# Ringmaster Architecture Simplification Spec

## Background

Ringmaster is a task management tool for developers that helps them manage backlogs, create worktrees, and ship code. The core value proposition is **helping developers attack backlog items by creating isolated git worktrees** — not synchronizing tasks across platforms.

### Current Architecture (3 Task Sources)

1. **Local Storage** - Browser localStorage for fast, offline-capable task storage
2. **File Mode (BACKLOG.md)** - Git-backed markdown file with rich task metadata
3. **GitHub Issues** - Two-way sync with GitHub Issues using a `ringmaster` label

### Current Data Flow

```
BACKLOG.md ←→ LocalStorage ←→ GitHub Issues
     ↑              ↑              ↑
     └──────────────┼──────────────┘
            Complex bidirectional sync
            with conflict resolution
```

---

## Problem Statement

The current bidirectional sync architecture creates significant complexity:

1. **Metadata Fragility** - Task identity preserved via HTML comments (`<!-- ringmaster:id=... -->`) that can be corrupted or lost during edits
2. **Conflict Resolution Overhead** - Two-way sync requires detecting conflicts, tracking timestamps, and manual resolution
3. **Sync State Confusion** - Tasks can be in states like `synced`, `pending`, `conflict`, `error`, `local-only` — cognitive overhead for users
4. **Chasing Tails** - Changes in one system must propagate to others, creating cascading updates and potential data loss
5. **Lost Focus** - The sync complexity detracts from the core value: **creating branches and working on tasks**

### Evidence from Codebase

- `src/app/api/github/sync/route.ts` - Complex sync logic with multiple edge cases
- `src/lib/storage/github-sync.ts` - Bidirectional sync service with conflict detection
- `src/hooks/useAutoSync.ts` - Auto-sync hooks adding background complexity
- Multiple metadata comment formats embedded in BACKLOG.md

---

## Technical Approach: Lanes, Not Sync

### New Philosophy

**Each task source stays in its own lane.** Users explicitly move items between sources when needed — no automatic bidirectional sync.

### New Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Ringmaster UI                             │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  BACKLOG.md  │  │    GitHub    │  │    Quick     │       │
│  │    View      │  │    Issues    │  │    Tasks     │       │
│  │              │  │    View      │  │  (localStorage)│     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                 │               │
│         └────────────┬────┴────────────────┘               │
│                      │                                      │
│              ┌───────▼────────┐                            │
│              │  Work on Item  │                            │
│              │  (Any Source)  │                            │
│              └───────┬────────┘                            │
│                      │                                      │
│              ┌───────▼────────┐                            │
│              │ Create Worktree│                            │
│              │   & Branch     │                            │
│              └────────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

### Key Changes

| Current | New |
|---------|-----|
| One unified task list with sync | Multiple source views |
| Automatic bidirectional sync | User-driven linking (explicit action) |
| Complex conflict resolution | No conflicts (sources are independent) |
| Metadata comments with sync status | Simple `github_issue: #123` reference (no sync metadata) |
| Auto-sync on timer | Manual "Link to GitHub" action in edit modal |

### Linking Model

**Keep:** The ability to link a BACKLOG.md item to a GitHub issue
**Remove:** Automatic two-way sync, conflict detection, sync status tracking

A linked item simply has a reference like:
```markdown
### My Task
**GitHub Issue**: #123
**Priority**: High | **Effort**: Medium
```

This is a **reference**, not a sync relationship. Changes to the GitHub issue don't auto-update the backlog item and vice versa.

### Core User Flows

#### Flow 1: View Tasks from Any Source
1. User opens Ringmaster
2. Sees tab/toggle for: **Backlog** | **GitHub** | **Quick Tasks**
3. Each view shows items from that source only
4. No sync — just read from source

#### Flow 2: Work on an Item
1. User clicks on any item (from any source)
2. Clicks "Tackle" to start working
3. System creates worktree and branch
4. **Source stays in its lane** — BACKLOG.md item stays in BACKLOG.md, GitHub issue stays as GitHub issue

