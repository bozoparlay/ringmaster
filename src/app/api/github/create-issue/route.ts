import { NextResponse } from 'next/server';
import type { BacklogItem, Priority, Effort, Value, Status } from '@/types/backlog';

/**
 * Label applied to all issues created through Ringmaster for identification and filtering.
 */
const RINGMASTER_LABEL = 'ringmaster';

/**
 * Prefix/suffix for embedding task ID in issue body. This hidden comment enables
 * bidirectional sync by linking GitHub issues back to their source tasks.
 */
const TASK_ID_PREFIX = '<!-- ringmaster:id=';
const TASK_ID_SUFFIX = ' -->';

/**
 * Request payload for creating a GitHub issue from a Ringmaster task.
 * Supports both full task objects and legacy simple requests.
 */
interface CreateIssueRequest {
  // Full task data (preferred)
  task?: Partial<BacklogItem>;

  // Legacy fields for backward compatibility
  title?: string;
  body?: string;
  labels?: string[];

  // Required config
  repo: string;
  token: string;
}

interface GitHubIssueResponse {
  number: number;
  html_url: string;
  title: string;
  state: string;
}

/**
 * Formats a BacklogItem into GitHub Issue body with structured sections.
 * Embeds task ID for sync, displays metadata, and formats acceptance criteria as checkboxes.
 */
function formatIssueBody(task: Partial<BacklogItem>): string {
  const bodyParts: string[] = [];

  // Embed task ID for bidirectional sync identification
  if (task.id) {
    bodyParts.push(`${TASK_ID_PREFIX}${task.id}${TASK_ID_SUFFIX}`);
    bodyParts.push('');
  }

  // Metadata line with priority, effort, and value
  const metaParts: string[] = [];
  if (task.priority) {
    metaParts.push(`**Priority**: ${capitalize(task.priority)}`);
  }
  if (task.effort) {
    metaParts.push(`**Effort**: ${formatEffort(task.effort)}`);
  }
  if (task.value) {
    metaParts.push(`**Value**: ${capitalize(task.value)}`);
  }
  if (metaParts.length > 0) {
    bodyParts.push(metaParts.join(' | '));
    bodyParts.push('');
  }

  // Description section
  if (task.description) {
    bodyParts.push('## Description');
    bodyParts.push('');
    bodyParts.push(task.description);
    bodyParts.push('');
  }

  // Acceptance criteria as GitHub task list checkboxes
  if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    bodyParts.push('## Acceptance Criteria');
    bodyParts.push('');
    task.acceptanceCriteria.forEach(criterion => {
      bodyParts.push(`- [ ] ${criterion}`);
    });
    bodyParts.push('');
  }

  // Notes section for additional context
  if (task.notes) {
    bodyParts.push('## Notes');
    bodyParts.push('');
    bodyParts.push(task.notes);
  }

  return bodyParts.join('\n').trim();
}

/**
 * Builds the label array for a GitHub issue based on task metadata.
 * Includes the ringmaster marker plus priority, status, effort, value, and category labels.
 */
function buildLabels(task: Partial<BacklogItem>): string[] {
  const labels: string[] = [RINGMASTER_LABEL];

  if (task.priority) {
    labels.push(`priority:${task.priority}`);
  }

  if (task.status && task.status !== 'backlog') {
    labels.push(`status:${task.status.replace('_', '-')}`);
  }

  if (task.effort) {
    labels.push(`effort:${task.effort.replace('_', '-')}`);
  }

  if (task.value) {
    labels.push(`value:${task.value}`);
  }

  if (task.category) {
    // Sanitize category for use as label (lowercase, replace spaces with dashes)
    const categoryLabel = task.category.toLowerCase().replace(/\s+/g, '-');
    labels.push(categoryLabel);
  }

  return labels;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).replace('_', ' ');
}

function formatEffort(effort: Effort): string {
  const effortLabels: Record<Effort, string> = {
    trivial: 'Trivial',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    very_high: 'Very High',
  };
  return effortLabels[effort] || capitalize(effort);
}

/**
 * Resolves the GitHub token, supporting both client-provided tokens and
 * server-managed tokens stored in environment variables.
 */
function resolveToken(clientToken: string | undefined): string | null {
  // If client provides a real token, use it
  if (clientToken && clientToken !== 'server-managed') {
    return clientToken;
  }

  // Fall back to server-side token from environment
  return process.env.GITHUB_TOKEN || null;
}

export async function POST(request: Request) {
  try {
    const body: CreateIssueRequest = await request.json();
    const { task, title: legacyTitle, body: legacyBody, labels: legacyLabels, repo, token: clientToken } = body;

    // Resolve token with server-managed fallback
    const token = resolveToken(clientToken);

    if (!token) {
      return NextResponse.json(
        { error: 'No GitHub token configured. Add GITHUB_TOKEN to .env.local or configure in Settings.' },
        { status: 401 }
      );
    }

    if (!repo) {
      return NextResponse.json({ error: 'Repository is required' }, { status: 400 });
    }

    // Determine title, body, and labels based on request format
    let issueTitle: string;
    let issueBody: string;
    let issueLabels: string[];

    if (task) {
      // Full task object provided - use proper formatting
      if (!task.title) {
        return NextResponse.json({ error: 'Task title is required' }, { status: 400 });
      }
      issueTitle = task.title;
      issueBody = formatIssueBody(task);
      issueLabels = buildLabels(task);
    } else {
      // Legacy request format - use provided values directly
      if (!legacyTitle) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 });
      }
      issueTitle = legacyTitle;
      issueBody = legacyBody || '';
      issueLabels = legacyLabels || [];
    }

    // Create issue via GitHub API
    const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody,
        labels: issueLabels,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'GitHub authentication failed. Token may be expired or invalid.' },
          { status: 401 }
        );
      }
      if (response.status === 403) {
        return NextResponse.json(
          { error: 'Permission denied. Ensure your token has "Issues: Read and write" permission.' },
          { status: 403 }
        );
      }
      if (response.status === 404) {
        return NextResponse.json(
          { error: `Repository ${repo} not found or not accessible with this token.` },
          { status: 404 }
        );
      }
      if (response.status === 422) {
        const errorData = await response.json();
        return NextResponse.json(
          { error: `Validation failed: ${errorData.message || 'Invalid request'}` },
          { status: 422 }
        );
      }
      return NextResponse.json(
        { error: `GitHub API error: ${response.status}` },
        { status: response.status }
      );
    }

    const issue: GitHubIssueResponse = await response.json();

    return NextResponse.json({
      success: true,
      issue: {
        number: issue.number,
        url: issue.html_url,
        title: issue.title,
      },
    });
  } catch (error) {
    console.error('[github/create-issue] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create issue' },
      { status: 500 }
    );
  }
}
