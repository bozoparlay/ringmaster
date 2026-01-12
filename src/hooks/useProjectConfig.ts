'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  ProjectConfig,
  UserGitHubConfig,
  RepoInfoResponse,
  GitHubStatusResponse,
  StorageMode,
  GitProvider,
} from '@/lib/storage';
import {
  getUserGitHubConfig,
  setUserGitHubConfig,
  clearUserGitHubConfig,
  getProjectConfig,
  setProjectConfig,
  createProjectConfig,
  isProjectConfigStale,
  migrateOldGitHubConfig,
  shouldShowPrompt,
  dismissProjectPrompt,
  initializeGitHubSettings,
} from '@/lib/storage';

/**
 * Return type for useProjectConfig hook
 */
export interface UseProjectConfigReturn {
  // Project info (from /api/repo-info)
  project: {
    owner: string;
    repo: string;
    repoUrl: string;
    provider: GitProvider;
    defaultBranch: string;
    currentBranch: string;
    hasBacklogFile: boolean;
  } | null;

  // Configuration state
  config: ProjectConfig | null;
  storageMode: StorageMode;

  // GitHub-specific
  isGitHubRepo: boolean;
  isGitHubConnected: boolean;
  gitHubUser: { login: string; name: string; avatarUrl: string } | null;

  // Prompt state
  showGitHubPrompt: boolean;

  // Actions
  setStorageMode: (mode: StorageMode) => void;
  connectGitHub: (token: string) => Promise<boolean>;
  disconnectGitHub: () => void;
  refreshProject: () => Promise<void>;
  dismissPrompt: (permanent?: boolean) => void;

  // Status
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook for managing project configuration with auto-detection
 *
 * Features:
 * - Auto-detects repo from git remote on mount
 * - Caches project config in localStorage (24h TTL)
 * - Manages user-level GitHub PAT
 * - Handles migration from old config format
 * - Controls GitHub connection prompt visibility
 */
export function useProjectConfig(): UseProjectConfigReturn {
  // State
  const [project, setProject] = useState<UseProjectConfigReturn['project']>(null);
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [gitHubUser, setGitHubUser] = useState<UseProjectConfigReturn['gitHubUser']>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGitHubPrompt, setShowGitHubPrompt] = useState(false);

  // Refs
  const initializedRef = useRef(false);
  const fetchingRef = useRef(false);

  // Derived state
  const isGitHubRepo = project?.provider === 'github';
  const isGitHubConnected = config?.storageMode === 'github' && !!getUserGitHubConfig()?.token;
  const storageMode = config?.storageMode || 'local';