#### Flow 3: Link Backlog Item to GitHub Issue
1. User opens edit modal for a BACKLOG.md item
2. Sees "Link to GitHub Issue" field
3. Can search/select an existing issue OR create a new issue
4. Link is saved as simple reference (`**GitHub Issue**: #123`)
5. **No auto-sync** — link is just for reference/navigation

#### Flow 4: Create Issue from Backlog / Add to Backlog from Issue
1. User can explicitly "Send to GitHub" on a backlog item → creates new issue
2. User can explicitly "Add to Backlog" on a GitHub issue → appends to BACKLOG.md
3. Both operations are **one-way, user-initiated**
4. Optionally auto-links after creation

---

## Implementation Phases

### Phase 1: Multi-Source View Architecture

**Goal:** Replace unified Kanban with source-tabbed views

**Changes:**
- New `SourceSelector` component (tabs: Backlog | GitHub | Quick Tasks)
- Refactor `KanbanBoard` to accept a `source` prop
- Create `BacklogView` - reads BACKLOG.md directly (no sync metadata needed)
- Create `GitHubIssuesView` - fetches ALL open issues (no label filter)
- Create `QuickTasksView` - localStorage items for scratch/quick tasks
- Remove auto-sync hooks from main page

**Files to Modify:**
- `src/app/page.tsx` - Add source selector
- `src/components/KanbanBoard.tsx` - Accept source prop, simplify
- `src/hooks/useBacklog.ts` - Simplify to read-only from BACKLOG.md
- New: `src/components/SourceSelector.tsx`
- New: `src/components/views/BacklogView.tsx`
- New: `src/components/views/GitHubIssuesView.tsx`
- New: `src/components/views/QuickTasksView.tsx`

**Playwright Validation:**
```typescript
test('can switch between source views', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Default view shows Backlog
  await expect(page.getByRole('tab', { name: 'Backlog' })).toHaveAttribute('aria-selected', 'true');

  // Switch to GitHub view
  await page.getByRole('tab', { name: 'GitHub' }).click();
  await expect(page.getByRole('tab', { name: 'GitHub' })).toHaveAttribute('aria-selected', 'true');

  // Switch to Quick Tasks
  await page.getByRole('tab', { name: 'Quick Tasks' }).click();
  await expect(page.getByRole('tab', { name: 'Quick Tasks' })).toHaveAttribute('aria-selected', 'true');
});
```

**Acceptance Criteria:**
- [ ] Three source tabs visible in UI
- [ ] Each tab loads items from its respective source
- [ ] No auto-sync running in background
- [ ] Backlog view shows BACKLOG.md items
- [ ] GitHub view shows ALL open issues from the repository
- [ ] Quick Tasks view shows localStorage items

---

### Phase 2: Simplify Backlog Parser

**Goal:** Keep GitHub issue references, remove sync machinery

**Changes:**
- Keep `<!-- ringmaster:id=... github=123 -->` for linking (but remove `synced=`, `status=`)
- Parser extracts `github_issue` as simple number reference
- Remove sync status tracking from BacklogItem type
- Display GitHub issue link on task card (clickable to open issue)

**Files to Modify:**
- `src/lib/backlog-parser.ts` - Simplify metadata extraction (keep id, github; drop sync fields)
- `src/lib/storage/file-backlog.ts` - Remove sync-related code
- `src/types/backlog.ts` (if exists) - Remove `syncStatus`, `lastSynced` fields

**New Metadata Format:**
```markdown
### My Task
<!-- ringmaster:id=abc123 github=456 -->
**Priority**: High | **Effort**: Medium
```
No `synced=` or `status=` — just ID and optional GitHub reference.

**Playwright Validation:**
```typescript
test('backlog items show github link without sync status', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Find a task with GitHub link
  const taskCard = page.getByTestId('task-card').first();

  // Should show GitHub issue link
  await expect(taskCard.getByRole('link', { name: /#\d+/ })).toBeVisible();

  // Should NOT show sync status
  await expect(taskCard).not.toContainText('synced');
  await expect(taskCard).not.toContainText('pending');
  await expect(taskCard).not.toContainText('conflict');
});
```

