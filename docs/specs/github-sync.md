# GitHub Bidirectional Sync Specification

> **Status**: ✅ **Complete** (Phases 1-4 Implemented)
> **Author**: Principal Engineer
> **Created**: 2025-01-12
> **Last Updated**: 2025-01-12

## Implementation Summary

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1: Push Sync** | ✅ Complete | Local → GitHub Issues, auto-create labels |
| **Phase 2: Pull Sync** | ✅ Complete | GitHub → Local, parse issue body/labels |
| **Phase 3: Conflicts** | ✅ Complete | Detect both-modified, resolution modal |
| **Phase 4: Auto-sync** | ✅ Complete | Background sync, visibility change, online/offline |
| **Phase 5: Advanced** | ⏳ Deferred | Assignees, milestones, PR linking (future) |

**Key Files**:
- `src/app/api/github/sync/route.ts` - Main sync API endpoint
- `src/hooks/useAutoSync.ts` - Background sync hook
- `src/components/SyncConflictModal.tsx` - Conflict resolution UI
- `src/lib/storage/types.ts` - Label schema and types

---

## Executive Summary

This specification defines **bidirectional synchronization** between Ringmaster's local task storage and GitHub Issues, enabling team collaboration while maintaining local-first performance.

### Problems Solved

1. **No Collaboration**: Tasks stored locally can't be shared with team members
2. **No Durability**: Browser localStorage can be cleared, losing all tasks
3. **No Integration**: Can't leverage GitHub's ecosystem (labels, PRs, assignees)
4. **Current Sync is Broken**: GitHub mode falls back to localStorage with warning

### End State

Users can:
- Work locally with instant UI response
- Push tasks to GitHub Issues with one click
- Pull team members' issues into their backlog
- Resolve conflicts when both sides change
- Sync automatically in the background

---

## Architecture

### Decision Record: Local-First with Bidirectional Sync

**Status**: Accepted

**Context**: Users need fast task management UI while wanting GitHub Issues integration for collaboration and persistence.

**Options Considered**:

| Option | Latency | Offline | Collaboration | Complexity |
|--------|---------|---------|---------------|------------|
| GitHub as sole storage | 200-500ms/op | ❌ | ✅ | Low |
| One-way push only | <10ms | ✅ | ❌ | Low |
| **Local-first + bidirectional sync** | **<10ms** | **✅** | **✅** | **Medium** |

**Decision**: Local-first with bidirectional sync provides the best user experience.

**Consequences**:
- Need conflict resolution strategy
- Need sync state tracking per task
- More complex than single-source-of-truth
- Eventual consistency (not real-time collaboration)

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER ACTIONS                              │
└─────────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           │                  │                  │
           ▼                  ▼                  ▼
    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
    │ Create Task │    │ Update Task │    │ Click Sync  │
    └─────────────┘    └─────────────┘    └─────────────┘
           │                  │                  │
           └──────────────────┼──────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LOCAL STORAGE (Primary)                       │
│  localStorage['ringmaster:tasks:{repoHash}']                    │
│  - Instant reads/writes                                          │
│  - Works offline                                                 │
│  - Tracks: lastLocalModified, githubIssueNumber, lastSyncedAt   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Sync (manual or auto)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SYNC ENGINE                                   │
│  1. Compare local vs remote timestamps                          │
│  2. Detect conflicts (both modified)                            │
│  3. Push local changes → GitHub API                             │
│  4. Pull remote changes → Local storage                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GITHUB ISSUES (Secondary)                     │
│  - Durable cloud storage                                        │
│  - Team collaboration                                           │
│  - Labels for state/priority                                    │
│  - Integration with PRs                                         │
└─────────────────────────────────────────────────────────────────┘
```

### Storage Schema

```typescript
// Extended BacklogItem with sync metadata
interface BacklogItem {
  // Existing fields
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  // ... other existing fields

  // NEW: GitHub sync metadata
  githubIssueNumber?: number;      // Linked GitHub issue number
  githubIssueUrl?: string;         // Full URL for quick access
  lastSyncedAt?: string;           // ISO timestamp of last successful sync
  lastLocalModifiedAt?: string;    // ISO timestamp of last local change
  lastRemoteModifiedAt?: string;   // ISO timestamp from GitHub's updated_at
  syncStatus?: 'synced' | 'pending' | 'conflict' | 'error';
}

