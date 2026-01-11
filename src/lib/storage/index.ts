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
} from './types';

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
