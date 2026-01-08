import { NextResponse } from 'next/server';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

interface ReviewRequest {
  taskId: string;
  title: string;
  description?: string;
  branch?: string;
  worktreePath?: string;
  backlogPath?: string;
}

interface ReviewIssue {
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  file?: string;
  line?: number;
  message: string;
}

interface ReviewResult {
  passed: boolean;
  summary: string;
  issues: ReviewIssue[];
}

/**
 * Review code changes using Claude Code CLI.
 * Claude Code has access to the full codebase and can use tools like grep, read files, etc.
 */
async function reviewWithClaudeCode(
  workDir: string,
  branch: string,
  baseBranch: string,
  title: string,
  description: string
): Promise<ReviewResult> {
  const prompt = `You are reviewing code changes for a task. Analyze the changes thoroughly.

Task: ${title}
Description: ${description || 'No description provided'}

The changes are on branch "${branch}" compared to "${baseBranch}".

Instructions:
1. Run: git diff ${baseBranch}...${branch}
2. Review the diff for issues - read relevant files if you need more context
3. Return your review as JSON

Return ONLY this JSON structure (no markdown, no explanation):
{
  "passed": boolean,
  "summary": "2-3 sentence summary of changes and quality",
  "issues": [
    {
      "severity": "critical" | "major" | "minor" | "suggestion",
      "file": "path/to/file.ts",
      "line": 42,
      "message": "Description of the issue"
    }
  ]
}

Severity guidelines:
- critical: Security vulnerabilities, data loss risks, crashes
- major: Logic errors, missing error handling, broken functionality
- minor: Code style, naming, small improvements
- suggestion: Optional enhancements

Only set "passed": false for critical or major issues.
Focus on real bugs and issues, not style preferences.`;

  return new Promise((resolve, reject) => {
    // Use spawn to run claude CLI in print mode
    const claude = spawn('claude', ['-p', prompt, '--output-format', 'text'], {
      cwd: workDir,
      env: { ...process.env, FORCE_COLOR: '0' },
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    claude.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    claude.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    claude.on('close', (code: number | null) => {
      if (code !== 0) {
        console.error('Claude Code stderr:', stderr);
        reject(new Error(`Claude Code exited with code ${code}`));
        return;
      }

      // Parse JSON from response - find the JSON object in the output
      try {
        // Look for JSON object pattern
        const jsonMatch = stdout.match(/\{[\s\S]*?"passed"[\s\S]*?"summary"[\s\S]*?\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]) as ReviewResult;
          resolve(result);
        } else {
          console.error('Claude Code output:', stdout);
          reject(new Error('No valid JSON found in Claude Code response'));
        }
      } catch (err) {
        console.error('Parse error. Output was:', stdout);
        reject(new Error(`Failed to parse Claude Code response: ${err}`));
      }
    });

    claude.on('error', (err: Error) => {
      reject(new Error(`Failed to spawn Claude Code: ${err.message}`));
    });

    // Set a timeout for the review (5 minutes max)
    setTimeout(() => {
      claude.kill();
      reject(new Error('Claude Code review timed out after 5 minutes'));
    }, 5 * 60 * 1000);
  });
}

/**
 * Check if Claude Code CLI is available
 */
async function isClaudeCodeAvailable(): Promise<boolean> {
  try {
    await execAsync('which claude');
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const { taskId, title, description, branch, worktreePath, backlogPath } =
      await request.json() as ReviewRequest;

    if (!taskId || !title) {
      return NextResponse.json({ error: 'taskId and title are required' }, { status: 400 });
    }

    // Determine the repo and worktree directories
    const repoDir = backlogPath ? path.dirname(backlogPath) : process.cwd();
    let workDir = repoDir;

    if (worktreePath) {
      const absoluteWorktreePath = path.isAbsolute(worktreePath)
        ? worktreePath
        : path.join(repoDir, worktreePath);
      workDir = absoluteWorktreePath;
    }

    // Determine branch name if not provided
    let targetBranch = branch;
    if (!targetBranch) {
      try {
        const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: workDir });
        targetBranch = stdout.trim();
      } catch {
        return NextResponse.json(
          { error: 'Could not determine branch name' },
          { status: 400 }
        );
      }
    }

    // Get the default branch (main or master)
    let defaultBranch = 'main';
    try {
      const { stdout } = await execAsync('git branch --list main master', { cwd: repoDir });
      if (stdout.includes('main')) defaultBranch = 'main';
      else if (stdout.includes('master')) defaultBranch = 'master';
    } catch {}

    // Check if there are any changes to review
    let hasChanges = false;
    try {
      const { stdout } = await execAsync(
        `git diff ${defaultBranch}...${targetBranch} --stat`,
        { cwd: workDir }
      );
      hasChanges = stdout.trim().length > 0;
    } catch {
      // Try alternative diff
      try {
        const { stdout } = await execAsync(
          `git diff ${defaultBranch} ${targetBranch} --stat`,
          { cwd: workDir }
        );
        hasChanges = stdout.trim().length > 0;
      } catch {
        return NextResponse.json(
          { error: 'Could not get git diff. Make sure both branches exist.' },
          { status: 400 }
        );
      }
    }

    if (!hasChanges) {
      return NextResponse.json({
        success: true,
        result: {
          passed: true,
          summary: 'No changes detected compared to the base branch.',
          issues: [],
        },
      });
    }

    // Check if Claude Code is available
    const claudeAvailable = await isClaudeCodeAvailable();
    if (!claudeAvailable) {
      return NextResponse.json(
        { error: 'Claude Code CLI is not installed. Please install it first: https://docs.anthropic.com/en/docs/claude-code' },
        { status: 500 }
      );
    }

    // Run the review with Claude Code
    const result = await reviewWithClaudeCode(
      workDir,
      targetBranch,
      defaultBranch,
      title,
      description || ''
    );

    return NextResponse.json({
      success: true,
      result,
      branch: targetBranch,
      baseBranch: defaultBranch,
      reviewedBy: 'claude-code',
    });
  } catch (error) {
    console.error('Review task error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