// Sync state stored separately for quick access
interface SyncState {
  // Key: 'ringmaster:sync:{repoHash}'
  lastSyncAt: string;              // Last full sync timestamp
  lastPullAt: string;              // Last pull-only timestamp
  pendingPushCount: number;        // Tasks waiting to be pushed
  conflictCount: number;           // Tasks with conflicts
  errors: SyncError[];             // Recent sync errors
}

interface SyncError {
  taskId: string;
  operation: 'push' | 'pull';
  message: string;
  timestamp: string;
  retryCount: number;
}
```

### Field Mapping

| Ringmaster Field | GitHub Issue Field | Notes |
|------------------|-------------------|-------|
| `title` | `title` | Direct mapping |
| `description` | `body` (markdown) | Includes AC as checklist |
| `status` | `state` + labels | open/closed + status labels |
| `priority` | label | `priority:critical`, etc. |
| `category` | label | `category:Infrastructure`, etc. |
| `effort` | label | `effort:low`, `effort:medium`, etc. |
| `acceptanceCriteria` | `body` | Markdown checklist in body |

### Label Schema

```typescript
const DEFAULT_GITHUB_LABELS = {
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

  // Meta labels
  'ringmaster': { color: '7057FF', description: 'Managed by Ringmaster' },
};
```

---

## API Specifications

### POST /api/github/sync

Main sync endpoint that handles bidirectional synchronization.

**Request**:
```typescript
interface SyncRequest {
  repo: string;                    // "owner/repo"
  direction?: 'push' | 'pull' | 'both';  // Default: 'both'
  force?: boolean;                 // Overwrite conflicts without prompting
  taskIds?: string[];              // Sync specific tasks only (optional)
}
```

**Response**:
```typescript
interface SyncResponse {
  success: boolean;
  summary: {
    pushed: number;                // Tasks pushed to GitHub
    pulled: number;                // Issues pulled from GitHub
    conflicts: number;             // Conflicts detected
    errors: number;                // Errors encountered
  };
  pushed: SyncedTask[];            // Details of pushed tasks
  pulled: SyncedTask[];            // Details of pulled issues
  conflicts: ConflictInfo[];       // Conflicts needing resolution
  errors: SyncError[];             // Error details
}

interface SyncedTask {
  taskId: string;
  issueNumber: number;
  operation: 'created' | 'updated' | 'closed' | 'reopened';
}

