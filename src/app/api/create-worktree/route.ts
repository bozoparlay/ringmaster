import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execWithTimeout, TimeoutError } from '@/lib/resilience';

// Timeouts for git operations
const GIT_COMMAND_TIMEOUT_MS = 15000;  // 15s for simple git commands
const GIT_WORKTREE_TIMEOUT_MS = 30000; // 30s for worktree creation (can be slower)

interface CreateWorktreeRequest {
  taskId: string;
  title: string;
  backlogPath?: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export async function POST(request: Request) {
  try {
    const { taskId, title, backlogPath } = await request.json() as CreateWorktreeRequest;

    // Determine the repo directory (parent of backlog file, or cwd)
    const repoDir = backlogPath ? path.dirname(backlogPath) : process.cwd();
    const tasksDir = path.join(repoDir, '.tasks');
    const worktreeName = `task-${taskId.slice(0, 8)}`;
    const worktreePath = path.join(tasksDir, worktreeName);
    const branchName = `task/${taskId.slice(0, 8)}-${slugify(title)}`;

    // Check if worktree already exists
    try {
      await fs.access(worktreePath);
      // Worktree exists - return existing info
      return NextResponse.json({
        success: true,
        branch: branchName,
        worktreePath: `.tasks/${worktreeName}`,
        absolutePath: worktreePath,
        alreadyExists: true,
      });
    } catch {
      // Worktree doesn't exist - create it
    }

    // Ensure .tasks directory exists
    await fs.mkdir(tasksDir, { recursive: true });

    // Ensure .tasks is in .gitignore
    const gitignorePath = path.join(repoDir, '.gitignore');
    try {
      const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
      if (!gitignoreContent.includes('.tasks')) {
        await fs.appendFile(gitignorePath, '\n# Task worktrees\n.tasks/\n');
      }
    } catch {
      // .gitignore doesn't exist - create it
      await fs.writeFile(gitignorePath, '# Task worktrees\n.tasks/\n');
    }

    // Get the default branch name (usually main or master)
    let defaultBranch = 'main';
    try {
      const { stdout } = await execWithTimeout(
        'git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed "s@^refs/remotes/origin/@@"',
        { cwd: repoDir },
        GIT_COMMAND_TIMEOUT_MS
      );
      const branch = stdout.trim();
      if (branch) defaultBranch = branch;
    } catch {
      // Try to detect from local branches
      try {
        const { stdout } = await execWithTimeout(
          'git branch --list main master',
          { cwd: repoDir },
          GIT_COMMAND_TIMEOUT_MS
        );
        if (stdout.includes('main')) defaultBranch = 'main';
        else if (stdout.includes('master')) defaultBranch = 'master';
      } catch {
        // Default to main
      }
    }

    // Create the worktree with a new branch based on default branch
    await execWithTimeout(
      `git worktree add "${worktreePath}" -b "${branchName}" ${defaultBranch}`,
      { cwd: repoDir },
      GIT_WORKTREE_TIMEOUT_MS
    );

    return NextResponse.json({
      success: true,
      branch: branchName,
      worktreePath: `.tasks/${worktreeName}`,
      absolutePath: worktreePath,
      baseBranch: defaultBranch,
      alreadyExists: false,
    });
  } catch (error) {
    // Log with context about error type
    if (error instanceof TimeoutError) {
      console.error(`[create-worktree] Git operation timed out: ${error.message}`);
      return NextResponse.json(
        { success: false, error: 'Git operation timed out. The repository may be locked or very large.' },
        { status: 504 }
      );
    }

    console.error('[create-worktree] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
