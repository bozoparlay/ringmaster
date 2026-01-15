/**
 * CRUD operations for executions table.
 */

import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDb, executions, executionLogs, type Execution, type NewExecution, type ExecutionLog } from './index';

export type ExecutionStatus = 'running' | 'completed' | 'failed' | 'killed';
export type TaskSource = 'file' | 'github' | 'quick';

interface CreateExecutionParams {
  taskSource: TaskSource;
  taskId: string;
  taskTitle?: string;
  prompt?: string;
  agentType?: string;
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
  };

  await db.insert(executions).values(newExecution);

  return {
    ...newExecution,
    agentSessionId: null,
    exitCode: null,
    completedAt: null,
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
