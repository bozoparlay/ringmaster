# Backlog Management Feature Spec

> **Status**: Final Draft
> **Created**: 2024-01-09
> **Last Updated**: 2025-01-09

---

## Executive Summary

Migrate Ringmaster's task storage from `BACKLOG.md` (git-tracked) to a **local-first architecture** with optional **GitHub Issues sync**. This eliminates git merge conflicts while preserving fast editing and adding powerful synchronization capabilities.

---

## Problem Statement

### The Git Conflict Problem

```
Timeline of a typical task workflow:

1. BACKLOG.md has "Task X" on main branch
2. Developer creates worktree: .tasks/task-abc123/
3. Developer implements Task X (code changes)
4. Developer wants to mark Task X as "shipped"
5. ⚠️ Meanwhile: Someone added "Task Y" to BACKLOG.md on main
6. ❌ Result: Merge conflict when PR is created/merged
```

### Root Cause

`BACKLOG.md` conflates two concerns:
- **Mutable state** (task status, progress) - changes frequently
- **Version-controlled code** - should be stable, mergeable

### Requirements

Since Ringmaster manages **any repository** (not just itself):
- ✅ Must work with any git repo the user points it at
- ✅ Must not pollute target repo with task management files
- ✅ Must be as fast as editing a local file
- ✅ Must integrate with GitHub Issues for teams

---

## Current Architecture Analysis

### Existing Data Model (`BacklogItem`)

```typescript
// From src/types/backlog.ts - ALREADY EXISTS
interface BacklogItem {
  id: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low' | 'someday';
  effort?: 'trivial' | 'low' | 'medium' | 'high' | 'very_high';
  value?: 'low' | 'medium' | 'high';
  status: 'backlog' | 'up_next' | 'in_progress' | 'review' | 'ready_to_ship';
  tags: string[];
  category?: string;
  createdAt: string;
  updatedAt: string;
  order: number;

  // Structured fields
  acceptanceCriteria?: string[];
  notes?: string;

  // Git workflow (Ringmaster-specific)
  branch?: string;
  worktreePath?: string;
  reviewFeedback?: string;

  // Computed (not persisted)
  qualityScore?: number;
  qualityIssues?: string[];
}
```

### Important Implementation Notes

**`up_next` is a Virtual Status**: The `up_next` status is **not persisted** to BACKLOG.md. When serializing, tasks with `up_next` status are written as `backlog`. The `up_next` distinction is computed at display time based on:
- Tasks in `backlog` status
- Sorted by priority weight
- Limited to a configurable count (default: 5)

This means the storage layer only needs to handle: `backlog`, `in_progress`, `review`, `ready_to_ship`.

**Task Quality Validation**: Existing `src/lib/task-quality.ts` provides quality scoring (0-100) for tasks. Tasks below 50 score show warnings. Quality is computed on load, not persisted. This should be preserved in all storage providers.

### Existing Infrastructure

| Component | Location | Current Role |
|-----------|----------|--------------|
| `useBacklog` hook | `src/hooks/useBacklog.ts` | State management, debounced writes |
| `backlog-parser.ts` | `src/lib/backlog-parser.ts` | Parse/serialize BACKLOG.md |
| `local-storage-cache.ts` | `src/lib/local-storage-cache.ts` | LocalStorage caching |
| `/api/backlog` route | `src/app/api/backlog/route.ts` | CRUD operations |
| KanbanBoard, TaskCard, etc. | `src/components/` | UI components |

### Current Data Flow

```
┌─────────────┐    parse    ┌─────────────┐    cache    ┌─────────────┐
│ BACKLOG.md  │ ──────────► │ BacklogItem │ ──────────► │ localStorage│
│  (file)     │             │   (state)   │             │  (cache)    │
└─────────────┘             └─────────────┘             └─────────────┘
       ▲                           │
       │         serialize         │
       └───────────────────────────┘
              (debounced write)
```

**Problem**: Source of truth is a git-tracked file → conflicts

---

## Target Architecture

### New Data Flow

```
┌─────────────┐                                    ┌─────────────┐
│ localStorage│ ◄────────────────────────────────► │GitHub Issues│
│  (PRIMARY)  │            sync (optional)         │  (REMOTE)   │
└─────────────┘                                    └─────────────┘
       │
       │  export (optional)
       ▼
┌─────────────┐
│ BACKLOG.md  │  ← Generated snapshot, gitignored or read-only
│ (OPTIONAL)  │
└─────────────┘
```

**Key Change**: LocalStorage becomes the **source of truth**, not a cache.

### Storage Strategy

```
Browser localStorage (per repo):
  ringmaster:tasks:{repo-hash}     → Task[] JSON
  ringmaster:sync:{repo-hash}      → SyncState JSON
  ringmaster:settings:{repo-hash}  → RepoSettings JSON
  ringmaster:active-repo           → string (current repo hash)
```

**Repo Hash Generation**: Use a stable hash of the repository's remote URL (or local path for repos without remotes):
```typescript
function getRepoHash(repoPath: string, remoteUrl?: string): string {
  const identifier = remoteUrl || repoPath;
  // Use a simple hash function (e.g., djb2 or FNV-1a)
  return hashString(identifier);
}
```

**Data Isolation**: Each repository's tasks are completely isolated. Switching repositories in the UI loads a different localStorage namespace. This prevents cross-contamination and allows working with multiple projects.

For larger datasets (future):
```
IndexedDB (upgrade path):
  ringmaster-db
    ├── tasks (objectStore, indexed by repo-hash)
    ├── sync-state (objectStore)
    └── settings (objectStore)
```

**Storage Quota Considerations**:
- localStorage has ~5MB limit per origin
- Average task JSON: ~500 bytes → ~10,000 tasks per repo
- If approaching quota: warn user, suggest cleanup of old completed tasks
- IndexedDB upgrade path for power users with large backlogs

---

## GitHub Issues Field Mapping

### Field Compatibility Matrix

| BacklogItem Field | GitHub Issues | Mapping Strategy |
|-------------------|---------------|------------------|
| `title` | `title` | Direct ↔ |
| `description` | `body` (markdown) | Direct ↔ |
| `priority` | `labels` | `priority:high`, `priority:medium`, etc. |
| `status` | `state` + `labels` | See status mapping below |
| `effort` | `labels` | `effort:low`, `effort:medium`, etc. |
| `value` | `labels` | `value:low`, `value:medium`, etc. |
| `tags` | `labels` | Pass-through |
| `category` | `labels` | `category:Infrastructure`, etc. |
| `acceptanceCriteria` | `body` | Markdown checkbox list in body |
| `notes` | `body` | Markdown section in body |
| `branch` | linked branch | Via GitHub branch linking |
| `worktreePath` | — | Local only (not synced) |
| `qualityScore` | — | Computed locally |
| `order` | — | Local only (use GitHub Projects for ordering) |

