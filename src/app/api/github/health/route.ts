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
  updated_at: string;
}

interface HealthCheckResult {
  success: boolean;
  timestamp: string;
  repo: string;
  checks: {
    authentication: { status: 'ok' | 'error'; message: string };
    repoAccess: { status: 'ok' | 'error'; message: string };
    issueCount: { status: 'ok' | 'warning' | 'error'; count: number; message: string };
    duplicateCheck: { status: 'ok' | 'warning'; duplicateGroups: number; message: string };
    orphanCheck: { status: 'ok' | 'warning'; orphanCount: number; message: string };
  };
  summary: {
    healthy: boolean;
    warnings: number;
    errors: number;
  };
}

function extractTaskId(body: string | null): string | null {
  if (!body) return null;

  const metaMatch = body.match(/<!--\s*ringmaster:id=([^\s]+)/);
  if (metaMatch) return metaMatch[1];

  const taskIdMatch = body.match(/\*\*Task ID\*\*:\s*`?([^`\n]+)`?/);
  if (taskIdMatch) return taskIdMatch[1].trim();

  return null;
}

async function githubRequest<T>(
  endpoint: string,
  token: string
): Promise<T> {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const timestamp = new Date().toISOString();
  const { searchParams } = new URL(request.url);
  const repo = searchParams.get('repo');

  if (!repo) {
    return NextResponse.json(
      { success: false, error: 'repo query parameter is required' },
      { status: 400 }
    );
  }

  const authHeader = request.headers.get('Authorization');
  let token = authHeader?.replace('Bearer ', '');

  if (!token || token === 'server-managed') {
    const credentials = await getGitHubCredentials();
    token = credentials?.token;
  }

  const result: HealthCheckResult = {
    success: true,
    timestamp,
    repo,
    checks: {
      authentication: { status: 'ok', message: 'Token present' },
      repoAccess: { status: 'ok', message: 'Unknown' },
      issueCount: { status: 'ok', count: 0, message: 'Unknown' },
      duplicateCheck: { status: 'ok', duplicateGroups: 0, message: 'Unknown' },
      orphanCheck: { status: 'ok', orphanCount: 0, message: 'Unknown' },
    },
    summary: {
      healthy: true,
      warnings: 0,
      errors: 0,
    },
  };

  // Check authentication
  if (!token) {
    result.checks.authentication = { status: 'error', message: 'No GitHub token configured' };
    result.summary.errors++;
    result.summary.healthy = false;
    return NextResponse.json(result);
  }

  // Check repo access
  try {
    await githubRequest(`/repos/${repo}`, token);
    result.checks.repoAccess = { status: 'ok', message: 'Repository accessible' };
  } catch (err) {
    result.checks.repoAccess = {
      status: 'error',
      message: err instanceof Error ? err.message : 'Repository not accessible',
    };
    result.summary.errors++;
    result.summary.healthy = false;
    return NextResponse.json(result);
  }

  // Fetch all issues with ringmaster label
  let allIssues: GitHubIssue[] = [];
  try {
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

    // Issue count check
    if (allIssues.length > 100) {
      result.checks.issueCount = {
        status: 'warning',
        count: allIssues.length,
        message: `High issue count (${allIssues.length}). Consider cleanup.`,
      };
      result.summary.warnings++;
    } else {
      result.checks.issueCount = {
        status: 'ok',
        count: allIssues.length,
        message: `${allIssues.length} issues with ringmaster label`,
      };
    }

    // Duplicate check
    const byTaskId = new Map<string, GitHubIssue[]>();
    for (const issue of allIssues) {
      const taskId = extractTaskId(issue.body);
      if (!taskId) continue;

      const existing = byTaskId.get(taskId) || [];
      existing.push(issue);
      byTaskId.set(taskId, existing);
    }

    let duplicateGroups = 0;
    for (const issues of byTaskId.values()) {
      if (issues.length > 1) duplicateGroups++;
    }

    if (duplicateGroups > 0) {
      result.checks.duplicateCheck = {
        status: 'warning',
        duplicateGroups,
        message: `Found ${duplicateGroups} task(s) with duplicate issues. Run /api/github/deduplicate to fix.`,
      };
      result.summary.warnings++;
    } else {
      result.checks.duplicateCheck = {
        status: 'ok',
        duplicateGroups: 0,
        message: 'No duplicate issues found',
      };
    }

    // Orphan check (closed issues without task ID)
    const orphanCount = allIssues.filter(
      issue => issue.state === 'closed' && !extractTaskId(issue.body)
    ).length;

    if (orphanCount > 10) {
      result.checks.orphanCheck = {
        status: 'warning',
        orphanCount,
        message: `Found ${orphanCount} closed orphan issues. Consider removing their ringmaster label.`,
      };
      result.summary.warnings++;
    } else {
      result.checks.orphanCheck = {
        status: 'ok',
        orphanCount,
        message: orphanCount > 0
          ? `${orphanCount} closed issues without task ID`
          : 'No orphan issues',
      };
    }

  } catch (err) {
    result.checks.issueCount = {
      status: 'error',
      count: 0,
      message: err instanceof Error ? err.message : 'Failed to fetch issues',
    };
    result.summary.errors++;
    result.summary.healthy = false;
  }

  // Final summary
  result.summary.healthy = result.summary.errors === 0;

  return NextResponse.json(result);
}
