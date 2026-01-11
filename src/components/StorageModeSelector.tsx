'use client';

import { useState, useEffect } from 'react';
import {
  getStorageMode,
  setStorageMode,
  getAvailableStorageModes,
  isGitHubSyncConfigured,
  type StorageMode,
} from '@/lib/storage';
import { GitHubSettingsModal } from './GitHubSettingsModal';

interface StorageModeSelectorProps {
  /**
   * Callback when storage mode changes
   */
  onModeChange?: (newMode: StorageMode) => void;
  /**
   * Callback to get markdown export (called when export button clicked)
   */
  onExport?: () => Promise<string>;
  /**
   * Compact mode for embedding in headers/toolbars
   */
  compact?: boolean;
}

/**
 * StorageModeSelector - UI component for selecting task storage mode
 *
 * Allows users to switch between:
 * - Local Storage (default, local-first)
 * - File (BACKLOG.md, backwards compatible)
 * - GitHub Issues (future, disabled)
 */
export function StorageModeSelector({ onModeChange, onExport, compact = false }: StorageModeSelectorProps) {
  const [currentMode, setCurrentMode] = useState<StorageMode>('local');
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false);
  const [isGitHubConfigured, setIsGitHubConfigured] = useState(false);
  const modes = getAvailableStorageModes();

  // Load current mode and GitHub config status on mount
  useEffect(() => {
    const mode = getStorageMode();
    setCurrentMode(mode);
    setIsGitHubConfigured(isGitHubSyncConfigured());
  }, []);

  const handleModeSelect = (mode: StorageMode) => {
    // If selecting GitHub mode and not configured, open settings first
    if (mode === 'github' && !isGitHubConfigured) {
      setIsGitHubModalOpen(true);
      return;
    }

    setStorageMode(mode);
    setCurrentMode(mode);
    setIsOpen(false);
    onModeChange?.(mode);
  };

  const handleGitHubConnect = () => {
    setIsGitHubConfigured(true);
    // After connecting, set mode to github and notify parent
    setStorageMode('github');
    setCurrentMode('github');
    setIsOpen(false);
    onModeChange?.('github');
  };

  const handleExport = async () => {
    if (!onExport || isExporting) return;

    setIsExporting(true);
    try {
      const markdown = await onExport();

      // Create downloadable file
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BACKLOG-export-${new Date().toISOString().split('T')[0]}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setIsOpen(false);
    } catch (error) {
      console.error('[StorageModeSelector] Export failed:', error);
      alert('Export failed. Check console for details.');
    } finally {
      setIsExporting(false);
    }
  };

  const currentModeInfo = modes.find(m => m.mode === currentMode);

  // Icon for each mode
  const getModeIcon = (mode: StorageMode) => {
    switch (mode) {
      case 'local':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        );
      case 'file':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'github':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
        );
    }
  };

  if (compact) {
    // Compact dropdown for toolbar/header
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-900/50 border border-surface-800 hover:border-surface-700 transition-colors text-sm"
          title={`Storage: ${currentModeInfo?.label}`}
        >
          {getModeIcon(currentMode)}
          <span className="text-surface-400">{currentModeInfo?.label}</span>
          <svg className={`w-3 h-3 text-surface-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute top-full mt-2 right-0 w-72 bg-surface-900 border border-surface-700 rounded-xl shadow-2xl overflow-hidden z-50">
            <div className="p-3 border-b border-surface-800">
              <p className="text-sm font-medium text-surface-200">Storage Mode</p>
              <p className="text-xs text-surface-500 mt-1">Choose where to store your tasks</p>
            </div>
            <div className="p-2">
              {modes.map((modeInfo) => (
                <button
                  key={modeInfo.mode}
                  onClick={() => modeInfo.available && handleModeSelect(modeInfo.mode)}
                  disabled={!modeInfo.available}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    currentMode === modeInfo.mode
                      ? 'bg-accent/10 border border-accent/30'
                      : modeInfo.available
                        ? 'hover:bg-surface-800'
                        : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className={`mt-0.5 ${currentMode === modeInfo.mode ? 'text-accent' : 'text-surface-400'}`}>
                    {getModeIcon(modeInfo.mode)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${currentMode === modeInfo.mode ? 'text-accent' : 'text-surface-200'}`}>
                        {modeInfo.label}
                      </span>
                      {!modeInfo.available && (
                        <span className="text-xs px-1.5 py-0.5 bg-surface-700 text-surface-400 rounded">
                          Coming soon
                        </span>
                      )}
                      {currentMode === modeInfo.mode && (
                        <svg className="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <p className="text-xs text-surface-500 mt-0.5 line-clamp-2">
                      {modeInfo.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            {/* Export Button */}
            {onExport && (
              <div className="p-2 border-t border-surface-800">
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-surface-800 disabled:opacity-50"
                >
                  <svg className="w-4 h-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-surface-200">
                      {isExporting ? 'Exporting...' : 'Export to Markdown'}
                    </span>
                    <p className="text-xs text-surface-500 mt-0.5">
                      Download tasks as BACKLOG.md file
                    </p>
                  </div>
                </button>
              </div>
            )}
            {/* GitHub Settings Link (if configured) */}
            {isGitHubConfigured && (
              <div className="p-2 border-t border-surface-800">
                <button
                  onClick={() => setIsGitHubModalOpen(true)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-surface-800"
                >
                  <svg className="w-4 h-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-sm font-medium text-surface-200">GitHub Settings</span>
                </button>
              </div>
            )}
            <div className="p-3 border-t border-surface-800 bg-surface-800/30">
              <p className="text-xs text-surface-500">
                Note: Changing modes does not migrate data. Use the migration wizard to transfer tasks between storage locations.
              </p>
            </div>
          </div>
        )}

        {/* GitHub Settings Modal */}
        <GitHubSettingsModal
          isOpen={isGitHubModalOpen}
          onClose={() => setIsGitHubModalOpen(false)}
          onConnect={handleGitHubConnect}
        />
      </div>
    );
  }

  // Full settings panel mode
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium text-surface-100">Storage Mode</h3>
        <p className="text-sm text-surface-500 mt-1">Choose where to store your tasks</p>
      </div>

      <div className="space-y-2">
        {modes.map((modeInfo) => (
          <button
            key={modeInfo.mode}
            onClick={() => modeInfo.available && handleModeSelect(modeInfo.mode)}
            disabled={!modeInfo.available}
            className={`w-full flex items-start gap-4 p-4 rounded-xl border transition-colors ${
              currentMode === modeInfo.mode
                ? 'bg-accent/10 border-accent/30'
                : modeInfo.available
                  ? 'bg-surface-900/50 border-surface-800 hover:border-surface-700'
                  : 'bg-surface-900/30 border-surface-800/50 opacity-50 cursor-not-allowed'
            }`}
          >
            <div className={`p-2 rounded-lg ${currentMode === modeInfo.mode ? 'bg-accent/20 text-accent' : 'bg-surface-800 text-surface-400'}`}>
              {getModeIcon(modeInfo.mode)}
            </div>
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2">
                <span className={`font-medium ${currentMode === modeInfo.mode ? 'text-accent' : 'text-surface-200'}`}>
                  {modeInfo.label}
                </span>
                {!modeInfo.available && (
                  <span className="text-xs px-2 py-0.5 bg-surface-700 text-surface-400 rounded">
                    Coming soon
                  </span>
                )}
              </div>
              <p className="text-sm text-surface-500 mt-1">
                {modeInfo.description}
              </p>
            </div>
            {currentMode === modeInfo.mode && (
              <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
