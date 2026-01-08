import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

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
      const { stdout } = await execAsync(
        'git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed "s@^refs/remotes/origin/@@"',
        { cwd: repoDir }
      );
      const branch = stdout.trim();
      if (branch) defaultBranch = branch;
    } catch {
      // Try to detect from local branches
      try {
        const { stdout } = await execAsync('git branch --list main master', { cwd: repoDir });
        if (stdout.includes('main')) defaultBranch = 'main';
        else if (stdout.includes('master')) defaultBranch = 'master';
      } catch {
        // Default to main
      }
    }

    // Create the worktree with a new branch based on default branch
    await execAsync(
      `git worktree add "${worktreePath}" -b "${branchName}" ${defaultBranch}`,
      { cwd: repoDir }
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
    console.error('Create worktree error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
