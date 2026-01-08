import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

interface CommitBacklogRequest {
  backlogPath: string;
  message: string;
}

export async function POST(request: Request) {
  try {
    const { backlogPath, message } = await request.json() as CommitBacklogRequest;

    if (!backlogPath || !message) {
      return NextResponse.json(
        { error: 'backlogPath and message are required' },
        { status: 400 }
      );
    }

    const repoDir = path.dirname(backlogPath);
    const backlogFile = path.basename(backlogPath);

    // Check if there are changes to the backlog file
    try {
      const { stdout: statusOutput } = await execAsync(
        `git status --porcelain "${backlogFile}"`,
        { cwd: repoDir }
      );

      if (!statusOutput.trim()) {
        // No changes to commit
        return NextResponse.json({
          success: true,
          committed: false,
          message: 'No changes to backlog file',
        });
      }
    } catch {
      // Git status failed, try to commit anyway
    }

    // Stage the backlog file specifically (not other files)
    await execAsync(`git add "${backlogFile}"`, { cwd: repoDir });

    // Commit with the provided message
    const escapedMessage = message.replace(/'/g, "'\\''");
    await execAsync(`git commit -m '${escapedMessage}'`, { cwd: repoDir });

    // Get the commit SHA
    const { stdout: shaOutput } = await execAsync('git rev-parse HEAD', { cwd: repoDir });
    const commitSha = shaOutput.trim();

    return NextResponse.json({
      success: true,
      committed: true,
      commitSha,
    });
  } catch (error) {
    console.error('Commit backlog error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
