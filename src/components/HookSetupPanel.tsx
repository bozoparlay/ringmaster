'use client';

import { useState, useEffect, useCallback } from 'react';
import { getHooksConfigJson } from '@/lib/hooks/config';

interface HookStatus {
  configured: boolean;
  hasSubagentStop: boolean;
  hasSessionStop: boolean;
  trustsTaskWorktrees: boolean;
  settingsPath: string | null;
  settingsSource: 'project-local' | 'project' | 'global' | 'none';
  issues: string[];
  ringmasterUrl: string | null;
}

interface HookSetupPanelProps {
  baseUrl?: string;
  projectRoot?: string;
  /** Compact mode for embedding in other panels */
  compact?: boolean;
}

type SetupState = 'idle' | 'checking' | 'enabling' | 'disabling' | 'success' | 'error';

/**
 * Panel for managing Claude Code hook configuration.
 * Features one-click setup with status detection and manual fallback.
 */
export function HookSetupPanel({
  baseUrl = 'http://localhost:3000',
  projectRoot,
  compact = false
}: HookSetupPanelProps) {
  const [status, setStatus] = useState<HookStatus | null>(null);
  const [setupState, setSetupState] = useState<SetupState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);

  const configJson = getHooksConfigJson(baseUrl);

  // Check hook status on mount and periodically
  const checkStatus = useCallback(async () => {
    try {
      setSetupState('checking');
      const params = new URLSearchParams();
      if (projectRoot) params.set('projectRoot', projectRoot);

      const response = await fetch(`/api/hooks/status?${params}`, {
        cache: 'no-store',
      });

      if (!response.ok) throw new Error('Failed to check status');

      const data: HookStatus = await response.json();
      setStatus(data);
      setSetupState('idle');
      setErrorMessage(null);
    } catch (error) {
      setSetupState('error');
      setErrorMessage('Could not check hook configuration');
    }
  }, [projectRoot]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Enable hooks with one click
  const handleEnable = async () => {
    try {
      setSetupState('enabling');
      setErrorMessage(null);

      const response = await fetch('/api/hooks/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectRoot,
          baseUrl,
          enableSubagentStop: true,
          enableSessionStop: true,
          trustTaskWorktrees: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to enable hooks');
      }

      setSetupState('success');

      // Refresh status after a brief delay
      setTimeout(() => {
        checkStatus();
      }, 500);
    } catch (error) {
      setSetupState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Setup failed');
    }
  };

  // Disable hooks
  const handleDisable = async () => {
    try {
      setSetupState('disabling');
      setErrorMessage(null);

      const params = new URLSearchParams();
      if (projectRoot) params.set('projectRoot', projectRoot);

      const response = await fetch(`/api/hooks/setup?${params}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to disable hooks');
      }

      // Refresh status
      await checkStatus();
    } catch (error) {
      setSetupState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to disable');
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(configJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('Failed to copy to clipboard');
    }
  };

  // Determine visual state
  const isFullyConfigured = status?.hasSubagentStop && status?.hasSessionStop;
  const isPartiallyConfigured = status?.configured && !isFullyConfigured;
  const isNotConfigured = !status?.configured;
  const isLoading = setupState === 'checking' || setupState === 'enabling' || setupState === 'disabling';

  // Status indicator colors
  const getStatusColor = () => {
    if (isLoading) return 'bg-surface-500';
    if (isFullyConfigured) return 'bg-green-500';
    if (isPartiallyConfigured) return 'bg-yellow-500';
    return 'bg-surface-600';
  };

  const getStatusRing = () => {
    if (isFullyConfigured) return 'ring-green-500/20';
    if (isPartiallyConfigured) return 'ring-yellow-500/20';
    return 'ring-surface-600/20';
  };

  if (compact) {
    // Compact inline version for embedding
    return (
      <div className="flex items-center justify-between gap-4 p-3 bg-surface-800/50 rounded-lg border border-surface-700/50">
        <div className="flex items-center gap-3">
          <div className={`relative w-2.5 h-2.5 rounded-full ${getStatusColor()}`}>
            {isLoading && (
              <div className="absolute inset-0 rounded-full bg-surface-500 animate-ping" />
            )}
          </div>
          <div>
            <span className="text-sm text-surface-200">
              {isFullyConfigured ? 'Auto-review enabled' :
               isPartiallyConfigured ? 'Partially configured' :
               'Auto-review disabled'}
            </span>
          </div>
        </div>
        {!isFullyConfigured && (
          <button
            onClick={handleEnable}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Setting up...' : 'Enable'}
          </button>
        )}
        {isFullyConfigured && (
          <button
            onClick={handleDisable}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-surface-400 hover:text-surface-300 hover:bg-surface-700/50 transition-colors"
          >
            Disable
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header with status */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className={`relative flex-shrink-0 w-3 h-3 rounded-full ring-4 ${getStatusColor()} ${getStatusRing()}`}>
              {isLoading && (
                <div className={`absolute inset-0 rounded-full ${getStatusColor()} animate-ping opacity-75`} />
              )}
            </div>
            <h3 className="text-base font-medium text-surface-100">Auto-Review Pipeline</h3>
          </div>
          <p className="text-sm text-surface-400 mt-1.5 ml-6">
            {isFullyConfigured
              ? 'Tasks automatically move to AI Review when Claude Code sessions end'
              : isPartiallyConfigured
              ? 'Some hooks are configured, but auto-review requires the Stop hook'
              : 'Enable to automatically move tasks to review when work completes'}
          </p>
        </div>
      </div>

      {/* Main action card */}
      <div className={`relative overflow-hidden rounded-xl border transition-all duration-300 ${
        isFullyConfigured
          ? 'bg-green-500/5 border-green-500/20'
          : isPartiallyConfigured
          ? 'bg-yellow-500/5 border-yellow-500/20'
          : 'bg-surface-800/50 border-surface-700/50'
      }`}>
        {/* Subtle gradient overlay */}
        <div className={`absolute inset-0 opacity-30 pointer-events-none ${
          isFullyConfigured
            ? 'bg-gradient-to-br from-green-500/10 via-transparent to-transparent'
            : isPartiallyConfigured
            ? 'bg-gradient-to-br from-yellow-500/10 via-transparent to-transparent'
            : 'bg-gradient-to-br from-accent/5 via-transparent to-transparent'
        }`} />

        <div className="relative p-5">
          {/* Status-specific content */}
          {isFullyConfigured ? (
            <div className="space-y-4">
              {/* Success state */}
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-green-300">Hooks Configured</p>
                  <p className="text-xs text-surface-400 mt-0.5">
                    {status?.settingsSource === 'project-local' ? 'Project-level' : status?.settingsSource} settings
                  </p>
                </div>
              </div>

              {/* Feature list */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="flex items-center gap-2 text-sm text-surface-300">
                  <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Subagent tracking</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-surface-300">
                  <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Auto-review trigger</span>
                </div>
                <div className={`flex items-center gap-2 text-sm ${status?.trustsTaskWorktrees ? 'text-surface-300' : 'text-surface-500'}`}>
                  <svg className={`w-4 h-4 ${status?.trustsTaskWorktrees ? 'text-green-400' : 'text-surface-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={status?.trustsTaskWorktrees ? "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" : "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"} />
                  </svg>
                  <span>Worktree trust</span>
                </div>
              </div>

              {/* Disable option */}
              <div className="flex items-center justify-between pt-3 border-t border-surface-700/50">
                <span className="text-xs text-surface-500">
                  Settings in <code className="px-1 py-0.5 bg-surface-800 rounded text-surface-400">.claude/settings.local.json</code>
                </span>
                <button
                  onClick={handleDisable}
                  disabled={isLoading}
                  className="text-xs text-surface-500 hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  {setupState === 'disabling' ? 'Disabling...' : 'Disable hooks'}
                </button>
              </div>
            </div>
          ) : isPartiallyConfigured ? (
            <div className="space-y-4">
              {/* Partial config state */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-yellow-300">Incomplete Setup</p>
                  <p className="text-xs text-surface-400 mt-1">
                    {status?.issues.join('. ')}
                  </p>
                </div>
              </div>

              {/* Feature status */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className={`flex items-center gap-2 text-sm ${status?.hasSubagentStop ? 'text-surface-300' : 'text-surface-500'}`}>
                  <svg className={`w-4 h-4 ${status?.hasSubagentStop ? 'text-green-400' : 'text-surface-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={status?.hasSubagentStop ? "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" : "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"} />
                  </svg>
                  <span>Subagent tracking</span>
                </div>
                <div className={`flex items-center gap-2 text-sm ${status?.hasSessionStop ? 'text-surface-300' : 'text-surface-500'}`}>
                  <svg className={`w-4 h-4 ${status?.hasSessionStop ? 'text-green-400' : 'text-surface-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={status?.hasSessionStop ? "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" : "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"} />
                  </svg>
                  <span>Auto-review trigger</span>
                </div>
                <div className={`flex items-center gap-2 text-sm ${status?.trustsTaskWorktrees ? 'text-surface-300' : 'text-surface-500'}`}>
                  <svg className={`w-4 h-4 ${status?.trustsTaskWorktrees ? 'text-green-400' : 'text-surface-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={status?.trustsTaskWorktrees ? "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" : "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"} />
                  </svg>
                  <span>Worktree trust</span>
                </div>
              </div>

              {/* Fix button */}
              <button
                onClick={handleEnable}
                disabled={isLoading}
                className="w-full mt-2 py-2.5 px-4 rounded-lg bg-accent/20 hover:bg-accent/30 text-accent font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {setupState === 'enabling' ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Updating configuration...
                  </span>
                ) : (
                  'Complete Setup'
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Not configured state */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-surface-200">Enable Auto-Review</p>
                  <p className="text-xs text-surface-400 mt-1">
                    One click to configure Claude Code hooks. Tasks will automatically move to AI Review when work sessions complete.
                  </p>
                </div>
              </div>

              {/* Feature preview */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="flex items-center gap-2 text-sm text-surface-400">
                  <svg className="w-4 h-4 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span>Subagent tracking</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-surface-400">
                  <svg className="w-4 h-4 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span>Auto-review trigger</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-surface-400">
                  <svg className="w-4 h-4 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span>Worktree trust</span>
                </div>
              </div>

              {/* Enable button */}
              <button
                onClick={handleEnable}
                disabled={isLoading}
                className="w-full mt-2 py-3 px-4 rounded-lg bg-accent hover:bg-accent-hover text-surface-900 font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-glow-amber-sm hover:shadow-glow-amber"
              >
                {setupState === 'enabling' ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Setting up...
                  </span>
                ) : (
                  'Enable Auto-Review'
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {errorMessage && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{errorMessage}</span>
          <button
            onClick={checkStatus}
            className="ml-auto text-xs text-red-400 hover:text-red-300"
          >
            Retry
          </button>
        </div>
      )}

      {/* Success message */}
      {setupState === 'success' && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-300 text-sm animate-fade-in">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Hooks configured successfully! Auto-review is now active.</span>
        </div>
      )}

      {/* Advanced/Manual setup accordion */}
      <div className="border border-surface-700/50 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-surface-400 hover:text-surface-300 hover:bg-surface-800/50 transition-colors"
        >
          <span>Advanced Setup</span>
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showAdvanced && (
          <div className="border-t border-surface-700/50 p-4 space-y-4 animate-fade-in">
            <p className="text-xs text-surface-400">
              Manually add this configuration to your Claude Code settings:
            </p>

            <div className="text-xs text-surface-500 space-y-1">
              <p>
                <span className="text-surface-400">Project:</span>{' '}
                <code className="bg-surface-800 px-1.5 py-0.5 rounded">.claude/settings.local.json</code>
              </p>
              <p>
                <span className="text-surface-400">Global:</span>{' '}
                <code className="bg-surface-800 px-1.5 py-0.5 rounded">~/.claude/settings.json</code>
              </p>
            </div>

            {/* Config JSON */}
            <div className="relative group">
              <pre className="bg-surface-900 border border-surface-700/50 rounded-lg p-4 text-xs text-surface-400 overflow-x-auto font-mono">
                <code>{configJson}</code>
              </pre>
              <button
                onClick={handleCopy}
                className={`absolute top-2 right-2 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  copied
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-surface-700 text-surface-300 hover:bg-surface-600 opacity-0 group-hover:opacity-100'
                }`}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <p className="text-xs text-surface-500">
              After adding manually, restart Claude Code for changes to take effect.
            </p>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="pt-2">
        <p className="text-xs text-surface-500 leading-relaxed">
          <span className="text-surface-400">How it works:</span> When you finish working on a task in Claude Code,
          the Stop hook notifies Ringmaster, which automatically moves the task to AI Review.
        </p>
      </div>
    </div>
  );
}

export default HookSetupPanel;
