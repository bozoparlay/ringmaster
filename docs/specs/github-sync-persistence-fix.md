# GitHub Sync Persistence Fix

## Status: Implemented
**Created**: 2026-01-12
**Implemented**: 2026-01-12
**Author**: Claude

---

## Executive Summary

The GitHub sync feature creates duplicate issues on every sync cycle because task identity and sync metadata are not being persisted properly. This spec documents the root causes and defines the fixes required to achieve reliable bidirectional sync.

---

## Background

### Feature Context
Ringmaster provides GitHub Issues sync to enable:
1. **Push**: Local tasks → GitHub Issues (for visibility, collaboration)
2. **Pull**: GitHub Issues → Local tasks (for external contributions)

### Observed Behavior
- Sync creates **hundreds of duplicate issues** for the same task
- Closed issues get **reopened** on subsequent syncs
- The sync loop runs every 5 minutes + on tab focus, amplifying the problem

### Impact
- **User impact**: 300+ test issues created, polluting the GitHub repo
- **Trust impact**: Users cannot safely enable GitHub sync
- **Data integrity**: No reliable link between local tasks and GitHub issues

---

## Root Cause Analysis

### Primary Issue: Task Identity Not Preserved (File Mode)

**Location**: `src/lib/backlog-parser.ts`

When using file storage mode (BACKLOG.md), the markdown parser/serializer loses critical data:

1. **New UUIDs on every parse** (line 274):
   ```typescript
   id: uuidv4(),  // Always generates new ID!
   ```

2. **Sync metadata not serialized** (`serializeBacklogMd` function):
   - Does NOT write: `id`, `githubIssueNumber`, `githubIssueUrl`, `lastSyncedAt`, `syncStatus`
   - Only writes: title, priority, effort, value, description, acceptance criteria, notes

**Result**: Every file read creates "new" tasks with different IDs. The sync API cannot match tasks to existing issues.

### Secondary Issue: Sync Pulls All Closed Issues

**Location**: `src/app/api/github/sync/route.ts` (lines 613-614)

```typescript
existingIssues = await githubRequest<GitHubIssue[]>(
  `/repos/${repo}/issues?labels=${RINGMASTER_LABEL}&state=all&per_page=100`,
  token
);
```

The sync fetches ALL issues (including closed ones) with the `ringmaster` label. When processed:

1. Closed issues with no matching local task are treated as "new from GitHub"
2. They get added to local state
3. On next sync, they're pushed back and **reopened** (status ≠ `ready_to_ship`)

### Tertiary Issue: State Management Race Condition

**Location**: `src/hooks/useAutoSync.ts` and `src/hooks/useBacklog.ts`

The sync flow has potential race conditions:

1. Sync completes, calls `onUpdateItem` with issue number
2. `useBacklog.updateItem` updates React state
3. File write is **debounced** (2 second delay)
4. Next sync triggers before write completes
5. Sync reads stale state without issue numbers

---

## Investigation Summary

### Files Examined

| File | Issue Found |
|------|-------------|
| `src/lib/backlog-parser.ts` | UUID regeneration, missing sync metadata |
| `src/lib/storage/local-storage.ts` | JSON.stringify preserves all fields ✓ |
| `src/lib/storage/file-backlog.ts` | Uses parser, inherits its issues |
| `src/hooks/useBacklog.ts` | Debounce may cause race condition |
| `src/hooks/useAutoSync.ts` | Relies on `onUpdateItem` for persistence |
| `src/app/api/github/sync/route.ts` | Fetches closed issues, no filtering |

### Data Flow Trace

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SYNC CREATES ISSUE                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. useAutoSync calls POST /api/github/sync                                  │
│ 2. API creates GitHub issue #123 for task "abc-123"                         │
│ 3. API returns: { taskId: "abc-123", issueNumber: 123 }                     │
│ 4. useAutoSync calls onUpdateItem({ ...task, githubIssueNumber: 123 })      │
│ 5. useBacklog.updateItem updates React state                                │
│ 6. [FILE MODE] Write debounced - NOT WRITTEN YET                            │
│ 7. [FILE MODE] serializeBacklogMd() called - DROPS githubIssueNumber        │
│ 8. [FILE MODE] parseBacklogMd() called - GENERATES NEW UUID                 │
│ 9. Next sync: task has no githubIssueNumber, different ID                   │
│ 10. Sync creates ANOTHER issue #124 for same task                           │
│ 11. Repeat forever...                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Solution Design

### Task 1: Preserve Task Identity in Markdown

**File**: `src/lib/backlog-parser.ts`

Add a metadata comment block at the start of each task section:

```markdown
### Task Title
<!-- ringmaster:id=abc-12345 github=123 synced=2026-01-12T03:00:00Z -->
**Priority**: High | **Effort**: Medium

**Description**:
Task description here...
```

**Changes Required**:

1. **`serializeBacklogMd()`**: Write metadata comment after title
2. **`parseBacklogMd()`**: Parse metadata comment to extract `id`, `githubIssueNumber`, `lastSyncedAt`
3. **Preserve existing IDs**: Don't generate new UUID if one exists in metadata

### Task 2: Filter Closed Issues During Pull

**File**: `src/app/api/github/sync/route.ts`

Modify the pull logic to skip orphaned closed issues:

```typescript
// In the pull section (around line 725)
if (!localTask) {
  // Skip closed issues that aren't in local state
  // These are likely cleanup artifacts or external closures
  if (issue.state === 'closed') {
    console.log(`[GitHub Sync] Skipping closed orphan issue #${issue.number}`);
    continue;
  }
  // ... rest of new issue handling
}
```

### Task 3: Add Idempotency Check Before Issue Creation

**File**: `src/app/api/github/sync/route.ts`

Before creating a new issue, search for existing issues with matching title/task ID:

```typescript
// In pushTask function, before creating new issue
const existingByTitle = await githubRequest<GitHubIssue[]>(
  `/repos/${repo}/issues?state=all&per_page=10`,
  token
);
const duplicate = existingByTitle.find(i =>
  i.title === task.title && extractTaskId(i.body) === task.id
);
if (duplicate) {
  return { issue: duplicate, operation: 'unchanged' };
}
```

### Task 4: Flush Pending Writes Before Sync

**File**: `src/hooks/useBacklog.ts`

Export a method to force-flush any pending writes:

```typescript
const flushPendingWrites = useCallback(async () => {
  if (debounceRef.current && pendingItemsRef.current) {
    clearTimeout(debounceRef.current);
    await writeToFile(pendingItemsRef.current);
    pendingItemsRef.current = null;
  }
}, [writeToFile]);
```

**File**: `src/hooks/useAutoSync.ts`

Call flush before syncing:

```typescript
const sync = useCallback(async () => {
  // Flush any pending writes first
  if (onFlushWrites) {
    await onFlushWrites();
  }
  // ... rest of sync logic
}, [/* deps */]);
```

---

## Tasks

### Phase 1: Critical Fixes (Stop the Bleeding)

- [x] **T1.1**: Update `serializeBacklogMd()` to write metadata comment with `id`, `githubIssueNumber`, `lastSyncedAt`
- [x] **T1.2**: Update `parseBacklogMd()` to extract and preserve `id` from metadata comment (don't regenerate)
- [x] **T1.3**: Skip closed orphan issues during pull sync
- [x] **T1.4**: Add integration test for round-trip: serialize → parse preserves all fields

### Phase 2: Robustness Improvements

- [ ] **T2.1**: Add idempotency check before creating new issues
- [ ] **T2.2**: Implement write flush before sync
- [ ] **T2.3**: Add rate limiting / backoff to prevent runaway sync loops
- [ ] **T2.4**: Add sync status indicator showing pending vs synced tasks

### Phase 3: Recovery & Cleanup Tools

- [ ] **T3.1**: Add CLI command to deduplicate GitHub issues
- [ ] **T3.2**: Add "unlink task from GitHub" action in UI
- [ ] **T3.3**: Add "sync health check" diagnostic endpoint

---

## Acceptance Criteria

### AC1: Single Issue Per Task
```
Given: A task "Fix login bug" with no githubIssueNumber
When: Sync runs 5 times consecutively
Then: Exactly 1 GitHub issue is created
And: The task's githubIssueNumber is set to that issue's number
And: Subsequent syncs show operation: "unchanged"
```

### AC2: Metadata Preserved in File Mode
```
Given: Storage mode is "file" (BACKLOG.md)
And: A task has githubIssueNumber: 123, lastSyncedAt: "2026-01-12T03:00:00Z"
When: The task is serialized to markdown and parsed back
Then: The parsed task has the same id
And: The parsed task has githubIssueNumber: 123
And: The parsed task has lastSyncedAt: "2026-01-12T03:00:00Z"
```

### AC3: Closed Issues Not Reopened
```
Given: A GitHub issue #100 exists with state: "closed" and label: "ringmaster"
And: No local task is linked to issue #100
When: Sync runs
Then: Issue #100 remains closed
And: No new local task is created for issue #100
```

### AC4: LocalStorage Mode Works
```
Given: Storage mode is "local" (localStorage)
And: A task is synced and receives githubIssueNumber: 456
When: The page is refreshed
Then: The task still has githubIssueNumber: 456
And: Sync recognizes it as already synced
```

---

## Testing Plan

### Unit Tests
1. `backlog-parser.test.ts`: Round-trip preserves sync metadata
2. `github-sync.test.ts`: Closed orphan issues are skipped

### Integration Tests
1. Create task → Sync → Verify single issue created
2. Sync again → Verify no duplicate
3. Close issue on GitHub → Sync → Verify not reopened
4. File mode round-trip → Verify metadata preserved

### Manual Testing
1. Clear localStorage and BACKLOG.md
2. Create a test task "Sync Test 001"
3. Enable GitHub sync
4. Observe: Single issue created
5. Wait 5 minutes (or trigger sync manually)
6. Verify: No duplicates

---

## Rollback Plan

If issues arise:
1. Disable auto-sync by default (`enabled: false` in useAutoSync)
2. Add feature flag: `NEXT_PUBLIC_DISABLE_GITHUB_SYNC=true`
3. Clean up duplicate issues using gh CLI batch commands

---

## References

- Related file: `docs/specs/github-sync.md` (original sync spec)
- Related file: `docs/guides/github-sync-workflow.md` (user guide)
- Issue tracker: https://github.com/bozoparlay/ringmaster/issues

---

## Appendix: Metadata Comment Format

### Proposed Format
```markdown
### Task Title
<!-- ringmaster:id=uuid github=issue_number synced=iso_timestamp status=synced -->
```

### Parsing Regex
```typescript
const metaRegex = /<!--\s*ringmaster:id=([^\s]+)(?:\s+github=(\d+))?(?:\s+synced=([^\s]+))?(?:\s+status=([^\s]+))?\s*-->/;
```

### Full BacklogItem Serialization (if needed)
For complete data preservation, could use YAML frontmatter:
```markdown
### Task Title
---
id: abc-12345
githubIssueNumber: 123
lastSyncedAt: 2026-01-12T03:00:00Z
syncStatus: synced
---
**Priority**: High | **Effort**: Medium
```

The simpler HTML comment approach is preferred for backwards compatibility with existing BACKLOG.md files.
