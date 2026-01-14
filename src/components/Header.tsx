'use client';

import { useState, useEffect, useRef } from 'react';
import { HealthIndicator } from './HealthIndicator';
import { StorageModeSelector } from './StorageModeSelector';
import { ActionDropdown, type ActionItem } from './ActionDropdown';
import { AnimatedSearch } from './AnimatedSearch';
import type { StorageMode } from '@/lib/storage';
// Note: We use the isGitHubConnected prop instead of isGitHubSyncConfigured()
// to avoid hydration mismatches (localStorage isn't available during SSR)

interface HeaderProps {
  filePath: string | null;
  fileExists: boolean;
  storageMode?: StorageMode;
  onNewTask: () => void;
  onRefresh: () => void;
  onChangePath: (path: string) => void;
  onStorageModeChange?: (mode: StorageMode) => void;
  onExportMarkdown?: () => Promise<string>;
  onSync?: () => Promise<void>;
  isSyncing?: boolean;
  onCleanup?: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  /** Auto-detected repo from git remote */
  detectedRepo?: { owner: string; repo: string };
  /** Project config is stale (>24h) */
  isProjectStale?: boolean;
  /** Refresh project detection */
  onRefreshProject?: () => Promise<void>;
  /** Connected GitHub user info */
  gitHubUser?: { login: string; name: string; avatarUrl: string } | null;
  /** Whether GitHub connection is active */
  isGitHubConnected?: boolean;
  /** Open GitHub settings */
  onOpenGitHubSettings?: () => void;
  /** Last sync timestamp */
  lastSyncAt?: string;
  /** Clean up orphaned worktrees */
  onCleanupWorktrees?: () => Promise<void>;
}

const RECENT_PATHS_KEY = 'ringmaster-recent-paths';
const MAX_RECENT_PATHS = 5;

/**
 * Format a timestamp as a relative time string (e.g., "5m ago", "2h ago")
 */
function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return 'yesterday';
  return `${diffDay}d ago`;
}

function getRecentPaths(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_PATHS_KEY) || '[]');
  } catch {
    return [];
  }
}

function addRecentPath(path: string): void {
  if (typeof window === 'undefined') return;
  const recent = getRecentPaths().filter(p => p !== path);
  recent.unshift(path);
  localStorage.setItem(RECENT_PATHS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT_PATHS)));
}

