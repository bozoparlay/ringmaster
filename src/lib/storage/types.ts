/**
 * Storage Provider Types for Backlog Management
 *
 * This module defines the interface for task storage providers,
 * enabling local-first architecture with optional GitHub sync.
 */

import type { BacklogItem } from '@/types/backlog';

/**
 * Storage mode determines where tasks are persisted
 */
export type StorageMode = 'file' | 'local' | 'github';

/**
 * GitHub sync status for a task
 */
export type GitHubSyncStatus = 'local' | 'synced' | 'modified' | 'conflict' | 'deleted-remote';

/**
 * Configuration options for storage providers
 */
export interface StorageOptions {
  /** Path to the repository root */
  repoPath?: string;
  /** Git remote URL (for repo identification) */
  remoteUrl?: string;
  /** Path to BACKLOG.md file (for file mode) */
  backlogFilePath?: string;
  /** GitHub personal access token (for github mode) */
  githubToken?: string;
  /** GitHub repository in "owner/repo" format (for github mode) */
  githubRepo?: string;
}

/**
 * Abstract interface for task storage providers
 *
 * All storage providers must implement this interface,
 * allowing the application to switch between storage modes
 * without changing the business logic.
 */
export interface TaskStorageProvider {
  /** The storage mode this provider implements */
  readonly mode: StorageMode;

  /**
   * Initialize the provider for a specific repository
   * @param repoIdentifier - Unique identifier for the repo (path or remote URL)
   */
  initialize(repoIdentifier: string): Promise<void>;

  /**
   * Check if the provider is initialized and ready
   */
  isInitialized(): boolean;

  // === CRUD Operations ===

  /**
   * Get all tasks from storage
   */
  getAll(): Promise<BacklogItem[]>;

  /**
   * Get a single task by ID
   * @param id - Task ID
   * @returns The task or null if not found
   */
  getById(id: string): Promise<BacklogItem | null>;

  /**
   * Create a new task
   * @param item - Task data (without id, createdAt, updatedAt)
   * @returns The created task with generated fields
   */
  create(item: Omit<BacklogItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<BacklogItem>;

  /**
   * Update an existing task
   * @param id - Task ID to update
   * @param updates - Partial task data to merge
   * @returns The updated task
   */
  update(id: string, updates: Partial<BacklogItem>): Promise<BacklogItem>;

  /**
   * Delete a task
   * @param id - Task ID to delete
   */
  delete(id: string): Promise<void>;

  // === Bulk Operations ===

  /**
   * Replace all tasks in storage
   * Used for migrations and bulk updates
   * @param items - Complete list of tasks
   */
  replaceAll(items: BacklogItem[]): Promise<void>;

  // === Export ===

  /**
   * Export all tasks to markdown format
   * All providers must support this for backup/export purposes
   */
  exportToMarkdown(): Promise<string>;
}

/**
 * Factory for creating storage providers
 */
export interface StorageProviderFactory {
  /**
   * Create a storage provider for the specified mode
   * @param mode - Storage mode to use
   * @param options - Provider-specific options
   */
  create(mode: StorageMode, options?: StorageOptions): TaskStorageProvider;
}

/**
 * Sync state for GitHub-enabled storage
 */
export interface SyncState {
  lastSyncedAt: string | null;
  pendingOperations: SyncOperation[];
  conflicts: SyncConflict[];
}

/**
 * A pending sync operation (for offline queue)
 */
export interface SyncOperation {
  id: string;
  type: 'push' | 'pull' | 'delete';
  taskId: string;
  issueNumber?: number;
  queuedAt: string;
  retryCount: number;
}

/**
 * A sync conflict between local and remote
 */
export interface SyncConflict {
  taskId: string;
  issueNumber: number;
  localVersion: BacklogItem;
  remoteVersion: GitHubIssueData;
  conflictType: 'both-modified' | 'deleted-remote' | 'deleted-local';
  detectedAt: string;
}

/**
 * GitHub issue data (simplified for conflict resolution)
 */
export interface GitHubIssueData {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  updatedAt: string;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  pushed: { taskId: string; issueNumber: number }[];
  pulled: { issueNumber: number; taskId: string }[];
  conflicts: SyncConflict[];
  errors: SyncError[];
}

/**
 * An error that occurred during sync
 */
export interface SyncError {
  taskId?: string;
  issueNumber?: number;
  operation: 'push' | 'pull' | 'delete';
  message: string;
  retryable: boolean;
}
