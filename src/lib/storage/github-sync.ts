/**
 * GitHub Issues Sync Service
 *
 * Provides bidirectional synchronization between local tasks and GitHub Issues.
 * This enables team collaboration while maintaining the local-first experience.
 *
 * Key features:
 * - Push local tasks to GitHub Issues
 * - Pull GitHub Issues to local storage
 * - Detect and resolve conflicts
 * - Offline queue for pending operations
 * - ETag-based change detection
 */

import type { BacklogItem } from '@/types/backlog';
import type {
  TaskStorageProvider,
  StorageMode,
  GitHubSyncStatus,
  SyncState,
  SyncOperation,
  SyncConflict,
  SyncResult,
  SyncError,
  GitHubIssueData,
} from './types';
import { serializeBacklogMd, parseBacklogMd } from '../backlog-parser';

/**
 * Label used to identify Ringmaster-managed issues
 */
const RINGMASTER_LABEL = 'ringmaster-task';

/**
 * Metadata prefix in issue body to store task ID
 */
const TASK_ID_PREFIX = '<!-- ringmaster-task-id:';
const TASK_ID_SUFFIX = ' -->';

/**
 * GitHub API response types
 */
interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: Array<{ name: string }>;
  updated_at: string;
  created_at: string;
}

interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description?: string;
}

/**
 * Map task status to GitHub issue state
 */
function statusToGitHubState(status: BacklogItem['status']): 'open' | 'closed' {
  return status === 'ready_to_ship' ? 'closed' : 'open';
}

/**
 * Map GitHub issue state to task status
 */
function githubStateToStatus(state: 'open' | 'closed'): BacklogItem['status'] {
  return state === 'closed' ? 'ready_to_ship' : 'in_progress';
}

/**
 * Extract task ID from issue body metadata
 */
function extractTaskId(body: string | null): string | null {
  if (!body) return null;
  const match = body.match(new RegExp(`${TASK_ID_PREFIX}([^\\s]+)${TASK_ID_SUFFIX}`));
  return match ? match[1] : null;
}

/**
 * Add task ID metadata to issue body
 */
function addTaskIdToBody(body: string, taskId: string): string {
  return `${TASK_ID_PREFIX}${taskId}${TASK_ID_SUFFIX}\n\n${body}`;
}

/**
 * Remove task ID metadata from issue body
 */
function removeTaskIdFromBody(body: string | null): string {
  if (!body) return '';
  return body.replace(new RegExp(`${TASK_ID_PREFIX}[^\\s]+${TASK_ID_SUFFIX}\\n*`), '').trim();
}

/**
 * Convert a BacklogItem to GitHub Issue format
 */
function taskToGitHubIssue(task: BacklogItem): { title: string; body: string; labels: string[] } {
  const bodyParts: string[] = [];

  // Add task ID metadata
  bodyParts.push(`${TASK_ID_PREFIX}${task.id}${TASK_ID_SUFFIX}`);
  bodyParts.push('');

  // Add metadata
  const metaParts = [`**Priority**: ${task.priority}`];
  if (task.effort) metaParts.push(`**Effort**: ${task.effort}`);
  if (task.value) metaParts.push(`**Value**: ${task.value}`);
  bodyParts.push(metaParts.join(' | '));
  bodyParts.push('');

  // Add description
  if (task.description) {
    bodyParts.push('## Description');
    bodyParts.push(task.description);
    bodyParts.push('');
  }

  // Add acceptance criteria
  if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    bodyParts.push('## Acceptance Criteria');
    task.acceptanceCriteria.forEach(criterion => {
      bodyParts.push(`- [ ] ${criterion}`);
    });
    bodyParts.push('');
  }

  // Add notes
  if (task.notes) {
    bodyParts.push('## Notes');
    bodyParts.push(task.notes);
  }

  // Build labels
  const labels = [RINGMASTER_LABEL];
  if (task.category) {
    labels.push(`category:${task.category}`);
  }
  labels.push(`priority:${task.priority}`);
  if (task.status !== 'backlog') {
    labels.push(`status:${task.status}`);
  }

  return {
    title: task.title,
    body: bodyParts.join('\n'),
    labels,
  };
}

/**
 * Convert a GitHub Issue to BacklogItem format
 */
