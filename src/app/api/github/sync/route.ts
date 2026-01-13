/**
 * GitHub Sync API Endpoint
 *
 * POST /api/github/sync - Synchronize local tasks with GitHub Issues
 *
 * This endpoint handles push sync (Local → GitHub):
 * - Creates new issues for unsynced tasks
 * - Updates existing issues for modified tasks
 * - Closes issues for completed tasks
 * - Auto-creates labels if they don't exist
 *
 * Token priority:
 * 1. GITHUB_TOKEN from .env.local
 * 2. ~/.ringmaster/config.json
 * 3. Authorization header (legacy/client-side fallback)
 */

import { NextRequest, NextResponse } from 'next/server';
import type { BacklogItem } from '@/types/backlog';
import { GITHUB_LABEL_SCHEMA, type GitHubLabelDef } from '@/lib/storage/types';
import { getGitHubCredentials } from '@/lib/config/github-credentials';

// ============================================================================
// Types
// ============================================================================

interface SyncRequest {
  repo: string;
  tasks: BacklogItem[];
  direction?: 'push' | 'pull' | 'both';
}

interface SyncedTask {
  taskId: string;
  issueNumber: number;
  issueUrl: string;
  operation: 'created' | 'updated' | 'closed' | 'reopened' | 'unchanged';
}

interface PulledTask {
  task: BacklogItem;
  issueNumber: number;
  operation: 'new' | 'updated' | 'closed';
}

interface SyncError {
  taskId?: string;
  issueNumber?: number;
  operation: 'push' | 'pull' | 'label';
  message: string;
  retryable: boolean;
}

interface SyncConflict {
  taskId: string;
  issueNumber: number;
  localVersion: BacklogItem;
  remoteVersion: BacklogItem;
  conflictType: 'both-modified' | 'local-deleted' | 'remote-deleted';
}

interface SyncResponse {
  success: boolean;
  summary: {
    pushed: number;
    pulled: number;
    unchanged: number;
    conflicts: number;
    errors: number;
  };
  tasks: SyncedTask[];
  pulled: PulledTask[];
  conflicts: SyncConflict[];
  errors: SyncError[];
}

// ============================================================================
// GitHub API Helpers
// ============================================================================

const RINGMASTER_LABEL = 'ringmaster';
const TASK_ID_PREFIX = '<!-- ringmaster-task-id:';
const TASK_ID_SUFFIX = ' -->';

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: Array<{ name: string }>;
  updated_at: string;
  created_at: string;
  html_url: string;
}

interface GitHubLabel {
  name: string;
  color: string;
  description?: string;
}

async function githubRequest<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${errorText}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// ============================================================================
// Label Management
// ============================================================================

async function ensureLabelsExist(
  repo: string,
  token: string,
  labelNames: string[]
): Promise<{ created: string[]; errors: SyncError[] }> {
  const created: string[] = [];
  const errors: SyncError[] = [];

  // Get existing labels
  let existingLabels: GitHubLabel[] = [];
  try {
    existingLabels = await githubRequest<GitHubLabel[]>(
      `/repos/${repo}/labels?per_page=100`,
      token
    );
  } catch (error) {
    errors.push({
      operation: 'label',
      message: `Failed to fetch labels: ${error instanceof Error ? error.message : 'Unknown error'}`,
      retryable: true,
    });
    return { created, errors };
  }

  const existingNames = new Set(existingLabels.map(l => l.name.toLowerCase()));

  // Create missing labels
  for (const labelName of labelNames) {
    if (existingNames.has(labelName.toLowerCase())) continue;

    const labelDef = GITHUB_LABEL_SCHEMA[labelName] as GitHubLabelDef | undefined;
    if (!labelDef) {
      // Dynamic category label - create with default color
      try {
        await githubRequest(
          `/repos/${repo}/labels`,
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              name: labelName,
              color: 'EDEDED',
              description: `Auto-created by Ringmaster`,
            }),
          }
        );
        created.push(labelName);
      } catch (error) {
        // Label might already exist (race condition)
        if (!(error instanceof Error && error.message.includes('422'))) {
          errors.push({
            operation: 'label',
            message: `Failed to create label ${labelName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            retryable: true,
          });
        }
      }
      continue;
    }

    try {
      await githubRequest(
        `/repos/${repo}/labels`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            name: labelName,
            color: labelDef.color,
            description: labelDef.description,
          }),
        }
      );
      created.push(labelName);
    } catch (error) {
      // Label might already exist (race condition) - 422 is expected
      if (!(error instanceof Error && error.message.includes('422'))) {
        errors.push({
          operation: 'label',
          message: `Failed to create label ${labelName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          retryable: true,
        });
      }
    }
  }

  return { created, errors };
}

