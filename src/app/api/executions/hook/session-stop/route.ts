/**
 * Hook endpoint for Claude Code's Stop event (session completion).
 *
 * When a Claude Code session ends (user exits or task completes), this hook:
 * 1. Checks if the session was in a Ringmaster task worktree
 * 2. If so, auto-moves the task to ai_review status
 * 3. Triggers AI review if configured
 *
 * This enables the automatic Tackle → Work → Review flow.
 *
 * Hook configuration (add to .claude/settings.local.json):
 * {
 *   "hooks": {
 *     "Stop": [{
 *       "matcher": "",
 *       "hooks": [{
 *         "type": "command",
 *         "command": "curl -s -X POST http://localhost:3000/api/executions/hook/session-stop -H 'Content-Type: application/json' -d @-",
 *         "timeout": 5000
 *       }]
 *     }]
 *   }
 * }
 */

import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Expected payload from Claude Code's Stop hook.
 */
interface SessionStopPayload {
  session_id: string;
  cwd?: string;
  // Additional fields that might be present
  total_tokens?: number;
  total_cost?: number;
  duration_ms?: number;
}

/**
 * Extract task ID from a worktree path.
 * Worktrees are created as: .tasks/task-{shortId}-{slug}/
 *
 * @example
 * extractTaskIdFromPath('/Users/me/project/.tasks/task-abc12345-my-feature/')
 * // Returns: 'abc12345' (the short ID prefix)
 */
function extractTaskIdFromPath(cwdPath: string): string | null {
  // Match .tasks/task-{id} pattern (with optional -slug suffix)
  // Examples: .tasks/task-6860bdfe/ or .tasks/task-6860bdfe-my-feature/
  const match = cwdPath.match(/\.tasks\/task-([a-f0-9]{8})(?:-|\/|$)/);
  return match ? match[1] : null;
}

/**
 * Find the full task ID from a short ID prefix by searching the backlog.
 * Supports both formats:
 * - HTML comment: <!-- ringmaster:id=UUID -->
 * - YAML-style: id: UUID
 */
async function findFullTaskId(shortId: string, backlogPath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(backlogPath, 'utf-8');
    // Look for task ID that starts with the short ID
    // Match both <!-- ringmaster:id=UUID --> and id: UUID formats
    const htmlMatch = content.match(new RegExp(`ringmaster:id=(${shortId}[a-f0-9-]*)`, 'i'));
    if (htmlMatch) return htmlMatch[1];

    const yamlMatch = content.match(new RegExp(`id:\\s*(${shortId}[a-f0-9-]*)`, 'i'));
    return yamlMatch ? yamlMatch[1] : null;
  } catch {
    return null;
  }
}

/**
 * Update task status in the BACKLOG.md file.
 *
 * BACKLOG.md format:
 * ## [in_progress] Category Name
 * ### Task Title
 * <!-- ringmaster:id=UUID -->
 *
 * Status is in the section header, not in task metadata.
 * We need to find the task ID and look backwards for the section header.
 */
async function updateTaskStatus(
  backlogPath: string,
  taskId: string,
  newStatus: string
): Promise<boolean> {
  try {
    let content = await fs.readFile(backlogPath, 'utf-8');
    const lines = content.split('\n');

    // Find the line containing the task ID
    let taskIdLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`ringmaster:id=${taskId}`) || lines[i].includes(`id: ${taskId}`)) {
        taskIdLineIndex = i;
        break;
      }
    }

    if (taskIdLineIndex === -1) {
      console.log(`[session-stop] Task ID ${taskId} not found in backlog`);
      return false;
    }

    // Look backwards for the section header (## [status] Category)
    let sectionLineIndex = -1;
    for (let i = taskIdLineIndex; i >= 0; i--) {
      const match = lines[i].match(/^##\s*\[([\w_]+)\]/);
      if (match) {
        sectionLineIndex = i;
        break;
      }
    }

    if (sectionLineIndex === -1) {
      console.log(`[session-stop] Section header not found for task ${taskId}`);
      return false;
    }

    // Update the status in the section header
    const oldLine = lines[sectionLineIndex];
    const newLine = oldLine.replace(/\[([\w_]+)\]/, `[${newStatus}]`);

    if (oldLine === newLine) {
      console.log(`[session-stop] Status already ${newStatus} for task ${taskId}`);
      return true; // No change needed
    }

    lines[sectionLineIndex] = newLine;
    content = lines.join('\n');
    await fs.writeFile(backlogPath, content, 'utf-8');

    console.log(`[session-stop] Updated task ${taskId} to status: ${newStatus}`);
    return true;
  } catch (error) {
    console.error(`[session-stop] Failed to update task status:`, error);
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const payload: SessionStopPayload = await request.json();

    console.log(`[session-stop] Received: session=${payload.session_id?.substring(0, 8)}..., cwd=${payload.cwd}`);

    // Validate required fields
    if (!payload.cwd) {
      console.log('[session-stop] No cwd provided, ignoring');
      return NextResponse.json({ success: true, ignored: true, reason: 'no_cwd' });
    }

    // Check if this is a Ringmaster task worktree
    const shortTaskId = extractTaskIdFromPath(payload.cwd);
    if (!shortTaskId) {
      console.log('[session-stop] Not a Ringmaster worktree, ignoring');
      return NextResponse.json({ success: true, ignored: true, reason: 'not_worktree' });
    }

    console.log(`[session-stop] Detected task worktree: ${shortTaskId}`);

    // Find the project root (parent of .tasks directory)
    const tasksDir = payload.cwd.match(/(.*)\/\.tasks\//)?.[1];
    if (!tasksDir) {
      console.log('[session-stop] Could not determine project root');
      return NextResponse.json({ success: true, ignored: true, reason: 'no_project_root' });
    }

    // Look for BACKLOG.md in the project root
    const backlogPath = path.join(tasksDir, 'BACKLOG.md');

    try {
      await fs.access(backlogPath);
    } catch {
      console.log('[session-stop] No BACKLOG.md found at', backlogPath);
      return NextResponse.json({ success: true, ignored: true, reason: 'no_backlog' });
    }

    // Find the full task ID
    const fullTaskId = await findFullTaskId(shortTaskId, backlogPath);
    if (!fullTaskId) {
      console.log(`[session-stop] Could not find full task ID for ${shortTaskId}`);
      return NextResponse.json({ success: true, ignored: true, reason: 'task_not_found' });
    }

    // Update task status to ai_review
    const updated = await updateTaskStatus(backlogPath, fullTaskId, 'ai_review');

    if (updated) {
      console.log(`[session-stop] Task ${fullTaskId} moved to ai_review`);
      return NextResponse.json({
        success: true,
        taskId: fullTaskId,
        newStatus: 'ai_review',
      });
    } else {
      return NextResponse.json({
        success: true,
        ignored: true,
        reason: 'update_failed',
      });
    }
  } catch (error) {
    console.error('[session-stop] Error:', error);

    // Don't fail the hook - Claude Code might be waiting
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
