import { NextResponse } from 'next/server';
import * as path from 'path';
import * as fs from 'fs/promises';
import { execWithTimeout, TimeoutError } from '@/lib/resilience';

// Timeouts
const GIT_COMMAND_TIMEOUT_MS = 15000;   // 15s for git commands
const GIT_PUSH_TIMEOUT_MS = 30000;      // 30s for git push

interface ShipRequest {
  taskId: string;
  title: string;
  branch?: string;
  worktreePath?: string;
  backlogPath?: string;
  commitMessage?: string;  // Optional custom commit message
  prNumber?: number;        // PR number to merge (if known)
  skipMerge?: boolean;      // Skip PR merge (for manual merge workflows)
  /**
   * GAP #12 FIX: If true, skip worktree cleanup to avoid breaking active shell sessions.
   * Default is true (safe mode) - caller can trigger cleanup separately.
   */
  deferWorktreeCleanup?: boolean;
}

// GAP #15 FIX: Helper to merge PR via GitHub CLI
async function mergePR(branch: string, prNumber?: number, repoDir?: string): Promise<{
  success: boolean;
  prNumber?: number;
  mergeMethod?: string;
  error?: string;
}> {
  const cwd = repoDir || process.cwd();

  try {
    // If we have a PR number, merge by number; otherwise merge by branch
    const prIdentifier = prNumber ? prNumber.toString() : branch;

    console.log(`[ship-task] Merging PR for: ${prIdentifier}`);

    // First, check if PR exists and is mergeable
    const { stdout: prInfo } = await execWithTimeout(
      `gh pr view "${prIdentifier}" --json number,state,mergeable,mergeStateStatus`,
      { cwd },
      GIT_COMMAND_TIMEOUT_MS
    );

    const pr = JSON.parse(prInfo);
    console.log(`[ship-task] PR #${pr.number} state: ${pr.state}, mergeable: ${pr.mergeable}`);

    if (pr.state !== 'OPEN') {
      return {
        success: false,
        prNumber: pr.number,
        error: `PR #${pr.number} is not open (state: ${pr.state})`
      };
    }

    if (pr.mergeable !== 'MERGEABLE') {
      return {
        success: false,
        prNumber: pr.number,
        error: `PR #${pr.number} is not mergeable (status: ${pr.mergeStateStatus})`
      };
    }

    // Merge using squash (keeps history clean)
    await execWithTimeout(
      `gh pr merge "${pr.number}" --squash --delete-branch`,
      { cwd },
      GIT_PUSH_TIMEOUT_MS  // Use longer timeout for merge operation
    );

    console.log(`[ship-task] PR #${pr.number} merged successfully`);

    return {
      success: true,
      prNumber: pr.number,
      mergeMethod: 'squash'
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[ship-task] PR merge error: ${errorMsg}`);

    return {
      success: false,
      error: errorMsg
    };
  }
}

export async function POST(request: Request) {
  try {
    const {
      taskId,
      title,
      branch,
      worktreePath,
      backlogPath,
      commitMessage,
      prNumber,
      skipMerge = false,
      deferWorktreeCleanup = true, // GAP #12 FIX: Default to safe mode
    } = await request.json() as ShipRequest;

    if (!taskId || !title) {
      return NextResponse.json({ error: 'taskId and title are required' }, { status: 400 });
    }

    // Determine directories
    const repoDir = backlogPath ? path.dirname(backlogPath) : process.cwd();
    let workDir = repoDir;
    let worktreeAbsPath: string | undefined;

    if (worktreePath) {
      worktreeAbsPath = path.isAbsolute(worktreePath)
        ? worktreePath
        : path.join(repoDir, worktreePath);
      try {
        await fs.access(worktreeAbsPath);
        workDir = worktreeAbsPath;
      } catch {
        // Worktree doesn't exist, work in repo dir
        worktreeAbsPath = undefined;
      }
    }

    // Get current branch name
    let currentBranch = branch;
    if (!currentBranch) {
      try {
        const { stdout } = await execWithTimeout(
          'git rev-parse --abbrev-ref HEAD',
          { cwd: workDir },
          GIT_COMMAND_TIMEOUT_MS
        );
        currentBranch = stdout.trim();
      } catch {
        return NextResponse.json(
          { error: 'Could not determine branch name' },
          { status: 400 }
        );
      }
    }

    // Check if there are any changes to commit
    let hasChanges = false;
    try {
      const { stdout: statusOutput } = await execWithTimeout(
        'git status --porcelain',
        { cwd: workDir },
        GIT_COMMAND_TIMEOUT_MS
      );
      hasChanges = statusOutput.trim().length > 0;
    } catch (err) {
      console.error('Git status error:', err);
    }

    let commitSha: string | undefined;

    if (hasChanges) {
      // Stage all changes
      await execWithTimeout('git add -A', { cwd: workDir }, GIT_COMMAND_TIMEOUT_MS);

      // Create commit
      const message = commitMessage || title;
      // Escape the message for shell
      const escapedMessage = message.replace(/'/g, "'\\''");

      try {
        await execWithTimeout(
          `git commit -m '${escapedMessage}'`,
          { cwd: workDir },
          GIT_COMMAND_TIMEOUT_MS
        );

        // Get commit SHA
        const { stdout: shaOutput } = await execWithTimeout(
          'git rev-parse HEAD',
          { cwd: workDir },
          GIT_COMMAND_TIMEOUT_MS
        );
        commitSha = shaOutput.trim();
      } catch (err) {
        // Commit might fail if there's nothing to commit (e.g., only untracked files that are gitignored)
        console.warn('Commit warning:', err);
      }
    }

    // Push to remote
    try {
      await execWithTimeout(
        `git push -u origin ${currentBranch}`,
        { cwd: workDir },
        GIT_PUSH_TIMEOUT_MS
      );
    } catch (err) {
      // Push might fail if branch already exists remotely - try regular push
      console.error('Push error:', err);
      try {
        await execWithTimeout(
          `git push origin ${currentBranch}`,
          { cwd: workDir },
          GIT_PUSH_TIMEOUT_MS
        );
      } catch {
        return NextResponse.json(
          { error: 'Failed to push to remote. Make sure you have push access.' },
          { status: 500 }
        );
      }
    }

    // GAP #15 FIX: Merge the PR
    let mergeResult: { success: boolean; prNumber?: number; mergeMethod?: string; error?: string } | undefined;

    if (!skipMerge && currentBranch !== 'main' && currentBranch !== 'master') {
      mergeResult = await mergePR(currentBranch, prNumber, repoDir);

      if (!mergeResult.success) {
        console.warn(`[ship-task] PR merge failed: ${mergeResult.error}`);
        // Don't fail the whole operation - warn and continue
        // User may want to merge manually or PR may not exist yet
      }
    }

    // GAP #12 FIX: Only remove worktree if NOT deferred
    // Deferred cleanup prevents breaking active shell sessions (e.g., Claude Code)
    let worktreeRemoved = false;
    let worktreePendingCleanup = false;

    if (worktreeAbsPath) {
      if (deferWorktreeCleanup) {
        // Don't remove - just flag it for later cleanup
        worktreePendingCleanup = true;
        console.log(`[ship-task] Deferring worktree cleanup for: ${worktreeAbsPath}`);
      } else {
        // Remove worktree immediately (old behavior)
        try {
          await execWithTimeout(
            `git worktree remove "${worktreeAbsPath}" --force`,
            { cwd: repoDir },
            GIT_COMMAND_TIMEOUT_MS
          );
          worktreeRemoved = true;
        } catch (err) {
          console.warn('Worktree removal warning:', err);
          // Try to remove the directory manually if worktree remove fails
          try {
            await fs.rm(worktreeAbsPath, { recursive: true, force: true });
            await execWithTimeout('git worktree prune', { cwd: repoDir }, GIT_COMMAND_TIMEOUT_MS);
            worktreeRemoved = true;
          } catch {
            console.warn('Manual worktree cleanup failed');
            worktreePendingCleanup = true;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      branch: currentBranch,
      commitSha,
      pushed: true,
      // GAP #15: PR merge info
      merged: mergeResult?.success ?? false,
      mergeInfo: mergeResult,
      worktreeRemoved,
      worktreePendingCleanup,
      worktreePath: worktreeAbsPath, // Return so caller knows which worktree to clean up later
      repoDir,
      // GAP #12: Instructions for manual cleanup if needed
      cleanupInstructions: worktreePendingCleanup
        ? `To clean up the worktree later, run: cd "${repoDir}" && git worktree remove "${worktreeAbsPath}" --force`
        : undefined,
    });
  } catch (error) {
    console.error('Ship task error:', error);

    // Handle timeout errors specifically
    if (error instanceof TimeoutError) {
      return NextResponse.json(
        { success: false, error: `Ship operation timed out: ${error.message}` },
        { status: 504 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