// ============================================================================
// Task <-> Issue Conversion
// ============================================================================

function taskToIssueBody(task: BacklogItem): string {
  const parts: string[] = [];

  // Add task ID metadata (hidden comment)
  parts.push(`${TASK_ID_PREFIX}${task.id}${TASK_ID_SUFFIX}`);
  parts.push('');

  // Add description
  if (task.description) {
    parts.push(task.description);
    parts.push('');
  }

  // Add acceptance criteria as checklist
  if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    parts.push('## Acceptance Criteria');
    parts.push('');
    for (const criterion of task.acceptanceCriteria) {
      parts.push(`- [ ] ${criterion}`);
    }
    parts.push('');
  }

  // Add notes
  if (task.notes) {
    parts.push('## Notes');
    parts.push('');
    parts.push(task.notes);
    parts.push('');
  }

  // Add metadata footer
  parts.push('---');
  parts.push(`*Priority: ${task.priority}*`);
  if (task.effort) parts.push(`*Effort: ${task.effort}*`);
  if (task.value) parts.push(`*Value: ${task.value}*`);

  return parts.join('\n');
}

function taskToLabels(task: BacklogItem): string[] {
  const labels: string[] = [RINGMASTER_LABEL];

  // Priority label
  labels.push(`priority:${task.priority}`);

  // Status label (only if not backlog)
  if (task.status !== 'backlog') {
    const statusLabel = task.status.replace('_', '-');
    labels.push(`status:${statusLabel}`);
  }

  // Effort label
  if (task.effort) {
    const effortLabel = task.effort.replace('_', '-');
    labels.push(`effort:${effortLabel}`);
  }

  // Category as label
  if (task.category) {
    labels.push(`category:${task.category}`);
  }

  return labels;
}

function extractTaskId(body: string | null): string | null {
  if (!body) return null;
  const match = body.match(new RegExp(`${TASK_ID_PREFIX}([^\\s]+)${TASK_ID_SUFFIX}`));
  return match ? match[1] : null;
}

/**
 * Parse a GitHub Issue back into a BacklogItem
 */