interface ConflictInfo {
  taskId: string;
  issueNumber: number;
  localVersion: BacklogItem;
  remoteVersion: BacklogItem;
  lastCommonVersion?: BacklogItem;
  conflictType: 'both-modified' | 'local-deleted' | 'remote-deleted';
}
```

### POST /api/github/resolve-conflict

Resolves a sync conflict with user's choice.

**Request**:
```typescript
interface ResolveConflictRequest {
  taskId: string;
  resolution: 'keep-local' | 'keep-remote' | 'merge';
  mergedItem?: BacklogItem;        // Required if resolution is 'merge'
}
```

### GET /api/github/issues

Fetches issues from GitHub (used for pull sync).

**Query Parameters**:
- `repo`: Repository (owner/repo)
- `state`: open, closed, all (default: open)
- `labels`: Comma-separated label filter
- `since`: ISO timestamp for incremental fetch
- `page`, `per_page`: Pagination

**Response**:
```typescript
interface IssuesResponse {
  issues: GitHubIssue[];
  pagination: {
    page: number;
    perPage: number;
    totalCount: number;
    hasNextPage: boolean;
  };
}
```

---

## Component Specifications

### SyncButton Component

Replaces simple sync button in Header with status-aware component.

```typescript
interface SyncButtonProps {
  onSync: () => Promise<void>;
  syncState: SyncState;
  isConnected: boolean;
}
```

**Visual States**:
```
[Sync]              → Default, clickable
[Syncing...]        → Animated spinner, disabled
[✓ Synced]          → Green, shows last sync time on hover
[⚠ 3 pending]       → Yellow, shows pending count
[⚠ 2 conflicts]     → Orange, opens conflict modal on click
[✗ Error]           → Red, shows error on hover
[Offline]           → Gray, disabled
```

### SyncStatusIndicator Component

Shows sync status for individual task cards.

```typescript
interface SyncStatusIndicatorProps {
  status: 'synced' | 'pending' | 'conflict' | 'error' | 'local-only';
  issueNumber?: number;
  issueUrl?: string;
}
```

**Visual States**:
```
[GitHub icon]       → Synced, links to issue
[↑ pending]         → Waiting to push
[⚠ conflict]        → Needs resolution
[✗ error]           → Sync failed
[local]             → Never synced (no GitHub icon)
```

### ConflictResolutionModal Component

Modal for resolving sync conflicts.

```typescript
interface ConflictResolutionModalProps {
  isOpen: boolean;
  conflicts: ConflictInfo[];
  onResolve: (taskId: string, resolution: 'keep-local' | 'keep-remote' | 'merge', merged?: BacklogItem) => void;
  onResolveAll: (resolution: 'keep-local' | 'keep-remote') => void;
  onClose: () => void;
}
```

**Design**:
```
┌──────────────────────────────────────────────────────────────────┐
│  ⚠ Sync Conflicts (2)                                      [×]  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Task: "Implement dark mode"                                     │
│  ┌─────────────────────────┬─────────────────────────┐          │
│  │ LOCAL VERSION           │ GITHUB VERSION          │          │
│  ├─────────────────────────┼─────────────────────────┤          │
│  │ Title: Implement dark   │ Title: Implement dark   │          │
│  │        mode toggle      │        mode             │          │
│  │ Priority: High          │ Priority: Medium        │  ← diff  │
│  │ Status: In Progress     │ Status: In Progress     │          │
│  │ Modified: 2 hours ago   │ Modified: 1 hour ago    │          │
│  └─────────────────────────┴─────────────────────────┘          │
│                                                                  │
│  [Keep Local]    [Keep GitHub]    [Merge...]                    │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  [Keep All Local]              [Keep All GitHub]      [Cancel]  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Phases

### Phase 1: Push Sync (Local → GitHub) ✅
**Goal**: Users can push their local tasks to GitHub Issues
**Priority**: Critical
**Estimated Complexity**: Medium
**Status**: Complete

**Tasks**:

| ID | Task | Status | Notes |
|----|------|--------|-------|
| P1-1 | Add sync metadata fields to BacklogItem type | ✅ | `githubIssueNumber`, `lastSyncedAt`, `syncStatus`, etc. |
| P1-2 | Create `/api/github/sync` endpoint (push only) | ✅ | `src/app/api/github/sync/route.ts` |
| P1-3 | Implement `pushTask()` in sync endpoint | ✅ | Create issue if new, update if exists |
| P1-4 | Implement `closeIssue()` for done tasks | ✅ | Close issue when task marked `ready_to_ship` |
| P1-5 | Auto-create labels if missing | ✅ | Full label schema with colors |
| P1-6 | Wire Header sync button to push sync | ✅ | Shows when GitHub configured |
| P1-7 | Add sync status indicator to task cards | ✅ | GitHub icon with status |
| P1-8 | Handle rate limiting with queue/retry | ✅ | 100ms delay between requests |
| P1-9 | Format task body as GitHub markdown | ✅ | Description + AC checklist |
| P1-10 | Update local task with issue number after create | ✅ | Updates via `updateItem()` |

**Acceptance Criteria**:
- [x] Clicking "Sync" creates GitHub Issues for unsynced local tasks
- [x] Clicking "Sync" updates GitHub Issues for modified local tasks
- [x] Tasks marked "done" close their linked GitHub Issues
- [x] Sync progress is visible (loading state, success/error feedback)
- [x] Tasks store their linked GitHub issue number after sync
- [x] Labels are created automatically if they don't exist
- [x] Task card shows GitHub issue link after sync
- [x] Rate limiting doesn't cause data loss (queued and retried)

**Implementation Notes**:
- Sync button shows when `isGitHubSyncConfigured()` returns true (not tied to storage mode)
- Label schema defined in `GITHUB_LABEL_SCHEMA` constant
- Task body includes hidden comment with task ID for linking

**Dependencies**: None (uses existing PAT storage)

---

### Phase 2: Pull Sync (GitHub → Local) ✅
**Goal**: Users can pull GitHub Issues into their local backlog
**Priority**: High
**Estimated Complexity**: Medium
**Status**: Complete