### Status ↔ GitHub State Mapping

```
BacklogItem.status    →  GitHub Issue
─────────────────────────────────────────────────────
backlog               →  state:open  + label:status:backlog
up_next               →  state:open  + label:status:up-next
in_progress           →  state:open  + label:status:in-progress
review                →  state:open  + label:status:review
ready_to_ship         →  state:closed
```

### Issue Body Template (for rich fields)

```markdown
{description}

## Acceptance Criteria
- [ ] First criterion
- [ ] Second criterion

## Notes
{notes content here}

---
<!-- ringmaster:metadata
effort: medium
value: high
-->
```

The HTML comment preserves metadata that doesn't map to labels, ensuring round-trip fidelity.

---

## Extended Task Model

Add GitHub sync fields to existing `BacklogItem`:

```typescript
// Extension to BacklogItem for GitHub sync
interface BacklogItem {
  // ... existing fields ...

  // === GitHub Sync (NEW - Phase 2) ===
  githubIssueNumber?: number;      // Linked issue number
  githubIssueUrl?: string;         // Full URL for quick access
  githubSyncStatus?: 'local' | 'synced' | 'modified' | 'conflict' | 'deleted-remote';
  githubSyncedAt?: string;         // ISO timestamp of last sync
  githubEtag?: string;             // For conflict detection
}
```

### Default Values for New Fields

When migrating existing tasks or creating new tasks:

```typescript
const DEFAULT_GITHUB_SYNC_STATUS = 'local';  // Not yet synced

// Migration: existing tasks get default sync status
function migrateTask(task: BacklogItem): BacklogItem {
  return {
    ...task,
    githubSyncStatus: task.githubSyncStatus ?? 'local',
  };
}
```

### Type Guards

```typescript
function isGitHubLinked(task: BacklogItem): boolean {
  return task.githubIssueNumber !== undefined;
}

function needsSync(task: BacklogItem): boolean {
  return task.githubSyncStatus === 'modified' ||
         task.githubSyncStatus === 'local';
}

function hasConflict(task: BacklogItem): boolean {
  return task.githubSyncStatus === 'conflict' ||
         task.githubSyncStatus === 'deleted-remote';
}
```

---

## Implementation Plan

### Phase 0: Preparation (No UI Changes) ✅ COMPLETE
**Goal**: Refactor storage layer without breaking existing functionality

#### Checklist
- [x] Create `TaskStorageProvider` interface abstracting storage operations
- [x] Implement `LocalStorageTaskStore` (promotes current cache to primary)
- [x] Implement `FileBacklogTaskStore` (current behavior, for backwards compat)
- [x] Add storage provider configuration to app settings
- [x] Update `useBacklog` hook to use storage provider abstraction
- [x] Add migration utility: BACKLOG.md → localStorage
- [ ] Write unit tests for storage providers (deferred to Phase 4)

**Implementation Notes** (2025-01-10):
- Created `src/lib/storage/` module with types, providers, factory, and migration utilities
- Storage factory supports `local`, `file`, and `github` modes (github falls back to local)
- `useBacklog` hook now uses storage provider abstraction with mode-aware persistence

#### Files to Create/Modify
```
src/lib/storage/
  ├── types.ts              # TaskStorageProvider interface
  ├── local-storage.ts      # LocalStorageTaskStore implementation
  ├── file-backlog.ts       # FileBacklogTaskStore (current behavior)
  └── index.ts              # Factory and exports

src/hooks/useBacklog.ts     # Update to use storage provider
src/lib/migration.ts        # BACKLOG.md → localStorage migration
```

#### TaskStorageProvider Interface (Detailed)

```typescript
// src/lib/storage/types.ts

import type { BacklogItem } from '@/types/backlog';

export type StorageMode = 'file' | 'local' | 'github';

export interface TaskStorageProvider {
  readonly mode: StorageMode;

  // Lifecycle
  initialize(repoIdentifier: string): Promise<void>;

  // CRUD Operations
  getAll(): Promise<BacklogItem[]>;
  getById(id: string): Promise<BacklogItem | null>;
  create(item: Omit<BacklogItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<BacklogItem>;
  update(id: string, updates: Partial<BacklogItem>): Promise<BacklogItem>;
  delete(id: string): Promise<void>;

  // Bulk Operations
  replaceAll(items: BacklogItem[]): Promise<void>;

  // Export (all providers should support this)
  exportToMarkdown(): Promise<string>;
}

export interface StorageProviderFactory {
  create(mode: StorageMode, options?: StorageOptions): TaskStorageProvider;
}

export interface StorageOptions {
  repoPath?: string;
  remoteUrl?: string;
  backlogFilePath?: string;  // For file mode
  githubToken?: string;      // For github mode
  githubRepo?: string;       // For github mode: "owner/repo"
}
```

#### LocalStorageTaskStore Implementation Pattern

```typescript
// src/lib/storage/local-storage.ts

export class LocalStorageTaskStore implements TaskStorageProvider {
  readonly mode: StorageMode = 'local';
  private repoHash: string = '';
  private storageKey: string = '';

  async initialize(repoIdentifier: string): Promise<void> {
    this.repoHash = hashString(repoIdentifier);
    this.storageKey = `ringmaster:tasks:${this.repoHash}`;
  }

  async getAll(): Promise<BacklogItem[]> {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(this.storageKey);
    return data ? JSON.parse(data) : [];
  }

  async create(item: Omit<BacklogItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<BacklogItem> {
    const now = new Date().toISOString();
    const newItem: BacklogItem = {
      ...item,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };
    const items = await this.getAll();
    items.push(newItem);
    await this.replaceAll(items);
    return newItem;
  }

  // ... other methods follow same pattern

  async exportToMarkdown(): Promise<string> {
    const items = await this.getAll();
    return serializeBacklogMd(items);
  }
}
```

#### Hook Refactoring Strategy

The current `useBacklog` hook should be refactored to:

1. **Accept a storage provider** via context or props
2. **Remove file-specific logic** from the hook itself
3. **Keep debouncing for file mode only** (local storage is fast enough for immediate writes)

