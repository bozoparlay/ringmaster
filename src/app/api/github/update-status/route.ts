/**
 * GitHub Update Status API Endpoint
 *
 * POST /api/github/update-status - Update the status label on a GitHub issue
 *
 * Uses ATOMIC update: fetches current labels, modifies, and PATCHes in a single
 * request to prevent data corruption from partial failures.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubCredentials } from '@/lib/config/github-credentials';
import type { Status } from '@/types/backlog';

interface UpdateStatusRequest {
  repo: string;
  issueNumber: number;
  oldStatus: Status;
  newStatus: Status;
}

interface GitHubLabel {
  name: string;
  color?: string;
}

// Map internal status values to GitHub label names
// Note: Labels include space after colon to match existing GitHub labels
const STATUS_TO_LABEL: Record<Status, string | null> = {
  backlog: 'status: backlog',
  up_next: 'status: up-next',
  in_progress: 'status: in-progress',
  review: 'status: review',
  ready_to_ship: 'status: ready-to-ship',
};

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
    const body = await request.json() as UpdateStatusRequest;
    const { repo, issueNumber, newStatus } = body;

    if (!repo || !issueNumber || !newStatus) {
      return NextResponse.json(
        { error: 'Missing required fields: repo, issueNumber, newStatus' },
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
    // This prevents partial failures where DELETE succeeds but POST fails

    // Step 1: Get current issue to get all labels
    const getResponse = await fetch(
      `https://api.github.com/repos/${repo}/issues/${issueNumber}`,
      { method: 'GET', headers }
    );

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.error(`[update-status] Failed to get issue #${issueNumber}:`, errorText);
      return NextResponse.json(
        { error: `Failed to get issue: ${getResponse.status}` },
        { status: getResponse.status }
      );
    }

    const issue = await getResponse.json();
    const currentLabels: GitHubLabel[] = issue.labels || [];

    // Step 2: Build new label list - remove all status labels, add new one
    const nonStatusLabels = currentLabels
      .map((l: GitHubLabel) => l.name)
      .filter((name: string) => !name.startsWith('status:'));

    const newLabel = STATUS_TO_LABEL[newStatus];
    const updatedLabels = newLabel
      ? [...nonStatusLabels, newLabel]
      : nonStatusLabels;

    // Step 3: PATCH issue with complete label list (atomic operation)
    const patchResponse = await fetch(
      `https://api.github.com/repos/${repo}/issues/${issueNumber}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ labels: updatedLabels }),
      }
    );

    if (!patchResponse.ok) {
      const errorText = await patchResponse.text();
      console.error(`[update-status] Failed to update labels:`, errorText);
      return NextResponse.json(
        { error: `Failed to update labels: ${patchResponse.status}` },
        { status: patchResponse.status }
      );
    }

    console.log(`[update-status] Atomically updated issue #${issueNumber} to ${newStatus}`);
    return NextResponse.json({
      success: true,
      issueNumber,
      newStatus,
      labels: updatedLabels,
    });
  } catch (error) {
    console.error('[update-status] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
