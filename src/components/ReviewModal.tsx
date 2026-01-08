'use client';

import { useEffect } from 'react';

interface ReviewIssue {
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  file?: string;
  line?: number;
  message: string;
}

interface ReviewResult {
  passed: boolean;
  summary: string;
  issues: ReviewIssue[];
}

interface ReviewModalProps {
  isOpen: boolean;
  isLoading: boolean;
  result: ReviewResult | null;
  error?: string;
  onClose: () => void;
  onContinue: () => void;  // Move to ready_to_ship on pass
  onRetry: () => void;     // Move back to in_progress on fail
  taskTitle: string;
}

const severityStyles = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  major: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  minor: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  suggestion: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const severityLabels = {
  critical: 'Critical',
  major: 'Major',
  minor: 'Minor',
  suggestion: 'Suggestion',
};

export function ReviewModal({
  isOpen,
  isLoading,
  result,
  error,
  onClose,
  onContinue,
  onRetry,
  taskTitle,
}: ReviewModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-fade-in"
        onClick={isLoading ? undefined : onClose}
      />

      {/* Modal */}
      <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl md:max-h-[80vh] bg-surface-900 border border-surface-700/50 rounded-2xl shadow-2xl z-50 animate-scale-in flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              isLoading ? 'bg-purple-500/20' :
              result?.passed ? 'bg-green-500/20' :
              error ? 'bg-red-500/20' : 'bg-orange-500/20'
            }`}>
              {isLoading ? (
                <svg className="w-4 h-4 text-purple-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : result?.passed ? (
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
            </div>
            <div>
              <h2 className="font-display text-lg text-surface-100">
                {isLoading ? 'Reviewing Code...' :
                 error ? 'Review Error' :
                 result?.passed ? 'Review Passed' : 'Review Found Issues'}
              </h2>
              <p className="text-xs text-surface-500 truncate max-w-md">{taskTitle}</p>
            </div>
          </div>
          {!isLoading && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              {/* Animated review indicator */}
              <div className="relative w-24 h-24 mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-surface-700" />
                <div className="absolute inset-0 rounded-full border-4 border-purple-500 border-t-transparent animate-spin" />
                <div className="absolute inset-4 rounded-full bg-surface-800 flex items-center justify-center">
                  <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-surface-300 text-sm">Analyzing your changes with Claude...</p>
              <p className="text-surface-500 text-xs mt-2">This may take a moment for large diffs</p>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-surface-300 mb-2">Failed to complete review</p>
              <p className="text-surface-500 text-sm">{error}</p>
            </div>
          )}

          {result && !isLoading && (
            <div className="space-y-4">
              {/* Summary */}
              <div className={`p-4 rounded-lg border ${
                result.passed
                  ? 'bg-green-500/10 border-green-500/20'
                  : 'bg-orange-500/10 border-orange-500/20'
              }`}>
                <p className={`text-sm ${result.passed ? 'text-green-300' : 'text-orange-300'}`}>
                  {result.summary}
                </p>
              </div>

              {/* Issues */}
              {result.issues.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-surface-300">Issues Found ({result.issues.length})</h3>
                  {result.issues.map((issue, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border ${severityStyles[issue.severity]}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium uppercase ${severityStyles[issue.severity]}`}>
                          {severityLabels[issue.severity]}
                        </span>
                        {issue.file && (
                          <span className="text-xs text-surface-400 font-mono">
                            {issue.file}{issue.line ? `:${issue.line}` : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-sm mt-2">{issue.message}</p>
                    </div>
                  ))}
                </div>
              )}

              {result.issues.length === 0 && result.passed && (
                <div className="text-center py-4">
                  <p className="text-surface-400">No issues found. Your code looks good!</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isLoading && (
          <div className="px-6 py-4 border-t border-surface-800 bg-surface-900/80 flex gap-3">
            {error && (
              <>
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 px-4 rounded-lg font-medium bg-surface-800 hover:bg-surface-700 text-surface-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={onRetry}
                  className="flex-1 py-2.5 px-4 rounded-lg font-medium bg-accent hover:bg-accent-hover text-surface-900 transition-colors"
                >
                  Skip Review & Continue
                </button>
              </>
            )}

            {result?.passed && (
              <>
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 px-4 rounded-lg font-medium bg-surface-800 hover:bg-surface-700 text-surface-300 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={onContinue}
                  className="flex-1 py-2.5 px-4 rounded-lg font-medium bg-green-600 hover:bg-green-500 text-white transition-colors shadow-lg shadow-green-500/20"
                >
                  Move to Ready to Ship
                </button>
              </>
            )}

            {result && !result.passed && (
              <>
                <button
                  onClick={onRetry}
                  className="flex-1 py-2.5 px-4 rounded-lg font-medium bg-surface-800 hover:bg-surface-700 text-surface-300 transition-colors"
                >
                  Return to In Progress
                </button>
                <button
                  onClick={onContinue}
                  className="flex-1 py-2.5 px-4 rounded-lg font-medium bg-orange-600 hover:bg-orange-500 text-white transition-colors"
                >
                  Ship Anyway
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