```typescript
// New hook signature
interface UseBacklogOptions {
  provider?: TaskStorageProvider;  // Optional, defaults based on settings
  path?: string;                    // For backwards compat with file mode
}

// Provider selection happens in a context wrapper
export function BacklogProvider({ children }: { children: React.ReactNode }) {
  const settings = useSettings();
  const provider = useMemo(() => {
    return createStorageProvider(settings.storageMode, {
      repoPath: settings.repoPath,
      backlogFilePath: settings.backlogPath,
    });
  }, [settings.storageMode, settings.repoPath, settings.backlogPath]);

  return (
    <BacklogContext.Provider value={{ provider }}>
      {children}
    </BacklogContext.Provider>
  );
}
```

---

### Phase 1: Local-First Storage (UI Updates) ✅ COMPLETE
**Goal**: Users can choose local-only storage, eliminating git conflicts

#### Checklist
- [x] Add "Storage Mode" setting in UI (File / Local / GitHub)
- [x] Update task creation to respect storage mode
- [ ] Add sync status indicator to TaskCard component (deferred to Phase 2)
- [ ] Add visual distinction for local-only tasks (deferred to Phase 2)
- [x] Implement "Export to Markdown" feature (optional BACKLOG.md generation)
- [ ] Add `.gitignore` recommendation when using local storage (deferred)
- [ ] Update onboarding/first-run experience (deferred to Phase 4)

**Implementation Notes** (2025-01-10):
- Created `StorageModeSelector` component with compact dropdown for header
- Storage mode selector shows in header, dynamically shows/hides file picker based on mode
- Export to Markdown downloads a timestamped BACKLOG.md file
- Mode changes trigger page reload to reinitialize storage provider

#### UI Mockup: Storage Mode Selector
```
┌─────────────────────────────────────────────────────┐
│ Settings                                            │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Task Storage Mode                                   │
│                                                     │
│ ○ File (BACKLOG.md)     ← Current behavior          │
│   Tasks stored in git-tracked markdown file         │
│   ⚠️ May cause merge conflicts                      │
│                                                     │
│ ● Local                 ← Recommended               │
│   Tasks stored in browser, no git conflicts         │
│   Can export to markdown anytime                    │
│                                                     │
│ ○ GitHub Issues         ← Coming in Phase 2         │
│   Tasks synced with GitHub Issues                   │
│   Best for team collaboration                       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

### Phase 2: GitHub Issues Sync 🚧 IN PROGRESS
**Goal**: Bidirectional sync with GitHub Issues

#### Checklist
- [x] Create `GitHubSyncService` class
- [x] Implement `pushTask()` - create/update GitHub Issue from task
- [x] Implement `pullIssue()` - import GitHub Issue to local task
- [x] Implement `syncAll()` - full bidirectional sync
- [x] Add label management (create required labels if missing)
- [x] Implement conflict detection using ETags
- [x] Create GitHub Settings modal for configuration
- [x] Create conflict resolution UI
- [x] Add sync status indicators (synced/modified/conflict)
- [x] Add sync button to header with loading state
- [ ] Add "Push to GitHub" / "Pull from GitHub" task actions (deferred to Phase 3)
- [ ] Create Sync Panel modal for bulk operations (deferred)
- [ ] Handle rate limiting gracefully (deferred)
- [ ] Add offline queue for sync operations (deferred to Phase 3)

**Implementation Notes** (2025-01-10):
- Created `GitHubSyncService` in `src/lib/storage/github-sync.ts`
- Service handles task→issue conversion with embedded task ID in body
- Created `GitHubSettingsModal` for token/repo configuration
- GitHub mode now available in StorageModeSelector (triggers config modal if not set up)
- Added sync button to Header (shows when GitHub mode active)
- Added GitHub sync indicator to TaskCard (shows issue number + sync status)
- Created `SyncConflictModal` for side-by-side conflict resolution

#### GitHubSyncService API
```typescript
interface GitHubSyncService {
  // Configuration
  configure(repo: string, token?: string): Promise<void>;
  isConfigured(): boolean;

  // Single task operations
  pushTask(taskId: string): Promise<{ issueNumber: number; url: string }>;
  pullTask(taskId: string): Promise<BacklogItem>;
  unlinkTask(taskId: string): Promise<void>;

  // Bulk operations
  syncAll(): Promise<SyncResult>;
  pullAllIssues(filter?: IssueFilter): Promise<BacklogItem[]>;

  // Status
  getSyncStatus(): SyncStatus;
  getPendingChanges(): PendingChange[];
  getConflicts(): Conflict[];
  resolveConflict(taskId: string, resolution: 'local' | 'remote' | 'manual'): Promise<void>;

  // Offline queue
  queueOperation(operation: SyncOperation): void;
  getQueuedOperations(): SyncOperation[];
  processQueue(): Promise<QueueResult>;
}

interface SyncResult {
  pushed: { taskId: string; issueNumber: number }[];
  pulled: { issueNumber: number; taskId: string }[];
  conflicts: Conflict[];
  errors: SyncError[];
}

interface Conflict {
  taskId: string;
  issueNumber: number;
  localVersion: BacklogItem;
  remoteVersion: GitHubIssue;
  conflictType: 'both-modified' | 'deleted-remote' | 'deleted-local';
}

interface SyncOperation {
  id: string;
  type: 'push' | 'pull' | 'delete';
  taskId: string;
  issueNumber?: number;
  queuedAt: string;
  retryCount: number;
}
```

#### Offline Queue Implementation

When the user is offline or GitHub API is unavailable:

1. **Queue operations locally**: Store pending sync operations in localStorage
2. **Automatic retry**: When online status changes or on app load, process queue
3. **Conflict detection**: If remote changed while offline, detect on sync and prompt user

```typescript
// Offline queue storage
interface OfflineQueue {
  operations: SyncOperation[];
  lastProcessed: string | null;
}

// Stored at: ringmaster:sync-queue:{repo-hash}
```

#### Conflict Resolution Strategy

```
                    ┌─────────────────────────────────────────┐
                    │         CONFLICT DETECTED               │
                    └─────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │    Compare local vs remote        │
                    │    using updatedAt timestamps     │
                    └─────────────────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
     ┌────────▼────────┐    ┌────────▼────────┐    ┌────────▼────────┐
     │  LOCAL NEWER    │    │  REMOTE NEWER   │    │   BOTH SAME     │
     │                 │    │                 │    │   TIMESTAMP     │
     └────────┬────────┘    └────────┬────────┘    └────────┬────────┘
              │                       │                       │
              │                       │              ┌────────▼────────┐
              │                       │              │  FIELD-LEVEL    │
              │                       │              │  COMPARISON     │
              │                       │              └────────┬────────┘
              │                       │                       │
    ┌─────────▼─────────┐   ┌─────────▼─────────┐   ┌─────────▼─────────┐
    │ Suggest: Keep     │   │ Suggest: Keep     │   │ Suggest: Manual   │
    │ Local             │   │ Remote            │   │ Merge             │
    └───────────────────┘   └───────────────────┘   └───────────────────┘
