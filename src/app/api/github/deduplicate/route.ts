'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubCredentials } from '@/lib/config/github-credentials';

const RINGMASTER_LABEL = 'ringmaster';

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  created_at: string;
  html_url: string;
}

interface DuplicateGroup {
  taskId: string;
  title: string;
  issues: GitHubIssue[];
  keepIssue: GitHubIssue;
  duplicatesToClose: GitHubIssue[];
}

interface DeduplicateResult {
  success: boolean;
  dryRun: boolean;
  summary: {
    totalIssues: number;
    uniqueTasks: number;
    duplicateGroups: number;
    issuesToClose: number;
    issuesClosed: number;
    errors: number;
  };
  duplicateGroups: DuplicateGroup[];
  errors: Array<{ issueNumber: number; message: string }>;
}

/**
 * Extract task ID from issue body.
 * Looks for the ringmaster metadata comment or Task ID line.
 */
function extractTaskId(body: string | null): string | null {
  if (!body) return null;

  // Try metadata comment format first
  const metaMatch = body.match(/<!--\s*ringmaster:id=([^\s]+)/);
  if (metaMatch) return metaMatch[1];

  // Try explicit Task ID line
  const taskIdMatch = body.match(/\*\*Task ID\*\*:\s*`?([^`\n]+)`?/);
  if (taskIdMatch) return taskIdMatch[1].trim();

  return null;
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
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

async function fetchAllIssues(repo: string, token: string): Promise<GitHubIssue[]> {
  const allIssues: GitHubIssue[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const issues = await githubRequest<GitHubIssue[]>(
      `/repos/${repo}/issues?labels=${RINGMASTER_LABEL}&state=all&per_page=${perPage}&page=${page}`,
      token
    );

    allIssues.push(...issues);

    if (issues.length < perPage) break;
    page++;
  }

  return allIssues;
}

function findDuplicates(issues: GitHubIssue[]): DuplicateGroup[] {
  // Group issues by task ID
  const byTaskId = new Map<string, GitHubIssue[]>();

  for (const issue of issues) {
    const taskId = extractTaskId(issue.body);
    if (!taskId) continue;

    const existing = byTaskId.get(taskId) || [];
    existing.push(issue);
    byTaskId.set(taskId, existing);
  }

  // Find groups with more than one issue
  const duplicateGroups: DuplicateGroup[] = [];

  for (const [taskId, groupIssues] of byTaskId.entries()) {
    if (groupIssues.length <= 1) continue;

    // Sort by creation date (oldest first)
    const sorted = [...groupIssues].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Keep the oldest issue, close the rest
    const keepIssue = sorted[0];
    const duplicatesToClose = sorted.slice(1);

    duplicateGroups.push({
      taskId,
      title: keepIssue.title,
      issues: sorted,
      keepIssue,
      duplicatesToClose,
    });
  }

  return duplicateGroups;
}

async function closeIssue(
  repo: string,
  issueNumber: number,
  token: string,
  reason: string
): Promise<void> {
  // Add comment explaining closure
  await githubRequest(
    `/repos/${repo}/issues/${issueNumber}/comments`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        body: `🔄 **Closed as duplicate** by Ringmaster deduplication.\n\n${reason}`,
      }),
    }
  );

  // Close the issue
  await githubRequest(
    `/repos/${repo}/issues/${issueNumber}`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify({
        state: 'closed',
        state_reason: 'not_planned',
      }),
    }
  );

  // Remove ringmaster label to prevent re-sync
  try {
    await githubRequest(
      `/repos/${repo}/issues/${issueNumber}/labels/${RINGMASTER_LABEL}`,
      token,
      { method: 'DELETE' }
    );
  } catch {
    // Label may already be removed
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { repo, dryRun = true } = body;

    if (!repo) {
      return NextResponse.json(
        { success: false, error: 'repo is required' },
        { status: 400 }
      );
    }

    // Get token from header or server config
    const authHeader = request.headers.get('Authorization');
    let token = authHeader?.replace('Bearer ', '');

    if (!token || token === 'server-managed') {
      const credentials = await getGitHubCredentials();
      token = credentials?.token;
    }

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'GitHub token not configured' },
        { status: 401 }
      );
    }

    console.log(`[Deduplicate] Fetching issues for ${repo} (dryRun: ${dryRun})`);

    // Fetch all issues with ringmaster label
    const allIssues = await fetchAllIssues(repo, token);
    console.log(`[Deduplicate] Found ${allIssues.length} total issues`);

    // Find duplicate groups
    const duplicateGroups = findDuplicates(allIssues);
    const issuesToClose = duplicateGroups.reduce(
      (sum, g) => sum + g.duplicatesToClose.length,
      0
    );

    console.log(`[Deduplicate] Found ${duplicateGroups.length} duplicate groups with ${issuesToClose} issues to close`);

    const result: DeduplicateResult = {
      success: true,
      dryRun,
      summary: {
        totalIssues: allIssues.length,
        uniqueTasks: new Set(allIssues.map(i => extractTaskId(i.body)).filter(Boolean)).size,
        duplicateGroups: duplicateGroups.length,
        issuesToClose,
        issuesClosed: 0,
        errors: 0,
      },
      duplicateGroups,
      errors: [],
    };

    // If not dry run, close the duplicates
    if (!dryRun && issuesToClose > 0) {
      for (const group of duplicateGroups) {
        for (const issue of group.duplicatesToClose) {
          try {
            const reason = `This issue is a duplicate of #${group.keepIssue.number} for task \`${group.taskId}\`.`;
            await closeIssue(repo, issue.number, token, reason);
            result.summary.issuesClosed++;
            console.log(`[Deduplicate] Closed #${issue.number} (duplicate of #${group.keepIssue.number})`);
          } catch (err) {
            result.summary.errors++;
            result.errors.push({
              issueNumber: issue.number,
              message: err instanceof Error ? err.message : 'Unknown error',
            });
            console.error(`[Deduplicate] Failed to close #${issue.number}:`, err);
          }
        }
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Deduplicate] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Deduplication failed',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // GET does a dry run by default
  const { searchParams } = new URL(request.url);
  const repo = searchParams.get('repo');

  if (!repo) {
    return NextResponse.json(
      { success: false, error: 'repo query parameter is required' },
      { status: 400 }
    );
  }

  // Create a fake request with dryRun: true
  const fakeRequest = new NextRequest(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ repo, dryRun: true }),
  });

  return POST(fakeRequest);
}
