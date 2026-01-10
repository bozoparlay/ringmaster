'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface SimilarTask {
  id: string;
  title: string;
  similarity: number;
  recommendation: 'merge' | 'extend' | 'duplicate';
  reason: string;
}

interface SimilarityCheckProgressProps {
  title: string;
  description: string;
  category?: string;
  backlogPath: string;
  onComplete: (similarTasks: SimilarTask[], shouldProceed: boolean) => void;
  onCancel: () => void;
}

interface ProgressState {
  checked: number;
  total: number;
  phase: 'starting' | 'checking' | 'timeout' | 'complete';
  batchIndex?: number;
  batchTotal?: number;
}

export function SimilarityCheckProgress({
  title,
  description,
  category,
  backlogPath,
  onComplete,
  onCancel,
}: SimilarityCheckProgressProps) {
  const [progress, setProgress] = useState<ProgressState>({ checked: 0, total: 0, phase: 'starting' });
  const [similarTasks, setSimilarTasks] = useState<SimilarTask[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<{ reason: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasStartedRef = useRef(false);

  const startSimilarityCheck = useCallback(async () => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/check-similarity-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, category, backlogPath }),
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
              handleEvent(event);
            } catch (e) {
              console.error('Parse error:', e);
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User cancelled - don't show error
        return;
      }
      console.error('Similarity check error:', err);
      setError((err as Error).message);
      setIsComplete(true);
    }
  }, [title, description, category, backlogPath]);

  const handleEvent = (event: { type: string; data: unknown }) => {
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
        break;
      case 'skipped':
        setSkipped(event.data as { reason: string });
        setIsComplete(true);
        break;
      case 'error':
        setError((event.data as { message: string }).message);
        setIsComplete(true);
        break;
    }
  };

  useEffect(() => {
    startSimilarityCheck();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [startSimilarityCheck]);

  const handleProceed = () => {
    abortControllerRef.current?.abort();
    onComplete(similarTasks, true);
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    onCancel();
  };

  const handleReview = () => {
    onComplete(similarTasks, false);
  };

  const progressPercent = progress.total > 0 ? Math.round((progress.checked / progress.total) * 100) : 0;

  // If skipped (Claude unavailable, circuit open), proceed automatically
  if (skipped) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 text-surface-400">
          <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm">{skipped.reason}</span>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 bg-surface-700 hover:bg-surface-600 text-surface-300 font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleProceed}
            className="flex-1 bg-accent hover:bg-accent-hover text-surface-900 font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Continue Adding Task
          </button>
        </div>
      </div>
    );
  }

  // Error state - allow proceeding
  if (error && isComplete) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 text-red-400">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm">Similarity check encountered an error: {error}</span>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 bg-surface-700 hover:bg-surface-600 text-surface-300 font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleProceed}
            className="flex-1 bg-accent hover:bg-accent-hover text-surface-900 font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Add Task Anyway
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Progress Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-surface-300">
            {progress.phase === 'starting' && 'Starting similarity check...'}
            {progress.phase === 'checking' && `Checking for similar tasks...`}
            {progress.phase === 'timeout' && 'Check timed out'}
            {progress.phase === 'complete' && 'Check complete'}
          </span>
          <span className="text-xs text-surface-500">
            {progress.checked} / {progress.total || '...'} tasks
          </span>
        </div>

        {/* Progress Bar */}
        <div className="h-2 bg-surface-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ease-out ${
              isComplete ? 'bg-green-500' : 'bg-accent'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Batch indicator */}
        {progress.batchIndex !== undefined && progress.batchTotal !== undefined && !isComplete && (
          <p className="text-xs text-surface-500">
            Processing batch {progress.batchIndex} of {progress.batchTotal}
          </p>
        )}
      </div>

      {/* Similar Tasks Found (live updating) */}
      {similarTasks.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-amber-400 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {similarTasks.length} similar task{similarTasks.length !== 1 ? 's' : ''} found
          </h4>

          <div className="max-h-[200px] overflow-y-auto space-y-2">
            {similarTasks.map((task, idx) => (
              <div
                key={`${task.id}-${idx}`}
                className="p-3 bg-surface-800/50 border border-surface-700 rounded-lg animate-fade-in"
              >
                <div className="flex items-start justify-between gap-2">
                  <h5 className="font-medium text-surface-200 text-sm truncate">{task.title}</h5>
                  <span className={`
                    px-2 py-0.5 rounded text-xs font-medium shrink-0
                    ${task.recommendation === 'duplicate' ? 'bg-red-500/20 text-red-300' :
                      task.recommendation === 'merge' ? 'bg-amber-500/20 text-amber-300' :
                      'bg-blue-500/20 text-blue-300'}
                  `}>
                    {Math.round(task.similarity * 100)}%
                  </span>
                </div>
                <p className="text-xs text-surface-400 mt-1">{task.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No similar tasks found message */}
      {isComplete && similarTasks.length === 0 && (
        <div className="flex items-center gap-2 text-green-400">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm">No similar tasks found</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleCancel}
          className="flex-1 bg-surface-700 hover:bg-surface-600 text-surface-300 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
        >
          Cancel
        </button>

        {!isComplete ? (
          <button
            onClick={handleProceed}
            className="flex-1 bg-surface-600 hover:bg-surface-500 text-surface-200 font-medium py-2 px-4 rounded-lg transition-colors text-sm border border-surface-500"
          >
            Skip & Add Now
          </button>
        ) : similarTasks.length > 0 ? (
          <>
            <button
              onClick={handleReview}
              className="flex-1 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 font-medium py-2 px-4 rounded-lg transition-colors text-sm border border-amber-500/30"
            >
              Review Similar
            </button>
            <button
              onClick={handleProceed}
              className="flex-1 bg-accent hover:bg-accent-hover text-surface-900 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
            >
              Add Anyway
            </button>
          </>
        ) : (
          <button
            onClick={handleProceed}
            className="flex-1 bg-accent hover:bg-accent-hover text-surface-900 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
          >
            Add Task
          </button>
        )}
      </div>
    </div>
  );
}