```

**Auto-merge rules** (when no conflict):
- If only one side modified a field → take that value
- If both modified same field → conflict, show diff

**ETag-based conflict detection**:
```typescript
// Store ETag from GitHub API response
interface GitHubSyncMetadata {
  issueNumber: number;
  etag: string;              // GitHub's ETag header
  lastSyncedAt: string;      // When we last synced
  localUpdatedAt: string;    // When task was last modified locally
}

// On push: compare local updatedAt with lastSyncedAt
// If local is newer → push changes
// On response: update etag and lastSyncedAt

// On pull: send If-None-Match header with stored etag
// If 304 Not Modified → skip update
// If 200 OK → update local, store new etag
```

#### UI Mockup: Sync Panel
```
┌─────────────────────────────────────────────────────────────────┐
│ GitHub Sync                                                 [×] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Repository: bozoparlay/ringmaster                               │
│ Last synced: 5 minutes ago                    [Sync Now]        │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 📤 Push to GitHub (2)                                       │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ ☐ "Add dark mode" - will create new issue                   │ │
│ │ ☐ "Fix drag and drop" - will update #12                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 📥 Pull from GitHub (1)                                     │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ ☐ #15 "New feature request" - will import                   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ⚠️ Conflicts (1)                                             │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ #8 "Setup docker" - modified both locally and on GitHub     │ │
│ │                                          [Resolve...]       │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│              [Pull Selected]  [Push Selected]  [Sync All]       │
└─────────────────────────────────────────────────────────────────┘
```

---

### Phase 3: Workflow Integration ✅ COMPLETE
**Goal**: Deep integration with Ringmaster's worktree workflow

#### Checklist
- [x] Auto-link task to worktree when "Tackle" is clicked
- [x] Auto-update issue status when worktree status changes (Tackle → in_progress label)
- [x] Show GitHub Issue link in TaskPanel header
- [x] Add "View on GitHub" action (click link opens issue)
- [x] Auto-close issue when task is shipped (PR merged)
- [ ] Detect and display associated PRs for a task (deferred - requires GitHub API integration)
- [ ] Add issue comments from Ringmaster (deferred - optional feature)

**Implementation Notes** (2025-01-10):
- TaskPanel now shows GitHub Issue link (#123) in header when task is linked
- KanbanBoard's `handleStartWork` updates GitHub Issue labels when tackling
- KanbanBoard's `handleShip` closes GitHub Issue when task is shipped
- All GitHub operations are best-effort (failures don't block workflow)

#### Workflow Mapping
```
Ringmaster Action          →  GitHub Effect
───────────────────────────────────────────────────
Tackle Task                →  Add "in-progress" label
Create Worktree            →  Link branch to issue
Create PR                  →  PR references issue ("Fixes #X")
Ship Task (PR merged)      →  Close issue automatically
Review Failed              →  Add comment with feedback
```

---

### Phase 4: Migration & Polish ✅ COMPLETE
**Goal**: Smooth transition from BACKLOG.md

#### Checklist
- [x] One-click "Import from BACKLOG.md" in settings (MigrationWizard modal)
- [x] One-click "Export all to GitHub Issues" (via MigrationWizard)
- [x] Data export (Markdown via StorageModeSelector)
- [ ] Bulk operations UI (multi-select, bulk status change) - deferred
- [ ] Keyboard shortcuts for common actions - deferred
- [x] Drag-and-drop reordering (existing functionality)
- [x] Search/filter improvements (existing search + priority filter)
- [ ] Documentation and migration guide - deferred

**Implementation Notes** (2025-01-10):
- Created `MigrationWizard` component for guided migration from BACKLOG.md
- Wizard supports migrating to: Local Storage, GitHub Issues, or both
- Export to Markdown available from StorageModeSelector dropdown
- Existing drag-and-drop and search/filter features already implemented

#### Migration Wizard
```
┌─────────────────────────────────────────────────────────────────┐
│ Migrate from BACKLOG.md                                     [×] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Found 12 tasks in BACKLOG.md                                    │
│                                                                 │
│ Where would you like to store your tasks?                       │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ○ Local Storage (Recommended)                               │ │
│ │   Fast, no conflicts, works offline                         │ │
│ │   Tasks stay on this device only                            │ │
│ │                                                             │ │
│ │ ○ GitHub Issues                                             │ │
│ │   Great for teams, visible on GitHub                        │ │
│ │   Requires GitHub authentication                            │ │
│ │                                                             │ │
│ │ ○ Both (Local + GitHub Sync)                                │ │
│ │   Best of both worlds                                       │ │
│ │   Fast local edits, synced to GitHub                        │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ After migration:                                                │
│ ☑ Add BACKLOG.md to .gitignore                                  │
│ ☐ Delete BACKLOG.md (keep backup)                               │
│ ☐ Create GitHub Issues for all tasks                            │
│                                                                 │
│                                    [Cancel]  [Start Migration]  │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Routes

### Current Endpoints (to be migrated)

The existing API uses `/api/backlog`:
```
GET    /api/backlog                    # List all tasks (parses BACKLOG.md)
POST   /api/backlog                    # Write all tasks (serializes to BACKLOG.md)
PATCH  /api/backlog                    # Update single task
DELETE /api/backlog?id={id}            # Delete task
```

### New/Modified Endpoints

**Phase 0**: Keep existing `/api/backlog` routes but make them storage-agnostic internally.

**Phase 1+**: Introduce new routes alongside existing ones for gradual migration:

```
# Task CRUD (storage-agnostic)
GET    /api/tasks                      # List all tasks
POST   /api/tasks                      # Create task
GET    /api/tasks/[id]                 # Get single task
PATCH  /api/tasks/[id]                 # Update task
DELETE /api/tasks/[id]                 # Delete task

# GitHub Sync (Phase 2)
POST   /api/github/sync                # Full sync
POST   /api/github/push/[taskId]       # Push single task
POST   /api/github/pull/[issueNumber]  # Pull single issue
GET    /api/github/status              # Sync status
POST   /api/github/resolve/[taskId]    # Resolve conflict

# Migration
POST   /api/migrate/from-backlog       # Import BACKLOG.md
POST   /api/migrate/to-github          # Bulk export to GitHub Issues
GET    /api/export/markdown            # Generate BACKLOG.md snapshot

# Settings
GET    /api/settings                   # Get repo settings
PATCH  /api/settings                   # Update settings
```

