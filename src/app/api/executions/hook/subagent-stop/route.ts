/**
 * Hook endpoint for Claude Code's SubagentStop event.
 *
 * When Claude Code's Task tool spawns a subagent and it completes,
 * this hook receives the completion data and creates a child execution record.
 *
 * Hook configuration (add to ~/.claude/settings.json):
 * {
 *   "hooks": {
 *     "SubagentStop": [{
 *       "matcher": "",
 *       "hooks": [{
 *         "type": "command",
 *         "command": "curl -s -X POST http://localhost:3000/api/executions/hook/subagent-stop -H 'Content-Type: application/json' -d @-",
 *         "timeout": 5000
 *       }]
 *     }]
 *   }
 * }
 */

import { NextResponse } from 'next/server';
import { createSubagentExecution } from '@/lib/db/executions';

/**
 * Expected payload from Claude Code's SubagentStop hook.
 * The hook passes data via stdin to the command.
 */
interface SubagentStopPayload {
  // Session context
  session_id: string; // Parent session UUID

  // Subagent details
  subagent_id?: string; // Subagent's own ID
  subagent_type: string; // 'Explore' | 'Plan' | 'code-reviewer' | etc.

  // Execution details
  prompt: string; // The prompt sent to the subagent
  result?: string; // The subagent's response (may be truncated)

  // Metrics
  total_tokens?: number;
  total_tool_uses?: number;
  duration_ms?: number;

  // Context (from Claude Code)
  cwd?: string;
  transcript_path?: string;
}

export async function POST(request: Request) {
  try {
    const payload: SubagentStopPayload = await request.json();

    // Validate required fields
    if (!payload.session_id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    if (!payload.subagent_type) {
      return NextResponse.json({ error: 'Missing subagent_type' }, { status: 400 });
    }

    if (!payload.prompt) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    console.log(
      `[hook/subagent-stop] Received: type=${payload.subagent_type}, session=${payload.session_id.substring(0, 8)}...`
    );

    // Create subagent execution record
    const execution = await createSubagentExecution({
      parentSessionId: payload.session_id,
      subagentType: payload.subagent_type,
      prompt: payload.prompt,
      totalTokens: payload.total_tokens,
      totalToolUses: payload.total_tool_uses,
      durationMs: payload.duration_ms,
    });

    if (!execution) {
      return NextResponse.json(
        { error: 'Failed to create execution record' },
        { status: 500 }
      );
    }

    console.log(
      `[hook/subagent-stop] Created execution ${execution.id}, parent=${execution.parentExecutionId || 'orphan'}`
    );

    return NextResponse.json({
      success: true,
      executionId: execution.id,
      parentExecutionId: execution.parentExecutionId,
    });
  } catch (error) {
    console.error('[hook/subagent-stop] Error:', error);

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
