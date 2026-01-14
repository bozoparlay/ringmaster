import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { execWithTimeout } from '@/lib/resilience';

const GIT_COMMAND_TIMEOUT_MS = 15000;

interface CleanupResult {
  success: boolean;
  cleaned: string[];
  failed: string[];
  freedBytes?: number;
  error?: string;
}

async function getDirectorySize(dirPath: string): Promise<number> {
  let size = 0;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += await getDirectorySize(fullPath);
      } else {
        const stat = await fs.stat(fullPath);
        size += stat.size;
      }
    }
  } catch {
    // Ignore errors (permission issues, etc.)
  }
  return size;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { repoDir } = body as { repoDir?: string };

    const workDir = repoDir || process.cwd();
    const tasksDir = path.join(workDir, '.tasks');

    // Check if .tasks directory exists
    try {
      await fs.access(tasksDir);
    } catch {
      return NextResponse.json({
        success: true,
        cleaned: [],
        failed: [],
        freedBytes: 0,
        message: 'No .tasks directory found',
      });
    }

    // Get registered worktrees
    const { stdout: worktreeList } = await execWithTimeout(
      'git worktree list --porcelain',
      { cwd: workDir },
      GIT_COMMAND_TIMEOUT_MS
    );

    const registeredPaths = new Set<string>();
    for (const line of worktreeList.split('\n')) {
      if (line.startsWith('worktree ')) {
        registeredPaths.add(line.replace('worktree ', ''));
      }
    }

    // Get directories in .tasks
    const entries = await fs.readdir(tasksDir, { withFileTypes: true });
    const taskDirs = entries
      .filter(e => e.isDirectory() && e.name.startsWith('task-'))
      .map(e => e.name);

    const cleaned: string[] = [];
    const failed: string[] = [];
    let freedBytes = 0;

    for (const taskDir of taskDirs) {
      const fullPath = path.join(tasksDir, taskDir);
      const isRegistered = registeredPaths.has(fullPath);

      if (!isRegistered) {
        // This is an orphaned directory
        try {
          const dirSize = await getDirectorySize(fullPath);
          await fs.rm(fullPath, { recursive: true, force: true });
          cleaned.push(taskDir);
          freedBytes += dirSize;
        } catch (err) {
          console.error(`Failed to remove ${taskDir}:`, err);
          failed.push(taskDir);
        }
      }
    }

    // Prune any stale worktree references
    try {
      await execWithTimeout('git worktree prune', { cwd: workDir }, GIT_COMMAND_TIMEOUT_MS);
    } catch {
      // Non-fatal, continue
    }

    return NextResponse.json({
      success: true,
      cleaned,
      failed,
      freedBytes,
    } as CleanupResult);

  } catch (error) {
    console.error('Cleanup worktrees error:', error);
    return NextResponse.json(
      {
        success: false,
        cleaned: [],
        failed: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      } as CleanupResult,
      { status: 500 }
    );
  }
}

export async function GET() {
  // GET request returns info about orphaned worktrees without deleting
  try {
    const workDir = process.cwd();
    const tasksDir = path.join(workDir, '.tasks');

    try {
      await fs.access(tasksDir);
    } catch {
      return NextResponse.json({
        orphaned: [],
        totalSize: 0,
      });
    }

    const { stdout: worktreeList } = await execWithTimeout(
      'git worktree list --porcelain',
      { cwd: workDir },
      GIT_COMMAND_TIMEOUT_MS
    );

    const registeredPaths = new Set<string>();
    for (const line of worktreeList.split('\n')) {
      if (line.startsWith('worktree ')) {
        registeredPaths.add(line.replace('worktree ', ''));
      }
    }

    const entries = await fs.readdir(tasksDir, { withFileTypes: true });
    const taskDirs = entries
      .filter(e => e.isDirectory() && e.name.startsWith('task-'))
      .map(e => e.name);

    const orphaned: Array<{ name: string; size: number }> = [];
    let totalSize = 0;

    for (const taskDir of taskDirs) {
      const fullPath = path.join(tasksDir, taskDir);
      const isRegistered = registeredPaths.has(fullPath);

      if (!isRegistered) {
        const size = await getDirectorySize(fullPath);
        orphaned.push({ name: taskDir, size });
        totalSize += size;
      }
    }

    return NextResponse.json({
      orphaned,
      totalSize,
    });

  } catch (error) {
    console.error('Get orphaned worktrees error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
