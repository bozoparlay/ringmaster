import { NextResponse } from 'next/server';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { fromIni } from '@aws-sdk/credential-providers';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

// Initialize Bedrock client with profile support
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: fromIni({
    profile: process.env.AWS_PROFILE || 'bozo',
  }),
});

const CLAUDE_MODEL_ID = 'us.anthropic.claude-sonnet-4-20250514-v1:0';

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
 * Get git diff between branches
 */
async function getGitDiff(workDir: string, baseBranch: string, targetBranch: string): Promise<string> {
  try {
    // Try three-dot syntax first (commits on target not in base)
    const { stdout } = await execAsync(
      `git diff ${baseBranch}...${targetBranch}`,
      { cwd: workDir, maxBuffer: 10 * 1024 * 1024 }
    );
    return stdout;
  } catch {
    // Fallback to two-dot syntax
    const { stdout } = await execAsync(
      `git diff ${baseBranch} ${targetBranch}`,
      { cwd: workDir, maxBuffer: 10 * 1024 * 1024 }
    );
    return stdout;
  }
}

/**
 * Review code changes using Bedrock API directly
 */
async function reviewWithBedrock(
  diff: string,
  title: string,
  description: string
): Promise<ReviewResult> {
  const prompt = `You are reviewing code changes for a task. Analyze the git diff thoroughly.

Task: ${title}
Description: ${description || 'No description provided'}

Git Diff:
\`\`\`diff
${diff.slice(0, 50000)}
\`\`\`
${diff.length > 50000 ? '\n[Diff truncated due to length]' : ''}

Instructions:
1. Review the diff for code quality issues
2. Compare the implementation against the task requirements in the description
3. Check if the implementation scope matches what was requested
4. Return your review as JSON

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

  console.log(`[review-task] Calling Bedrock API with diff length: ${diff.length}`);

  const command = new ConverseCommand({
    modelId: CLAUDE_MODEL_ID,
    messages: [
      {
        role: 'user',
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      maxTokens: 4096,
      temperature: 0.3,
    },
  });

  const response = await bedrockClient.send(command);

  const assistantMessage = response.output?.message?.content?.[0];
  if (!assistantMessage || assistantMessage.text === undefined) {
    throw new Error('No response from Bedrock');
  }

  const responseText = assistantMessage.text;
  console.log(`[review-task] Bedrock response length: ${responseText.length}`);

  // Parse JSON from response
  const jsonMatch = responseText.match(/\{[\s\S]*?"passed"[\s\S]*?"summary"[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[review-task] No JSON found in response:', responseText.slice(0, 500));
    throw new Error('No valid JSON found in Bedrock response');
  }

  try {
    const result = JSON.parse(jsonMatch[0]) as ReviewResult;
    return result;
  } catch (parseError) {
    console.error('[review-task] JSON parse error:', parseError);
    console.error('[review-task] Raw JSON:', jsonMatch[0].slice(0, 500));
    throw new Error(`Failed to parse review JSON: ${parseError}`);
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

    // Get the git diff
    console.log(`[review-task] Getting diff: ${defaultBranch}...${targetBranch} in ${workDir}`);
    let diff: string;
    try {
      diff = await getGitDiff(workDir, defaultBranch, targetBranch);
    } catch (diffError) {
      return NextResponse.json(
        { error: `Could not get git diff: ${diffError}` },
        { status: 400 }
      );
    }

    if (!diff.trim()) {
      return NextResponse.json({
        success: true,
        result: {
          passed: true,
          summary: 'No changes detected compared to the base branch.',
          issues: [],
        },
      });
    }

    // Run the review with Bedrock
    const startTime = Date.now();
    const result = await reviewWithBedrock(diff, title, description || '');
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
      reviewedBy: 'bedrock-api',
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
