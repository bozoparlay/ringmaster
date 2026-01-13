/**
 * Storage Module Exports
 *
 * This module provides a unified interface for task storage with multiple backends:
 * - LocalStorage (default): Browser localStorage for local-first experience
 * - File: BACKLOG.md file via API (backwards compatible)
 * - GitHub: GitHub Issues sync (planned)
 *
 * Usage:
 * ```typescript
 * import { createStorageProvider, getStorageMode, setStorageMode } from '@/lib/storage';
 *
 * // Get or create a storage provider
 * const provider = await createStorageProvider(repoIdentifier);
 *
 * // Use CRUD operations
 * const items = await provider.getAll();
 * const newItem = await provider.create({ title: 'New Task', ... });
 * ```
 */

// Types
export type {
  StorageMode,
  StorageOptions,
  TaskStorageProvider,
  StorageProviderFactory,
  GitHubSyncStatus,
  SyncState,
  SyncOperation,
  SyncConflict,
  SyncResult,
  SyncError,
  GitHubIssueData,
  // Project Integration Types (Phase 0)
  GitProvider,
  UserGitHubConfig,
  ProjectConfig,
  RepoInfoResponse,
  GitHubStatusResponse,
} from './types';

export { DEFAULT_GITHUB_LABELS, GITHUB_LABEL_SCHEMA, type GitHubLabelDef } from './types';

// Storage Providers
export { LocalStorageTaskStore, getStorageKey, hasLocalStorageData, clearLocalStorageData } from './local-storage';
export { FileBacklogTaskStore, hasBacklogFile } from './file-backlog';

// Factory and Configuration
export {
  storageFactory,
  createStorageProvider,
  getStorageMode,
  setStorageMode,
  getAvailableStorageModes,
  DEFAULT_STORAGE_MODE,
} from './factory';

// Migration Utilities
export {
  getStorageStatus,
  migrateFileToLocal,
  migrateLocalToFile,
  exportToMarkdown,
  importFromMarkdown,
  mergeStorageSources,
  type MigrationResult,
  type StorageStatus,
} from './migration';

// GitHub Sync Service
export {
  GitHubSyncService,
  isGitHubSyncConfigured,
  getGitHubSyncConfig,
  setGitHubSyncConfig,
  clearGitHubSyncConfig,
  type GitHubSyncConfig,
} from './github-sync';

// Project Configuration (Phase 0)
export {
  // User-level config
  getUserGitHubConfig,
  setUserGitHubConfig,
  clearUserGitHubConfig,
  hasUserGitHubConfig,
  // Project-level config
  getProjectConfig,
  setProjectConfig,
  updateProjectConfig,
  deleteProjectConfig,
  getProjectKey,
  isProjectConfigStale,
  createProjectConfig,
  initializeGitHubSettings,
  // Migration
  migrateOldGitHubConfig,
  // Prompt helpers
  dismissProjectPrompt,
  shouldShowPrompt,
  // Debug helpers
  getAllProjectConfigs,
  clearAllProjectConfigs,
} from './project-config';