**Acceptance Criteria:**
- [ ] Parser extracts `github_issue` number from metadata
- [ ] Task cards show clickable GitHub issue link (#123)
- [ ] No sync status indicators (synced, pending, conflict)
- [ ] BACKLOG.md can have items with or without GitHub links

---

### Phase 3: Worktree-First Workflow

**Goal:** Ensure "Tackle" workflow works from any source view

**Changes:**
- "Tackle" button available on items from all three sources
- Creates worktree/branch regardless of source
- GitHub source: assigns issue to user, adds "in progress" label
- Backlog source: updates status in BACKLOG.md to `[in_progress]`
- Quick Tasks: marks as in-progress in localStorage

**Files to Modify:**
- `src/components/TaskPanel.tsx` - Ensure Tackle works for all sources
- `src/app/api/worktree/` - May need minor adjustments
- `src/components/TackleModal.tsx` - Source-agnostic tackle flow

**Playwright Validation:**
```typescript
test('can tackle item from backlog source', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Click on a backlog item
  await page.getByTestId('task-card').first().click();

  // Click Tackle
  await page.getByRole('button', { name: /tackle/i }).click();

  // Verify worktree creation dialog appears
  await expect(page.getByText(/creating worktree/i)).toBeVisible();
});

test('can tackle item from github source', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Switch to GitHub tab
  await page.getByRole('tab', { name: 'GitHub' }).click();

  // Click on a GitHub issue
  await page.getByTestId('task-card').first().click();

  // Click Tackle
  await page.getByRole('button', { name: /tackle/i }).click();

  // Verify worktree creation
  await expect(page.getByText(/creating worktree/i)).toBeVisible();
});
```

**Acceptance Criteria:**
- [ ] Can tackle items from Backlog view
- [ ] Can tackle items from GitHub view
- [ ] Can tackle items from Quick Tasks view
- [ ] Worktree created with appropriate branch name
- [ ] Source-specific status updates work (GitHub label, BACKLOG.md status, localStorage flag)

---

### Phase 4: Link to GitHub UI in Edit Modal

**Goal:** Add user-driven linking between backlog items and GitHub issues

**Changes:**
- Add "Link to GitHub Issue" field in task edit modal
- Searchable dropdown to find existing issues
- Option to create new issue and auto-link
- Display linked issue on task card (clickable)
- Unlink option to remove association

**Files to Modify:**
- `src/components/TaskEditModal.tsx` (or equivalent) - Add GitHub link field
- `src/components/TaskCard.tsx` - Display linked issue badge
- `src/app/api/github/issues/route.ts` - Search issues endpoint

**Files to Create:**
- `src/components/GitHubIssuePicker.tsx` - Searchable issue selector component

**Playwright Validation:**
```typescript
test('can link backlog item to existing github issue', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Click edit on a backlog item
  await page.getByTestId('task-card').first().click();
  await page.getByRole('button', { name: /edit/i }).click();

  // Find GitHub link field
  await page.getByLabel(/link to github/i).click();

  // Search for an issue
  await page.getByPlaceholder(/search issues/i).fill('bug');

  // Select an issue from dropdown
  await page.getByRole('option').first().click();

  // Save
  await page.getByRole('button', { name: /save/i }).click();

  // Verify link appears on card
  await expect(page.getByTestId('task-card').first().getByRole('link', { name: /#\d+/ })).toBeVisible();
});

test('can unlink github issue from backlog item', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Click edit on a linked backlog item
  await page.getByTestId('task-card').first().click();
  await page.getByRole('button', { name: /edit/i }).click();

  // Click unlink
  await page.getByRole('button', { name: /unlink/i }).click();

  // Save
  await page.getByRole('button', { name: /save/i }).click();

  // Verify link is removed
  await expect(page.getByTestId('task-card').first().getByRole('link', { name: /#\d+/ })).not.toBeVisible();
});
```

**Acceptance Criteria:**
- [ ] Edit modal has "Link to GitHub Issue" field
- [ ] Can search and select existing issues
- [ ] Can unlink a previously linked issue
- [ ] Linked issue number shows on task card
- [ ] Clicking issue link opens GitHub in new tab

---

### Phase 5: Explicit Import/Export Utilities

**Goal:** Add explicit (non-automatic) tools for moving items between sources

**Changes:**
- "Send to GitHub" action on Backlog items → creates GitHub issue (and auto-links)
- "Add to Backlog" action on GitHub issues → appends to BACKLOG.md (and auto-links)
- "Promote to Backlog" action on Quick Tasks → adds to BACKLOG.md
- All operations are one-way, user-initiated, no sync loops

**Files to Create:**
- `src/app/api/github/create-issue/route.ts` - Create issue from backlog item
- `src/app/api/backlog/append/route.ts` - Append item to BACKLOG.md

**Files to Modify:**
- `src/components/TaskPanel.tsx` - Add import/export actions

**Playwright Validation:**
```typescript
test('can send backlog item to github', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Click on a backlog item (not linked to GitHub)
  await page.getByTestId('task-card').first().click();

  // Click "Send to GitHub"
  await page.getByRole('button', { name: /send to github/i }).click();

  // Confirm action
  await page.getByRole('button', { name: /confirm/i }).click();

  // Success message
  await expect(page.getByText(/issue created/i)).toBeVisible();

  // Verify auto-link
  await expect(page.getByTestId('task-card').first().getByRole('link', { name: /#\d+/ })).toBeVisible();
});

test('can import github issue to backlog', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Switch to GitHub tab
  await page.getByRole('tab', { name: 'GitHub' }).click();

  // Click on a GitHub issue
  await page.getByTestId('task-card').first().click();

  // Click "Add to Backlog"
  await page.getByRole('button', { name: /add to backlog/i }).click();

  // Success message
  await expect(page.getByText(/added to backlog/i)).toBeVisible();

  // Switch to Backlog tab and verify
  await page.getByRole('tab', { name: 'Backlog' }).click();
  // New item should be visible with GitHub link
});
```

**Acceptance Criteria:**
- [ ] "Send to GitHub" creates issue from backlog item and auto-links
- [ ] "Add to Backlog" appends GitHub issue to BACKLOG.md and auto-links
- [ ] "Promote to Backlog" moves Quick Task to BACKLOG.md
- [ ] All operations show success/error feedback
- [ ] No automatic reverse sync occurs

---

### Phase 6: Cleanup and Polish

**Goal:** Remove legacy sync code, polish UI, final validation

**Changes:**
- Remove `src/app/api/github/sync/` directory
- Remove `src/lib/storage/github-sync.ts`
- Remove `useAutoSync` hook
- Remove sync status indicators from UI
- Update settings modal (remove sync settings, keep GitHub token for issues API)
- Clean up BACKLOG.md (remove legacy metadata comments)

**Files to Remove:**
- `src/app/api/github/sync/route.ts`
- `src/lib/storage/github-sync.ts`
- `src/hooks/useAutoSync.ts`
- Any sync-related types/utilities

**Files to Modify:**
- `src/components/Header.tsx` - Remove sync status indicator
- `src/components/SettingsModal.tsx` - Simplify GitHub settings
- `BACKLOG.md` - Strip metadata comments (optional migration script)

**Playwright Validation:**
```typescript
test('full workflow: view sources, tackle item, complete work', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // View backlog
  await expect(page.getByRole('tab', { name: 'Backlog' })).toBeVisible();
  await expect(page.getByTestId('task-card')).toHaveCount.greaterThan(0);

  // View GitHub issues
  await page.getByRole('tab', { name: 'GitHub' }).click();
  // (may have 0 items if no issues with label)

  // View Quick Tasks
  await page.getByRole('tab', { name: 'Quick Tasks' }).click();

  // Create a quick task
  await page.getByRole('button', { name: /add task/i }).click();
  await page.getByLabel('Title').fill('Test task');
  await page.getByRole('button', { name: /save/i }).click();

  // Tackle the task
  await page.getByTestId('task-card').first().click();
  await page.getByRole('button', { name: /tackle/i }).click();

  // Verify UI shows no sync indicators
  await expect(page.getByText(/syncing/i)).not.toBeVisible();
  await expect(page.getByText(/conflict/i)).not.toBeVisible();
});
```

**Acceptance Criteria:**
- [ ] No sync-related code remains
- [ ] No sync status indicators in UI
- [ ] All three source views work independently
- [ ] Tackle workflow works from any source
- [ ] Import/export utilities work as expected
- [ ] Application is simpler and more focused

---

## Summary of Architecture Changes

### Before
```
Complex bidirectional sync between 3 sources
├── Auto-sync hooks running on timer
├── Conflict resolution machinery
├── Metadata comments with sync status in BACKLOG.md
├── Sync status tracking (synced, pending, conflict, error)
└── ~15 files of sync infrastructure
```

### After
```
Three independent source views with user-driven linking
├── Backlog view (reads BACKLOG.md)
├── GitHub view (reads ALL open issues via API)
├── Quick Tasks view (localStorage)
├── User-driven linking (edit modal)
├── Explicit import/export utilities
└── Focus on worktree workflow
```

### Phase Summary

| Phase | Goal | Key Deliverable |
|-------|------|-----------------|
| 1 | Multi-Source Views | Tab-based UI for Backlog, GitHub, Quick Tasks |
| 2 | Simplify Parser | Remove sync metadata, keep GitHub reference |
| 3 | Worktree Workflow | Tackle works from any source |
| 4 | Link to GitHub UI | Edit modal with GitHub issue picker |
| 5 | Import/Export | One-way "Send to GitHub" / "Add to Backlog" |
| 6 | Cleanup | Remove auto-sync code, polish |

### Files Changed Summary

**New Files:**
- `src/components/SourceSelector.tsx`
- `src/components/views/BacklogView.tsx`
- `src/components/views/GitHubIssuesView.tsx`
- `src/components/views/QuickTasksView.tsx`
- `src/components/GitHubIssuePicker.tsx`
- `src/app/api/github/create-issue/route.ts`
- `src/app/api/github/issues/route.ts` (search endpoint)
- `src/app/api/backlog/append/route.ts`

**Modified Files:**
- `src/app/page.tsx`
- `src/components/KanbanBoard.tsx`
- `src/components/TaskPanel.tsx`
- `src/components/TaskEditModal.tsx`
- `src/components/TaskCard.tsx`
- `src/components/Header.tsx`
- `src/lib/backlog-parser.ts`
- `src/lib/storage/file-backlog.ts`

**Removed Files:**
- `src/app/api/github/sync/route.ts`
- `src/lib/storage/github-sync.ts`
- `src/hooks/useAutoSync.ts`

---

## Testing Strategy

**Playwright-First Approach:**
- Each phase ends with Playwright tests validating the user workflow
- Tests run against `localhost:3000` (or `:3001` for worktrees)
- Focus on user-visible behavior, not implementation details

**Minimal Unit Tests:**
- Only where complex logic requires it (e.g., backlog parser)
- Prefer integration tests via Playwright

**Manual Validation:**
- Open the website and work through each flow
- This is the primary quality check

---

## Design Approach

**Frontend Design Skill:**
- Use the `/frontend-design` skill at each phase for UI components
- Ensures high design quality and polished user experience
- Creates distinctive, production-grade interfaces
- Avoids generic AI aesthetics

**Per-Phase Design Work:**
| Phase | Design Focus |
|-------|--------------|
| 1 | Source selector tabs, view layout |
| 2 | Task card with GitHub link badge |
| 3 | Tackle flow UI updates |
| 4 | GitHub issue picker component, edit modal updates |
| 5 | Import/export action buttons, confirmation dialogs |
| 6 | Final polish, remove sync indicators |

Each phase should invoke the frontend design skill for any new UI components or significant visual changes.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Users rely on current sync | Provide migration guide, keep GitHub label for filtering |
| BACKLOG.md has legacy metadata | Phase 6 includes cleanup script |
| GitHub API rate limits | Existing rate limiting already in place |
| Lost functionality | Import/export utilities preserve ability to move items |

---

## Success Criteria

The refactor is successful when:
1. A user can view tasks from any source without confusion
2. A user can "tackle" any item and start working immediately
3. A user can explicitly move items between sources when needed
4. There is no background sync causing unexpected changes
5. The codebase is simpler with fewer edge cases to maintain
