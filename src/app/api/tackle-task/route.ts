import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import path from 'path';
import { execWithTimeout, TimeoutError } from '@/lib/resilience';
import { buildTaskPrompt } from '@/lib/prompt-builder';

// Timeouts for various operations
const GIT_COMMAND_TIMEOUT_MS = 15000;   // 15s for git commands
const GIT_WORKTREE_TIMEOUT_MS = 30000;  // 30s for worktree creation
const EXTERNAL_APP_TIMEOUT_MS = 5000;   // 5s for opening VS Code, clipboard

type IdeType = 'vscode' | 'terminal' | 'cursor' | 'kiro';

interface TackleRequest {
  taskId: string;
  title: string;
  description?: string;
  category?: string;
  priority?: string;
  tags?: string[];
  acceptanceCriteria?: string[];
  notes?: string;
  effort?: string;
  value?: string;
  backlogPath?: string;
  worktreePath?: string;  // If already created
  ide?: IdeType;
}

// IDE launch commands
const IDE_COMMANDS: Record<IdeType, string> = {
  vscode: 'code -n',
  cursor: 'cursor',
  kiro: 'kiro',
  terminal: '', // No IDE to launch
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export async function POST(request: Request) {
  try {
    const {
      taskId,
      title,
      description,
      category,
      priority,
      tags,
      acceptanceCriteria,
      notes,
      effort,
      value,
      backlogPath,
      worktreePath,
      ide = 'vscode'
    } = await request.json() as TackleRequest;

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
            const { stdout } = await execWithTimeout(
              'git branch --list main master',
              { cwd: repoDir },
              GIT_COMMAND_TIMEOUT_MS
            );
            if (stdout.includes('main')) defaultBranch = 'main';
            else if (stdout.includes('master')) defaultBranch = 'master';
          } catch {}

          await execWithTimeout(
            `git worktree add "${potentialWorktreePath}" -b "${branchName}" ${defaultBranch}`,
            { cwd: repoDir },
            GIT_WORKTREE_TIMEOUT_MS
          );
          targetDir = potentialWorktreePath;
          branch = branchName;
        } catch (err) {
          console.warn('Failed to create worktree:', err);
          // Fall back to repo dir
        }
      }
    }

    // Build the prompt for Claude Code using the canonical prompt builder
    const prompt = buildTaskPrompt({
      title,
      priority,
      category,
      tags,
      description,
      acceptanceCriteria,
      notes,
      effort,
      value,
      branch,
    });

    // Escape single quotes for shell
    const escapedPrompt = prompt.replace(/'/g, "'\\''");

    // The command to run claude with the task context
    const claudeCommand = `claude '${escapedPrompt}'`;

    // Copy to clipboard using pbcopy (macOS) - non-critical, use short timeout
    try {
      await execWithTimeout(
        `echo '${escapedPrompt}' | pbcopy`,
        {},
        EXTERNAL_APP_TIMEOUT_MS
      );
    } catch (err) {
      // Log timeout vs other errors differently
      if (err instanceof TimeoutError) {
        console.warn('[tackle-task] Clipboard operation timed out');
      } else {
        console.warn('[tackle-task] Failed to copy to clipboard');
      }
    }

    // Open the selected IDE in a new window at the target directory (worktree or repo)
    // This can fail if the IDE isn't installed - non-critical
    const ideCommand = IDE_COMMANDS[ide];
    if (ideCommand) {
      try {
        await execWithTimeout(
          `${ideCommand} "${targetDir}"`,
          {},
          EXTERNAL_APP_TIMEOUT_MS
        );
      } catch (err) {
        if (err instanceof TimeoutError) {
          console.warn(`[tackle-task] ${ide} launch timed out`);
        } else {
          console.warn(`[tackle-task] Failed to open ${ide}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      command: claudeCommand,
      prompt, // Return the generated prompt for potential client use
      targetDir,
      branch,
      ide,
      message: ide === 'terminal'
        ? 'Command copied to clipboard. Paste in your terminal to start!'
        : `Opening ${ide}... Command copied to clipboard!`,
    });
  } catch (error) {
    // Handle timeout errors with appropriate status code
    if (error instanceof TimeoutError) {
      console.error(`[tackle-task] Operation timed out: ${error.message}`);
      return NextResponse.json(
        { error: 'Operation timed out. Please try again.' },
        { status: 504 }
      );
    }

    console.error('[tackle-task] Error:', error);
    return NextResponse.json(
      { error: 'Failed to prepare task' },
      { status: 500 }
    );
  }
}
