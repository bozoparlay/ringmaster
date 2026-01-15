/**
 * Hook to fetch and manage task session data from the execution layer.
 */

import { useState, useEffect, useCallback } from 'react';

interface Execution {
  id: string;
  taskSource: string;
  taskId: string;
  taskTitle: string | null;
  agentSessionId: string | null;
  agentType: string | null;
  status: string;
  exitCode: number | null;
  prompt: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface UseTaskSessionResult {
  latestExecution: Execution | null;
  hasSession: boolean;
  sessionId: string | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useTaskSession(
  taskSource: 'file' | 'github' | 'quick' | undefined,
  taskId: string | undefined
): UseTaskSessionResult {
  const [latestExecution, setLatestExecution] = useState<Execution | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    if (!taskSource || !taskId) {
      setLatestExecution(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/executions?task_source=${taskSource}&task_id=${taskId}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch executions');
      }

      const data = await response.json();
      const executions: Execution[] = data.executions || [];

      // Get the most recent execution (already sorted by API)
      setLatestExecution(executions[0] || null);
    } catch (err) {
      console.error('[useTaskSession] Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLatestExecution(null);
    } finally {
      setIsLoading(false);
    }
  }, [taskSource, taskId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  return {
    latestExecution,
    hasSession: !!latestExecution?.agentSessionId,
    sessionId: latestExecution?.agentSessionId || null,
    isLoading,
    error,
    refresh: fetchSession,
  };
}
