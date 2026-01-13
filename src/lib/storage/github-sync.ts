/**
 * GitHub Issues Service
 *
 * Provides integration with GitHub Issues for workflow actions like tackle and ship.
 * This is NOT an automatic sync - it provides explicit user-driven operations.
 *
 * Key features:
 * - Create issues from backlog items
 * - Assign issues and manage labels during tackle workflow
 * - Update issue state during ship workflow
 */

import type { BacklogItem } from '@/types/backlog';

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

/**
 * Map task status to GitHub issue state
 */
function statusToGitHubState(status: BacklogItem['status']): 'open' | 'closed' {
  return status === 'ready_to_ship' ? 'closed' : 'open';
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
 * GitHub Service Configuration
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
 * GitHub Service
 *
 * Handles GitHub API interactions for workflow actions (tackle, ship, create issue).
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
   * Assign an issue to a user
   * Used when tackling a task to indicate who is working on it
   */
  async assignIssue(issueNumber: number, assignees: string[]): Promise<void> {
    await this.request(
      `/repos/${this.config.repo}/issues/${issueNumber}/assignees`,
      {
        method: 'POST',
        body: JSON.stringify({ assignees }),
      }
    );
  }

  /**
   * Add labels to an issue without removing existing ones
   * Used for adding "in-progress" label when tackling
   */
  async addLabels(issueNumber: number, labels: string[]): Promise<void> {
    await this.request(
      `/repos/${this.config.repo}/issues/${issueNumber}/labels`,
      {
        method: 'POST',
        body: JSON.stringify({ labels }),
      }
    );
  }

  /**
   * Remove labels from an issue
   * Used for removing "in-progress" when shipping
   */
  async removeLabel(issueNumber: number, label: string): Promise<void> {
    try {
      await this.request(
        `/repos/${this.config.repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
        {
          method: 'DELETE',
        }
      );
    } catch (error) {
      // Ignore 404 errors (label wasn't on the issue)
      if (error instanceof Error && error.message.includes('404')) {
        return;
      }
      throw error;
    }
  }

  /**
   * Handle tackle workflow: assign user and add in-progress label
   * @param issueNumber The GitHub issue number
   * @param username The GitHub username to assign
   * @param inProgressLabel The label to add (default: "status: in-progress")
   */
  async handleTackle(
    issueNumber: number,
    username: string,
    inProgressLabel: string = 'status: in-progress'
  ): Promise<{ assigned: boolean; labeled: boolean }> {
    const result = { assigned: false, labeled: false };

    try {
      await this.assignIssue(issueNumber, [username]);
      result.assigned = true;
    } catch (error) {
      console.error('[GitHubSync] Failed to assign issue:', error);
    }

    try {
      await this.addLabels(issueNumber, [inProgressLabel]);
      result.labeled = true;
    } catch (error) {
      console.error('[GitHubSync] Failed to add label:', error);
    }

    return result;
  }

  /**
   * Handle ship workflow: update labels for review/ready state
   * @param issueNumber The GitHub issue number
   * @param fromLabel Label to remove (e.g., "status: in-progress")
   * @param toLabel Label to add (e.g., "status: review")
   */
  async handleShip(
    issueNumber: number,
    fromLabel: string = 'status: in-progress',
    toLabel: string = 'status: review'
  ): Promise<{ removedLabel: boolean; addedLabel: boolean }> {
    const result = { removedLabel: false, addedLabel: false };

    try {
      await this.removeLabel(issueNumber, fromLabel);
      result.removedLabel = true;
    } catch (error) {
      console.error('[GitHubSync] Failed to remove label:', error);
    }

    try {
      await this.addLabels(issueNumber, [toLabel]);
      result.addedLabel = true;
    } catch (error) {
      console.error('[GitHubSync] Failed to add label:', error);
    }

    return result;
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
 *
 * Checks multiple sources in priority order:
 * 1. Legacy sync config (ringmaster:github:token, ringmaster:github:repo)
 * 2. New user config (ringmaster:user:github) + auto-detected repo
 *
 * For server-managed tokens, returns 'server-managed' as the token value
 * and the API will use credentials from .env.local or config file.
 */
export function getGitHubSyncConfig(): GitHubSyncConfig | null {
  if (typeof window === 'undefined') return null;

  // 1. Check legacy sync config first
  const legacyToken = localStorage.getItem('ringmaster:github:token');
  const legacyRepo = localStorage.getItem('ringmaster:github:repo');
  const apiUrl = localStorage.getItem('ringmaster:github:apiUrl');

  if (legacyToken && legacyRepo) {
    return {
      token: legacyToken,
      repo: legacyRepo,
      apiUrl: apiUrl || undefined,
    };
  }

  // 2. Check new user config format + get repo from project config
  try {
    const userGithubStr = localStorage.getItem('ringmaster:user:github');
    if (userGithubStr) {
      const userGithub = JSON.parse(userGithubStr);
      if (userGithub?.token) {
        // Get repo from project configs (find the one with github mode)
        let repo: string | null = null;

        // Look for project config with owner/repo info
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith('ringmaster:project:')) {
            try {
              const projectConfig = JSON.parse(localStorage.getItem(key) || '{}');
              if (projectConfig.owner && projectConfig.repo) {
                repo = `${projectConfig.owner}/${projectConfig.repo}`;
                break;
              }
            } catch {
              // Skip invalid project configs
            }
          }
        }

        if (repo) {
          return {
            token: userGithub.token, // May be 'server-managed'
            repo,
            apiUrl: apiUrl || undefined,
          };
        }
      }
    }
  } catch {
    // Ignore parse errors
  }

  return null;
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
