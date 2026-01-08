import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

interface ShipRequest {
  taskId: string;
  title: string;
  branch?: string;
  worktreePath?: string;
  backlogPath?: string;
  commitMessage?: string;  // Optional custom commit message
}

export async function POST(request: Request) {
  try {
    const { taskId, title, branch, worktreePath, backlogPath, commitMessage } =
      await request.json() as ShipRequest;

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
        const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: workDir });
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
      const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: workDir });
      hasChanges = statusOutput.trim().length > 0;
    } catch (err) {
      console.error('Git status error:', err);
    }

    let commitSha: string | undefined;

    if (hasChanges) {
      // Stage all changes
      await execAsync('git add -A', { cwd: workDir });

      // Create commit
      const message = commitMessage || title;
      // Escape the message for shell
      const escapedMessage = message.replace(/'/g, "'\\''");

      try {
        await execAsync(`git commit -m '${escapedMessage}'`, { cwd: workDir });

        // Get commit SHA
        const { stdout: shaOutput } = await execAsync('git rev-parse HEAD', { cwd: workDir });
        commitSha = shaOutput.trim();
      } catch (err) {
        // Commit might fail if there's nothing to commit (e.g., only untracked files that are gitignored)
        console.warn('Commit warning:', err);
      }
    }

    // Push to remote
    try {
      await execAsync(`git push -u origin ${currentBranch}`, { cwd: workDir });
    } catch (err) {
      // Push might fail if branch already exists remotely - try force push or regular push
      console.error('Push error:', err);
      try {
        // Try without -u if branch already tracked
        await execAsync(`git push origin ${currentBranch}`, { cwd: workDir });
      } catch {
        return NextResponse.json(
          { error: 'Failed to push to remote. Make sure you have push access.' },
          { status: 500 }
        );
      }
    }

    // Remove worktree if it exists
    if (worktreeAbsPath) {
      try {
        // First, make sure we're not in the worktree directory
        await execAsync(`git worktree remove "${worktreeAbsPath}" --force`, { cwd: repoDir });
      } catch (err) {
        console.warn('Worktree removal warning:', err);
        // Try to remove the directory manually if worktree remove fails
        try {
          await fs.rm(worktreeAbsPath, { recursive: true, force: true });
          // Also prune worktree list
          await execAsync('git worktree prune', { cwd: repoDir });
        } catch {
          console.warn('Manual worktree cleanup failed');
        }
      }
    }

    // Note: The backlog file will be updated by the frontend after this API returns.
    // We'll commit that change in a follow-up call or the frontend can trigger it.
    // For now, return success info so frontend knows to update backlog.

    return NextResponse.json({
      success: true,
      branch: currentBranch,
      commitSha,
      pushed: true,
      worktreeRemoved: !!worktreeAbsPath,
      repoDir, // Return so frontend can commit backlog change
    });
  } catch (error) {
    console.error('Ship task error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
