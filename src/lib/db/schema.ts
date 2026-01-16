/**
 * Database schema for the execution layer.
 *
 * This stores execution context for tasks from ANY source (file, github, quick).
 * Tasks themselves remain in their original sources - this only tracks executions.
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Executions table - tracks each time an agent works on a task.
 * Links to tasks via (task_source, task_id) composite key.
 * Supports parent-child relationships for subagent tracking.
 */
export const executions = sqliteTable('executions', {
  id: text('id').primaryKey(),

  // Task reference (works with any task source)
  taskSource: text('task_source').notNull(), // 'file' | 'github' | 'quick'
  taskId: text('task_id').notNull(),
  taskTitle: text('task_title'), // Cached for display

  // Agent session tracking
  agentSessionId: text('agent_session_id'), // Claude's session ID for --resume
  agentType: text('agent_type').default('claude-code'), // For future multi-agent support

  // Execution state
  status: text('status').notNull(), // 'running' | 'completed' | 'failed' | 'killed'
  exitCode: integer('exit_code'),
  prompt: text('prompt'), // The prompt sent to the agent

  // Timestamps (stored as ISO strings for SQLite)
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),

  // Multi-source tracking (new for subagent support)
  sourceType: text('source_type').default('subprocess'), // 'subprocess' | 'hook'
  parentExecutionId: text('parent_execution_id'), // Self-reference for parent-child hierarchy
  subagentType: text('subagent_type'), // 'Explore' | 'Plan' | 'code-reviewer' | etc.

  // Metrics from subagent completion
  totalTokens: integer('total_tokens'),
  totalToolUses: integer('total_tool_uses'),
  durationMs: integer('duration_ms'),
});

/**
 * Execution logs table - stores stdout/stderr in chunks for streaming.
 * Chunked storage enables efficient streaming and prevents huge single rows.
 */
export const executionLogs = sqliteTable('execution_logs', {
  id: text('id').primaryKey(),
  executionId: text('execution_id').notNull().references(() => executions.id),

  chunkIndex: integer('chunk_index').notNull(), // Order of chunks
  stream: text('stream').notNull(), // 'stdout' | 'stderr'
  content: text('content').notNull(), // The actual log content

  // Parsed metadata (extracted from Claude's JSON output)
  messageType: text('message_type'), // 'system' | 'assistant' | 'tool_use' | 'tool_result' | etc.

  timestamp: text('timestamp').notNull(),
});

/**
 * Workspaces table - tracks git worktrees for cleanup management.
 * Each workspace is associated with a task and has a cleanup policy.
 */
export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),

  // Task reference
  taskSource: text('task_source').notNull(),
  taskId: text('task_id').notNull(),

  // Workspace details
  worktreePath: text('worktree_path').notNull(),
  branch: text('branch').notNull(),

  // Cleanup management
  cleanupPolicy: text('cleanup_policy').default('auto'), // 'auto' | 'pinned' | 'manual'

  // Timestamps for retention calculations
  createdAt: text('created_at').notNull(),
  touchedAt: text('touched_at').notNull(), // Updated when task is viewed/accessed
});

/**
 * Execution events table - fine-grained event tracking for observability.
 * Records subagent completions, tool uses, and other significant events.
 */
export const executionEvents = sqliteTable('execution_events', {
  id: text('id').primaryKey(),
  executionId: text('execution_id').notNull().references(() => executions.id),

  // Event classification
  eventType: text('event_type').notNull(), // 'subagent_stop' | 'tool_use' | 'error' | etc.

  // Tool-specific data
  toolName: text('tool_name'), // 'Bash', 'Edit', 'Task', etc.

  // Subagent correlation
  subagentExecutionId: text('subagent_execution_id'), // Links to child execution record

  // Timing
  timestamp: text('timestamp').notNull(),
  durationMs: integer('duration_ms'),

  // Flexible metadata storage
  metadata: text('metadata'), // JSON blob for event-specific data
});

// Type exports for use in application code
export type Execution = typeof executions.$inferSelect;
export type NewExecution = typeof executions.$inferInsert;

export type ExecutionLog = typeof executionLogs.$inferSelect;
export type NewExecutionLog = typeof executionLogs.$inferInsert;

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;

export type ExecutionEvent = typeof executionEvents.$inferSelect;
export type NewExecutionEvent = typeof executionEvents.$inferInsert;
