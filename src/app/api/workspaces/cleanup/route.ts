/**
 * API endpoint for workspace cleanup.
 * POST - Clean up eligible workspaces based on retention policy.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getAllWorkspaces,
  getCleanupCandidates,
  deleteWorkspace,
} from '@/lib/db/workspaces';
import { getExecutionsForTask, type TaskSource } from '@/lib/db/executions';
import { execWithTimeout } from '@/lib/resilience';
import fs from 'fs';
import path from 'path';

interface CleanupResult {
  workspaceId: string;
  worktreePath: string;
  status: 'cleaned' | 'skipped';
  reason?: string;
}

/**
 * Check if a workspace has uncommitted changes.
 */
async function hasUncommittedChanges(worktreePath: string): Promise<boolean> {
  try {
    const { stdout } = await execWithTimeout(
      `git -C "${worktreePath}" status --porcelain`,
      {},
      5000
    );
    return stdout.trim().length > 0;
  } catch {
    // If git command fails, assume there might be changes (safe default)
    return true;
  }
}

/**
 * Check if any agent is currently running for this task.
 */
async function hasRunningExecution(
  taskSource: TaskSource,
  taskId: string
): Promise<boolean> {
  const executions = await getExecutionsForTask(taskSource, taskId);
  return executions.some((e) => e.status === 'running');
}

/**
 * Remove a git worktree.
 */
async function removeWorktree(worktreePath: string): Promise<void> {
  const projectRoot = process.cwd();

  // Get the worktree name from path
  const worktreeName = path.basename(worktreePath);

  // Remove the worktree using git
  await execWithTimeout(
    `git worktree remove "${worktreeName}" --force`,
    { cwd: projectRoot },
    15000
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      retentionHours = 24,
      dryRun = false,
      workspaceIds, // Optional: specific workspaces to clean
    } = body;

    let candidates: Awaited<ReturnType<typeof getAllWorkspaces>>;

    if (workspaceIds && Array.isArray(workspaceIds)) {
      // Clean specific workspaces
      const allWorkspaces = await getAllWorkspaces();
      candidates = allWorkspaces.filter((w) => workspaceIds.includes(w.id));
    } else {
      // Clean based on retention policy
      candidates = await getCleanupCandidates(retentionHours);
    }

    const results: CleanupResult[] = [];

    for (const workspace of candidates) {
      // Safety check 1: Skip if workspace doesn't exist on disk
      if (!fs.existsSync(workspace.worktreePath)) {
        // Clean up orphaned DB record
        if (!dryRun) {
          await deleteWorkspace(workspace.id);
        }
        results.push({
          workspaceId: workspace.id,
          worktreePath: workspace.worktreePath,
          status: 'cleaned',
          reason: 'Worktree already removed from disk',
        });
        continue;
      }

      // Safety check 2: Skip if agent is running
      const isRunning = await hasRunningExecution(
        workspace.taskSource as TaskSource,
        workspace.taskId
      );
      if (isRunning) {
        results.push({
          workspaceId: workspace.id,
          worktreePath: workspace.worktreePath,
          status: 'skipped',
          reason: 'Agent is currently running',
        });
        continue;
      }

      // Safety check 3: Skip if uncommitted changes
      const hasChanges = await hasUncommittedChanges(workspace.worktreePath);
      if (hasChanges) {
        results.push({
          workspaceId: workspace.id,
          worktreePath: workspace.worktreePath,
          status: 'skipped',
          reason: 'Has uncommitted changes',
        });
        continue;
      }

      // Clean up the workspace
      if (!dryRun) {
        try {
          await removeWorktree(workspace.worktreePath);
          await deleteWorkspace(workspace.id);
          results.push({
            workspaceId: workspace.id,
            worktreePath: workspace.worktreePath,
            status: 'cleaned',
          });
        } catch (error) {
          results.push({
            workspaceId: workspace.id,
            worktreePath: workspace.worktreePath,
            status: 'skipped',
            reason: `Failed to remove: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      } else {
        results.push({
          workspaceId: workspace.id,
          worktreePath: workspace.worktreePath,
          status: 'cleaned',
          reason: 'Dry run - would be cleaned',
        });
      }
    }

    const cleaned = results.filter((r) => r.status === 'cleaned').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;

    return NextResponse.json({
      results,
      summary: {
        total: results.length,
        cleaned,
        skipped,
        dryRun,
      },
    });
  } catch (error) {
    console.error('[workspaces/cleanup] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to clean up workspaces' },
      { status: 500 }
    );
  }
}
