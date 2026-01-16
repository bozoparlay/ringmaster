/**
 * Hook to fetch and manage task session data from the execution layer.
 */

import { useState, useEffect, useCallback } from 'react';

export interface Execution {
  id: string;
  taskSource: string;
  taskId: string;
  taskTitle: string | null;
  agentSessionId: string | null;
  agentType: string | null;
  status: 'running' | 'completed' | 'failed' | 'killed';
  exitCode: number | null;
  prompt: string | null;
  startedAt: string;
  completedAt: string | null;
  // New fields for subagent tracking
  sourceType: 'subprocess' | 'hook' | null;
  parentExecutionId: string | null;
  subagentType: string | null;
  totalTokens: number | null;
  totalToolUses: number | null;
  durationMs: number | null;
}

export interface ExecutionWithChildren extends Execution {
  children: Execution[];
}

interface UseTaskSessionResult {
  latestExecution: Execution | null;
  executions: ExecutionWithChildren[];
  hasSession: boolean;
  sessionId: string | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface UseTaskSessionOptions {
  includeChildren?: boolean;
}

export function useTaskSession(
  taskSource: 'file' | 'github' | 'quick' | undefined,
  taskId: string | undefined,
  options: UseTaskSessionOptions = {}
): UseTaskSessionResult {
  const { includeChildren = false } = options;
  const [executions, setExecutions] = useState<ExecutionWithChildren[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    if (!taskSource || !taskId) {
      setExecutions([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        task_source: taskSource,
        task_id: taskId,
      });
      if (includeChildren) {
        params.set('include_children', 'true');
      }

      const response = await fetch(`/api/executions?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch executions');
      }

      const data = await response.json();
      const rawExecutions = data.executions || [];

      // Map to ensure children array exists
      const mappedExecutions: ExecutionWithChildren[] = rawExecutions.map(
        (exec: ExecutionWithChildren) => ({
          ...exec,
          children: exec.children || [],
        })
      );

      setExecutions(mappedExecutions);
    } catch (err) {
      console.error('[useTaskSession] Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setExecutions([]);
    } finally {
      setIsLoading(false);
    }
  }, [taskSource, taskId, includeChildren]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Get most recent execution (first in list, already sorted by startedAt desc)
  const latestExecution = executions[0] || null;

  return {
    latestExecution,
    executions,
    hasSession: !!latestExecution?.agentSessionId,
    sessionId: latestExecution?.agentSessionId || null,
    isLoading,
    error,
    refresh: fetchSession,
  };
}