function issueToTask(issue: GitHubIssue, existingTask?: BacklogItem): BacklogItem {
  const body = issue.body || '';
  const taskId = extractTaskId(body) || existingTask?.id || `gh-${issue.number}`;

  // Remove task ID comment from body for parsing
  const cleanBody = body.replace(new RegExp(`${TASK_ID_PREFIX}[^\\s]+${TASK_ID_SUFFIX}\\n*`), '').trim();

  // Parse description (everything before ## sections or ---)
  let description = '';
  const descMatch = cleanBody.match(/^([\s\S]*?)(?=\n## |\n---|$)/);
  if (descMatch) {
    description = descMatch[1].trim();
  }

  // Parse acceptance criteria from checklist
  const acceptanceCriteria: string[] = [];
  const acSection = cleanBody.match(/## Acceptance Criteria\n\n?([\s\S]*?)(?=\n## |\n---|$)/i);
  if (acSection) {
    const lines = acSection[1].split('\n');
    for (const line of lines) {
      const match = line.match(/^- \[[ x]\] (.+)$/);
      if (match) {
        acceptanceCriteria.push(match[1]);
      }
    }
  }

  // Parse notes
  let notes: string | undefined;
  const notesSection = cleanBody.match(/## Notes\n\n?([\s\S]*?)(?=\n## |\n---|$)/i);
  if (notesSection) {
    notes = notesSection[1].trim();
  }

  // Parse labels for priority, status, effort, category
  let priority: BacklogItem['priority'] = 'medium';
  let status: BacklogItem['status'] = 'backlog';
  let effort: BacklogItem['effort'] | undefined;
  let category: string | undefined;

  for (const label of issue.labels) {
    const name = label.name.toLowerCase();

    if (name.startsWith('priority:')) {
      const val = name.replace('priority:', '');
      if (['critical', 'high', 'medium', 'low', 'someday'].includes(val)) {
        priority = val as BacklogItem['priority'];
      }
    }

    if (name.startsWith('status:')) {
      const val = name.replace('status:', '').replace('-', '_');
      if (['backlog', 'up_next', 'in_progress', 'review', 'ready_to_ship'].includes(val)) {
        status = val as BacklogItem['status'];
      }
    }

    if (name.startsWith('effort:')) {
      const val = name.replace('effort:', '').replace('-', '_');
      if (['trivial', 'low', 'medium', 'high', 'very_high'].includes(val)) {
        effort = val as BacklogItem['effort'];
      }
    }

    if (name.startsWith('category:')) {
      category = label.name.replace('category:', '');
    }
  }

  // Handle closed issues
  if (issue.state === 'closed' && status !== 'ready_to_ship') {
    status = 'ready_to_ship';
  }

  return {
    id: taskId,
    title: issue.title,
    description,
    priority,
    effort,
    status,
    tags: category ? [category] : [],
    category,
    createdAt: existingTask?.createdAt || issue.created_at,
    updatedAt: issue.updated_at,
    order: existingTask?.order || Date.now(),
    acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : undefined,
    notes,
    githubIssueNumber: issue.number,
    githubIssueUrl: issue.html_url,
    lastSyncedAt: new Date().toISOString(),
    lastRemoteModifiedAt: issue.updated_at,
    syncStatus: 'synced',
  };
}

// ============================================================================
// Rate Limiting
// ============================================================================

/**
 * Delay between API calls to avoid rate limiting
 * GitHub API limit: 5000 requests/hour for authenticated requests
 * We use 100ms delay between requests for safety
 */
const API_DELAY_MS = 100;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Conflict Detection
// ============================================================================

/**
 * Detect if there's a conflict between local and remote versions.
 * A conflict exists when BOTH local and remote were modified after the last sync.
 */
function detectConflict(
  localTask: BacklogItem,
  remoteIssue: GitHubIssue
): SyncConflict['conflictType'] | null {
  const lastSync = localTask.lastSyncedAt ? new Date(localTask.lastSyncedAt).getTime() : 0;

  // If never synced, no conflict possible (treat as new)
  if (!lastSync) return null;

  const localMod = localTask.lastLocalModifiedAt
    ? new Date(localTask.lastLocalModifiedAt).getTime()
    : localTask.updatedAt
    ? new Date(localTask.updatedAt).getTime()
    : 0;
  const remoteMod = new Date(remoteIssue.updated_at).getTime();

  const localChanged = localMod > lastSync;
  const remoteChanged = remoteMod > lastSync;

  if (localChanged && remoteChanged) {
    return 'both-modified';
  }

  return null;
}

// ============================================================================
// Sync Operations
// ============================================================================

async function pushTask(
  repo: string,
  token: string,
  task: BacklogItem,
  existingIssue?: GitHubIssue,
  allExistingIssues?: GitHubIssue[]
): Promise<{ issue: GitHubIssue; operation: SyncedTask['operation'] }> {
  const body = taskToIssueBody(task);
  const labels = taskToLabels(task);
  const state = task.status === 'ready_to_ship' ? 'closed' : 'open';

  // Idempotency check - if no existingIssue passed, search for a match
  // This prevents duplicate creation even if local metadata was lost
  if (!existingIssue && allExistingIssues) {
    // Search by task ID in body first (most reliable)
    const matchByTaskId = allExistingIssues.find(issue => {
      const issueTaskId = extractTaskId(issue.body);
      return issueTaskId === task.id;
    });

    if (matchByTaskId) {
      console.log(`[GitHub Sync] Idempotency check: Found existing issue #${matchByTaskId.number} by task ID`);
      existingIssue = matchByTaskId;
    } else {
      // Fallback: search by exact title match (less reliable but catches edge cases)
      const matchByTitle = allExistingIssues.find(issue =>
        issue.title === task.title &&
        issue.labels.some(l => l.name === RINGMASTER_LABEL)
      );

      if (matchByTitle) {
        console.log(`[GitHub Sync] Idempotency check: Found existing issue #${matchByTitle.number} by title`);
        existingIssue = matchByTitle;
      }
    }
  }

  if (existingIssue) {
    // Update existing issue
    const needsUpdate =
      existingIssue.title !== task.title ||
      existingIssue.body !== body ||
      existingIssue.state !== state;

    if (!needsUpdate) {
      return { issue: existingIssue, operation: 'unchanged' };
    }

    const issue = await githubRequest<GitHubIssue>(
      `/repos/${repo}/issues/${existingIssue.number}`,
      token,
      {
        method: 'PATCH',
        body: JSON.stringify({
          title: task.title,
          body,
          labels,
          state,
        }),
      }
    );

    const operation: SyncedTask['operation'] =
      existingIssue.state === 'open' && state === 'closed' ? 'closed' :
      existingIssue.state === 'closed' && state === 'open' ? 'reopened' :
      'updated';

    return { issue, operation };
  }

  // Create new issue
  const issue = await githubRequest<GitHubIssue>(
    `/repos/${repo}/issues`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        title: task.title,
        body,
        labels,
      }),
    }
  );

  // If task is done, close the issue immediately
  if (state === 'closed') {
    await githubRequest(
      `/repos/${repo}/issues/${issue.number}`,
      token,
      {
        method: 'PATCH',
        body: JSON.stringify({ state: 'closed' }),
      }
    );
    issue.state = 'closed';
  }

  return { issue, operation: 'created' };
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Get auth token - priority: server-side config > Authorization header
    let token: string | null = null;
    let tokenSource: string = 'none';

    // 1. Check server-side credentials (env var or config file)
    const serverCredentials = await getGitHubCredentials();
    if (serverCredentials) {
      token = serverCredentials.token;
      tokenSource = serverCredentials.source;
    }

    // 2. Fall back to Authorization header (client-side/legacy)
    if (!token) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
        tokenSource = 'header';
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: 'GitHub token not configured. Set GITHUB_TOKEN in .env.local or configure via settings.' },
        { status: 401 }
      );
    }

    console.log(`[GitHub Sync] Using token from: ${tokenSource}`);

    // Parse request body
    const body = await request.json() as SyncRequest;
    const { repo, tasks, direction = 'push' } = body;

    if (!repo) {
      return NextResponse.json(
        { error: 'Missing required field: repo' },
        { status: 400 }
      );
    }

    if (!tasks || !Array.isArray(tasks)) {
      return NextResponse.json(
        { error: 'Missing or invalid field: tasks' },
        { status: 400 }
      );
    }

    console.log(`[GitHub Sync] Starting ${direction} sync for ${repo} with ${tasks.length} tasks`);

    const response: SyncResponse = {
      success: true,
      summary: { pushed: 0, pulled: 0, unchanged: 0, conflicts: 0, errors: 0 },
      tasks: [],
      pulled: [],
      conflicts: [],
      errors: [],
    };

    // Collect all labels we'll need
    const allLabels = new Set<string>([RINGMASTER_LABEL]);
    for (const task of tasks) {
      for (const label of taskToLabels(task)) {
        allLabels.add(label);
      }
    }

    // Ensure labels exist
    const { created: createdLabels, errors: labelErrors } = await ensureLabelsExist(
      repo,
      token,
      Array.from(allLabels)
    );

    if (createdLabels.length > 0) {
      console.log(`[GitHub Sync] Created ${createdLabels.length} labels:`, createdLabels);
    }

    response.errors.push(...labelErrors);

    // Get existing issues with ringmaster label
    let existingIssues: GitHubIssue[] = [];
    try {
      existingIssues = await githubRequest<GitHubIssue[]>(
        `/repos/${repo}/issues?labels=${RINGMASTER_LABEL}&state=all&per_page=100`,
        token
      );
    } catch (error) {
      response.errors.push({
        operation: 'pull',
        message: `Failed to fetch existing issues: ${error instanceof Error ? error.message : 'Unknown error'}`,
        retryable: true,
      });
    }

    // Build map of task ID -> existing issue
    const issueByTaskId = new Map<string, GitHubIssue>();
    const issueByNumber = new Map<number, GitHubIssue>();
    for (const issue of existingIssues) {
      const taskId = extractTaskId(issue.body);
      if (taskId) {
        issueByTaskId.set(taskId, issue);
      }
      issueByNumber.set(issue.number, issue);
    }

    // Push sync: Local → GitHub
    if (direction === 'push' || direction === 'both') {
      let taskIndex = 0;
      for (const task of tasks) {
        try {
          // Rate limiting: add delay between requests (except for first request)
          if (taskIndex > 0) {
            await delay(API_DELAY_MS);
          }
          taskIndex++;

          // Check if task has existing issue by task ID or issue number
          let existingIssue = issueByTaskId.get(task.id);
          if (!existingIssue && task.githubIssueNumber) {
            existingIssue = issueByNumber.get(task.githubIssueNumber);
          }

          // Check for conflicts before pushing
          if (existingIssue) {
            const conflictType = detectConflict(task, existingIssue);
            if (conflictType) {
              // Both local and remote were modified - flag as conflict, don't push
              const remoteTask = issueToTask(existingIssue, task);
              response.conflicts.push({
                taskId: task.id,
                issueNumber: existingIssue.number,
                localVersion: task,
                remoteVersion: remoteTask,
                conflictType,
              });
              response.summary.conflicts++;
              console.log(`[GitHub Sync] Conflict detected for task ${task.id} (issue #${existingIssue.number})`);
              continue; // Skip pushing this task
            }
          }

          const { issue, operation } = await pushTask(repo, token, task, existingIssue, existingIssues);

          response.tasks.push({
            taskId: task.id,
            issueNumber: issue.number,
            issueUrl: issue.html_url,
            operation,
          });

          if (operation === 'unchanged') {
            response.summary.unchanged++;
          } else {
            response.summary.pushed++;
          }

          console.log(`[GitHub Sync] ${operation} issue #${issue.number} for task ${task.id}`);
        } catch (error) {
          response.errors.push({
            taskId: task.id,
            operation: 'push',
            message: error instanceof Error ? error.message : 'Unknown error',
            retryable: true,
          });
          response.summary.errors++;
        }
      }
    }

    // Pull sync: GitHub → Local
    if (direction === 'pull' || direction === 'both') {
      // Build set of task IDs already flagged as conflicts (skip during pull)
      const conflictedTaskIds = new Set(response.conflicts.map(c => c.taskId));

      // Build map of local tasks by issue number for comparison
      const localTaskByIssueNumber = new Map<number, BacklogItem>();
      for (const task of tasks) {
        if (task.githubIssueNumber) {
          localTaskByIssueNumber.set(task.githubIssueNumber, task);
        }
      }

      let pullIndex = 0;
      for (const issue of existingIssues) {
        try {
          // Rate limiting
          if (pullIndex > 0) {
            await delay(API_DELAY_MS);
          }
          pullIndex++;

          const taskId = extractTaskId(issue.body);
          // Try matching by task ID first, then fall back to issue number
          // This prevents duplicates when GitHub issue body has different ID than local task
          let localTask = taskId ? tasks.find(t => t.id === taskId) : null;
          if (!localTask) {
            localTask = localTaskByIssueNumber.get(issue.number);
          }

          if (!localTask) {
            // Skip closed orphan issues - these are likely cleanup artifacts
            // or issues closed externally that we shouldn't resurrect
            if (issue.state === 'closed') {
              console.log(`[GitHub Sync] Skipping closed orphan issue #${issue.number} (no local task)`);
              continue;
            }

            // New open issue from GitHub - not in local tasks
            const newTask = issueToTask(issue);
            response.pulled.push({
              task: newTask,
              issueNumber: issue.number,
              operation: 'new',
            });
            response.summary.pulled++;
            console.log(`[GitHub Sync] Pulled new issue #${issue.number} -> task ${newTask.id}`);
            continue;
          }

          // Skip tasks already flagged as conflicts (handled separately)
          if (conflictedTaskIds.has(localTask.id)) {
            continue;
          }

          // Check if issue was closed on GitHub (and we need to update local)
          if (issue.state === 'closed' && localTask.status !== 'ready_to_ship') {
            // Check for conflict: local was also modified
            const conflictType = detectConflict(localTask, issue);
            if (conflictType) {
              const remoteTask = issueToTask(issue, localTask);
              response.conflicts.push({
                taskId: localTask.id,
                issueNumber: issue.number,
                localVersion: localTask,
                remoteVersion: remoteTask,
                conflictType,
              });
              response.summary.conflicts++;
              console.log(`[GitHub Sync] Conflict detected during pull for task ${localTask.id} (issue #${issue.number})`);
              continue;
            }

            const updatedTask = issueToTask(issue, localTask);
            response.pulled.push({
              task: updatedTask,
              issueNumber: issue.number,
              operation: 'closed',
            });
            response.summary.pulled++;
            console.log(`[GitHub Sync] Issue #${issue.number} was closed, marking task ${localTask.id} as done`);
            continue;
          }

          // Check if issue was updated more recently than local task
          const issueUpdatedAt = new Date(issue.updated_at).getTime();
          const localModifiedAt = localTask.lastLocalModifiedAt
            ? new Date(localTask.lastLocalModifiedAt).getTime()
            : localTask.updatedAt
            ? new Date(localTask.updatedAt).getTime()
            : 0;
          const lastSyncedAt = localTask.lastSyncedAt
            ? new Date(localTask.lastSyncedAt).getTime()
            : 0;

          // If issue was updated after last sync, check for conflicts
          if (issueUpdatedAt > lastSyncedAt) {
            const localChanged = localModifiedAt > lastSyncedAt;

            if (localChanged) {
              // Both changed - conflict!
              const remoteTask = issueToTask(issue, localTask);
              response.conflicts.push({
                taskId: localTask.id,
                issueNumber: issue.number,
                localVersion: localTask,
                remoteVersion: remoteTask,
                conflictType: 'both-modified',
              });
              response.summary.conflicts++;
              console.log(`[GitHub Sync] Conflict detected during pull for task ${localTask.id}`);
            } else {
              // Only remote changed - safe to pull
              const updatedTask = issueToTask(issue, localTask);
              response.pulled.push({
                task: updatedTask,
                issueNumber: issue.number,
                operation: 'updated',
              });
              response.summary.pulled++;
              console.log(`[GitHub Sync] Issue #${issue.number} updated on GitHub, pulling changes`);
            }
          }
        } catch (error) {
          response.errors.push({
            issueNumber: issue.number,
            operation: 'pull',
            message: error instanceof Error ? error.message : 'Unknown error',
            retryable: true,
          });
          response.summary.errors++;
        }
      }
    }

    response.success = response.summary.errors === 0;
    console.log(`[GitHub Sync] Complete: ${response.summary.pushed} pushed, ${response.summary.pulled} pulled, ${response.summary.conflicts} conflicts, ${response.summary.unchanged} unchanged, ${response.summary.errors} errors`);

    return NextResponse.json(response);
  } catch (error) {
    console.error('[GitHub Sync] Fatal error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Sync failed',
        summary: { pushed: 0, pulled: 0, unchanged: 0, conflicts: 0, errors: 1 },
        tasks: [],
        pulled: [],
        conflicts: [],
        errors: [{
          operation: 'push',
          message: error instanceof Error ? error.message : 'Sync failed',
          retryable: false,
        }],
      },
      { status: 500 }
    );
  }
}
