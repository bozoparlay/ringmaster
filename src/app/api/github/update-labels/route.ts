/**
 * GitHub Update Labels API Endpoint
 *
 * POST /api/github/update-labels - Update metadata labels on a GitHub issue
 *
 * Uses ATOMIC update: fetches current labels, modifies, and PATCHes in a single
 * request to prevent data corruption from partial failures.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubCredentials } from '@/lib/config/github-credentials';
import type { Priority, Effort, Value } from '@/types/backlog';

interface UpdateLabelsRequest {
  repo: string;
  issueNumber: number;
  priority?: { old?: Priority; new: Priority };
  effort?: { old?: Effort; new: Effort };
  value?: { old?: Value; new: Value };
}

interface GitHubLabel {
  name: string;
  color?: string;
}

// Label prefix mappings
const LABEL_PREFIXES = {
  priority: 'priority:',
  effort: 'effort:',
  value: 'value:',
} as const;

export async function POST(request: NextRequest) {
  try {
    // Get auth token - priority: server-side config > Authorization header
    let token: string | null = null;

    // 1. Check server-side credentials (env var or config file)
    const serverCredentials = await getGitHubCredentials();
    if (serverCredentials) {
      token = serverCredentials.token;
    }

    // 2. Fall back to Authorization header (client-side/legacy)
    if (!token) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: 'GitHub token not configured' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json() as UpdateLabelsRequest;
    const { repo, issueNumber, priority, effort, value } = body;

    if (!repo || !issueNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: repo, issueNumber' },
        { status: 400 }
      );
    }

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    };

    // ATOMIC UPDATE: Fetch current issue, modify labels, PATCH in one request
    // This prevents partial failures where some labels update but others don't

    // Step 1: Get current issue to get all labels
    const getResponse = await fetch(
      `https://api.github.com/repos/${repo}/issues/${issueNumber}`,
      { method: 'GET', headers }
    );

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.error(`[update-labels] Failed to get issue #${issueNumber}:`, errorText);
      return NextResponse.json(
        { error: `Failed to get issue: ${getResponse.status}` },
        { status: getResponse.status }
      );
    }

    const issue = await getResponse.json();
    const currentLabels: GitHubLabel[] = issue.labels || [];
    let labelNames = currentLabels.map((l: GitHubLabel) => l.name);

    // Step 2: Build updated label list - remove old prefixed labels, add new ones
    const changes: string[] = [];

    // Process priority change
    if (priority) {
      labelNames = labelNames.filter(name => !name.startsWith(LABEL_PREFIXES.priority));
      labelNames.push(`${LABEL_PREFIXES.priority}${priority.new}`);
      changes.push(`priority:${priority.new}`);
    }

    // Process effort change
    if (effort) {
      labelNames = labelNames.filter(name => !name.startsWith(LABEL_PREFIXES.effort));
      labelNames.push(`${LABEL_PREFIXES.effort}${effort.new}`);
      changes.push(`effort:${effort.new}`);
    }

    // Process value change
    if (value) {
      labelNames = labelNames.filter(name => !name.startsWith(LABEL_PREFIXES.value));
      labelNames.push(`${LABEL_PREFIXES.value}${value.new}`);
      changes.push(`value:${value.new}`);
    }

    // Step 3: PATCH issue with complete label list (atomic operation)
    const patchResponse = await fetch(
      `https://api.github.com/repos/${repo}/issues/${issueNumber}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ labels: labelNames }),
      }
    );

    if (!patchResponse.ok) {
      const errorText = await patchResponse.text();
      console.error(`[update-labels] Failed to update labels:`, errorText);
      return NextResponse.json(
        { error: `Failed to update labels: ${patchResponse.status}` },
        { status: patchResponse.status }
      );
    }

    console.log(`[update-labels] Atomically updated issue #${issueNumber}:`, changes);
    return NextResponse.json({
      success: true,
      issueNumber,
      labels: labelNames,
      changes,
    });
  } catch (error) {
    console.error('[update-labels] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
