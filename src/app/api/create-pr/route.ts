import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

interface CreatePRRequest {
  taskId: string;
  title: string;
  description?: string;
  branch: string;
  baseBranch?: string;
  backlogPath?: string;
}

interface PRResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  error?: string;
}

export async function POST(request: Request): Promise<NextResponse<PRResult>> {
  try {
    const body = await request.json() as CreatePRRequest;
    const { taskId, title, description, branch, baseBranch = 'main', backlogPath } = body;

    if (!taskId || !title || !branch) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: taskId, title, branch' },
        { status: 400 }
      );
    }

    // Determine the repo directory
    const repoDir = backlogPath
      ? path.dirname(path.resolve(process.cwd(), backlogPath))
      : process.cwd();

    console.log(`[create-pr] Creating PR for branch ${branch} in ${repoDir}`);

    // Check if gh CLI is available
    try {
      await execAsync('which gh', { cwd: repoDir });
    } catch {
      return NextResponse.json({
        success: false,
        error: 'GitHub CLI (gh) is not installed. Install from https://cli.github.com and run `gh auth login`',
      });
    }

    // Check if user is authenticated
    try {
      await execAsync('gh auth status', { cwd: repoDir });
    } catch {
      return NextResponse.json({
        success: false,
        error: 'GitHub CLI is not authenticated. Run `gh auth login` to authenticate.',
      });
    }

    // Check if branch exists on remote, if not push it
    try {
      const { stdout: branchCheck } = await execAsync(
        `git ls-remote --heads origin ${branch}`,
        { cwd: repoDir }
      );
      if (!branchCheck.trim()) {
        console.log(`[create-pr] Branch ${branch} not on remote, pushing...`);
        await execAsync(`git push -u origin ${branch}`, { cwd: repoDir });
      }
    } catch (err) {
      console.log(`[create-pr] Could not check/push branch: ${err}`);
      // Try to push anyway
      try {
        await execAsync(`git push -u origin ${branch}`, { cwd: repoDir });
      } catch (pushErr) {
        return NextResponse.json({
          success: false,
          error: `Failed to push branch ${branch}: ${pushErr instanceof Error ? pushErr.message : 'Unknown error'}`,
        });
      }
    }

    // Check if PR already exists for this branch
    try {
      const { stdout: existingPR } = await execAsync(
        `gh pr list --head ${branch} --json number,url --limit 1`,
        { cwd: repoDir }
      );
      const prs = JSON.parse(existingPR);
      if (prs.length > 0) {
        console.log(`[create-pr] PR already exists: ${prs[0].url}`);
        return NextResponse.json({
          success: true,
          prUrl: prs[0].url,
          prNumber: prs[0].number,
        });
      }
    } catch (err) {
      console.log(`[create-pr] Could not check existing PRs: ${err}`);
      // Continue to create PR
    }

    // Build PR body
    const prBody = description || `Automated PR for task: ${title}`;

    // Escape title and body for shell
    const escapedTitle = title.replace(/"/g, '\\"').replace(/`/g, '\\`');
    const escapedBody = prBody.replace(/"/g, '\\"').replace(/`/g, '\\`');

    // Create PR using gh CLI
    const createCmd = `gh pr create --base ${baseBranch} --head ${branch} --title "${escapedTitle}" --body "${escapedBody}"`;
    console.log(`[create-pr] Running: ${createCmd}`);

    const { stdout, stderr } = await execAsync(createCmd, { cwd: repoDir });

    // Parse PR URL from output
    const urlMatch = stdout.match(/https:\/\/github\.com\/[^\s]+/);
    const prUrl = urlMatch ? urlMatch[0] : undefined;

    // Extract PR number from URL
    const prNumberMatch = prUrl?.match(/\/pull\/(\d+)$/);
    const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : undefined;

    if (!prUrl) {
      console.error(`[create-pr] Could not parse PR URL from output: ${stdout}`);
      return NextResponse.json({
        success: false,
        error: `PR created but could not parse URL. Output: ${stdout}`,
      });
    }

    console.log(`[create-pr] PR created: ${prUrl} (#${prNumber})`);

    return NextResponse.json({
      success: true,
      prUrl,
      prNumber,
    });
  } catch (error) {
    console.error('[create-pr] Error:', error);

    // Check for common gh errors
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('already exists')) {
      // PR already exists, try to get its URL
      return NextResponse.json({
        success: false,
        error: 'A pull request for this branch already exists.',
      });
    }

    return NextResponse.json({
      success: false,
      error: errorMessage,
    });
  }
}
