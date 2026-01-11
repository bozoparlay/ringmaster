'use client';

import { useState, useEffect } from 'react';
import type { BacklogItem } from '@/types/backlog';
import type { StorageMode } from '@/lib/storage';
import { migrateFileToLocal, migrateLocalToFile, importFromMarkdown } from '@/lib/storage/migration';
import { setStorageMode, getStorageMode, hasLocalStorageData, clearLocalStorageData } from '@/lib/storage';
import { GitHubSyncService, getGitHubSyncConfig, isGitHubSyncConfigured } from '@/lib/storage/github-sync';

interface MigrationWizardProps {
  isOpen: boolean;
  onClose: () => void;
  /** Callback when migration completes successfully */
  onComplete?: () => void;
  /** Path to BACKLOG.md for file-based import */
  backlogPath?: string;
}

type MigrationTarget = 'local' | 'github' | 'local-github';
type MigrationStep = 'select' | 'configure' | 'preview' | 'migrating' | 'complete';

interface MigrationState {
  target: MigrationTarget;
  sourceCount: number;
  addToGitignore: boolean;
  deleteBacklogMd: boolean;
  createGitHubIssues: boolean;
}

/**
 * MigrationWizard - Helps users migrate from BACKLOG.md to new storage modes
 *
 * Guides users through:
 * 1. Choosing target storage (local, github, or both)
 * 2. Configuring options (gitignore, delete source, etc.)
 * 3. Previewing the migration
 * 4. Executing the migration
 */