**Deprecation Path**: `/api/backlog` continues to work throughout all phases. Mark as deprecated in Phase 3. Remove in a future major version.

---

## Technical Decisions

### Q1: localStorage vs IndexedDB?
**Decision**: Start with localStorage, abstract for future IndexedDB migration.

**Rationale**:
- localStorage is simpler, synchronous, sufficient for ~100-500 tasks
- 5MB limit is ~10,000+ tasks in JSON
- Abstract behind `TaskStorageProvider` interface for easy upgrade

### Q2: GitHub API vs `gh` CLI?
**Decision**: Use GitHub REST API via fetch (with `gh auth token` for auth).

**Rationale**:
- Direct API is more reliable than shelling out to CLI
- Can use `gh auth token` to get token if user has `gh` installed
- Fallback to OAuth flow if no `gh` CLI

### Q3: Real-time sync vs manual sync?
**Decision**: Manual sync with optional auto-sync setting.

**Rationale**:
- Avoids unexpected changes appearing
- Reduces API calls / rate limiting issues
- Users control when sync happens
- Can add real-time later via webhooks/polling

### Q4: Conflict resolution strategy?
**Decision**: Three-way merge with manual override.

**Rationale**:
- Show both versions side-by-side
- Auto-merge non-conflicting fields
- Let user choose for conflicting fields
- "Keep Local" / "Keep Remote" / "Merge" options

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Task creation latency | < 100ms (local), < 2s (with GitHub push) |
| Full sync time | < 5s for 50 tasks |
| Git merge conflicts from tasks | **Zero** |
| Migration time | < 30s for typical backlog |
| Data loss incidents | **Zero** |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| localStorage cleared by user | Warn on settings clear; offer backup export; auto-backup to file on close |
| GitHub API rate limiting | Implement exponential backoff; batch operations; cache responses |
| Sync conflicts lose data | Always preserve both versions; manual resolution; conflict history log |
| Users confused by storage modes | Clear onboarding; sensible defaults; contextual help tooltips |
| Breaking existing workflows | Maintain backwards compat with File mode; gradual deprecation |
| Browser crashes during write | Use atomic writes (write to temp, then rename); transaction log |
| Multiple tabs editing same data | Use localStorage events for cross-tab sync; optimistic locking |
| Token expiration mid-sync | Graceful degradation; queue operations; prompt for re-auth |

### Multi-Tab Synchronization

When multiple browser tabs have Ringmaster open:

```typescript
// Listen for storage changes from other tabs
window.addEventListener('storage', (event) => {
  if (event.key?.startsWith('ringmaster:tasks:')) {
    // Another tab modified tasks - reload from storage
    refreshFromStorage();
  }
});

// Use BroadcastChannel for real-time coordination
const channel = new BroadcastChannel('ringmaster-sync');
channel.onmessage = (event) => {
  if (event.data.type === 'TASKS_UPDATED') {
    // Merge or reload based on conflict strategy
  }
};
```

---

## Testing Strategy

### Unit Tests

```
src/lib/storage/__tests__/
  ├── local-storage.test.ts     # LocalStorageTaskStore
  ├── file-backlog.test.ts      # FileBacklogTaskStore
  ├── migration.test.ts         # Migration utilities
  └── github-sync.test.ts       # GitHubSyncService (mocked API)
```

**Key test scenarios:**
- CRUD operations for each storage provider
- Migration from BACKLOG.md preserves all fields
- Conflict detection and resolution
- Offline queue processing
- Storage quota handling

### Integration Tests

```
src/__tests__/integration/
  ├── storage-switching.test.ts    # Switch between storage modes
  ├── github-sync.test.ts          # Real GitHub API (test repo)
  └── multi-tab.test.ts            # Cross-tab synchronization
```

### E2E Tests

```
e2e/
  ├── backlog-workflow.spec.ts     # Full task lifecycle
  ├── migration-wizard.spec.ts     # Migration from BACKLOG.md
  └── github-sync-flow.spec.ts     # GitHub sync UI flow
```

---

## Success Criteria (Per Phase)

### Phase 0: Preparation ✓ Definition of Done
- [ ] All existing tests pass with new storage abstraction
- [ ] `useBacklog` hook works identically with both `FileBacklogTaskStore` and `LocalStorageTaskStore`
- [ ] Switching storage providers does not lose data
- [ ] No user-visible changes (backwards compatible)
- [ ] Migration utility successfully imports all tasks from a sample BACKLOG.md

### Phase 1: Local-First Storage ✓ Definition of Done
- [ ] User can select "Local Storage" mode in settings
- [ ] Tasks created in Local mode are NOT written to BACKLOG.md
- [ ] Tasks persist across browser sessions (page refresh)
- [ ] Tasks persist across app restarts (close/reopen browser)
- [ ] "Export to Markdown" generates valid BACKLOG.md format
- [ ] Zero git merge conflicts when using Local mode
- [ ] Existing File mode users experience no changes

### Phase 2: GitHub Issues Sync ✓ Definition of Done
- [ ] User can authenticate with GitHub (via `gh` CLI token or OAuth)
- [ ] "Push to GitHub" creates a new issue with correct title, body, labels
- [ ] "Pull from GitHub" imports issue with all mapped fields
- [ ] Sync status indicator shows correct state (local/synced/modified/conflict)
- [ ] Conflicts are detected and surfaced to user
- [ ] User can resolve conflicts by choosing local, remote, or manual merge
- [ ] Rate limiting is handled gracefully (retry with backoff)
- [ ] Sync works for repos the user has write access to
- [ ] Labels are auto-created if missing (with user confirmation)

### Phase 3: Workflow Integration ✓ Definition of Done
- [ ] "Tackle Task" on a synced task updates GitHub issue labels
- [ ] Task shows linked GitHub issue number and clickable URL
- [ ] "View on GitHub" opens issue in browser
- [ ] When PR merges, linked issue is auto-closed (via "Fixes #X" in PR)
- [ ] Task status updates when GitHub issue state changes (on sync)
- [ ] Worktree ↔ Task ↔ Issue relationship is visible in UI