export function Header({ filePath, fileExists, storageMode, onNewTask, onRefresh, onChangePath, onStorageModeChange, onExportMarkdown, onSync, isSyncing, onCleanup, searchQuery, onSearchChange, detectedRepo, isProjectStale, onRefreshProject, gitHubUser, isGitHubConnected, onOpenGitHubSettings, lastSyncAt, onCleanupWorktrees }: HeaderProps) {
  const [showPathPicker, setShowPathPicker] = useState(false);
  const [pathInput, setPathInput] = useState('');
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [isRefreshingProject, setIsRefreshingProject] = useState(false);
  const [isCleaningWorktrees, setIsCleaningWorktrees] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Track mount state to prevent hydration mismatch for client-only UI
  useEffect(() => {
    setHasMounted(true);
  }, []);

  const handleRefreshProject = async () => {
    if (!onRefreshProject || isRefreshingProject) return;
    setIsRefreshingProject(true);
    try {
      await onRefreshProject();
    } finally {
      setIsRefreshingProject(false);
    }
  };

  const handleCleanupWorktrees = async () => {
    if (!onCleanupWorktrees || isCleaningWorktrees) return;
    setIsCleaningWorktrees(true);
    try {
      await onCleanupWorktrees();
    } finally {
      setIsCleaningWorktrees(false);
    }
  };

  useEffect(() => {
    setRecentPaths(getRecentPaths());
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowPathPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectPath = (path: string) => {
    addRecentPath(path);
    setRecentPaths(getRecentPaths());
    onChangePath(path);
    setShowPathPicker(false);
    setPathInput('');
  };

  const handleSubmitPath = (e: React.FormEvent) => {
    e.preventDefault();
    if (pathInput.trim()) {
      handleSelectPath(pathInput.trim());
    }
  };

  return (
    <header className="relative z-10 border-b border-surface-800/50 bg-surface-950/80 backdrop-blur-xl">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Logo & Title */}
        <div className="flex items-center gap-4">
          {/* Logo mark */}
          <div className="relative w-10 h-10 flex items-center justify-center">
            {/* Ring */}
            <div className="absolute inset-0 rounded-full border-2 border-accent/30" />
            <div className="absolute inset-1 rounded-full border border-accent/50" />
            {/* Center dot */}
            <div className="w-2 h-2 rounded-full bg-accent shadow-glow-amber-sm" />
          </div>

          <div>
            <h1 className="font-display text-xl text-surface-100 tracking-tight">
              Ringmaster
            </h1>
            <p className="text-xs text-surface-500 font-mono tracking-wide">
              Direct the circus
            </p>
          </div>

          {/* Health Status Indicator */}
          <div className="hidden sm:block border-l border-surface-800 pl-4 ml-2">
            <HealthIndicator
              pollInterval={15000}
              onStatusChange={(status, previousStatus) => {
                // Log status changes for visibility
                if (status === 'unhealthy') {
                  console.warn(`[Ringmaster] Server became ${status} (was ${previousStatus})`);
                } else if (previousStatus === 'unhealthy' && status === 'healthy') {
                  console.log(`[Ringmaster] Server recovered`);
                }
              }}
            />
          </div>
        </div>

        {/* Storage Mode & File Status */}
        <div className="hidden md:flex items-center gap-3">
          {/* Storage Mode Selector */}
          <StorageModeSelector
            compact
            onModeChange={(mode) => {
              onStorageModeChange?.(mode);
              // Refresh data when mode changes
              onRefresh();
            }}
            onExport={onExportMarkdown}
            detectedRepo={detectedRepo}
          />

          {/* Stale Detection Warning */}
          {isProjectStale && onRefreshProject && (
            <button
              onClick={handleRefreshProject}
              disabled={isRefreshingProject}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 hover:border-yellow-500/50 transition-colors disabled:opacity-50"
              title="Project detection is stale. Click to refresh."
            >
              <svg
                className={`w-4 h-4 text-yellow-400 ${isRefreshingProject ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-xs text-yellow-400">
                {isRefreshingProject ? 'Refreshing...' : 'Stale'}
              </span>
            </button>
          )}

          {/* GitHub Status Indicator */}
          {storageMode === 'github' && (
            <button
              onClick={onOpenGitHubSettings}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                isGitHubConnected
                  ? 'bg-green-500/10 border border-green-500/30 hover:border-green-500/50'
                  : 'bg-surface-900/50 border border-surface-800 hover:border-surface-700'
              }`}
              title={isGitHubConnected ? `Connected as ${gitHubUser?.login || 'unknown'}` : 'Connect to GitHub'}
            >
              {isGitHubConnected && gitHubUser?.avatarUrl ? (
                <img
                  src={gitHubUser.avatarUrl}
                  alt={gitHubUser.login}
                  className="w-5 h-5 rounded-full"
                />
              ) : (
                <div className={`w-2 h-2 rounded-full ${isGitHubConnected ? 'bg-green-500' : 'bg-surface-500'}`} />
              )}
              <span className={`text-xs ${isGitHubConnected ? 'text-green-400' : 'text-surface-400'}`}>
                {isGitHubConnected ? (gitHubUser?.login || 'Connected') : 'Connect'}
              </span>
              {/* Connection status dot */}
              {isGitHubConnected && (
                <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
              )}
            </button>
          )}

          {/* Last Sync Timestamp (after mount to avoid hydration mismatch) */}
          {hasMounted && isGitHubConnected && lastSyncAt && (
            <span className="text-xs text-surface-500" title={`Last synced: ${new Date(lastSyncAt).toLocaleString()}`}>
              Synced {formatRelativeTime(lastSyncAt)}
            </span>
          )}

          {/* File Status with Picker (only shown in file mode) */}
          {storageMode === 'file' && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowPathPicker(!showPathPicker)}
                className="flex items-center gap-3 px-4 py-2 rounded-lg bg-surface-900/50 border border-surface-800 hover:border-surface-700 transition-colors"
              >
                <div className={`w-2 h-2 rounded-full ${fileExists ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span className="text-xs text-surface-400 font-mono truncate max-w-[250px]">
                  {/* GAP #1 FIX: More helpful text when no file loaded */}
                  {filePath ? filePath.split('/').slice(-2).join('/') : 'Click to select file'}
                </span>
                <svg className={`w-3 h-3 text-surface-500 transition-transform ${showPathPicker ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

          {/* Path Picker Dropdown */}
          {showPathPicker && (
            <div className="absolute top-full mt-2 left-0 w-96 bg-surface-900 border border-surface-700 rounded-xl shadow-2xl overflow-hidden z-50">
              {/* Path Input */}
              <form onSubmit={handleSubmitPath} className="p-3 border-b border-surface-800">
                <label className="text-xs text-surface-500 mb-1.5 block">Enter BACKLOG.md path:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pathInput}
                    onChange={(e) => setPathInput(e.target.value)}
                    placeholder="/path/to/BACKLOG.md"
                    className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-accent/50"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 bg-accent hover:bg-accent-hover text-surface-900 font-medium text-sm rounded-lg transition-colors"
                  >
                    Open
                  </button>
                </div>
              </form>

              {/* Recent Paths */}
              {recentPaths.length > 0 && (
                <div className="p-2">
                  <p className="text-xs text-surface-500 px-2 py-1">Recent:</p>
                  {recentPaths.map((path, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelectPath(path)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm font-mono truncate transition-colors ${
                        path === filePath
                          ? 'bg-accent/10 text-accent'
                          : 'text-surface-300 hover:bg-surface-800'
                      }`}
                    >
                      {path}
                    </button>
                  ))}
                </div>
              )}

              {/* Current Path */}
              {filePath && (
                <div className="p-3 border-t border-surface-800 bg-surface-800/50">
                  <p className="text-xs text-surface-500 mb-1">Current:</p>
                  <p className="text-xs text-surface-300 font-mono break-all">{filePath}</p>
                </div>
              )}

              {/* Refresh Button */}
              <div className="p-2 border-t border-surface-800">
                <button
                  onClick={() => { onRefresh(); setShowPathPicker(false); }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-surface-400 hover:text-surface-200 hover:bg-surface-800 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh Current File
                </button>
              </div>
            </div>
          )}
            </div>
          )}

          {/* Sync Button (shown when GitHub is connected, after mount to avoid hydration mismatch) */}
          {hasMounted && isGitHubConnected && onSync && (
            <button
              onClick={onSync}
              disabled={isSyncing}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-900/50 border border-surface-800 hover:border-surface-700 transition-colors disabled:opacity-50"
              title="Sync with GitHub"
            >
              <svg
                className={`w-4 h-4 text-surface-400 ${isSyncing ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-xs text-surface-400">
                {isSyncing ? 'Syncing...' : 'Sync'}
              </span>
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {/* Animated Search */}
          <AnimatedSearch
            value={searchQuery}
            onChange={onSearchChange}
            placeholder="Search tasks..."
            className="hidden sm:flex"
          />

          {/* Actions Dropdown - consolidates Cleanup and Worktrees */}
          {(onCleanup || onCleanupWorktrees) && (
            <ActionDropdown
              className="hidden sm:block"
              actions={[
                ...(onCleanup ? [{
                  id: 'cleanup',
                  label: 'Tidy Up Tasks',
                  icon: (
                    // Modern sparkle/clean icon - represents tidying up
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                    </svg>
                  ),
                  onClick: onCleanup,
                }] : []),
                ...(onCleanupWorktrees ? [{
                  id: 'worktrees',
                  label: 'Clean Worktrees',
                  icon: (
                    // Git branch icon
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <circle cx="6" cy="6" r="3" />
                      <circle cx="6" cy="18" r="3" />
                      <circle cx="18" cy="12" r="3" />
                      <path d="M6 9v6M9 6h6c1.5 0 3 1.5 3 3v0" />
                    </svg>
                  ),
                  onClick: handleCleanupWorktrees,
                  loading: isCleaningWorktrees,
                  loadingLabel: 'Cleaning...',
                }] : []),
              ] as ActionItem[]}
            />
          )}

          {/* Mobile menu button */}
          <button className="sm:hidden p-2 text-surface-400 hover:text-surface-100 hover:bg-surface-800 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent" />
    </header>
  );
}
