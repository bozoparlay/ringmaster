/**
 * API routes for a single execution.
 * GET - Get execution details
 * PATCH - Update execution (status, session_id, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getExecution,
  completeExecution,
  updateSessionId,
  getExecutionLogs,
} from '@/lib/db/executions';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const execution = await getExecution(id);

    if (!execution) {
      return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
    }

    // Include logs if requested
    const { searchParams } = new URL(request.url);
    const includeLogs = searchParams.get('include_logs') === 'true';

    if (includeLogs) {
      const logs = await getExecutionLogs(id);
      return NextResponse.json({ execution, logs });
    }

    return NextResponse.json({ execution });
  } catch (error) {
    console.error('[execution] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch execution' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const execution = await getExecution(id);
    if (!execution) {
      return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
    }

    // Update session ID
    if (body.sessionId) {
      await updateSessionId(id, body.sessionId);
    }

    // Complete execution
    if (body.status && ['completed', 'failed', 'killed'].includes(body.status)) {
      await completeExecution(id, {
        status: body.status,
        exitCode: body.exitCode,
      });
    }

    // Fetch updated execution
    const updated = await getExecution(id);
    return NextResponse.json({ execution: updated });
  } catch (error) {
    console.error('[execution] PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update execution' },
      { status: 500 }
    );
  }
}
