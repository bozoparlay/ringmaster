import { NextRequest, NextResponse } from 'next/server';
import { GitHubSyncService, type GitHubSyncConfig } from '@/lib/storage/github-sync';

/**
 * POST /api/github/tackle
 *
 * Handles the GitHub integration for tackling a task:
 * - Assigns the issue to the current user
 * - Adds the "in-progress" label
 *
 * Request body:
 * - issueNumber: GitHub issue number
 * - repo: Repository in "owner/repo" format
 * - inProgressLabel (optional): Custom label for in-progress state
 *
 * Authorization: Bearer token required
 */

interface TackleRequest {
  issueNumber: number;
  repo: string;
  inProgressLabel?: string;
}

interface TackleResponse {
  success: boolean;
  assigned: boolean;
  labeled: boolean;
  username?: string;
  error?: string;
}

export async function POST(request: NextRequest) {
  // Get token from Authorization header
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    const response: TackleResponse = {
      success: false,
      assigned: false,
      labeled: false,
      error: 'No authorization token provided',
    };
    return NextResponse.json(response, { status: 401 });
  }

  try {
    const body = await request.json() as TackleRequest;
    const { issueNumber, repo, inProgressLabel } = body;

    if (!issueNumber || !repo) {
      const response: TackleResponse = {
        success: false,
        assigned: false,
        labeled: false,
        error: 'Missing required fields: issueNumber and repo',
      };
      return NextResponse.json(response, { status: 400 });
    }

    // First, get the current user's username
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Ringmaster-App',
      },
    });

    if (!userResponse.ok) {
      const response: TackleResponse = {
        success: false,
        assigned: false,
        labeled: false,
        error: 'Invalid or expired token',
      };
      return NextResponse.json(response, { status: 401 });
    }

    const userData = await userResponse.json();
    const username = userData.login;

    // Create sync service and handle tackle
    const config: GitHubSyncConfig = {
      token,
      repo,
    };

    const syncService = new GitHubSyncService(config);
    const result = await syncService.handleTackle(
      issueNumber,
      username,
      inProgressLabel || 'status: in-progress'
    );

    const response: TackleResponse = {
      success: result.assigned || result.labeled,
      assigned: result.assigned,
      labeled: result.labeled,
      username,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[github/tackle] Error:', error);

    const response: TackleResponse = {
      success: false,
      assigned: false,
      labeled: false,
      error: error instanceof Error ? error.message : 'Failed to tackle issue',
    };
    return NextResponse.json(response, { status: 500 });
  }
}
