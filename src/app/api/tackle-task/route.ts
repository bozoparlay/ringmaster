import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execWithTimeout, TimeoutError } from '@/lib/resilience';
import { buildTaskPrompt } from '@/lib/prompt-builder';
import { createExecution, type TaskSource } from '@/lib/db/executions';
import { upsertWorkspace } from '@/lib/db/workspaces';

/**
 * Expand ~ to the user's home directory.
 * Shell doesn't expand ~ inside double quotes, so we need to handle it in Node.
 */
function expandTilde(filepath: string): string {
  if (filepath.startsWith('~/')) {
    return path.join(os.homedir(), filepath.slice(2));
  }
  if (filepath === '~') {
    return os.homedir();
  }
  return filepath;
}

// Timeouts for various operations
const GIT_COMMAND_TIMEOUT_MS = 15000;   // 15s for git commands
const GIT_WORKTREE_TIMEOUT_MS = 30000;  // 30s for worktree creation
const EXTERNAL_APP_TIMEOUT_MS = 5000;   // 5s for opening VS Code, clipboard

type IdeType = 'vscode' | 'terminal' | 'cursor' | 'kiro' | 'worktree' | 'iterm-interactive';

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
  taskSource?: TaskSource;  // 'file' | 'github' | 'quick'
  model?: string;  // Claude CLI model name (opus, sonnet, haiku)
}

// IDE launch commands (empty = no simple command, handled specially)
const IDE_COMMANDS: Record<IdeType, string> = {
  vscode: 'code -n',
  cursor: 'cursor',
  kiro: 'kiro',
  terminal: '', // No IDE to launch, but still copy to clipboard
  worktree: '', // GAP #4: No IDE and no clipboard - just create worktree
  'iterm-interactive': '', // Special handling: opens iTerm with Claude running
};

/**
 * Spawn iTerm2 with Claude running in the worktree directory.
 * Uses AppleScript to open a new iTerm window and run Claude with the prompt.
 *
 * We write the prompt to a temp file to avoid shell escaping issues with
 * newlines, quotes, backticks, etc.
 */
async function spawnItermWithClaude(worktreePath: string, prompt: string, model: string): Promise<void> {
  const timestamp = Date.now();
  const tempPromptPath = path.join('/tmp', `ringmaster-prompt-${timestamp}.txt`);
  const tempScriptPath = path.join('/tmp', `ringmaster-iterm-${timestamp}.scpt`);

  // Write prompt to temp file (avoids all escaping issues)
  await fs.writeFile(tempPromptPath, prompt);

  // Build the shell command - read prompt from file
  // Using $() to read file contents as the prompt argument
  const shellCommand = `cd "${worktreePath}" && claude --model ${model} "$(cat '${tempPromptPath}')"`;

  const appleScript = `
tell application "iTerm2"
  create window with default profile
  tell current session of current window
    write text ${JSON.stringify(shellCommand)}
  end tell
  activate
end tell
`;

  try {
    await fs.writeFile(tempScriptPath, appleScript);
    await execWithTimeout(
      `osascript "${tempScriptPath}"`,
      {},
      EXTERNAL_APP_TIMEOUT_MS + 2000
    );
  } finally {
    // Clean up AppleScript file (keep prompt file - Claude needs it)
    // The prompt file will be cleaned up on next run or by OS
    try {
      await fs.unlink(tempScriptPath);
    } catch {
      // Ignore cleanup errors
    }
  }
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
      ide = 'vscode',
      taskSource = 'file',
      model = 'sonnet'  // Default to sonnet if not specified
    } = await request.json() as TackleRequest;

    if (!title || !taskId) {
      return NextResponse.json({ error: 'Title and taskId are required' }, { status: 400 });
    }

    // Determine the repo directory (expand ~ to home directory)
    const repoDir = backlogPath ? path.dirname(expandTilde(backlogPath)) : process.cwd();

    // Determine target directory - use worktree if exists
    let targetDir = repoDir;
    let branch: string | undefined;

    if (worktreePath) {
      // Worktree path provided - use it (expand ~ to home directory)
      const expandedWorktreePath = expandTilde(worktreePath);
      const absoluteWorktreePath = path.isAbsolute(expandedWorktreePath)
        ? expandedWorktreePath
        : path.join(repoDir, expandedWorktreePath);
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

    // Create execution record in database
    let execution;
    try {
      execution = await createExecution({
        taskSource,
        taskId,
        taskTitle: title,
        prompt,
      });
      console.log(`[tackle-task] Created execution ${execution.id} for task ${taskId}`);
    } catch (err) {
      console.error('[tackle-task] Failed to create execution record:', err);
      // Non-fatal - continue without execution tracking
    }

    // Track workspace in database if we have a worktree
    if (branch && targetDir !== repoDir) {
      try {
        await upsertWorkspace({
          taskSource,
          taskId,
          worktreePath: targetDir,
          branch,
        });
        console.log(`[tackle-task] Tracked workspace for task ${taskId}`);
      } catch (err) {
        console.error('[tackle-task] Failed to track workspace:', err);
        // Non-fatal - continue without workspace tracking
      }
    }

    // Escape single quotes for shell
    const escapedPrompt = prompt.replace(/'/g, "'\\''");

    // The command to run claude with the task context (with model flag)
    const claudeCommand = `claude --model ${model} '${escapedPrompt}'`;

    // Handle iTerm interactive mode specially - spawns iTerm with Claude running
    if (ide === 'iterm-interactive') {
      try {
        await spawnItermWithClaude(targetDir, prompt, model);
        console.log(`[tackle-task] Spawned iTerm with Claude for task ${taskId}`);
      } catch (err) {
        if (err instanceof TimeoutError) {
          console.warn('[tackle-task] iTerm launch timed out');
        } else {
          console.warn('[tackle-task] Failed to launch iTerm:', err);
        }
        // Fallback: copy to clipboard so user can still paste manually
        try {
          await execWithTimeout(
            `echo '${escapedPrompt}' | pbcopy`,
            {},
            EXTERNAL_APP_TIMEOUT_MS
          );
        } catch {
          // Clipboard fallback also failed, but we continue
        }
      }

      return NextResponse.json({
        success: true,
        command: claudeCommand,
        prompt,
        targetDir,
        branch,
        ide,
        model,
        executionId: execution?.id,
        message: `Opening iTerm with Claude (${model})... You can interact directly!`,
      });
    }

    // Copy to clipboard using pbcopy (macOS) - skip for worktree-only mode
    if (ide !== 'worktree') {
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
      model,
      executionId: execution?.id,
      message: ide === 'terminal'
        ? `Command copied to clipboard (${model}). Paste in your terminal to start!`
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