export function MigrationWizard({ isOpen, onClose, onComplete, backlogPath }: MigrationWizardProps) {
  const [step, setStep] = useState<MigrationStep>('select');
  const [state, setState] = useState<MigrationState>({
    target: 'local',
    sourceCount: 0,
    addToGitignore: true,
    deleteBacklogMd: false,
    createGitHubIssues: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<BacklogItem[]>([]);
  const [migrationProgress, setMigrationProgress] = useState(0);

  // Fetch tasks from BACKLOG.md when wizard opens
  useEffect(() => {
    if (isOpen && backlogPath) {
      fetchBacklogTasks();
    }
  }, [isOpen, backlogPath]);

  const fetchBacklogTasks = async () => {
    try {
      const response = await fetch(`/api/backlog?path=${encodeURIComponent(backlogPath || '')}`);
      if (response.ok) {
        const data = await response.json();
        setTasks(data.items || []);
        setState(s => ({ ...s, sourceCount: data.items?.length || 0 }));
      }
    } catch (error) {
      console.error('[MigrationWizard] Failed to fetch tasks:', error);
    }
  };

  const handleTargetSelect = (target: MigrationTarget) => {
    setState(s => ({ ...s, target }));

    // If GitHub selected but not configured, go to configure step
    if (target === 'github' || target === 'local-github') {
      if (!isGitHubSyncConfigured()) {
        setStep('configure');
        return;
      }
    }
    setStep('preview');
  };

  const handleMigrate = async () => {
    setStep('migrating');
    setError(null);
    setMigrationProgress(0);

    try {
      // Step 1: Migrate to localStorage (if target includes local)
      if (state.target === 'local' || state.target === 'local-github') {
        setMigrationProgress(10);

        // Get current storage mode to know if we're migrating from file
        const currentMode = getStorageMode();
        if (currentMode === 'file') {
          // Migrate from file to local
          await migrateFileToLocal(backlogPath || '');
        }

        setMigrationProgress(40);
      }

      // Step 2: Create GitHub Issues (if target includes github)
      if (state.target === 'github' || state.target === 'local-github') {
        const config = getGitHubSyncConfig();
        if (config) {
          const syncService = new GitHubSyncService(config);

          // Ensure label exists
          await syncService.ensureLabel();
          setMigrationProgress(50);

          // Create issues for each task
          for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            if (!task.githubIssueNumber) {
              try {
                await syncService.createIssue(task);
              } catch (err) {
                console.warn(`[MigrationWizard] Failed to create issue for task ${task.id}:`, err);
              }
            }
            setMigrationProgress(50 + Math.round((i / tasks.length) * 40));
          }
        }
      }

      setMigrationProgress(90);

      // Step 3: Update storage mode
      if (state.target === 'github' || state.target === 'local-github') {
        setStorageMode('github');
      } else {
        setStorageMode('local');
      }

      setMigrationProgress(100);
      setStep('complete');
    } catch (err) {
      console.error('[MigrationWizard] Migration failed:', err);
      setError(err instanceof Error ? err.message : 'Migration failed');
      setStep('preview'); // Go back to preview on error
    }
  };

  const handleComplete = () => {
    onComplete?.();
    onClose();
    // Reload to apply new storage mode
    window.location.reload();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 bg-surface-900 border border-surface-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-surface-100">
                Migrate from BACKLOG.md
              </h2>
              <p className="text-sm text-surface-400">
                {state.sourceCount > 0 ? `Found ${state.sourceCount} tasks` : 'Loading...'}
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

        {/* Content */}
        <div className="p-6">
          {/* Step: Select Target */}
          {step === 'select' && (
            <div className="space-y-4">
              <p className="text-surface-300 mb-6">
                Where would you like to store your tasks?
              </p>

              {/* Option: Local Storage */}
              <button
                onClick={() => handleTargetSelect('local')}
                className="w-full flex items-start gap-4 p-4 rounded-xl border border-surface-700 hover:border-accent/50 bg-surface-800/50 hover:bg-surface-800 transition-colors text-left"
              >
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-surface-100">Local Storage</span>
                    <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-400 rounded-full">Recommended</span>
                  </div>
                  <p className="text-sm text-surface-400 mt-1">
                    Fast, no conflicts, works offline. Tasks stay on this device only.
                  </p>
                </div>
              </button>

              {/* Option: GitHub Issues */}
              <button
                onClick={() => handleTargetSelect('github')}
                className="w-full flex items-start gap-4 p-4 rounded-xl border border-surface-700 hover:border-accent/50 bg-surface-800/50 hover:bg-surface-800 transition-colors text-left"
              >
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <span className="font-medium text-surface-100">GitHub Issues</span>
                  <p className="text-sm text-surface-400 mt-1">
                    Great for teams. Tasks visible on GitHub. Requires authentication.
                  </p>
                </div>
              </button>

              {/* Option: Both */}
              <button
                onClick={() => handleTargetSelect('local-github')}
                className="w-full flex items-start gap-4 p-4 rounded-xl border border-surface-700 hover:border-accent/50 bg-surface-800/50 hover:bg-surface-800 transition-colors text-left"
              >
                <div className="p-2 rounded-lg bg-accent/10">
                  <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <div className="flex-1">
                  <span className="font-medium text-surface-100">Both (Local + GitHub Sync)</span>
                  <p className="text-sm text-surface-400 mt-1">
                    Best of both worlds. Fast local edits, synced to GitHub for collaboration.
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* Step: Configure (for GitHub) */}
          {step === 'configure' && (
            <div className="space-y-4">
              <p className="text-surface-300 mb-4">
                Please configure GitHub connection first:
              </p>
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-yellow-300 text-sm">
                  Open the Storage Mode selector in the header and click on GitHub to configure your connection.
                </p>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setStep('select')}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-300 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    if (isGitHubSyncConfigured()) {
                      setStep('preview');
                    }
                  }}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-accent hover:bg-accent-hover text-surface-900 font-medium transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-surface-800">
                <p className="text-surface-300 mb-2">Migration Summary:</p>
                <ul className="space-y-1 text-sm text-surface-400">
                  <li>• {state.sourceCount} tasks will be migrated</li>
                  <li>
                    • Target: {state.target === 'local' ? 'Local Storage' :
                      state.target === 'github' ? 'GitHub Issues' :
                        'Local Storage + GitHub Sync'}
                  </li>
                </ul>
              </div>

              {/* Options */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 rounded-lg bg-surface-800/50 hover:bg-surface-800 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={state.addToGitignore}
                    onChange={(e) => setState(s => ({ ...s, addToGitignore: e.target.checked }))}
                    className="w-4 h-4 rounded border-surface-600 bg-surface-700 text-accent focus:ring-accent/50"
                  />
                  <span className="text-surface-300 text-sm">Add BACKLOG.md to .gitignore</span>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg bg-surface-800/50 hover:bg-surface-800 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={state.deleteBacklogMd}
                    onChange={(e) => setState(s => ({ ...s, deleteBacklogMd: e.target.checked }))}
                    className="w-4 h-4 rounded border-surface-600 bg-surface-700 text-accent focus:ring-accent/50"
                  />
                  <span className="text-surface-300 text-sm">Delete BACKLOG.md after migration (backup recommended)</span>
                </label>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setStep('select')}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-300 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleMigrate}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-accent hover:bg-accent-hover text-surface-900 font-medium transition-colors"
                >
                  Start Migration
                </button>
              </div>
            </div>
          )}

          {/* Step: Migrating */}
          {step === 'migrating' && (
            <div className="space-y-4 text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 mb-4">
                <svg className="w-8 h-8 text-accent animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <p className="text-lg text-surface-100">Migrating your tasks...</p>
              <p className="text-sm text-surface-400">Please don't close this window.</p>

              {/* Progress bar */}
              <div className="mt-4 h-2 bg-surface-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${migrationProgress}%` }}
                />
              </div>
              <p className="text-xs text-surface-500">{migrationProgress}% complete</p>
            </div>
          )}

          {/* Step: Complete */}
          {step === 'complete' && (
            <div className="space-y-4 text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-4">
                <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg text-surface-100">Migration Complete!</p>
              <p className="text-sm text-surface-400">
                {state.sourceCount} tasks have been migrated to {
                  state.target === 'local' ? 'Local Storage' :
                    state.target === 'github' ? 'GitHub Issues' :
                      'Local Storage with GitHub Sync'
                }.
              </p>

              <button
                onClick={handleComplete}
                className="mt-6 py-2.5 px-8 rounded-lg bg-accent hover:bg-accent-hover text-surface-900 font-medium transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
