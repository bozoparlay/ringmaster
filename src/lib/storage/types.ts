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
  remoteVersion: BacklogItem;
  conflictType: 'both-modified' | 'local-deleted' | 'remote-deleted';
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

// ============================================================================
// Project Integration Types (Phase 0)
// ============================================================================

/**
 * Git provider detected from remote URL
 */
export type GitProvider = 'github' | 'gitlab' | 'bitbucket' | 'unknown';

/**
 * User-level configuration (shared across all projects)
 * Stored at: 'ringmaster:user:github'
 */
export interface UserGitHubConfig {
  token: string;
  tokenCreatedAt: string;
  username?: string;
}

/**
 * Project-level configuration (per repository)
 * Stored at: 'ringmaster:project:{repoUrlHash}'
 */
export interface ProjectConfig {
  // Repository info (detected from git remote)
  repoUrl: string;
  owner: string;
  repo: string;
  provider: GitProvider;

  // User preferences
  storageMode: StorageMode;

  // GitHub-specific settings (only used when storageMode === 'github')
  github?: {
    syncEnabled: boolean;
    labelMapping: {
      'up-next': string;
      'in-progress': string;
      'review': string;
      'ready-to-ship': string;
    };
    autoAssign: boolean;
    linkPRsToIssues: boolean;
  };

  // Prompt state
  promptDismissed?: boolean;
  promptDismissedAt?: string;

  // Metadata
  configuredAt: string;
  lastSyncAt?: string;
}

/**
 * Response from /api/repo-info endpoint
 */
export interface RepoInfoResponse {
  // Detected from git remote
  repoUrl: string;
  owner: string;
  repo: string;
  provider: GitProvider;

  // Additional context
  defaultBranch: string;
  currentBranch: string;

  // Ringmaster state
  hasBacklogFile: boolean;
}

/**
 * Response from /api/github/status endpoint
 */
export interface GitHubStatusResponse {
  connected: boolean;
  user?: {
    login: string;
    name: string;
    avatarUrl: string;
  };
  repo?: {
    fullName: string;
    private: boolean;
    hasIssues: boolean;
    defaultBranch: string;
  };
  permissions?: {
    canReadIssues: boolean;
    canWriteIssues: boolean;
    canCreatePRs: boolean;
  };
  error?: string;
}

/**
 * GitHub label definition with color and description
 */
export interface GitHubLabelDef {
  color: string;
  description: string;
}

/**
 * Comprehensive label schema for GitHub sync
 * All labels managed by Ringmaster
 */
export const GITHUB_LABEL_SCHEMA: Record<string, GitHubLabelDef> = {
  // Meta label to identify Ringmaster-managed issues
  'ringmaster': { color: '7057FF', description: 'Managed by Ringmaster' },

  // Priority labels
  'priority:critical': { color: 'B60205', description: 'Critical priority' },
  'priority:high': { color: 'D93F0B', description: 'High priority' },
  'priority:medium': { color: 'FBCA04', description: 'Medium priority' },
  'priority:low': { color: '0E8A16', description: 'Low priority' },
  'priority:someday': { color: 'C5DEF5', description: 'Someday/maybe' },

  // Status labels (for Kanban columns)
  'status:backlog': { color: 'EDEDED', description: 'In backlog' },
  'status:up-next': { color: 'C2E0C6', description: 'Up next' },
  'status:in-progress': { color: '0052CC', description: 'In progress' },
  'status:review': { color: '5319E7', description: 'In review' },
  'status:ready-to-ship': { color: '0E8A16', description: 'Ready to ship' },

  // Effort labels
  'effort:trivial': { color: 'BFDADC', description: 'Trivial effort' },
  'effort:low': { color: 'C2E0C6', description: 'Low effort' },
  'effort:medium': { color: 'FEF2C0', description: 'Medium effort' },
  'effort:high': { color: 'F9D0C4', description: 'High effort' },
  'effort:very-high': { color: 'E99695', description: 'Very high effort' },
};

/**
 * Default label mapping for GitHub workflow sync (legacy)
 */
export const DEFAULT_GITHUB_LABELS = {
  'up-next': 'priority: up-next',
  'in-progress': 'status: in-progress',
  'review': 'status: review',
  'ready-to-ship': 'status: ready-to-ship',
} as const;
