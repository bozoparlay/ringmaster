'use client';

import { useState, useEffect, useCallback } from 'react';

interface GitHubConnectionPromptProps {
  /** Whether to show the prompt */
  isOpen: boolean;
  /** Detected repo info */
  repo?: { owner: string; repo: string };
  /** Called when user clicks Connect */
  onConnect: () => void;
  /** Called when user dismisses (permanent=false for "Later", true for "Don't ask again") */
  onDismiss: (permanent: boolean) => void;
  /** Auto-hide timeout in ms (default 10000) */
  autoHideMs?: number;
}

/**
 * GitHubConnectionPrompt - Non-blocking banner to encourage GitHub connection
 *
 * Shows when:
 * - GitHub repo detected from git remote
 * - User hasn't connected GitHub for this project
 * - User hasn't dismissed the prompt (or dismissed >7 days ago)
 *
 * Features:
 * - Auto-hides after 10 seconds (configurable)
 * - "Later" dismisses temporarily (shows again in 7 days)
 * - "Don't ask again" dismisses permanently for this project
 * - Smooth slide-down animation
 */
export function GitHubConnectionPrompt({
  isOpen,
  repo,
  onConnect,
  onDismiss,
  autoHideMs = 10000,
}: GitHubConnectionPromptProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [showDismissOptions, setShowDismissOptions] = useState(false);

  // Handle open state with animation
  useEffect(() => {
    if (isOpen) {
      // Small delay to trigger CSS transition
      const timer = setTimeout(() => setIsVisible(true), 50);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
      setIsAnimatingOut(false);
    }
  }, [isOpen]);

  const handleDismiss = useCallback((permanent: boolean) => {
    setIsAnimatingOut(true);
    // Wait for animation to complete
    setTimeout(() => {
      onDismiss(permanent);
      setIsAnimatingOut(false);
      setShowDismissOptions(false);
    }, 300);
  }, [onDismiss]);

  // Auto-hide timer
  useEffect(() => {
    if (!isOpen || autoHideMs <= 0) return;

    const timer = setTimeout(() => {
      handleDismiss(false);
    }, autoHideMs);

    return () => clearTimeout(timer);
  }, [isOpen, autoHideMs, handleDismiss]);

  const handleConnect = useCallback(() => {
    setIsAnimatingOut(true);
    setTimeout(() => {
      onConnect();
      setIsAnimatingOut(false);
    }, 300);
  }, [onConnect]);

  if (!isOpen) return null;

  return (
    <div
      className={`
        fixed top-0 left-0 right-0 z-40
        transform transition-all duration-300 ease-out
        ${isVisible && !isAnimatingOut ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}
      `}
    >
      <div className="bg-gradient-to-r from-purple-500/20 via-blue-500/20 to-purple-500/20 border-b border-purple-500/30 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Message */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-surface-100 truncate">
                  {repo ? (
                    <>
                      Sync <span className="text-purple-400">{repo.owner}/{repo.repo}</span> with GitHub Issues?
                    </>
                  ) : (
                    'Connect to GitHub Issues for seamless task syncing'
                  )}
                </p>
                <p className="text-xs text-surface-400 truncate">
                  Track tasks as issues, auto-assign when tackling, link PRs automatically
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {showDismissOptions ? (
                <>
                  <button
                    onClick={() => handleDismiss(false)}
                    className="px-3 py-1.5 text-xs font-medium text-surface-300 hover:text-surface-100 hover:bg-surface-800/50 rounded-lg transition-colors"
                  >
                    Later
                  </button>
                  <button
                    onClick={() => handleDismiss(true)}
                    className="px-3 py-1.5 text-xs font-medium text-surface-500 hover:text-surface-300 rounded-lg transition-colors"
                  >
                    Don't ask again
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setShowDismissOptions(true)}
                    className="px-3 py-1.5 text-xs font-medium text-surface-400 hover:text-surface-200 rounded-lg transition-colors"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={handleConnect}
                    className="px-4 py-1.5 text-xs font-medium bg-purple-500 hover:bg-purple-400 text-white rounded-lg transition-colors shadow-sm"
                  >
                    Connect
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
