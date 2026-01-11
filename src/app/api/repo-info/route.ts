import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import path from 'path';
import { execWithTimeout } from '@/lib/resilience';
import type { RepoInfoResponse, GitProvider } from '@/lib/storage/types';

/**
 * GET /api/repo-info
 *
 * Returns information about the current repository by detecting:
 * - Git remote URL (origin)
 * - Owner and repo name (parsed from remote URL)
 * - Git provider (github, gitlab, bitbucket, unknown)
 * - Default branch
 * - Current branch
 * - Whether BACKLOG.md exists
 *
 * This endpoint supports auto-detection for the GitHub Project Integration feature.
 */
export async function GET() {
  try {
    const cwd = process.cwd();

    // Get git remote URL
    let repoUrl = '';
    try {
      const { stdout } = await execWithTimeout(
        'git remote get-url origin',
        { cwd },
        5000
      );
      repoUrl = stdout.trim();
    } catch {
      // No remote configured or not a git repo
      return NextResponse.json({
        repoUrl: '',
        owner: '',
        repo: '',
        provider: 'unknown' as GitProvider,
        defaultBranch: 'main',
        currentBranch: '',
        hasBacklogFile: existsSync(path.join(cwd, 'BACKLOG.md')),
      } satisfies RepoInfoResponse);
    }

    // Parse the remote URL to extract owner, repo, and provider
    const { owner, repo, provider } = parseGitRemoteUrl(repoUrl);

    // Get default branch
    let defaultBranch = 'main';
    try {
      // Try to get the actual default branch from remote HEAD
      const { stdout } = await execWithTimeout(
        'git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || echo "refs/remotes/origin/main"',
        { cwd },
        5000
      );
      const match = stdout.trim().match(/refs\/remotes\/origin\/(.+)$/);
      if (match) {
        defaultBranch = match[1];
      }
    } catch {
      // Fall back to 'main' if we can't determine
    }

    // Get current branch
    let currentBranch = '';
    try {
      const { stdout } = await execWithTimeout(
        'git branch --show-current',
        { cwd },
        5000
      );
      currentBranch = stdout.trim();
    } catch {
      // Might be in detached HEAD state
    }

    // Check if BACKLOG.md exists
    const hasBacklogFile = existsSync(path.join(cwd, 'BACKLOG.md'));

    const response: RepoInfoResponse = {
      repoUrl,
      owner,
      repo,
      provider,
      defaultBranch,
      currentBranch,
      hasBacklogFile,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[repo-info] Error:', error);
    return NextResponse.json(
      { error: 'Failed to detect repository info' },
      { status: 500 }
    );
  }
}

/**
 * Parse a git remote URL to extract owner, repo, and provider
 *
 * Supports:
 * - SSH format: git@github.com:owner/repo.git
 * - HTTPS format: https://github.com/owner/repo.git
 * - Enterprise URLs: git@github.enterprise.com:org/repo.git
 */
function parseGitRemoteUrl(url: string): { owner: string; repo: string; provider: GitProvider } {
  // SSH format: git@github.com:owner/repo.git
  const sshMatch = url.match(/git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return {
      provider: detectProvider(sshMatch[1]),
      owner: sshMatch[2],
      repo: sshMatch[3].replace(/\.git$/, ''),
    };
  }

  // HTTPS format: https://github.com/owner/repo.git
  const httpsMatch = url.match(/https?:\/\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    return {
      provider: detectProvider(httpsMatch[1]),
      owner: httpsMatch[2],
      repo: httpsMatch[3].replace(/\.git$/, ''),
    };
  }

  return { provider: 'unknown', owner: '', repo: '' };
}

/**
 * Detect the git provider from the hostname
 */
function detectProvider(host: string): GitProvider {
  const hostLower = host.toLowerCase();
  if (hostLower.includes('github')) return 'github';
  if (hostLower.includes('gitlab')) return 'gitlab';
  if (hostLower.includes('bitbucket')) return 'bitbucket';
  return 'unknown';
}