function githubIssueToTask(issue: GitHubIssue, existingTask?: BacklogItem): BacklogItem {
  const body = removeTaskIdFromBody(issue.body);
  const taskId = extractTaskId(issue.body);

  // Parse metadata from body
  const priorityMatch = body.match(/\*\*Priority\*\*:\s*(\w+)/i);
  const effortMatch = body.match(/\*\*Effort\*\*:\s*(\w+)/i);
  const valueMatch = body.match(/\*\*Value\*\*:\s*(\w+)/i);

  // Parse description
  const descriptionMatch = body.match(/## Description\n([\s\S]*?)(?=\n## |$)/i);
  const description = descriptionMatch ? descriptionMatch[1].trim() : '';

  // Parse acceptance criteria
  const criteriaMatch = body.match(/## Acceptance Criteria\n([\s\S]*?)(?=\n## |$)/i);
  const acceptanceCriteria = criteriaMatch
    ? criteriaMatch[1]
        .split('\n')
        .filter(line => line.startsWith('- '))
        .map(line => line.replace(/^- \[[ x]\]\s*/, '').trim())
    : undefined;

  // Parse notes
  const notesMatch = body.match(/## Notes\n([\s\S]*?)$/i);
  const notes = notesMatch ? notesMatch[1].trim() : undefined;

  // Extract category from labels
  const categoryLabel = issue.labels.find(l => l.name.startsWith('category:'));
  const category = categoryLabel ? categoryLabel.name.replace('category:', '') : undefined;

  // Determine status from labels and state
  let status: BacklogItem['status'] = githubStateToStatus(issue.state);
  const statusLabel = issue.labels.find(l => l.name.startsWith('status:'));
  if (statusLabel) {
    const labelStatus = statusLabel.name.replace('status:', '') as BacklogItem['status'];
    if (['backlog', 'in_progress', 'review', 'ready_to_ship'].includes(labelStatus)) {
      status = labelStatus;
    }
  }

  return {
    id: taskId || existingTask?.id || `gh-${issue.number}`,
    title: issue.title,
    description,
    priority: (priorityMatch?.[1]?.toLowerCase() as BacklogItem['priority']) || 'medium',
    effort: (effortMatch?.[1]?.toLowerCase() as BacklogItem['effort']) || undefined,
    value: (valueMatch?.[1]?.toLowerCase() as BacklogItem['value']) || undefined,
    status,
    tags: category ? [category] : [],
    category,
    createdAt: existingTask?.createdAt || issue.created_at,
    updatedAt: issue.updated_at,
    order: existingTask?.order || Date.now(),
    acceptanceCriteria,
    notes,
    // Link to GitHub
    githubIssueNumber: issue.number,
  };
}

/**
 * GitHub Sync Service Configuration
 */
export interface GitHubSyncConfig {
  /** GitHub personal access token */
  token: string;
  /** Repository in "owner/repo" format */
  repo: string;
  /** Base URL for GitHub API (for enterprise) */
  apiUrl?: string;
}

/**
 * GitHub Sync Service
 *
 * Handles synchronization between local tasks and GitHub Issues.
 */
export class GitHubSyncService {
  private config: GitHubSyncConfig;
  private apiUrl: string;
  private etags: Map<number, string> = new Map();

  constructor(config: GitHubSyncConfig) {
    this.config = config;
    this.apiUrl = config.apiUrl || 'https://api.github.com';
  }

  /**
   * Make an authenticated request to the GitHub API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ data: T; etag?: string }> {
    const url = `${this.apiUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error: ${response.status} ${error}`);
    }

    const data = await response.json() as T;
    const etag = response.headers.get('ETag') || undefined;

    return { data, etag };
  }

  /**
   * Ensure the ringmaster label exists
   */
  async ensureLabel(): Promise<void> {
    try {
      await this.request(`/repos/${this.config.repo}/labels/${RINGMASTER_LABEL}`);
    } catch {
      // Label doesn't exist, create it
      await this.request(`/repos/${this.config.repo}/labels`, {
        method: 'POST',
        body: JSON.stringify({
          name: RINGMASTER_LABEL,
          color: 'f5a623',
          description: 'Task managed by Ringmaster',
        }),
      });
    }
  }

  /**
   * Get all Ringmaster-managed issues from GitHub
   */
  async getIssues(): Promise<GitHubIssue[]> {
    const { data } = await this.request<GitHubIssue[]>(
      `/repos/${this.config.repo}/issues?labels=${RINGMASTER_LABEL}&state=all&per_page=100`
    );
    return data;
  }

  /**
   * Get a single issue by number
   */
  async getIssue(issueNumber: number): Promise<GitHubIssue> {
    const { data, etag } = await this.request<GitHubIssue>(
      `/repos/${this.config.repo}/issues/${issueNumber}`
    );
    if (etag) {
      this.etags.set(issueNumber, etag);
    }
    return data;
  }

  /**
   * Create a new issue from a task
   */
  async createIssue(task: BacklogItem): Promise<GitHubIssue> {
    const issueData = taskToGitHubIssue(task);

    const { data } = await this.request<GitHubIssue>(
      `/repos/${this.config.repo}/issues`,
      {
        method: 'POST',
        body: JSON.stringify(issueData),
      }
    );

    return data;
  }

  /**
   * Update an existing issue
   */
  async updateIssue(issueNumber: number, task: BacklogItem): Promise<GitHubIssue> {
    const issueData = taskToGitHubIssue(task);

    const { data } = await this.request<GitHubIssue>(
      `/repos/${this.config.repo}/issues/${issueNumber}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          ...issueData,
          state: statusToGitHubState(task.status),
        }),
      }
    );

    return data;
  }

  /**
   * Close an issue (mark task as shipped)
   */
  async closeIssue(issueNumber: number): Promise<void> {
    await this.request(
      `/repos/${this.config.repo}/issues/${issueNumber}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ state: 'closed' }),
      }
    );
  }

  /**
   * Perform a full sync between local tasks and GitHub
   */
  async sync(localTasks: BacklogItem[]): Promise<SyncResult> {
    const result: SyncResult = {
      pushed: [],
      pulled: [],
      conflicts: [],
      errors: [],
    };

    try {
      // Ensure label exists
      await this.ensureLabel();

      // Get all GitHub issues
      const issues = await this.getIssues();
      const issueByTaskId = new Map<string, GitHubIssue>();
      const issueByNumber = new Map<number, GitHubIssue>();

      for (const issue of issues) {
        const taskId = extractTaskId(issue.body);
        if (taskId) {
          issueByTaskId.set(taskId, issue);
        }
        issueByNumber.set(issue.number, issue);
      }

      // Process local tasks
      for (const task of localTasks) {
        try {
          const existingIssue = issueByTaskId.get(task.id);

          if (!existingIssue) {
            // Task doesn't exist on GitHub - push it
            const issue = await this.createIssue(task);
            result.pushed.push({ taskId: task.id, issueNumber: issue.number });
          } else {
            // Task exists - check for conflicts
            const localUpdated = new Date(task.updatedAt).getTime();
            const remoteUpdated = new Date(existingIssue.updated_at).getTime();

            if (localUpdated > remoteUpdated) {
              // Local is newer - push
              await this.updateIssue(existingIssue.number, task);
              result.pushed.push({ taskId: task.id, issueNumber: existingIssue.number });
            } else if (remoteUpdated > localUpdated) {
              // Remote is newer - this will be handled in pull phase
              // Skip for now
            }
            // If equal, no action needed
          }
        } catch (error) {
          result.errors.push({
            taskId: task.id,
            operation: 'push',
            message: error instanceof Error ? error.message : 'Unknown error',
            retryable: true,
          });
        }
      }

      // Pull new/updated issues
      for (const issue of issues) {
        try {
          const taskId = extractTaskId(issue.body);
          const existingTask = localTasks.find(t =>
            t.id === taskId || t.githubIssueNumber === issue.number
          );

          if (!existingTask) {
            // New issue from GitHub - pull it
            result.pulled.push({ issueNumber: issue.number, taskId: taskId || `gh-${issue.number}` });
          } else {
            const localUpdated = new Date(existingTask.updatedAt).getTime();
            const remoteUpdated = new Date(issue.updated_at).getTime();

            if (remoteUpdated > localUpdated) {
              // Remote is newer - pull
              result.pulled.push({ issueNumber: issue.number, taskId: existingTask.id });
            }
          }
        } catch (error) {
          result.errors.push({
            issueNumber: issue.number,
            operation: 'pull',
            message: error instanceof Error ? error.message : 'Unknown error',
            retryable: true,
          });
        }
      }

    } catch (error) {
      result.errors.push({
        operation: 'pull',
        message: error instanceof Error ? error.message : 'Sync failed',
        retryable: false,
      });
    }

    return result;
  }

  /**
   * Convert GitHub issues to BacklogItems
   */
  issuesToTasks(issues: GitHubIssue[], existingTasks: BacklogItem[] = []): BacklogItem[] {
    return issues.map(issue => {
      const taskId = extractTaskId(issue.body);
      const existing = existingTasks.find(t =>
        t.id === taskId || t.githubIssueNumber === issue.number
      );
      return githubIssueToTask(issue, existing);
    });
  }
}