  /**
   * Fetch repo info from backend
   */
  const fetchRepoInfo = useCallback(async (): Promise<RepoInfoResponse | null> => {
    try {
      const response = await fetch('/api/repo-info');
      if (!response.ok) {
        throw new Error(`Failed to fetch repo info: ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      console.error('[useProjectConfig] Failed to fetch repo info:', err);
      return null;
    }
  }, []);

  /**
   * Validate GitHub token and get user info
   */
  const validateGitHubToken = useCallback(async (token: string, repo?: string): Promise<GitHubStatusResponse | null> => {
    try {
      const url = repo ? `/api/github/status?repo=${encodeURIComponent(repo)}` : '/api/github/status';
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return await response.json();
    } catch (err) {
      console.error('[useProjectConfig] Failed to validate GitHub token:', err);
      return null;
    }
  }, []);

  /**
   * Initialize project config
   */
  const initialize = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      setIsLoading(true);
      setError(null);

      // Run migration from old config format (one-time)
      migrateOldGitHubConfig();

      // Fetch repo info from backend
      const repoInfo = await fetchRepoInfo();

      if (!repoInfo || !repoInfo.repoUrl) {
        // Not a git repo or no remote - use defaults
        setProject(null);
        setConfig(null);
        setIsLoading(false);
        fetchingRef.current = false;
        return;
      }

      // Set project info
      setProject({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        repoUrl: repoInfo.repoUrl,
        provider: repoInfo.provider,
        defaultBranch: repoInfo.defaultBranch,
        currentBranch: repoInfo.currentBranch,
        hasBacklogFile: repoInfo.hasBacklogFile,
      });

      // Get or create project config
      let projectConfig = getProjectConfig(repoInfo.repoUrl);

      if (!projectConfig || isProjectConfigStale(projectConfig)) {
        // Create new config or refresh stale one
        projectConfig = createProjectConfig(
          repoInfo.repoUrl,
          repoInfo.owner,
          repoInfo.repo,
          repoInfo.provider,
          projectConfig?.storageMode || 'local'
        );
        setProjectConfig(projectConfig);
      }

      setConfig(projectConfig);

      // Check if we should show the GitHub prompt
      if (shouldShowPrompt(projectConfig)) {
        setShowGitHubPrompt(true);
      }

      // If GitHub mode is configured, validate the token
      const userConfig = getUserGitHubConfig();
      if (userConfig?.token && projectConfig.storageMode === 'github') {
        const status = await validateGitHubToken(
          userConfig.token,
          `${repoInfo.owner}/${repoInfo.repo}`
        );
        if (status?.connected && status.user) {
          setGitHubUser(status.user);
        }
      }
    } catch (err) {
      console.error('[useProjectConfig] Initialization error:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize');
    } finally {
      setIsLoading(false);
      fetchingRef.current = false;
    }
  }, [fetchRepoInfo, validateGitHubToken]);

  /**
   * Connect to GitHub with a PAT
   */
  const connectGitHub = useCallback(async (token: string): Promise<boolean> => {
    if (!project) return false;

    try {
      // Validate the token
      const status = await validateGitHubToken(token, `${project.owner}/${project.repo}`);

      if (!status?.connected) {
        setError(status?.error || 'Failed to connect to GitHub');
        return false;
      }

      // Save user config
      setUserGitHubConfig({
        token,
        tokenCreatedAt: new Date().toISOString(),
        username: status.user?.login,
      });

      // Update project config
      if (config) {
        const updated = initializeGitHubSettings(config.repoUrl);
        if (updated) {
          setConfig(updated);
        }
      }

      // Update user state
      if (status.user) {
        setGitHubUser(status.user);
      }

      // Hide prompt
      setShowGitHubPrompt(false);

      return true;
    } catch (err) {
      console.error('[useProjectConfig] GitHub connect error:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
      return false;
    }
  }, [project, config, validateGitHubToken]);

  /**
   * Disconnect from GitHub
   */
  const disconnectGitHub = useCallback(() => {
    clearUserGitHubConfig();
    setGitHubUser(null);

    if (config) {
      const updated: ProjectConfig = {
        ...config,
        storageMode: 'local',
        github: undefined,
      };
      setProjectConfig(updated);
      setConfig(updated);
    }
  }, [config]);

  /**
   * Change storage mode
   */
  const handleSetStorageMode = useCallback((mode: StorageMode) => {
    if (!config) return;

    const updated: ProjectConfig = {
      ...config,
      storageMode: mode,
    };
    setProjectConfig(updated);
    setConfig(updated);
  }, [config]);

  /**
   * Refresh project info
   */
  const refreshProject = useCallback(async () => {
    initializedRef.current = false;
    await initialize();
  }, [initialize]);

  /**
   * Dismiss GitHub prompt
   */
  const dismissPrompt = useCallback((permanent: boolean = false) => {
    setShowGitHubPrompt(false);
    if (config?.repoUrl) {
      dismissProjectPrompt(config.repoUrl, permanent);
    }
  }, [config]);

  // Initialize on mount
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      initialize();
    }
  }, [initialize]);

  return {
    project,
    config,
    storageMode,
    isGitHubRepo,
    isGitHubConnected,
    gitHubUser,
    showGitHubPrompt,
    setStorageMode: handleSetStorageMode,
    connectGitHub,
    disconnectGitHub,
    refreshProject,
    dismissPrompt,
    isLoading,
    error,
  };
}
