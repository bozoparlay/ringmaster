'use client';

import { useState } from 'react';
import type { BacklogItem } from '@/types/backlog';
import type { SyncConflict } from '@/lib/storage/types';

interface SyncConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  conflicts: SyncConflict[];
  onResolve: (taskId: string, resolution: 'local' | 'remote') => Promise<void>;
}

/**
 * SyncConflictModal - UI for resolving sync conflicts between local and remote
 *
 * Shows a side-by-side comparison of local vs remote versions and allows
 * the user to choose which version to keep.
 */
export function SyncConflictModal({
  isOpen,
  onClose,
  conflicts,
  onResolve,
}: SyncConflictModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isResolving, setIsResolving] = useState(false);

  if (!isOpen || conflicts.length === 0) return null;

  const currentConflict = conflicts[currentIndex];
  const totalConflicts = conflicts.length;

  const handleResolve = async (resolution: 'local' | 'remote') => {
    setIsResolving(true);
    try {
      await onResolve(currentConflict.taskId, resolution);

      // Move to next conflict or close if done
      if (currentIndex < totalConflicts - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        onClose();
        setCurrentIndex(0);
      }
    } finally {
      setIsResolving(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-4xl mx-4 bg-surface-900 border border-surface-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-surface-100">
                Sync Conflict
              </h2>
              <p className="text-sm text-surface-400">
                {currentIndex + 1} of {totalConflicts} conflict{totalConflicts > 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-800 rounded-lg transition-colors text-surface-400 hover:text-surface-200"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Conflict Type Badge */}
        <div className="px-6 py-3 bg-surface-800/50 border-b border-surface-800">
          <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
            currentConflict.conflictType === 'both-modified'
              ? 'bg-yellow-500/10 text-yellow-400'
              : currentConflict.conflictType === 'deleted-remote'
              ? 'bg-red-500/10 text-red-400'
              : 'bg-blue-500/10 text-blue-400'
          }`}>
            {currentConflict.conflictType === 'both-modified' && (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Both versions modified
              </>
            )}
            {currentConflict.conflictType === 'deleted-remote' && (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Deleted on GitHub
              </>
            )}
            {currentConflict.conflictType === 'deleted-local' && (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Deleted locally
              </>
            )}
          </span>
        </div>

        {/* Content: Side-by-side comparison */}
        <div className="grid grid-cols-2 divide-x divide-surface-700">
          {/* Local Version */}
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded bg-blue-500/10">
                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="font-medium text-surface-100">Local Version</h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-surface-500 uppercase tracking-wide">Title</label>
                <p className="text-surface-200 mt-1">{currentConflict.localVersion.title}</p>
              </div>

              <div>
                <label className="text-xs text-surface-500 uppercase tracking-wide">Description</label>
                <p className="text-surface-300 text-sm mt-1 line-clamp-3">
                  {currentConflict.localVersion.description || '(no description)'}
                </p>
              </div>

              <div className="flex gap-4">
                <div>
                  <label className="text-xs text-surface-500 uppercase tracking-wide">Status</label>
                  <p className="text-surface-300 text-sm mt-1">{currentConflict.localVersion.status}</p>
                </div>
                <div>
                  <label className="text-xs text-surface-500 uppercase tracking-wide">Priority</label>
                  <p className="text-surface-300 text-sm mt-1">{currentConflict.localVersion.priority}</p>
                </div>
              </div>

              <div>
                <label className="text-xs text-surface-500 uppercase tracking-wide">Last Modified</label>
                <p className="text-surface-400 text-sm mt-1">
                  {formatDate(currentConflict.localVersion.updatedAt)}
                </p>
              </div>
            </div>

            <button
              onClick={() => handleResolve('local')}
              disabled={isResolving}
              className="mt-6 w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Keep Local
            </button>
          </div>

          {/* Remote Version */}
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded bg-purple-500/10">
                <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
              </div>
              <h3 className="font-medium text-surface-100">
                GitHub Issue #{currentConflict.issueNumber}
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-surface-500 uppercase tracking-wide">Title</label>
                <p className="text-surface-200 mt-1">{currentConflict.remoteVersion.title}</p>
              </div>

              <div>
                <label className="text-xs text-surface-500 uppercase tracking-wide">Description</label>
                <p className="text-surface-300 text-sm mt-1 line-clamp-3">
                  {currentConflict.remoteVersion.body || '(no description)'}
                </p>
              </div>

              <div className="flex gap-4">
                <div>
                  <label className="text-xs text-surface-500 uppercase tracking-wide">State</label>
                  <p className="text-surface-300 text-sm mt-1">{currentConflict.remoteVersion.state}</p>
                </div>
                <div>
                  <label className="text-xs text-surface-500 uppercase tracking-wide">Labels</label>
                  <p className="text-surface-300 text-sm mt-1">
                    {currentConflict.remoteVersion.labels.join(', ') || '(none)'}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs text-surface-500 uppercase tracking-wide">Last Modified</label>
                <p className="text-surface-400 text-sm mt-1">
                  {formatDate(currentConflict.remoteVersion.updatedAt)}
                </p>
              </div>
            </div>

            <button
              onClick={() => handleResolve('remote')}
              disabled={isResolving}
              className="mt-6 w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Keep GitHub
            </button>
          </div>
        </div>

        {/* Footer with navigation */}
        {totalConflicts > 1 && (
          <div className="px-6 py-4 border-t border-surface-800 bg-surface-800/30 flex items-center justify-between">
            <button
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              className="px-3 py-1.5 text-sm text-surface-400 hover:text-surface-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ← Previous
            </button>

            <div className="flex gap-1">
              {conflicts.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    idx === currentIndex
                      ? 'bg-accent'
                      : 'bg-surface-600 hover:bg-surface-500'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={() => setCurrentIndex(Math.min(totalConflicts - 1, currentIndex + 1))}
              disabled={currentIndex === totalConflicts - 1}
              className="px-3 py-1.5 text-sm text-surface-400 hover:text-surface-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
