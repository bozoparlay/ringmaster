import { NextRequest, NextResponse } from 'next/server';
import { GitHubSyncService, type GitHubSyncConfig } from '@/lib/storage/github-sync';
import { getGitHubCredentials } from '@/lib/config/github-credentials';

/**
 * POST /api/github/ship
 *
 * Handles the GitHub integration for shipping a task:
 * - Removes "in-progress" label
 * - Adds "review" label
 *
 * This is called during the Ship flow to update the GitHub issue
 * to reflect the new status.
 *
 * Request body:
 * - issueNumber: GitHub issue number
 * - repo: Repository in "owner/repo" format
 * - fromLabel (optional): Label to remove (default: "status: in-progress")
 * - toLabel (optional): Label to add (default: "status: review")
 *
 * Token resolution:
 * 1. Server-side credentials (.env.local or ~/.ringmaster/config.json)
 * 2. Authorization header (fallback for client-provided tokens)
 */

interface ShipRequest {
  issueNumber: number;
  repo: string;
  fromLabel?: string;
  toLabel?: string;
}

interface ShipResponse {
  success: boolean;
  removedLabel: boolean;
  addedLabel: boolean;
  error?: string;
}

export async function POST(request: NextRequest) {
  // Resolve token: server-side credentials first, then Authorization header
  let token: string | null = null;

  const serverCredentials = await getGitHubCredentials();
  if (serverCredentials) {
    token = serverCredentials.token;
  }

  if (!token) {
    const authHeader = request.headers.get('Authorization');
    const headerToken = authHeader?.replace('Bearer ', '');
    if (headerToken && headerToken !== 'server-managed') {
      token = headerToken;
    }
  }

  if (!token) {
    const response: ShipResponse = {
      success: false,
      removedLabel: false,
      addedLabel: false,
      error: 'No GitHub token configured. Add GITHUB_TOKEN to .env.local or configure in Settings.',
    };
    return NextResponse.json(response, { status: 401 });
  }

  try {
    const body = await request.json() as ShipRequest;
    const { issueNumber, repo, fromLabel, toLabel } = body;

    if (!issueNumber || !repo) {
      const response: ShipResponse = {
        success: false,
        removedLabel: false,
        addedLabel: false,
        error: 'Missing required fields: issueNumber and repo',
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Create sync service and handle ship
    const config: GitHubSyncConfig = {
      token,
      repo,
    };

    const syncService = new GitHubSyncService(config);
    const result = await syncService.handleShip(
      issueNumber,
      fromLabel || 'status: in-progress',
      toLabel || 'status: review'
    );

    const response: ShipResponse = {
      success: result.removedLabel || result.addedLabel,
      removedLabel: result.removedLabel,
      addedLabel: result.addedLabel,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[github/ship] Error:', error);

    const response: ShipResponse = {
      success: false,
      removedLabel: false,
      addedLabel: false,
      error: error instanceof Error ? error.message : 'Failed to update issue labels',
    };
    return NextResponse.json(response, { status: 500 });
  }
}
