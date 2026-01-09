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

interface ScopeAnalysis {
  aligned: boolean;
  needsRescope: boolean;
  completeness: 'complete' | 'partial' | 'minimal';
  missingRequirements: string[];
  scopeCreep: string[];
  reason?: string;
}

interface ReviewResult {
  passed: boolean;
  summary: string;
  issues: ReviewIssue[];
  scope?: ScopeAnalysis;
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
2. Review the diff for code quality issues - read relevant files if you need more context
3. IMPORTANT: Compare the implementation against the task requirements in the description
4. Check if the implementation scope matches what was requested
5. Return your review as JSON

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
  ],
  "scope": {
    "aligned": boolean,
    "needsRescope": boolean,
    "completeness": "complete" | "partial" | "minimal",
    "missingRequirements": ["requirement that was not implemented"],
    "scopeCreep": ["extra work done that was not in requirements"],
    "reason": "explanation if needsRescope is true"
  }
}

Issue Severity guidelines:
- critical: Security vulnerabilities, data loss risks, crashes
- major: Logic errors, missing error handling, broken functionality
- minor: Code style, naming, small improvements
- suggestion: Optional enhancements

Scope Analysis guidelines:
- aligned: true if implementation reasonably addresses the task description
- needsRescope: true ONLY if there's a significant mismatch between task and implementation
  - Set true if: task fundamentally changed, wrong problem was solved, critical requirements completely missing
  - Set false for: minor missing features, small scope additions, normal iteration
- completeness: "complete" if all requirements met, "partial" if most done, "minimal" if just started
- missingRequirements: list specific requirements from description that aren't implemented
- scopeCreep: list significant work done that wasn't in the original requirements

IMPORTANT for "needsRescope":
- Default to FALSE unless there's clear evidence of fundamental scope mismatch
- Partial implementations should NOT trigger rescope - they're normal in iterative development
- Extra features (scope creep) alone should NOT trigger rescope unless they dominate the changes
- Only set true when the task definition itself needs to be revised

Only set "passed": false for critical or major code quality issues.
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
    const startTime = Date.now();
    const result = await reviewWithClaudeCode(
      workDir,
      targetBranch,
      defaultBranch,
      title,
      description || ''
    );
    const duration = Date.now() - startTime;

    // Log pipeline metrics for monitoring
    const metrics = {
      taskId,
      branch: targetBranch,
      duration,
      passed: result.passed,
      issueCount: result.issues.length,
      criticalIssues: result.issues.filter(i => i.severity === 'critical').length,
      majorIssues: result.issues.filter(i => i.severity === 'major').length,
      scope: result.scope ? {
        aligned: result.scope.aligned,
        needsRescope: result.scope.needsRescope,
        completeness: result.scope.completeness,
        missingCount: result.scope.missingRequirements.length,
        scopeCreepCount: result.scope.scopeCreep.length,
      } : null,
    };
    console.log('[review-task] Review completed:', JSON.stringify(metrics));

    // Log warning if rescope is flagged
    if (result.scope?.needsRescope) {
      console.warn(`[review-task] RESCOPE FLAGGED for task "${title.slice(0, 50)}": ${result.scope.reason || 'No reason provided'}`);
    }

    // Auto-create PR if review passed
    let prInfo: { prUrl?: string; prNumber?: number; prError?: string } = {};
    if (result.passed) {
      console.log('[review-task] Review passed, auto-creating PR...');
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const prResponse = await fetch(`${baseUrl}/api/create-pr`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId,
            title,
            description: description || '',
            branch: targetBranch,
            baseBranch: defaultBranch,
            backlogPath,
          }),
        });

        const prResult = await prResponse.json();
        if (prResult.success) {
          prInfo = {
            prUrl: prResult.prUrl,
            prNumber: prResult.prNumber,
          };
          console.log(`[review-task] PR created: ${prResult.prUrl}`);
        } else {
          prInfo = { prError: prResult.error };
          console.warn(`[review-task] PR creation failed: ${prResult.error}`);
        }
      } catch (prErr) {
        prInfo = { prError: prErr instanceof Error ? prErr.message : 'PR creation failed' };
        console.error('[review-task] PR creation error:', prErr);
      }
    }

    return NextResponse.json({
      success: true,
      result,
      branch: targetBranch,
      baseBranch: defaultBranch,
      reviewedBy: 'claude-code',
      metrics: {
        duration,
        timestamp: new Date().toISOString(),
      },
      ...prInfo, // Include PR info if available
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
