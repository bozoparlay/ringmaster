'use client';

import { useState } from 'react';
import { useTaskSession } from '@/hooks/useTaskSession';

interface SessionContinuityPanelProps {
  taskSource: 'file' | 'github' | 'quick';
  taskId: string;
  taskTitle: string;
  onContinue: (sessionId: string, prompt: string) => void;
}

export function SessionContinuityPanel({
  taskSource,
  taskId,
  taskTitle,
  onContinue,
}: SessionContinuityPanelProps) {
  const { hasSession, sessionId, latestExecution, isLoading } = useTaskSession(
    taskSource,
    taskId
  );
  const [followUpMessage, setFollowUpMessage] = useState('');
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);

  if (isLoading) {
    return (
      <div className="px-3 py-2 bg-surface-800/50 rounded-lg border border-surface-700/50">
        <div className="flex items-center gap-2 text-xs text-surface-500">
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading session data...
        </div>
      </div>
    );
  }

  if (!hasSession || !sessionId) {
    return null;
  }

  const handleContinue = async () => {
    if (!sessionId) return;

    setIsContinuing(true);
    try {
      onContinue(sessionId, followUpMessage);
      setFollowUpMessage('');
      setShowFollowUp(false);
    } finally {
      setIsContinuing(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Session info banner */}
      <div className="px-3 py-2 bg-cyan-500/10 rounded-lg border border-cyan-500/30">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="text-xs text-cyan-300">
            Previous session available
            {latestExecution?.status === 'running' && ' (still running)'}
            {latestExecution?.status === 'completed' && ' (completed)'}
            {latestExecution?.status === 'failed' && ' (failed)'}
          </span>
        </div>
        {latestExecution && (
          <div className="mt-1 text-[10px] text-cyan-400/60 font-mono truncate">
            Session: {sessionId.slice(0, 16)}...
            {latestExecution.startedAt && (
              <span className="ml-2">
                Started: {new Date(latestExecution.startedAt).toLocaleString()}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Follow-up input */}
      {showFollowUp ? (
        <div className="p-3 bg-surface-800 rounded-lg border border-surface-700">
          <label className="block text-xs font-medium text-surface-400 mb-2">
            Follow-up message (optional)
          </label>
          <textarea
            value={followUpMessage}
            onChange={(e) => setFollowUpMessage(e.target.value)}
            rows={3}
            className="w-full bg-surface-900 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors resize-none"
            placeholder="e.g., Also add error handling, fix the failing test, continue with the next step..."
            autoFocus
          />
          <div className="flex items-center justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={() => {
                setShowFollowUp(false);
                setFollowUpMessage('');
              }}
              className="px-3 py-1.5 text-xs font-medium text-surface-400 hover:text-surface-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={isContinuing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isContinuing ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Continuing...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  Continue Session
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowFollowUp(true)}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600/80 to-blue-600/80 hover:from-cyan-600 hover:to-blue-600 text-white font-medium py-2.5 px-4 rounded-lg transition-all shadow-lg hover:shadow-cyan-500/25"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Continue Where You Left Off
        </button>
      )}
    </div>
  );
}
