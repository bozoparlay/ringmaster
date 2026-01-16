/**
 * CRUD operations for executions table.
 */

import { eq, and, desc, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import {
  getDb,
  executions,
  executionLogs,
  executionEvents,
  type Execution,
  type NewExecution,
  type ExecutionLog,
  type ExecutionEvent,
  type NewExecutionEvent,
} from './index';

export type ExecutionStatus = 'running' | 'completed' | 'failed' | 'killed';
export type TaskSource = 'file' | 'github' | 'quick';
export type SourceType = 'subprocess' | 'hook';

interface CreateExecutionParams {
  taskSource: TaskSource;
  taskId: string;
  taskTitle?: string;
  prompt?: string;
  agentType?: string;
  sourceType?: SourceType;
  parentExecutionId?: string;
  subagentType?: string;
}

interface CreateSubagentExecutionParams {
  parentSessionId: string;
  subagentType: string;
  prompt: string;
  totalTokens?: number;
  totalToolUses?: number;
  durationMs?: number;
}

/**
 * Create a new execution record.
 */
export async function createExecution(params: CreateExecutionParams): Promise<Execution> {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  const newExecution: NewExecution = {
    id,
    taskSource: params.taskSource,
    taskId: params.taskId,
    taskTitle: params.taskTitle || null,
    prompt: params.prompt || null,
    agentType: params.agentType || 'claude-code',
    status: 'running',
    startedAt: now,
    sourceType: params.sourceType || 'subprocess',
    parentExecutionId: params.parentExecutionId || null,
    subagentType: params.subagentType || null,
  };

  await db.insert(executions).values(newExecution);

  return {
    ...newExecution,
    agentSessionId: null,
    exitCode: null,
    completedAt: null,
    totalTokens: null,
    totalToolUses: null,
    durationMs: null,
  } as Execution;
}

/**
 * Get an execution by ID.
 */
export async function getExecution(id: string): Promise<Execution | null> {
  const db = getDb();
  const result = await db.select().from(executions).where(eq(executions.id, id));
  return result[0] || null;
}

/**
 * Get all executions for a task.
 */
export async function getExecutionsForTask(
  taskSource: TaskSource,
  taskId: string
): Promise<Execution[]> {
  const db = getDb();
  return db
    .select()
    .from(executions)
    .where(and(eq(executions.taskSource, taskSource), eq(executions.taskId, taskId)))
    .orderBy(desc(executions.startedAt));
}

/**
 * Get the most recent execution for a task.
 */
export async function getLatestExecution(
  taskSource: TaskSource,
  taskId: string
): Promise<Execution | null> {
  const db = getDb();
  const result = await db
    .select()
    .from(executions)
    .where(and(eq(executions.taskSource, taskSource), eq(executions.taskId, taskId)))
    .orderBy(desc(executions.startedAt))
    .limit(1);
  return result[0] || null;
}

/**
 * Get the latest session ID for a task (for --resume).
 */
export async function getLatestSessionId(
  taskSource: TaskSource,
  taskId: string
): Promise<string | null> {
  const execution = await getLatestExecution(taskSource, taskId);
  return execution?.agentSessionId || null;
}

/**
 * Update the session ID for an execution.
 */
export async function updateSessionId(executionId: string, sessionId: string): Promise<void> {
  const db = getDb();
  await db
    .update(executions)
    .set({ agentSessionId: sessionId })
    .where(eq(executions.id, executionId));
}

/**
 * Complete an execution (success or failure).
 */
export async function completeExecution(
  executionId: string,
  params: { status: 'completed' | 'failed' | 'killed'; exitCode?: number }
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  await db
    .update(executions)
    .set({
      status: params.status,
      exitCode: params.exitCode ?? null,
      completedAt: now,
    })
    .where(eq(executions.id, executionId));
}

/**
 * Add a log chunk to an execution.
 */
export async function addLogChunk(params: {
  executionId: string;
  stream: 'stdout' | 'stderr';
  content: string;
  messageType?: string;
}): Promise<void> {
  const db = getDb();

  // Get the next chunk index
  const existing = await db
    .select()
    .from(executionLogs)
    .where(eq(executionLogs.executionId, params.executionId))
    .orderBy(desc(executionLogs.chunkIndex))
    .limit(1);

  const chunkIndex = existing[0] ? existing[0].chunkIndex + 1 : 0;

  await db.insert(executionLogs).values({
    id: uuidv4(),
    executionId: params.executionId,
    chunkIndex,
    stream: params.stream,
    content: params.content,
    messageType: params.messageType || null,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get all log chunks for an execution.
 */
export async function getExecutionLogs(executionId: string): Promise<ExecutionLog[]> {
  const db = getDb();
  return db
    .select()
    .from(executionLogs)
    .where(eq(executionLogs.executionId, executionId))
    .orderBy(executionLogs.chunkIndex);
}

/**
 * Get log chunks after a specific index (for streaming).
 */
export async function getLogsAfterChunk(
  executionId: string,
  afterChunkIndex: number
): Promise<ExecutionLog[]> {
  const db = getDb();
  const allLogs = await db
    .select()
    .from(executionLogs)
    .where(eq(executionLogs.executionId, executionId))
    .orderBy(executionLogs.chunkIndex);

  return allLogs.filter((log) => log.chunkIndex > afterChunkIndex);
}

// ============================================
// Subagent Tracking Functions
// ============================================

/**
 * Find an execution by its Claude session ID.
 * Used to look up parent execution when subagent reports back.
 */
export async function findExecutionBySessionId(sessionId: string): Promise<Execution | null> {
  const db = getDb();
  const result = await db
    .select()
    .from(executions)
    .where(eq(executions.agentSessionId, sessionId))
    .orderBy(desc(executions.startedAt))
    .limit(1);
  return result[0] || null;
}

/**
 * Create a subagent execution record from hook data.
 * Automatically links to parent and copies task context.
 */
export async function createSubagentExecution(
  params: CreateSubagentExecutionParams
): Promise<Execution | null> {
  const db = getDb();

  // Find parent execution by session ID
  const parent = await findExecutionBySessionId(params.parentSessionId);

  if (!parent) {
    console.warn(`[db] No parent execution found for session ${params.parentSessionId}`);
    // Still create orphan record - can be linked later
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const startTime = params.durationMs
    ? new Date(Date.now() - params.durationMs).toISOString()
    : now;

  const newExecution: NewExecution = {
    id,
    // Copy task context from parent, or use defaults
    taskSource: parent?.taskSource || 'quick',
    taskId: parent?.taskId || 'orphan',
    taskTitle: parent?.taskTitle || null,
    prompt: params.prompt,
    agentType: 'claude-code',
    status: 'completed', // Subagent is already done when hook fires
    startedAt: startTime,
    completedAt: now,
    sourceType: 'hook',
    parentExecutionId: parent?.id || null,
    subagentType: params.subagentType,
    totalTokens: params.totalTokens ?? null,
    totalToolUses: params.totalToolUses ?? null,
    durationMs: params.durationMs ?? null,
  };

  await db.insert(executions).values(newExecution);

  // Also create an event on the parent to track the subagent completion
  if (parent) {
    await createEvent({
      executionId: parent.id,
      eventType: 'subagent_stop',
      subagentExecutionId: id,
      durationMs: params.durationMs,
      metadata: JSON.stringify({
        subagentType: params.subagentType,
        prompt: params.prompt.substring(0, 200), // Truncate for storage
      }),
    });
  }

  return {
    ...newExecution,
    agentSessionId: null,
    exitCode: null,
  } as Execution;
}

/**
 * Extended execution type with children for nested view.
 */
export interface ExecutionWithChildren extends Execution {
  children: Execution[];
}

/**
 * Get all top-level executions for a task with their children.
 * Returns a tree structure for nested UI display.
 */
export async function getExecutionsWithChildren(
  taskSource: TaskSource,
  taskId: string
): Promise<ExecutionWithChildren[]> {
  const db = getDb();

  // Get all executions for this task
  const allExecutions = await db
    .select()
    .from(executions)
    .where(and(eq(executions.taskSource, taskSource), eq(executions.taskId, taskId)))
    .orderBy(desc(executions.startedAt));

  // Separate into parents (no parent_execution_id) and children
  const parents = allExecutions.filter((e) => !e.parentExecutionId);
  const childMap = new Map<string, Execution[]>();

  for (const exec of allExecutions) {
    if (exec.parentExecutionId) {
      const existing = childMap.get(exec.parentExecutionId) || [];
      existing.push(exec);
      childMap.set(exec.parentExecutionId, existing);
    }
  }

  // Build tree structure
  return parents.map((parent) => ({
    ...parent,
    children: childMap.get(parent.id) || [],
  }));
}

/**
 * Get all child executions for a parent.
 */
export async function getChildExecutions(parentExecutionId: string): Promise<Execution[]> {
  const db = getDb();
  return db
    .select()
    .from(executions)
    .where(eq(executions.parentExecutionId, parentExecutionId))
    .orderBy(executions.startedAt);
}

// ============================================
// Event Tracking Functions
// ============================================

interface CreateEventParams {
  executionId: string;
  eventType: string;
  toolName?: string;
  subagentExecutionId?: string;
  durationMs?: number;
  metadata?: string;
}

/**
 * Create an execution event record.
 */
export async function createEvent(params: CreateEventParams): Promise<ExecutionEvent> {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  const newEvent: NewExecutionEvent = {
    id,
    executionId: params.executionId,
    eventType: params.eventType,
    toolName: params.toolName || null,
    subagentExecutionId: params.subagentExecutionId || null,
    timestamp: now,
    durationMs: params.durationMs ?? null,
    metadata: params.metadata || null,
  };

  await db.insert(executionEvents).values(newEvent);

  return newEvent as ExecutionEvent;
}

/**
 * Get all events for an execution.
 */
export async function getEventsForExecution(executionId: string): Promise<ExecutionEvent[]> {
  const db = getDb();
  return db
    .select()
    .from(executionEvents)
    .where(eq(executionEvents.executionId, executionId))
    .orderBy(executionEvents.timestamp);
}
