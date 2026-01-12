'use client';

import { useState, useEffect } from 'react';
import {
  getGitHubSyncConfig,
  setGitHubSyncConfig,
  clearGitHubSyncConfig,
  isGitHubSyncConfigured,
  type GitHubSyncConfig,
} from '@/lib/storage';

interface GitHubSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect?: () => void;
  /** Pre-detected repo from git remote (auto-filled) */
  detectedRepo?: { owner: string; repo: string };
}

/**
 * GitHubSettingsModal - Configure GitHub Issues sync
 *
 * Allows users to:
 * - Enter their GitHub Personal Access Token
 * - Specify the repository (owner/repo)
 * - Configure enterprise GitHub URL (optional)
 * - Test the connection
 * - Disconnect from GitHub
 */
export function GitHubSettingsModal({ isOpen, onClose, onConnect, detectedRepo }: GitHubSettingsModalProps) {
  const [token, setToken] = useState('');
  const [repo, setRepo] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Load existing config on mount, or pre-fill with detected repo
  useEffect(() => {
    if (isOpen) {
      const config = getGitHubSyncConfig();
      if (config) {
        setToken(config.token);
        setRepo(config.repo);
        setApiUrl(config.apiUrl || '');
        setIsConnected(true);
      } else {
        setToken('');
        // Pre-fill with detected repo if available
        setRepo(detectedRepo ? `${detectedRepo.owner}/${detectedRepo.repo}` : '');
        setApiUrl('');
        setIsConnected(false);
      }
      setTestResult(null);
    }
  }, [isOpen, detectedRepo]);

  const handleTestConnection = async () => {
    if (!token || !repo) {
      setTestResult({ success: false, message: 'Token and repository are required' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const baseUrl = apiUrl || 'https://api.github.com';
      const response = await fetch(`${baseUrl}/repos/${repo}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTestResult({
          success: true,
          message: `Connected to ${data.full_name}`,
        });
      } else if (response.status === 401) {
        setTestResult({ success: false, message: 'Invalid token or token lacks required permissions' });
      } else if (response.status === 404) {
        setTestResult({ success: false, message: 'Repository not found. Check the owner/repo format.' });
      } else {
        setTestResult({ success: false, message: `GitHub API error: ${response.status}` });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    if (!token || !repo) {
      setTestResult({ success: false, message: 'Token and repository are required' });
      return;
    }

    setGitHubSyncConfig({
      token,
      repo,
      apiUrl: apiUrl || undefined,
    });

    setIsConnected(true);
    onConnect?.();
    onClose();
  };

  const handleDisconnect = () => {
    clearGitHubSyncConfig();
    setToken('');
    setRepo('');
    setApiUrl('');
    setIsConnected(false);
    setTestResult(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-surface-900 rounded-2xl shadow-2xl border border-surface-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-surface-300" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            <div>
              <h2 className="text-lg font-semibold text-surface-100">GitHub Issues Sync</h2>
              <p className="text-xs text-surface-500">
                {isConnected ? `Connected to ${repo}` : 'Sync tasks with GitHub Issues'}
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
        <div className="p-6 space-y-5">
          {/* Personal Access Token */}
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-2">
              Personal Access Token
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-2.5 text-sm text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
              >
                {showToken ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-surface-500">
              Create a token at{' '}
              <a
                href="https://github.com/settings/tokens/new"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                github.com/settings/tokens
              </a>
              {' '}with <code className="bg-surface-800 px-1 rounded">repo</code> scope
            </p>
          </div>

          {/* Repository */}
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-2">
              Repository
              {detectedRepo && repo === `${detectedRepo.owner}/${detectedRepo.repo}` && (
                <span className="ml-2 text-xs text-green-400 font-normal">
                  ✓ Auto-detected
                </span>
              )}
            </label>
            <input
              type="text"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="owner/repository"
              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-2.5 text-sm text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
            />
            <p className="mt-1.5 text-xs text-surface-500">
              Format: <code className="bg-surface-800 px-1 rounded">owner/repo</code> (e.g., anthropics/claude-code)
            </p>
          </div>

          {/* Enterprise URL (collapsible) */}
          <details className="group">
            <summary className="cursor-pointer text-sm text-surface-400 hover:text-surface-200 flex items-center gap-2">
              <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Advanced: GitHub Enterprise
            </summary>
            <div className="mt-3 pl-6">
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://github.example.com/api/v3"
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-2.5 text-sm text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
              />
              <p className="mt-1.5 text-xs text-surface-500">
                Leave empty for github.com
              </p>
            </div>
          </details>

          {/* Test Result */}
          {testResult && (
            <div className={`p-3 rounded-lg ${testResult.success ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
              <div className="flex items-center gap-2">
                {testResult.success ? (
                  <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                )}
                <span className={`text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
                  {testResult.message}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-surface-800 bg-surface-800/30">
          {isConnected ? (
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              Disconnect
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={handleTestConnection}
              disabled={isTesting || !token || !repo}
              className="px-4 py-2 text-sm font-medium text-surface-300 hover:text-surface-100 hover:bg-surface-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTesting ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              onClick={handleSave}
              disabled={!token || !repo}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-surface-900 font-medium text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConnected ? 'Update' : 'Connect'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
