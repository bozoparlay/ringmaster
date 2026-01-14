/**
 * GitHub Update Status API Endpoint
 *
 * POST /api/github/update-status - Update the status label on a GitHub issue
 *
 * This removes the old status:* label and adds the new one, enabling
 * bidirectional sync between the GitHub view and GitHub Issues.
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
    const { repo, issueNumber, oldStatus, newStatus } = body;

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

    // Step 1: Remove old status label if it exists
    if (oldStatus) {
      const oldLabel = STATUS_TO_LABEL[oldStatus];
      if (oldLabel) {
        const encodedLabel = encodeURIComponent(oldLabel);
        const removeResponse = await fetch(
          `https://api.github.com/repos/${repo}/issues/${issueNumber}/labels/${encodedLabel}`,
          { method: 'DELETE', headers }
        );

        // 404 is OK - label might not exist
        if (!removeResponse.ok && removeResponse.status !== 404) {
          console.warn(`[update-status] Failed to remove old label ${oldLabel}:`, removeResponse.status);
        }
      }
    }

    // Step 2: Add new status label
    const newLabel = STATUS_TO_LABEL[newStatus];
    if (newLabel) {
      const addResponse = await fetch(
        `https://api.github.com/repos/${repo}/issues/${issueNumber}/labels`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ labels: [newLabel] }),
        }
      );

      if (!addResponse.ok) {
        const errorText = await addResponse.text();
        console.error(`[update-status] Failed to add label ${newLabel}:`, errorText);
        return NextResponse.json(
          { error: `Failed to add status label: ${addResponse.status}` },
          { status: addResponse.status }
        );
      }
    }

    console.log(`[update-status] Updated issue #${issueNumber}: ${oldStatus} -> ${newStatus}`);
    return NextResponse.json({
      success: true,
      issueNumber,
      oldStatus,
      newStatus,
    });
  } catch (error) {
    console.error('[update-status] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