### Phase 4: Migration & Polish ✓ Definition of Done
- [ ] Migration wizard successfully imports all tasks from BACKLOG.md
- [ ] User can choose destination: Local, GitHub, or Both
- [ ] Bulk select and status change works for 10+ tasks
- [ ] Keyboard shortcuts documented and functional (Cmd+N for new, etc.)
- [ ] Search finds tasks by title, description, and labels
- [ ] Export produces valid JSON, CSV, and Markdown formats
- [ ] Documentation covers all features and migration steps

---

## Rollout Plan

1. **Alpha** (Phase 0-1): Internal testing, opt-in local storage mode
2. **Beta** (Phase 2): GitHub sync for early adopters, gather feedback
3. **GA** (Phase 3-4): Full feature set, migration wizard, documentation
4. **Sunset File Mode**: Eventually deprecate BACKLOG.md as primary storage

---

## Data Backup & Recovery

### Automatic Backups

For Local storage mode, implement automatic backups:

```typescript
// Backup strategy
interface BackupConfig {
  autoBackupEnabled: boolean;
  backupInterval: number;        // minutes (default: 30)
  maxBackups: number;            // keep last N backups (default: 5)
  backupOnClose: boolean;        // backup when tab closes
}

// Stored at: ringmaster:backups:{repo-hash}
interface BackupEntry {
  id: string;
  timestamp: string;
  taskCount: number;
  data: string;                   // Compressed JSON
}
```

### Manual Export Formats

Users can export their data at any time:

| Format | Use Case |
|--------|----------|
| JSON | Full data backup, restore, or migration |
| Markdown | Human-readable, can commit to git |
| CSV | Spreadsheet analysis, bulk editing |

### Recovery Scenarios

| Scenario | Recovery Method |
|----------|-----------------|
| Accidental deletion | Restore from backup (Settings → Backups) |
| Browser data cleared | Import from JSON backup or re-sync from GitHub |
| Corrupted localStorage | Auto-detect on load, prompt restore from backup |
| GitHub sync overwrite | Conflict history preserves both versions |

---

## Glossary

| Term | Definition |
|------|------------|
| **Storage Mode** | Where tasks are persisted: File (BACKLOG.md), Local (browser), or GitHub (Issues) |
| **Sync Status** | The relationship between local task and GitHub issue: `local`, `synced`, `modified`, `conflict` |
| **Task Quality Score** | 0-100 rating of task description completeness (50+ required for good tasks) |
| **Virtual Status** | `up_next` status is computed from backlog tasks, not persisted |
| **Repo Hash** | Unique identifier for a repository, used to namespace localStorage |
| **ETag** | GitHub API header for detecting if a resource has changed |
| **Offline Queue** | Pending sync operations stored when GitHub is unavailable |

---

## Implementation Status & Remaining Work

> **Last Updated**: 2026-01-11
> **Current Branch**: `main` (with uncommitted WIP changes)
> **Status**: Phase 2-4 substantially complete, requires validation and commit

### Git Workflow

All work must follow this workflow:

```
1. Create feature branch from main
2. Commit incrementally after each validated step
3. Push to origin for backup
4. Merge to main when all tests pass
5. Push main to origin
```

**Branch naming**: `feature/backlog-storage-validation`

### Starting the Work

```bash
# 1. Ensure dev server is running on port 3000
npm run dev

# 2. Create feature branch for validation work
git checkout -b feature/backlog-storage-validation

# 3. Stage all current WIP changes
git add -A

# 4. Make initial commit with current state
git commit -m "feat(storage): implement local-first storage with GitHub sync

- Add TaskStorageProvider interface and factory pattern
- Implement LocalStorageTaskStore and FileBacklogTaskStore
- Add GitHubSyncService with push/pull/conflict detection
- Create StorageModeSelector, GitHubSettingsModal, SyncConflictModal
- Add MigrationWizard for BACKLOG.md import
- Integrate GitHub Issue sync into workflow (Tackle/Ship)
- Add sync status indicators to TaskCard and TaskPanel

Phases 0-4 substantially complete, pending validation."

# 5. Push branch to origin
git push -u origin feature/backlog-storage-validation
```

---

## Validation Checklist

Each step must be validated using Playwright MCP tools and committed incrementally.

### Step 1: Storage Mode Switching (Phase 1 Validation)

**Objective**: Verify users can switch between File/Local/GitHub modes without data loss.

#### Test Procedure (Playwright)

```typescript
// Navigate to app
await mcp__playwright__browser_navigate({ url: "http://localhost:3000" });
await mcp__playwright__browser_snapshot({});

// 1. Verify StorageModeSelector is visible in header
// Look for dropdown with "Local" or "File" text

// 2. Create a test task in current mode
await mcp__playwright__browser_click({
  element: "New Task button",
  ref: "<ref from snapshot>"
});
await mcp__playwright__browser_type({
  element: "Task title input",
  ref: "<ref from snapshot>",
  text: "Test Task - Storage Validation"
});
// Submit the task

// 3. Take screenshot for evidence
await mcp__playwright__browser_take_screenshot({
  filename: "validation-step1-task-created.png"
});

// 4. Switch storage mode via dropdown
await mcp__playwright__browser_click({
  element: "Storage mode dropdown",
  ref: "<ref from snapshot>"
});
// Select different mode - page will reload

// 5. After reload, verify task persists or behaves correctly per mode
await mcp__playwright__browser_snapshot({});
```

#### Acceptance Criteria
- [ ] StorageModeSelector visible in header
- [ ] Can switch between File ↔ Local modes
- [ ] Tasks persist after page refresh in Local mode
- [ ] Tasks persist after mode switch back to original mode
- [ ] Export to Markdown downloads valid file

#### Commit After Validation
```bash
git add -A
git commit -m "test(storage): validate storage mode switching

- Verified File ↔ Local mode transitions
- Confirmed data persistence across mode changes
- Tested Export to Markdown functionality"
```

---

### Step 2: Local Storage CRUD Operations (Phase 1 Validation)

**Objective**: Verify all CRUD operations work in Local storage mode.

#### Test Procedure (Playwright)

