/**
 * API routes for executions.
 * GET - List executions for a task
 * POST - Create a new execution
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createExecution,
  getExecutionsForTask,
  getExecutionsWithChildren,
  type TaskSource,
} from '@/lib/db/executions';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskSource = searchParams.get('task_source') as TaskSource | null;
    const taskId = searchParams.get('task_id');
    const includeChildren = searchParams.get('include_children') === 'true';

    if (!taskSource || !taskId) {
      return NextResponse.json(
        { error: 'Missing required params: task_source and task_id' },
        { status: 400 }
      );
    }

    // Use tree query if children requested
    const executions = includeChildren
      ? await getExecutionsWithChildren(taskSource, taskId)
      : await getExecutionsForTask(taskSource, taskId);

    return NextResponse.json({ executions });
  } catch (error) {
    console.error('[executions] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch executions' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskSource, taskId, taskTitle, prompt, agentType } = body;

    if (!taskSource || !taskId) {
      return NextResponse.json(
        { error: 'Missing required fields: taskSource and taskId' },
        { status: 400 }
      );
    }

    const execution = await createExecution({
      taskSource,
      taskId,
      taskTitle,
      prompt,
      agentType,
    });

    return NextResponse.json({ execution });
  } catch (error) {
    console.error('[executions] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create execution' },
      { status: 500 }
    );
  }
}