**Tasks**:

| ID | Task | Status | Notes |
|----|------|--------|-------|
| P2-1 | Add pull direction to sync endpoint | ✅ | Handles `direction: 'pull' \| 'both'` |
| P2-2 | Implement pull sync in sync endpoint | ✅ | `issueToTask()` function |
| P2-3 | Parse issue body to extract AC | ✅ | Markdown checklist → array |
| P2-4 | Parse labels to extract priority/status/effort | ✅ | Reverse label mapping |
| P2-5 | Match issues to existing tasks by issue number | ✅ | Via `extractTaskId()` or issue number |
| P2-6 | Create local tasks for new issues | ✅ | `operation: 'new'` in pulled array |
| P2-7 | Handle issue closure (mark local done) | ✅ | `operation: 'closed'` → ready_to_ship |
| P2-8 | Wire client to handle pulled tasks | ✅ | `handleSync` uses `direction: 'both'` |
| P2-9 | Filter by `ringmaster` label | ✅ | Only pulls ringmaster-labeled issues |
| P2-10 | Return pulled tasks in sync response | ✅ | `PulledTask[]` in response |

**Acceptance Criteria**:
- [x] "Sync" pulls new issues created directly in GitHub
- [x] Issues created by other team members appear locally
- [x] Changes made in GitHub (title, body, labels) update local tasks
- [x] Closed issues mark local tasks as "done"
- [x] Only issues with `ringmaster` label are imported
- [x] Sync is bidirectional by default (`direction: 'both'`)

**Implementation Notes**:
- Pull sync integrated into same `/api/github/sync` endpoint
- `issueToTask()` parses issue body, extracts AC checklist, maps labels
- Timestamps compared to detect which version is newer
- Client adds new tasks via `addItem()`, updates existing via `updateItem()`

**Dependencies**: Phase 1 (shared infrastructure)

---

### Phase 3: Conflict Detection & Resolution ✅
**Goal**: Handle cases where both local and GitHub were modified
**Priority**: Medium
**Estimated Complexity**: High
**Status**: Complete

**Tasks**:

| ID | Task | Status | Notes |
|----|------|--------|-------|
| P3-1 | Track `lastLocalModifiedAt` on task changes | ✅ | Set on local updates, not sync updates |
| P3-2 | Implement conflict detection algorithm | ✅ | `detectConflict()` in sync endpoint |
| P3-3 | Add conflicts to sync response | ✅ | `SyncConflict[]` with both versions |
| P3-4 | Update SyncConflictModal component | ✅ | Side-by-side diff view |
| P3-5 | Implement "keep local" resolution | ✅ | Clears lastSyncedAt, re-syncs |
| P3-6 | Implement "keep remote" resolution | ✅ | Updates local with remote version |
| P3-7 | Wire conflict modal to page.tsx | ✅ | Shows when conflicts detected |

**Implementation Notes**:
- `useBacklog.updateItem()` now accepts `{ fromSync: true }` option to avoid setting `lastLocalModifiedAt`
- Conflict detection compares three timestamps: `lastSyncedAt`, `lastLocalModifiedAt`, `issue.updated_at`
- If both local and remote changed since last sync → conflict flagged, not pushed/pulled
- Modal shows side-by-side comparison, user chooses "Keep Local" or "Keep GitHub"
- Skipped "merge" resolution for simplicity (can be added later)

**Acceptance Criteria**:
- [x] Sync detects conflicts before overwriting data
- [x] Conflict UI shows both versions side-by-side
- [x] User can choose "Keep Local" or "Keep Remote"
- [x] After resolution, sync continues with remaining items
- [x] Conflict count shown in error banner

**Dependencies**: Phase 1, Phase 2

---

### Phase 4: Automatic Background Sync ✅
**Goal**: Keep local and GitHub in sync without manual intervention
**Priority**: Medium
**Estimated Complexity**: Medium
**Status**: Complete

**Tasks**:

| ID | Task | Status | Notes |
|----|------|--------|-------|
| P4-1 | Create useAutoSync hook | ✅ | `src/hooks/useAutoSync.ts` |
| P4-2 | Implement sync interval | ✅ | Default: 5 minutes (configurable) |
| P4-3 | Add visibility change listener | ✅ | Sync on tab focus (with 1min cooldown) |
| P4-4 | Detect online/offline state | ✅ | `navigator.onLine` + events |
| P4-5 | Sync on reconnect | ✅ | Auto-syncs when coming back online |
| P4-6 | Wire to page.tsx | ✅ | Replaces manual handleSync |

