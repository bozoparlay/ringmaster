/**
 * GitHub Close Issue API Endpoint
 *
 * POST /api/github/close-issue - Close a GitHub issue
 *
 * This is used when deleting a task locally to prevent the sync
 * from resurrecting the task on the next pull.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubCredentials } from '@/lib/config/github-credentials';

interface CloseIssueRequest {
  repo: string;
  issueNumber: number;
}

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
    const body = await request.json() as CloseIssueRequest;
    const { repo, issueNumber } = body;

    if (!repo || !issueNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: repo, issueNumber' },
        { status: 400 }
      );
    }

    // Close the issue
    const response = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        state: 'closed',
        state_reason: 'completed',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[close-issue] Failed to close issue #${issueNumber}:`, errorText);
      return NextResponse.json(
        { error: `Failed to close issue: ${response.status}` },
        { status: response.status }
      );
    }

    console.log(`[close-issue] Successfully closed issue #${issueNumber}`);
    return NextResponse.json({ success: true, issueNumber });
  } catch (error) {
    console.error('[close-issue] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
