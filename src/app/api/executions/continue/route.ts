/**
 * API endpoint for continuing a task with session context.
 * POST - Create new execution with --resume flag.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createExecution,
  getLatestSessionId,
  type TaskSource,
} from '@/lib/db/executions';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskSource, taskId, taskTitle, prompt } = body;

    if (!taskSource || !taskId) {
      return NextResponse.json(
        { error: 'Missing required fields: taskSource and taskId' },
        { status: 400 }
      );
    }

    // Get the latest session ID for this task
    const sessionId = await getLatestSessionId(
      taskSource as TaskSource,
      taskId
    );

    if (!sessionId) {
      return NextResponse.json(
        { error: 'No previous session found for this task. Use regular tackle instead.' },
        { status: 400 }
      );
    }

    // Create new execution (the caller will handle spawning with --resume)
    const execution = await createExecution({
      taskSource: taskSource as TaskSource,
      taskId,
      taskTitle,
      prompt,
    });

    return NextResponse.json({
      execution,
      sessionId, // The caller uses this for --resume flag
      resumeCommand: `claude --resume ${sessionId}`,
    });
  } catch (error) {
    console.error('[executions/continue] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to continue execution' },
      { status: 500 }
    );
  }
}