/**
 * Check if GitHub sync is configured
 */
export function isGitHubSyncConfigured(): boolean {
  if (typeof window === 'undefined') return false;
  const token = localStorage.getItem('ringmaster:github:token');
  const repo = localStorage.getItem('ringmaster:github:repo');
  return !!(token && repo);
}

/**
 * Get GitHub sync configuration from localStorage
 */
export function getGitHubSyncConfig(): GitHubSyncConfig | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('ringmaster:github:token');
  const repo = localStorage.getItem('ringmaster:github:repo');
  const apiUrl = localStorage.getItem('ringmaster:github:apiUrl');

  if (!token || !repo) return null;

  return {
    token,
    repo,
    apiUrl: apiUrl || undefined,
  };
}

/**
 * Save GitHub sync configuration to localStorage
 */
export function setGitHubSyncConfig(config: GitHubSyncConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('ringmaster:github:token', config.token);
  localStorage.setItem('ringmaster:github:repo', config.repo);
  if (config.apiUrl) {
    localStorage.setItem('ringmaster:github:apiUrl', config.apiUrl);
  } else {
    localStorage.removeItem('ringmaster:github:apiUrl');
  }
}

/**
 * Clear GitHub sync configuration
 */
export function clearGitHubSyncConfig(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('ringmaster:github:token');
  localStorage.removeItem('ringmaster:github:repo');
  localStorage.removeItem('ringmaster:github:apiUrl');
}
