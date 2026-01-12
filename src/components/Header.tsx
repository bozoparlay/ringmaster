'use client';

import { useState, useEffect, useRef } from 'react';
import { HealthIndicator } from './HealthIndicator';
import { StorageModeSelector } from './StorageModeSelector';
import type { StorageMode } from '@/lib/storage';
import { isGitHubSyncConfigured } from '@/lib/storage';

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
}

const RECENT_PATHS_KEY = 'ringmaster-recent-paths';
const MAX_RECENT_PATHS = 5;

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

export function Header({ filePath, fileExists, storageMode, onNewTask, onRefresh, onChangePath, onStorageModeChange, onExportMarkdown, onSync, isSyncing, onCleanup, searchQuery, onSearchChange, detectedRepo }: HeaderProps) {
  const [showPathPicker, setShowPathPicker] = useState(false);
  const [pathInput, setPathInput] = useState('');
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

          {/* Sync Button (only shown in github mode when configured) */}
          {storageMode === 'github' && onSync && (
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

          {/* File Status with Picker (only shown in file mode) */}
          {storageMode === 'file' && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowPathPicker(!showPathPicker)}
                className="flex items-center gap-3 px-4 py-2 rounded-lg bg-surface-900/50 border border-surface-800 hover:border-surface-700 transition-colors"
              >
                <div className={`w-2 h-2 rounded-full ${fileExists ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span className="text-xs text-surface-400 font-mono truncate max-w-[250px]">
                  {filePath ? filePath.split('/').slice(-2).join('/') : 'No file loaded'}
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
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative hidden sm:block">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search tasks..."
              className="w-56 bg-surface-900 border border-surface-700 rounded-lg pl-9 pr-8 py-2 text-sm text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-surface-500 hover:text-surface-300 hover:bg-surface-700 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {onCleanup && (
            <button
              onClick={onCleanup}
              className="hidden sm:flex items-center gap-2 px-3 py-2 bg-surface-800 hover:bg-surface-700 text-surface-300 font-medium text-sm rounded-lg transition-colors border border-surface-700"
              title="Clean up tasks to match template"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              Cleanup
            </button>
          )}

          <button
            onClick={onNewTask}
            className="hidden sm:flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-surface-900 font-medium text-sm rounded-lg transition-all shadow-glow-amber-sm hover:shadow-glow-amber"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Task
          </button>

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