```typescript
// Ensure we're in Local mode
await mcp__playwright__browser_navigate({ url: "http://localhost:3000" });

// 1. CREATE: Add new task
await mcp__playwright__browser_click({ element: "New Task button", ref: "<ref>" });
await mcp__playwright__browser_type({ element: "title", ref: "<ref>", text: "CRUD Test Task" });
await mcp__playwright__browser_type({ element: "description", ref: "<ref>", text: "Testing create operation" });
// Submit

// 2. READ: Verify task appears in Backlog column
await mcp__playwright__browser_snapshot({});
// Confirm "CRUD Test Task" visible

// 3. UPDATE: Click task, modify, save
await mcp__playwright__browser_click({ element: "CRUD Test Task card", ref: "<ref>" });
// Panel opens
await mcp__playwright__browser_type({ element: "title input", ref: "<ref>", text: " - Updated" });
await mcp__playwright__browser_click({ element: "Save Changes", ref: "<ref>" });

// 4. Verify update persisted
await mcp__playwright__browser_snapshot({});

// 5. DELETE: Open task, delete
await mcp__playwright__browser_click({ element: "Delete button", ref: "<ref>" });
// Handle confirmation dialog
await mcp__playwright__browser_handle_dialog({ accept: true });

// 6. Verify deletion
await mcp__playwright__browser_snapshot({});
// Task should no longer appear

// 7. PERSIST: Refresh page, verify state
await mcp__playwright__browser_navigate({ url: "http://localhost:3000" });
await mcp__playwright__browser_snapshot({});
```

#### Acceptance Criteria
- [ ] Create: New task appears in Backlog column
- [ ] Read: Task data displays correctly
- [ ] Update: Changes save and persist
- [ ] Delete: Task removed from board
- [ ] Persist: Data survives page refresh

#### Commit After Validation
```bash
git add -A
git commit -m "test(storage): validate local storage CRUD operations

- Tested create, read, update, delete
- Verified persistence across page refresh
- Confirmed localStorage keys are properly namespaced"
```

---

### Step 3: GitHub Sync Configuration (Phase 2 Validation)

**Objective**: Verify GitHub sync can be configured and basic sync works.

#### Prerequisites
- GitHub Personal Access Token with `repo` scope
- Test repository (can be private)

#### Test Procedure (Playwright)

```typescript
// 1. Switch to GitHub mode
await mcp__playwright__browser_navigate({ url: "http://localhost:3000" });
await mcp__playwright__browser_click({ element: "Storage mode dropdown", ref: "<ref>" });
await mcp__playwright__browser_click({ element: "GitHub option", ref: "<ref>" });

// 2. GitHubSettingsModal should appear
await mcp__playwright__browser_snapshot({});
// Verify modal with token and repo inputs

// 3. Enter configuration
await mcp__playwright__browser_type({
  element: "GitHub Token input",
  ref: "<ref>",
  text: "<YOUR_TEST_TOKEN>"
});
await mcp__playwright__browser_type({
  element: "Repository input",
  ref: "<ref>",
  text: "owner/test-repo"
});
await mcp__playwright__browser_click({ element: "Save button", ref: "<ref>" });

// 4. Verify sync button appears in header
await mcp__playwright__browser_snapshot({});

// 5. Create a task and trigger sync
await mcp__playwright__browser_click({ element: "New Task", ref: "<ref>" });
await mcp__playwright__browser_type({ element: "title", ref: "<ref>", text: "GitHub Sync Test" });
// Submit

// 6. Click Sync button
await mcp__playwright__browser_click({ element: "Sync button", ref: "<ref>" });
await mcp__playwright__browser_wait_for({ time: 3 }); // Wait for sync

// 7. Verify sync completed
await mcp__playwright__browser_snapshot({});
// Task should show GitHub issue number badge
```

#### Acceptance Criteria
- [ ] GitHubSettingsModal opens when switching to GitHub mode
- [ ] Configuration saves to localStorage
- [ ] Sync button appears after configuration
- [ ] Push creates GitHub Issue with correct title/labels
- [ ] Task shows linked issue number after sync

#### Manual Verification
```bash
# Verify issue was created on GitHub
gh issue list --repo owner/test-repo --state open | head -5
```

#### Commit After Validation
```bash
git add -A
git commit -m "test(github): validate GitHub sync configuration and push

- Verified GitHubSettingsModal flow
- Tested initial sync (push) operation
- Confirmed issue creation on GitHub"
```

---

### Step 4: GitHub Pull & Conflict Resolution (Phase 2 Validation)

**Objective**: Verify pulling changes from GitHub and conflict resolution.

#### Test Procedure (Playwright)

```bash
# 1. Manually modify the GitHub issue (change title or add label)
gh issue edit <ISSUE_NUMBER> --repo owner/test-repo --title "GitHub Sync Test - Modified on GitHub"
```

```typescript
// 2. Trigger sync in app
await mcp__playwright__browser_navigate({ url: "http://localhost:3000" });
await mcp__playwright__browser_click({ element: "Sync button", ref: "<ref>" });
await mcp__playwright__browser_wait_for({ time: 3 });

// 3. Verify pulled changes appear
await mcp__playwright__browser_snapshot({});
// Task title should show "Modified on GitHub"

// 4. Test conflict: Modify task locally
await mcp__playwright__browser_click({ element: "task card", ref: "<ref>" });
await mcp__playwright__browser_type({ element: "title", ref: "<ref>", text: " - Local Edit" });
await mcp__playwright__browser_click({ element: "Save", ref: "<ref>" });
```

```bash
# 5. Modify same issue on GitHub
gh issue edit <ISSUE_NUMBER> --repo owner/test-repo --title "GitHub Sync Test - Conflicting Edit"
```

```typescript
// 6. Sync and observe conflict modal
await mcp__playwright__browser_click({ element: "Sync button", ref: "<ref>" });
await mcp__playwright__browser_wait_for({ time: 3 });
await mcp__playwright__browser_snapshot({});

// 7. SyncConflictModal should appear with both versions
// Test resolution options
await mcp__playwright__browser_click({ element: "Keep Local button", ref: "<ref>" });
await mcp__playwright__browser_snapshot({});
```

#### Acceptance Criteria
- [ ] Pull fetches changes from GitHub
- [ ] Task updates when remote has newer data
- [ ] Conflict detected when both sides modified
- [ ] SyncConflictModal shows both versions
- [ ] Can resolve conflict with Keep Local / Keep Remote

#### Commit After Validation
```bash
git add -A
git commit -m "test(github): validate pull and conflict resolution

- Verified pull fetches GitHub changes
- Tested conflict detection
- Confirmed SyncConflictModal resolution flow"
```

---

### Step 5: Workflow Integration (Phase 3 Validation)

**Objective**: Verify GitHub Issue updates during task workflow.

#### Test Procedure (Playwright)

