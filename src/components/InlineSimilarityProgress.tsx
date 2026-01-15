'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface SimilarTask {
  id: string;
  title: string;
  similarity: number;
  recommendation: 'merge' | 'extend' | 'duplicate';
  reason: string;
}

interface ProgressState {
  checked: number;
  total: number;
  phase: 'starting' | 'checking' | 'timeout' | 'complete';
  batchIndex?: number;
  batchTotal?: number;
}

interface ExistingItem {
  id: string;
  title: string;
  description: string;
  category?: string;
}

interface InlineSimilarityProgressProps {
  title: string;
  description: string;
  category?: string;
  /** Path to local BACKLOG.md file (for backlog mode) */
  backlogPath?: string;
  /** Pre-loaded items to check against (for GitHub mode) */
  existingItems?: ExistingItem[];
  onComplete: (similarTasks: SimilarTask[]) => void;
  onSkipped: () => void;
}

export function InlineSimilarityProgress({
  title,
  description,
  category,
  backlogPath,
  existingItems,
  onComplete,
  onSkipped,
}: InlineSimilarityProgressProps) {
  const [progress, setProgress] = useState<ProgressState>({ checked: 0, total: 0, phase: 'starting' });
  const [similarTasks, setSimilarTasks] = useState<SimilarTask[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [status, setStatus] = useState<'checking' | 'skipped' | 'error' | 'done'>('checking');
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasStartedRef = useRef(false);

  // Store initial params in ref to prevent useCallback recreation on prop changes
  const paramsRef = useRef({ title, description, category, backlogPath, existingItems });

  const startSimilarityCheck = useCallback(async () => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Use params from ref (captured at mount) to avoid dependency on props
    const { title: t, description: d, category: c, backlogPath: bp, existingItems: ei } = paramsRef.current;

    try {
      const response = await fetch('/api/check-similarity-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t, description: d, category: c, backlogPath: bp, existingItems: ei }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));

              switch (event.type) {
                case 'progress':
                  setProgress(event.data as ProgressState);
                  break;
                case 'similar':
                  setSimilarTasks(prev => [...prev, event.data as SimilarTask]);
                  break;
                case 'complete':
                  setProgress(prev => ({ ...prev, phase: 'complete' }));
                  setIsComplete(true);
                  setStatus('done');
                  break;
                case 'skipped':
                  setStatus('skipped');
                  setIsComplete(true);
                  break;
                case 'error':
                  setStatus('error');
                  setIsComplete(true);
                  break;
              }
            } catch {
              // Ignore parse errors for malformed SSE events
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Reset so next effect invocation can start fresh (StrictMode compatibility)
        hasStartedRef.current = false;
        return;
      }
      console.error('Similarity check error:', err);
      setStatus('error');
      setIsComplete(true);
    }
  }, []); // Empty deps - uses paramsRef for stable identity

  useEffect(() => {
    // Small delay to let StrictMode's double-invoke settle
    // This ensures we don't start during the "fake" first mount
    const timeoutId = setTimeout(() => {
      startSimilarityCheck();
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      abortControllerRef.current?.abort();
    };
  }, [startSimilarityCheck]);

  // Auto-complete when done
  useEffect(() => {
    if (isComplete && status === 'done') {
      onComplete(similarTasks);
    } else if (isComplete && (status === 'skipped' || status === 'error')) {
      onSkipped();
    }
  }, [isComplete, status, similarTasks, onComplete, onSkipped]);

  // Abort on unmount
  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // Expose abort method
  useEffect(() => {
    return () => abort();
  }, [abort]);

  const progressPercent = progress.total > 0 ? Math.round((progress.checked / progress.total) * 100) : 0;

  return (
    <div className="space-y-3 p-4 bg-surface-800/50 border border-surface-700 rounded-lg">
      {/* Header */}
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-accent animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <span className="text-sm font-medium text-surface-300">
          {progress.phase === 'starting' && 'Starting similarity check...'}
          {progress.phase === 'checking' && 'Checking for duplicates...'}
          {progress.phase === 'timeout' && 'Check timed out'}
          {progress.phase === 'complete' && 'Check complete'}
        </span>
        <span className="text-xs text-surface-500 ml-auto">
          {progress.total > 0 ? `${progress.checked}/${progress.total}` : '...'}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 bg-surface-700 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ease-out ${
            isComplete ? 'bg-green-500' : 'bg-accent'
          }`}
          style={{ width: `${Math.max(progressPercent, 5)}%` }}
        />
      </div>

      {/* Similar Tasks Found (compact) */}
      {similarTasks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-amber-400">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-xs font-medium">
              {similarTasks.length} similar task{similarTasks.length !== 1 ? 's' : ''} found
            </span>
          </div>

          <div className="max-h-[120px] overflow-y-auto space-y-1.5">
            {similarTasks.map((task, idx) => (
              <div
                key={`${task.id}-${idx}`}
                className="flex items-center justify-between gap-2 p-2 bg-surface-900/50 rounded text-xs"
              >
                <span className="text-surface-300 truncate">{task.title}</span>
                <span className={`
                  px-1.5 py-0.5 rounded font-medium shrink-0
                  ${task.recommendation === 'duplicate' ? 'bg-red-500/20 text-red-300' :
                    task.recommendation === 'merge' ? 'bg-amber-500/20 text-amber-300' :
                    'bg-blue-500/20 text-blue-300'}
                `}>
                  {Math.round(task.similarity * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Hook to control the similarity check from parent
export function useSimilarityCheck() {
  const [isChecking, setIsChecking] = useState(false);
  const [foundSimilar, setFoundSimilar] = useState<SimilarTask[]>([]);
  const abortRef = useRef<(() => void) | null>(null);

  const startCheck = useCallback(() => {
    setIsChecking(true);
    setFoundSimilar([]);
  }, []);

  const handleComplete = useCallback((tasks: SimilarTask[]) => {
    setFoundSimilar(tasks);
    setIsChecking(false);
  }, []);

  const handleSkipped = useCallback(() => {
    setFoundSimilar([]);
    setIsChecking(false);
  }, []);

  const skipCheck = useCallback(() => {
    abortRef.current?.();
    setIsChecking(false);
    setFoundSimilar([]);
  }, []);

  return {
    isChecking,
    foundSimilar,
    startCheck,
    handleComplete,
    handleSkipped,
    skipCheck,
    setAbortFn: (fn: () => void) => { abortRef.current = fn; },
  };
}
