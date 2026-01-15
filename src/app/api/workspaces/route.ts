/**
 * API routes for workspaces.
 * GET - List all workspaces with disk usage
 * POST - Create/update workspace
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllWorkspaces, upsertWorkspace } from '@/lib/db/workspaces';
import type { TaskSource } from '@/lib/db/executions';
import fs from 'fs';
import path from 'path';

/**
 * Calculate disk usage for a directory.
 */
async function getDiskUsage(dirPath: string): Promise<number> {
  try {
    if (!fs.existsSync(dirPath)) {
      return 0;
    }

    let totalSize = 0;
    const files = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        // Skip .git internals for performance
        if (file.name === '.git') {
          continue;
        }
        totalSize += await getDiskUsage(filePath);
      } else {
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
      }
    }

    return totalSize;
  } catch {
    return 0;
  }
}

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export async function GET() {
  try {
    const workspaces = await getAllWorkspaces();

    // Calculate disk usage for each workspace
    let totalUsage = 0;
    const workspacesWithUsage = await Promise.all(
      workspaces.map(async (ws) => {
        const usage = await getDiskUsage(ws.worktreePath);
        totalUsage += usage;
        return {
          ...ws,
          diskUsageBytes: usage,
          diskUsage: formatBytes(usage),
          exists: fs.existsSync(ws.worktreePath),
        };
      })
    );

    return NextResponse.json({
      workspaces: workspacesWithUsage,
      totalDiskUsageBytes: totalUsage,
      totalDiskUsage: formatBytes(totalUsage),
    });
  } catch (error) {
    console.error('[workspaces] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workspaces' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskSource, taskId, worktreePath, branch, cleanupPolicy } = body;

    if (!taskSource || !taskId || !worktreePath || !branch) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const workspace = await upsertWorkspace({
      taskSource: taskSource as TaskSource,
      taskId,
      worktreePath,
      branch,
      cleanupPolicy,
    });

    return NextResponse.json({ workspace });
  } catch (error) {
    console.error('[workspaces] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create workspace' },
      { status: 500 }
    );
  }
}
