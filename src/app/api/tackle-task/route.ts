import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

interface TackleRequest {
  taskId: string;
  title: string;
  description?: string;
  category?: string;
  priority?: string;
  backlogPath?: string;
  worktreePath?: string;  // If already created
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
    const { taskId, title, description, category, priority, backlogPath, worktreePath } =
      await request.json() as TackleRequest;

    if (!title || !taskId) {
      return NextResponse.json({ error: 'Title and taskId are required' }, { status: 400 });
    }

    // Determine the repo directory
    const repoDir = backlogPath ? path.dirname(backlogPath) : process.cwd();

    // Determine target directory - use worktree if exists
    let targetDir = repoDir;
    let branch: string | undefined;

    if (worktreePath) {
      // Worktree path provided - use it
      const absoluteWorktreePath = path.isAbsolute(worktreePath)
        ? worktreePath
        : path.join(repoDir, worktreePath);
      try {
        await fs.access(absoluteWorktreePath);
        targetDir = absoluteWorktreePath;
      } catch {
        // Worktree doesn't exist at provided path
      }
    } else {
      // Try to find or create worktree
      const tasksDir = path.join(repoDir, '.tasks');
      const worktreeName = `task-${taskId.slice(0, 8)}`;
      const potentialWorktreePath = path.join(tasksDir, worktreeName);
      const branchName = `task/${taskId.slice(0, 8)}-${slugify(title)}`;

      try {
        await fs.access(potentialWorktreePath);
        targetDir = potentialWorktreePath;
        branch = branchName;
      } catch {
        // Worktree doesn't exist - create it
        try {
          await fs.mkdir(tasksDir, { recursive: true });

          // Ensure .tasks is in .gitignore
          const gitignorePath = path.join(repoDir, '.gitignore');
          try {
            const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
            if (!gitignoreContent.includes('.tasks')) {
              await fs.appendFile(gitignorePath, '\n# Task worktrees\n.tasks/\n');
            }
          } catch {
            await fs.writeFile(gitignorePath, '# Task worktrees\n.tasks/\n');
          }

          // Get default branch
          let defaultBranch = 'main';
          try {
            const { stdout } = await execAsync('git branch --list main master', { cwd: repoDir });
            if (stdout.includes('main')) defaultBranch = 'main';
            else if (stdout.includes('master')) defaultBranch = 'master';
          } catch {}

          await execAsync(
            `git worktree add "${potentialWorktreePath}" -b "${branchName}" ${defaultBranch}`,
            { cwd: repoDir }
          );
          targetDir = potentialWorktreePath;
          branch = branchName;
        } catch (err) {
          console.warn('Failed to create worktree:', err);
          // Fall back to repo dir
        }
      }
    }

    // Build the prompt for Claude Code
    const promptParts = [`Task: ${title}`];

    if (priority) {
      promptParts.push(`Priority: ${priority}`);
    }

    if (category) {
      promptParts.push(`Category: ${category}`);
    }

    if (branch) {
      promptParts.push(`Branch: ${branch}`);
    }

    if (description) {
      promptParts.push(`\nDescription:\n${description}`);
    }

    const prompt = promptParts.join('\n');

    // Escape single quotes for shell
    const escapedPrompt = prompt.replace(/'/g, "'\\''");

    // The command to run claude with the task context
    const claudeCommand = `claude '${escapedPrompt}'`;

    // Copy to clipboard using pbcopy (macOS)
    try {
      await execAsync(`echo '${escapedPrompt}' | pbcopy`);
    } catch {
      console.warn('Failed to copy to clipboard');
    }

    // Open VS Code in a new window at the target directory (worktree or repo)
    try {
      await execAsync(`code -n "${targetDir}"`);
    } catch {
      console.warn('Failed to open VS Code');
    }

    return NextResponse.json({
      success: true,
      command: claudeCommand,
      targetDir,
      branch,
      message: 'Command copied to clipboard. Open VS Code terminal and paste to start!',
    });
  } catch (error) {
    console.error('Tackle task error:', error);
    return NextResponse.json(
      { error: 'Failed to prepare task' },
      { status: 500 }
    );
  }
}