```typescript
// 1. Create task with GitHub sync
await mcp__playwright__browser_navigate({ url: "http://localhost:3000" });
// Create and sync a task (or use existing synced task)

// 2. Click on synced task to open panel
await mcp__playwright__browser_click({ element: "synced task card", ref: "<ref>" });
await mcp__playwright__browser_snapshot({});

// 3. Verify GitHub link in TaskPanel header
// Should show "#123" clickable link

// 4. Click "Start Working" (Tackle)
await mcp__playwright__browser_click({ element: "Start Working button", ref: "<ref>" });
// TackleModal opens
await mcp__playwright__browser_snapshot({});

// (Skip actual worktree creation for validation - focus on GitHub update)
```

```bash
# 5. Verify GitHub issue updated with in-progress label
gh issue view <ISSUE_NUMBER> --repo owner/test-repo --json labels
```

```typescript
// 6. Test Ship flow (if task has worktree)
// Move task to ready_to_ship status
// Click "Commit & Push"
```

```bash
# 7. Verify GitHub issue was closed
gh issue view <ISSUE_NUMBER> --repo owner/test-repo --json state
```

#### Acceptance Criteria
- [ ] GitHub link visible in TaskPanel when task is synced
- [ ] Clicking link opens GitHub issue in new tab
- [ ] "Start Working" updates GitHub issue labels
- [ ] "Ship" closes GitHub issue

#### Commit After Validation
```bash
git add -A
git commit -m "test(workflow): validate GitHub workflow integration

- Verified GitHub link in TaskPanel
- Tested Tackle → in-progress label update
- Confirmed Ship → issue closed"
```

---

### Step 6: Migration Wizard (Phase 4 Validation)

**Objective**: Verify BACKLOG.md import works correctly.

#### Setup
```bash
# Create a test BACKLOG.md if needed
cat > /tmp/test-backlog.md << 'EOF'
# Backlog

## Critical

### [Migration Test Task]
Test task for migration validation.

**Priority**: critical
**Status**: backlog

EOF
```

#### Test Procedure (Playwright)

```typescript
// 1. Ensure File mode with a BACKLOG.md path
await mcp__playwright__browser_navigate({ url: "http://localhost:3000" });

// 2. Open MigrationWizard (from settings or storage selector)
// Look for "Import from BACKLOG.md" or migration option
await mcp__playwright__browser_snapshot({});

// 3. Select migration destination (Local Storage)
await mcp__playwright__browser_click({ element: "Local Storage option", ref: "<ref>" });

// 4. Start migration
await mcp__playwright__browser_click({ element: "Start Migration button", ref: "<ref>" });
await mcp__playwright__browser_wait_for({ time: 2 });

// 5. Verify tasks imported
await mcp__playwright__browser_snapshot({});
// Tasks from BACKLOG.md should appear in board
```

#### Acceptance Criteria
- [ ] MigrationWizard accessible from UI
- [ ] Can select destination (Local / GitHub / Both)
- [ ] Migration imports all tasks from BACKLOG.md
- [ ] Task metadata preserved (priority, status, description)

#### Commit After Validation
```bash
git add -A
git commit -m "test(migration): validate BACKLOG.md import wizard

- Verified MigrationWizard UI flow
- Tested import to Local storage
- Confirmed task metadata preservation"
```

---

### Step 7: Final Integration Test

**Objective**: End-to-end validation of complete workflow.

#### Test Procedure (Playwright)

```typescript
// Complete flow test
// 1. Start fresh (clear localStorage)
await mcp__playwright__browser_evaluate({
  function: "() => localStorage.clear()"
});
await mcp__playwright__browser_navigate({ url: "http://localhost:3000" });

// 2. Switch to Local mode
// 3. Create 3 tasks with different priorities
// 4. Verify drag-and-drop between columns
// 5. Switch to GitHub mode, configure
// 6. Sync all tasks
// 7. Verify all tasks have GitHub issue numbers
// 8. Export to Markdown
// 9. Verify downloaded file contains all tasks

await mcp__playwright__browser_take_screenshot({
  filename: "validation-final-state.png",
  fullPage: true
});
```

#### Acceptance Criteria
- [ ] Fresh start works correctly
- [ ] All storage modes functional
- [ ] Drag-and-drop works
- [ ] Full sync cycle completes
- [ ] Export produces valid Markdown

#### Commit After Validation
```bash
git add -A
git commit -m "test(integration): complete end-to-end validation

- Verified fresh start experience
- Tested all storage modes
- Confirmed export/import round-trip"
```

---

## Completing the Work

After all validation steps pass:

### Merge to Main

```bash
# 1. Ensure all tests passed and committed
git status  # Should show clean working tree

# 2. Switch to main
git checkout main

# 3. Merge feature branch
git merge feature/backlog-storage-validation --no-ff -m "feat(storage): complete local-first storage with GitHub sync

Implements Phase 0-4 of Backlog Management spec:
- Local-first storage architecture
- GitHub Issues bidirectional sync
- Workflow integration (Tackle/Ship)
- Migration wizard

All validation tests passed."

# 4. Push to origin
git push origin main

# 5. Clean up feature branch
git branch -d feature/backlog-storage-validation
git push origin --delete feature/backlog-storage-validation
```

### Handoff Checklist

Before handoff to another worker, ensure:

- [ ] All commits pushed to origin
- [ ] Main branch is up to date
- [ ] Dev server starts without errors: `npm run dev`
- [ ] Health endpoint returns healthy: `curl http://localhost:3000/api/health`
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] This spec document is up to date

### Remaining Deferred Work (For Future PRs)

The following items were intentionally deferred and can be addressed in future work:

| Item | Priority | Notes |
|------|----------|-------|
| Rate limiting with exponential backoff | Medium | Implement in GitHubSyncService |
| Offline queue for sync operations | Medium | Store pending ops in localStorage |
| Bulk operations UI | Medium | Multi-select in KanbanBoard |
| Per-task Push/Pull buttons | Low | Add to TaskPanel actions |
| Keyboard shortcuts | Low | Document and implement |
| Unit tests for storage providers | Medium | Jest tests for all providers |
| Associated PRs display | Low | GitHub API integration |

---

## References

- [GitHub Issues REST API](https://docs.github.com/en/rest/issues)
- [GitHub Labels API](https://docs.github.com/en/rest/issues/labels)
- [Web Storage API (localStorage)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Playwright MCP Tools](https://github.com/anthropics/mcp-playwright)
- Current implementation: `src/hooks/useBacklog.ts`, `src/lib/backlog-parser.ts`
- Task quality validation: `src/lib/task-quality.ts`
