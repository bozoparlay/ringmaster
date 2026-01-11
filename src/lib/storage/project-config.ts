/**
 * Project Configuration Storage Helpers
 *
 * Manages per-project configuration in localStorage with support for:
 * - User-level GitHub PAT (shared across projects)
 * - Project-level settings (storage mode, sync preferences)
 * - Cache TTL for repo detection
 */

import type { ProjectConfig, UserGitHubConfig, StorageMode, GitProvider, DEFAULT_GITHUB_LABELS } from './types';

// Storage keys
const USER_GITHUB_KEY = 'ringmaster:user:github';
const PROJECT_PREFIX = 'ringmaster:project:';

// Cache TTL: 24 hours
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Simple hash function for repo URL
 * Used to create unique storage keys per project
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get the storage key for a project
 */
export function getProjectKey(repoUrl: string): string {
  return `${PROJECT_PREFIX}${hashString(repoUrl)}`;
}

// ============================================================================
// User-Level GitHub Config (PAT)
// ============================================================================

/**
 * Get the user's GitHub configuration (PAT)
 */
export function getUserGitHubConfig(): UserGitHubConfig | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(USER_GITHUB_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as UserGitHubConfig;
  } catch {
    return null;
  }
}

/**
 * Set the user's GitHub configuration (PAT)
 */
export function setUserGitHubConfig(config: UserGitHubConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_GITHUB_KEY, JSON.stringify(config));
}

/**
 * Clear the user's GitHub configuration
 */
export function clearUserGitHubConfig(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(USER_GITHUB_KEY);
}

/**
 * Check if user has GitHub configured
 */
export function hasUserGitHubConfig(): boolean {
  return getUserGitHubConfig() !== null;
}

// ============================================================================
// Project-Level Config
// ============================================================================

/**
 * Get project configuration by repo URL
 */
export function getProjectConfig(repoUrl: string): ProjectConfig | null {
  if (typeof window === 'undefined') return null;
  if (!repoUrl) return null;

  try {
    const key = getProjectKey(repoUrl);
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    return JSON.parse(stored) as ProjectConfig;
  } catch {
    return null;
  }
}

/**
 * Set project configuration
 */
export function setProjectConfig(config: ProjectConfig): void {
  if (typeof window === 'undefined') return;
  if (!config.repoUrl) return;

  const key = getProjectKey(config.repoUrl);
  localStorage.setItem(key, JSON.stringify(config));
}

/**
 * Update project configuration (merge with existing)
 */
export function updateProjectConfig(repoUrl: string, updates: Partial<ProjectConfig>): ProjectConfig | null {
  if (typeof window === 'undefined') return null;
  if (!repoUrl) return null;

  const existing = getProjectConfig(repoUrl);
  if (!existing) return null;

  const updated: ProjectConfig = {
    ...existing,
    ...updates,
    // Don't overwrite nested github settings entirely
    github: updates.github
      ? { ...existing.github, ...updates.github }
      : existing.github,
  };

  setProjectConfig(updated);
  return updated;
}

/**
 * Delete project configuration
 */
export function deleteProjectConfig(repoUrl: string): void {
  if (typeof window === 'undefined') return;
  if (!repoUrl) return;

  const key = getProjectKey(repoUrl);
  localStorage.removeItem(key);
}

/**
 * Check if project config is stale (older than CACHE_TTL)
 */
export function isProjectConfigStale(config: ProjectConfig): boolean {
  if (!config.configuredAt) return true;
  const configuredAt = new Date(config.configuredAt).getTime();
  return Date.now() - configuredAt > CACHE_TTL_MS;
}

/**
 * Create a new project configuration with defaults
 */
export function createProjectConfig(
  repoUrl: string,
  owner: string,
  repo: string,
  provider: GitProvider,
  storageMode: StorageMode = 'local'
): ProjectConfig {
  return {
    repoUrl,
    owner,
    repo,
    provider,
    storageMode,
    configuredAt: new Date().toISOString(),
  };
}

/**
 * Initialize GitHub settings for a project
 */
export function initializeGitHubSettings(repoUrl: string): ProjectConfig | null {
  const config = getProjectConfig(repoUrl);
  if (!config) return null;

  const defaultLabels = {
    'up-next': 'priority: up-next',
    'in-progress': 'status: in-progress',
    'review': 'status: review',
    'ready-to-ship': 'status: ready-to-ship',
  };

  const updated: ProjectConfig = {
    ...config,
    storageMode: 'github',
    github: {
      syncEnabled: true,
      labelMapping: defaultLabels,
      autoAssign: true,
      linkPRsToIssues: true,
    },
  };

  setProjectConfig(updated);
  return updated;
}

// ============================================================================
// Migration Helpers
// ============================================================================

/**
 * Migrate old-style global GitHub config to new user-level storage
 * Call this on app initialization
 */
export function migrateOldGitHubConfig(): boolean {
  if (typeof window === 'undefined') return false;

  // Check for old-style config
  const oldToken = localStorage.getItem('ringmaster:github:token');
  const oldRepo = localStorage.getItem('ringmaster:github:repo');

  if (oldToken) {
    // Migrate to new user-level structure
    const userConfig: UserGitHubConfig = {
      token: oldToken,
      tokenCreatedAt: new Date().toISOString(),
    };
    setUserGitHubConfig(userConfig);

    // Clean up old keys
    localStorage.removeItem('ringmaster:github:token');
    localStorage.removeItem('ringmaster:github:repo');
    localStorage.removeItem('ringmaster:github:apiUrl');

    console.log('[project-config] Migrated old GitHub config to new format');
    return true;
  }

  return false;
}

/**
 * Mark prompt as dismissed for a project
 */
export function dismissProjectPrompt(repoUrl: string, permanent: boolean = false): void {
  const config = getProjectConfig(repoUrl);
  if (!config) return;

  updateProjectConfig(repoUrl, {
    promptDismissed: permanent,
    promptDismissedAt: new Date().toISOString(),
  });
}

/**
 * Check if prompt should be shown for a project
 */
export function shouldShowPrompt(config: ProjectConfig | null): boolean {
  if (!config) return false;
  if (config.promptDismissed) return false;
  if (config.storageMode === 'github') return false; // Already connected
  if (config.provider !== 'github') return false; // Not a GitHub repo

  // If dismissed temporarily, show again after 7 days
  if (config.promptDismissedAt) {
    const dismissedAt = new Date(config.promptDismissedAt).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - dismissedAt < sevenDays) return false;
  }

  return true;
}

// ============================================================================
// List/Debug Helpers
// ============================================================================

/**
 * Get all project configurations (for debugging)
 */
export function getAllProjectConfigs(): ProjectConfig[] {
  if (typeof window === 'undefined') return [];

  const configs: ProjectConfig[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PROJECT_PREFIX)) {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          configs.push(JSON.parse(value) as ProjectConfig);
        }
      } catch {
        // Skip invalid entries
      }
    }
  }
  return configs;
}

/**
 * Clear all project configurations (for testing)
 */
export function clearAllProjectConfigs(): void {
  if (typeof window === 'undefined') return;

  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PROJECT_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
}
