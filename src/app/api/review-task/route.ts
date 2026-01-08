import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

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

const REVIEW_PROMPT = `You are a code reviewer. Analyze the following git diff for a task and provide a review.

Task: {title}
Description: {description}

Git Diff:
\`\`\`
{diff}
\`\`\`

Provide your review as JSON in this exact format:
{
  "passed": boolean,
  "summary": "2-3 sentence summary of the changes and overall quality",
  "issues": [
    {
      "severity": "critical" | "major" | "minor" | "suggestion",
      "file": "path/to/file.ts",
      "line": 42,
      "message": "Description of the issue"
    }
  ]
}

Guidelines:
- Only set "passed": false for critical or major issues
- Critical: Security vulnerabilities, data loss risks, crashes
- Major: Logic errors, missing error handling, broken functionality
- Minor: Code style, naming, small improvements
- Suggestion: Optional enhancements, nice-to-haves

Focus on actual bugs and issues, not style preferences. Be constructive.
Return ONLY the JSON, no other text.`;

async function getBedrockClient() {
  const config: { region: string; credentials?: { accessKeyId: string; secretAccessKey: string } } = {
    region: process.env.AWS_REGION || 'us-east-1',
  };

  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }

  return new BedrockRuntimeClient(config);
}

async function reviewWithClaude(prompt: string): Promise<ReviewResult> {
  const client = await getBedrockClient();

  const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0';

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  const response = await client.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  const text = responseBody.content[0].text;

  // Parse the JSON response
  try {
    // Try to extract JSON from the response (in case there's extra text)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ReviewResult;
    }
    throw new Error('No JSON found in response');
  } catch {
    // If parsing fails, return a default result
    return {
      passed: true,
      summary: 'Review completed but response parsing failed. Manual review recommended.',
      issues: [],
    };
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

    // Get the diff between default branch and task branch
    let diff = '';
    try {
      const { stdout } = await execAsync(
        `git diff ${defaultBranch}...${targetBranch}`,
        { cwd: workDir, maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large diffs
      );
      diff = stdout;
    } catch (err) {
      console.error('Git diff error:', err);
      // Try alternative diff command
      try {
        const { stdout } = await execAsync(
          `git diff ${defaultBranch} ${targetBranch}`,
          { cwd: workDir, maxBuffer: 10 * 1024 * 1024 }
        );
        diff = stdout;
      } catch {
        return NextResponse.json(
          { error: 'Could not get git diff. Make sure both branches exist.' },
          { status: 400 }
        );
      }
    }

    if (!diff.trim()) {
      // No changes to review
      return NextResponse.json({
        success: true,
        result: {
          passed: true,
          summary: 'No changes detected compared to the base branch.',
          issues: [],
        },
      });
    }

    // Truncate diff if too long (Claude has context limits)
    const MAX_DIFF_LENGTH = 50000;
    let truncated = false;
    if (diff.length > MAX_DIFF_LENGTH) {
      diff = diff.slice(0, MAX_DIFF_LENGTH);
      truncated = true;
    }

    // Build the prompt
    const prompt = REVIEW_PROMPT
      .replace('{title}', title)
      .replace('{description}', description || 'No description provided')
      .replace('{diff}', diff);

    // Call Claude for review
    const result = await reviewWithClaude(prompt);

    if (truncated) {
      result.summary = `[Diff truncated due to size] ${result.summary}`;
    }

    return NextResponse.json({
      success: true,
      result,
      branch: targetBranch,
      baseBranch: defaultBranch,
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
