import { NextRequest, NextResponse } from 'next/server';
import type { GitHubStatusResponse } from '@/lib/storage/types';
import { getGitHubCredentials } from '@/lib/config/github-credentials';

/**
 * GET /api/github/status
 *
 * Validates GitHub configuration and returns connection status.
 *
 * Token priority:
 * 1. GITHUB_TOKEN from .env.local
 * 2. ~/.ringmaster/config.json
 * 3. Authorization header (legacy/client-side fallback)
 *
 * Query params:
 * - repo: Repository in "owner/repo" format (required for repo-specific info)
 *
 * Returns:
 * - User info (login, name, avatar)
 * - Repository info (if repo param provided)
 * - Token permissions
 * - tokenSource: where the token came from ('env', 'file', 'header')
 */
export async function GET(request: NextRequest) {
  // Get token - priority: server-side config > Authorization header
  let token: string | null = null;
  let tokenSource: 'env' | 'file' | 'header' | 'none' = 'none';

  // 1. Check server-side credentials (env var or config file)
  const serverCredentials = await getGitHubCredentials();
  if (serverCredentials) {
    token = serverCredentials.token;
    tokenSource = serverCredentials.source;
  }

  // 2. Fall back to Authorization header (client-side/legacy)
  if (!token) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
      tokenSource = 'header';
    }
  }

  if (!token) {
    const response: GitHubStatusResponse = {
      connected: false,
      error: 'No GitHub token configured. Set GITHUB_TOKEN in .env.local or configure via settings.',
    };
    return NextResponse.json(response, { status: 401 });
  }

  // Get optional repo param
  const searchParams = request.nextUrl.searchParams;
  const repoParam = searchParams.get('repo'); // e.g., "owner/repo"

  try {
    // Validate token by fetching user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Ringmaster-App',
      },
    });

    if (!userResponse.ok) {
      const error = await userResponse.text();
      console.error('[github/status] User fetch failed:', userResponse.status, error);

      const response: GitHubStatusResponse = {
        connected: false,
        error: userResponse.status === 401
          ? 'Invalid or expired token'
          : `GitHub API error: ${userResponse.status}`,
      };
      return NextResponse.json(response, { status: userResponse.status === 401 ? 401 : 502 });
    }

    const userData = await userResponse.json();

    // Build response
    const response: GitHubStatusResponse & { tokenSource?: string } = {
      connected: true,
      user: {
        login: userData.login,
        name: userData.name || userData.login,
        avatarUrl: userData.avatar_url,
      },
      permissions: {
        canReadIssues: true,  // If we got here, we have at least read access
        canWriteIssues: false,
        canCreatePRs: false,
      },
      tokenSource, // Tell client where token came from
    };

    // If repo specified, check repo access and permissions
    if (repoParam) {
      try {
        const repoResponse = await fetch(`https://api.github.com/repos/${repoParam}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Ringmaster-App',
          },
        });

        if (repoResponse.ok) {
          const repoData = await repoResponse.json();

          response.repo = {
            fullName: repoData.full_name,
            private: repoData.private,
            hasIssues: repoData.has_issues,
            defaultBranch: repoData.default_branch,
          };

          // Check permissions from repo response
          if (repoData.permissions) {
            response.permissions = {
              canReadIssues: repoData.has_issues && (repoData.permissions.pull || repoData.permissions.admin),
              canWriteIssues: repoData.has_issues && (repoData.permissions.push || repoData.permissions.admin),
              canCreatePRs: repoData.permissions.push || repoData.permissions.admin,
            };
          }
        } else if (repoResponse.status === 404) {
          response.error = `Repository '${repoParam}' not found or no access`;
        }
      } catch (repoError) {
        console.error('[github/status] Repo check failed:', repoError);
        // Don't fail the whole request, just note the repo issue
        response.error = `Could not verify repository access: ${repoError}`;
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[github/status] Error:', error);

    const response: GitHubStatusResponse = {
      connected: false,
      error: 'Failed to connect to GitHub API',
    };
    return NextResponse.json(response, { status: 502 });
  }
}

/**
 * POST /api/github/status
 *
 * Alternative endpoint that accepts token in body (for scenarios where
 * headers are problematic). Also accepts repo in body.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, repo } = body as { token?: string; repo?: string };

    if (!token) {
      const response: GitHubStatusResponse = {
        connected: false,
        error: 'No token provided',
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Create a new request with the token in Authorization header
    const url = new URL(request.url);
    if (repo) {
      url.searchParams.set('repo', repo);
    }

    const newRequest = new NextRequest(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return GET(newRequest);
  } catch (error) {
    console.error('[github/status] POST error:', error);

    const response: GitHubStatusResponse = {
      connected: false,
      error: 'Invalid request body',
    };
    return NextResponse.json(response, { status: 400 });
  }
}