**Implementation Notes**:
- `useAutoSync` hook provides: `status`, `lastSyncAt`, `isOnline`, `sync()`, `pendingCount`, `conflicts`
- Auto-sync runs on interval, tab focus, and coming back online
- Uses `isGitHubSyncConfigured()` to check if sync should run
- Deferred features: offline queue persistence, exponential backoff, settings UI

**Acceptance Criteria**:
- [x] Tasks sync automatically every N minutes (default: 5)
- [x] Returning to Ringmaster tab triggers sync
- [x] Offline state is detected and shows status
- [x] Coming back online triggers sync
- [x] Background sync doesn't interrupt user workflow

**Dependencies**: Phase 1, Phase 2, Phase 3

---

### Phase 5: Advanced GitHub Features (Future Enhancement)
**Goal**: Deep integration with GitHub ecosystem
**Priority**: Low
**Estimated Complexity**: High
**Status**: Deferred (Phase 1-4 complete, core functionality working)

**Tasks**:

| ID | Task | Status | Notes |
|----|------|--------|-------|
| P5-1 | Fetch and display assignees | ⏳ | Show avatar on task card |
| P5-2 | Add assignee picker in task modal | ⏳ | Dropdown with repo collaborators |
| P5-3 | Sync milestones | ⏳ | Map to sprints/releases |
| P5-4 | Add milestone picker in task modal | ⏳ | Dropdown with repo milestones |
| P5-5 | Detect PRs that reference issues | ⏳ | GitHub Search API |
| P5-6 | Show linked PR status on task card | ⏳ | Open/merged/closed badge |
| P5-7 | Fetch and display issue comments | ⏳ | Threaded view in task detail |
| P5-8 | Add reply to comment functionality | ⏳ | Post comment via API |
| P5-9 | (Optional) GitHub Projects integration | ⏳ | Sync with project board columns |
| P5-10 | (Optional) GitHub Enterprise support | ⏳ | Custom API URL |

**Note**: Phase 5 features are enhancements beyond core sync functionality. The bidirectional sync (Phases 1-4) is fully operational without Phase 5.

**Dependencies**: Phase 1, Phase 2

---

## Implementation Priority

```
Phase 1 (Push)     ████████████████████  CRITICAL - enables basic workflow
Phase 2 (Pull)     ████████████████      HIGH     - enables collaboration
Phase 3 (Conflicts)████████████          MEDIUM   - prevents data loss
Phase 4 (Auto)     ████████              MEDIUM   - improves UX
Phase 5 (Advanced) ████                  LOW      - nice to have
```

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Sync latency | <5s for 100 tasks | Time from click to completion |
| Data integrity | Zero data loss | No tasks lost during normal sync |
| Conflict rate | <5% of syncs | Conflicts / total syncs |
| Offline resilience | 100% queue persistence | Queued changes survive browser close |
| User satisfaction | Sync "just works" | No manual conflict resolution needed in 95% of cases |

---

## Non-Goals (Explicitly Out of Scope)

1. **Real-time collaborative editing** (Google Docs style) - Eventual consistency is acceptable
2. **GitHub Actions integration** - Not in scope for task management
3. **Multi-repo support** - Single repo per Ringmaster instance
4. **Issue templates** - Use GitHub's native templates
5. **GitHub Discussions integration** - Focus on Issues only
6. **Webhooks for real-time updates** - Polling/manual sync is sufficient for v1

---

## Open Questions

1. **Label prefix**: Should all Ringmaster labels use a prefix like `rm:` to avoid conflicts?
2. **Import filter**: Default to importing all issues, or only those with `ringmaster` label?
3. **Conflict threshold**: How long after last sync before we consider it a "conflict" vs "stale"?
4. **Offline queue size**: Limit on queued operations before warning user?

---

## References

- [GitHub Issues API](https://docs.github.com/en/rest/issues)
- [GitHub Labels API](https://docs.github.com/en/rest/issues/labels)
- [Existing spec: GitHub Project Integration](./github-project-integration.md)
