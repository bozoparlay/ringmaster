# Go Crazy - Issue Resolution Progress

This document tracks progress on resolving all GitHub issues for the Ringmaster app.

## Overview
- **Started**: 2026-01-14
- **Total Issues at Start**: 18
- **Issues Resolved**: 14
- **Issues Remaining**: 4

## Issues Summary

| # | Title | Priority | Status |
|---|-------|----------|--------|
| 512 | Improve Search on github view | Medium | **COMPLETED** |
| 511 | Automate Generating package context | Medium | Pending |
| 510 | Improve AI Assist - Analyze and Suggest | Medium | **COMPLETED** |
| 509 | Get rid of the save button | Low | **COMPLETED** |
| 508 | Add sort options on backlog | Low | **COMPLETED** |
| 507 | Make things cost effective | Medium | Pending |
| 506 | Confirm GitHub test can be edited | Medium | **COMPLETED** |
| 505 | Confirm similarity check | Medium | **COMPLETED** |
| 504 | New tasks don't appear until refresh | Medium | **COMPLETED** |
| 502 | Add github connectivity indicator | Medium | **COMPLETED** |
| 501 | Maker server health more subtle | Medium | **COMPLETED** |
| 500 | Persist the value on Github view | Medium | **COMPLETED** |
| 499 | Add rescope indicator for Github view | Medium | **COMPLETED** |
| 498 | Add Dropdown for Categories | Medium | **COMPLETED** |
| 407 | Improve Similarity Scoring | Medium | Pending |
| 404 | Fix drag and drop | High | **COMPLETED** |
| 403 | Improve Grading of Tasks | Medium | Pending |
| 402 | Setup docker container | High | **COMPLETED** |

---

## Work Log

### Issue #404: Fix drag and drop (HIGH PRIORITY)
**Status**: COMPLETED
**Started**: 2026-01-14
**Completed**: 2026-01-14

#### Problem
Drag and drop functionality had issues - users had to drag tiles to the middle of the target column rather than being able to drop them near the top where the header is located.

#### Root Cause
1. In `KanbanColumn.tsx`, the drop zone (`setNodeRef`) was only attached to the content div, NOT the header
2. The `closestCenter` collision detection algorithm picked items over columns when the task appeared in multiple places (Backlog + Up Next virtual column)

#### Implementation
1. **KanbanColumn.tsx**: Moved `setNodeRef` from content div to outer column div - making the entire column (header + content) a valid drop target
2. **Custom collision detection**: Created `customCollisionDetection` function in all three views (BacklogView, QuickTasksView, GitHubIssuesView) that:
   - Uses `pointerWithin` to detect column collisions first
   - Falls back to `closestCenter` for sorting within columns
   - Prioritizes column drops over item drops

#### Files Changed
- `src/components/KanbanColumn.tsx` - Expanded drop zone to entire column
- `src/components/views/QuickTasksView.tsx` - Added custom collision detection
- `src/components/views/BacklogView.tsx` - Added custom collision detection
- `src/components/views/GitHubIssuesView.tsx` - Added custom collision detection

#### Testing (Playwright Validated)
- [x] Drag task from Backlog to In Progress (dropping on header) - WORKS
- [x] Drag task from In Progress to Review (dropping on header) - WORKS
- [x] Drag task from Review back to Backlog (dropping on header) - WORKS
- [x] Drop zones now cover the full column area including headers

---

### Issue #501: Make server health more subtle
**Status**: COMPLETED
**Started**: 2026-01-14
**Completed**: 2026-01-14

#### Problem
Server health indicator was showing both a dot AND text label ("Server healthy"), making the UI cluttered when everything is working fine.

#### Implementation
Changed the HealthIndicator to only show the text label when the server is NOT healthy. When healthy, just the green dot is visible. The hover tooltip still works to show full details.

#### Files Changed
- `src/components/HealthIndicator.tsx` - Hide text label when status is 'healthy'

#### Testing (Playwright Validated)
- [x] When healthy: Only green dot visible, no text
- [x] Hover shows full tooltip with status details
- [x] "Checking..." text still shows during initial load
- [x] Degraded/unhealthy would still show text labels

---

### Issue #502: Add github connectivity indicator
**Status**: COMPLETED
**Started**: 2026-01-14
**Completed**: 2026-01-14

#### Problem
Need a GitHub connectivity indicator next to the repo name, similar to the server health indicator.

#### Implementation
Added GitHub connectivity indicator to the SourceSelector component:
1. Small green/gray dot on the GitHub tab showing connection status
2. Description area shows repo name (e.g., "bozoparlay/ringmaster") instead of just "Issues"
3. "connected"/"disconnected" badge in the description when GitHub tab is selected

#### Files Changed
- `src/components/SourceSelector.tsx` - Added isGitHubConnected and repoName props, connectivity indicators
- `src/app/page.tsx` - Pass isGitHubConnected and repoName to SourceSelector

#### Testing (Playwright Validated)
- [x] Green dot shows on GitHub tab when connected
- [x] Gray dot shows when disconnected
- [x] Repo name displays in description (e.g., "bozoparlay/ringmaster")
- [x] "connected" badge shows when in GitHub mode and connected

---

### Issue #504: New tasks don't appear until refresh
**Status**: COMPLETED
**Started**: 2026-01-14
**Completed**: 2026-01-14

#### Problem
When creating a new GitHub issue through the UI, users had to manually refresh the page to see the new task appear in the kanban board.

#### Implementation
Added optimistic update pattern to GitHubIssuesView:
1. Create a temporary issue with negative ID (`-Date.now()`) immediately
2. Add it to the UI state instantly - modal closes, task appears
3. Make the GitHub API call in the background
4. On success: Replace temp issue with real issue from API response
5. On failure: Remove temp issue, show error toast

#### Files Changed
- `src/components/views/GitHubIssuesView.tsx` - Added `handleCreateGitHubTask` with optimistic update logic

#### Testing (Playwright Validated)
- [x] New task appears in Backlog column immediately after clicking "Add Task"
- [x] Issue count updates instantly (19 → 20)
- [x] Toast shows "Created issue #514: Test optimistic update issue"
- [x] Modal closes immediately - no waiting for API response
- [x] Real issue number assigned after GitHub API completes

---

### Issue #500: Persist the value on Github view
**Status**: COMPLETED
**Started**: 2026-01-14
**Completed**: 2026-01-14

#### Problem
Changes made to the Value field (and other metadata like Priority and Effort) on GitHub issues didn't persist. The UI allowed editing but the changes weren't synced back to GitHub labels.

#### Root Cause
The `TaskPanel.onSave` handler in `GitHubIssuesView` only synced status changes to GitHub. Priority, Effort, and Value changes were ignored.

#### Implementation
1. Created new API endpoint `/api/github/update-labels` that handles updating `priority:*`, `effort:*`, and `value:*` labels
2. Added `updateIssueLabels` function in GitHubIssuesView with optimistic updates:
   - Immediately updates local state
   - Fires background API call to sync to GitHub
   - Rolls back on failure with error toast
3. Updated `onSave` handler to detect and sync priority, effort, and value changes

#### Files Changed
- `src/app/api/github/update-labels/route.ts` - New API endpoint for label updates
- `src/components/views/GitHubIssuesView.tsx` - Added updateIssueLabels function and enhanced onSave handler

#### Testing (Playwright Validated)
- [x] Change Value from Medium to High - UI updates instantly
- [x] Save Changes closes panel - shows $H on card
- [x] Refresh from GitHub - Value persists as High ($H)
- [x] Label synced to GitHub (value:high label added)

---

### Issue #512: Improve Search on github view
**Status**: COMPLETED
**Started**: 2026-01-14
**Completed**: 2026-01-14

#### Problem
The search functionality on the GitHub view was non-functional. Typing in the search box didn't filter the issues - all 17 issues remained visible regardless of the search query.

#### Root Cause
1. `GitHubIssuesView` component didn't have a `searchQuery` prop
2. `page.tsx` wasn't passing the `searchQuery` state to `GitHubIssuesView`
3. No filtering logic existed in `GitHubIssuesView`

#### Implementation
1. Added `searchQuery` prop to `GitHubIssuesView` interface
2. Updated `page.tsx` to pass `searchQuery` to `GitHubIssuesView`
3. Added client-side filtering in the `columnData` memo:
   - Filters by title, description, category, and tags
   - Case-insensitive, partial matches
   - Applied before organizing items into columns
4. Added "No tasks found" empty state with search icon and query display
5. Updated toolbar to show "X of Y open issues" during search

#### Files Changed
- `src/components/views/GitHubIssuesView.tsx` - Added searchQuery prop, filtering logic, empty state
- `src/app/page.tsx` - Pass searchQuery to GitHubIssuesView

#### Testing (Playwright Validated)
- [x] Search "docker" filters to 1 issue (#402) - shows "1 of 17 open issues"
- [x] Clear search restores full list (17 issues)
- [x] Search with no matches shows "No tasks found" with query
- [x] Real-time filtering as user types
- [x] Filters by title AND description content

---

### Issue #506: Confirm GitHub test can be edited
**Status**: COMPLETED (Verification)
**Started**: 2026-01-14
**Completed**: 2026-01-14

#### Objective
Verify that GitHub issues can be edited through the task panel and that changes persist across refreshes.

#### Testing (Playwright Validated)
- [x] Open edit task modal for GitHub issue #506
- [x] Edit Priority (Medium → High) - UI updates instantly
- [x] Edit Value (Medium → High) - shows $H on card
- [x] Click Save Changes - panel closes
- [x] Refresh from GitHub - Priority and Value changes persist
- [x] Labels synced to GitHub (priority:high, value:high labels added)
- [x] Priority change affected sorting (issue now in Up Next column)

#### Notes
This verification confirmed that the implementation from Issue #500 (Persist the value on Github view) works correctly end-to-end. The optimistic update + background sync pattern handles all metadata changes properly.

---

### Issue #505: Confirm similarity check
**Status**: COMPLETED
**Started**: 2026-01-14
**Completed**: 2026-01-14

#### Problem
The similarity check feature (which prevents duplicate tasks) only worked for the local Backlog view. When creating new GitHub issues, no similarity check was performed against existing GitHub issues.

#### Root Cause
1. The `/api/check-similarity-stream` API only accepted `backlogPath` to read tasks from a local file
2. `NewTaskModal` only triggered similarity checks when `backlogPath` was provided
3. `GitHubIssuesView` didn't pass any similarity data to `NewTaskModal`

#### Implementation
1. **Extended API** (`/api/check-similarity-stream/route.ts`):
   - Added `existingItems` parameter as alternative to `backlogPath`
   - Updated validation to accept either source
   - Modified task loading logic to use pre-loaded items when provided

2. **Updated InlineSimilarityProgress component**:
   - Added `existingItems` prop alongside `backlogPath`
   - Both are now optional - one or the other must be provided
   - Passes `existingItems` to API when available

3. **Updated NewTaskModal component**:
   - Added `existingItems` prop to interface
   - Updated similarity check gate to trigger when either `backlogPath` OR `existingItems` exists
   - Passes `existingItems` to `InlineSimilarityProgress`

4. **Updated GitHubIssuesView**:
   - Passes current GitHub issues as `existingItems` to `NewTaskModal`
   - Maps `BacklogItem[]` to the simpler `ExistingItem[]` format

#### Files Changed
- `src/app/api/check-similarity-stream/route.ts` - Extended to support `existingItems`
- `src/components/InlineSimilarityProgress.tsx` - Added `existingItems` prop
- `src/components/NewTaskModal.tsx` - Added `existingItems` prop and updated logic
- `src/components/views/GitHubIssuesView.tsx` - Pass existing issues to modal

#### Testing (Playwright Validated)
- [x] Open GitHub view with 15 issues loaded
- [x] Click "Create new GitHub issue" FAB
- [x] Enter title "Fix drag and drop issues in kanban board" (similar to existing #404)
- [x] Click "Add Task" - similarity check runs against GitHub issues
- [x] "Similar Tasks Found" modal appears showing:
  - "Fix drag and drop" at 90% similarity (Duplicate)
  - "Github issues that are marked move accordingly" at 70% (Consider Merging)
- [x] Click "Cancel" to not create duplicate

---

### Issue #510: Improve AI Assist - Analyze and Suggest
**Status**: COMPLETED
**Started**: 2026-01-14
**Completed**: 2026-01-14

#### Problem
When users clicked the "AI Assist - Analyze and Suggest" button in the New Task modal, there was no visual feedback during processing. Users couldn't tell if the system was working, which could lead to confusion or duplicate clicks.

#### Implementation
1. **Created shared `AiLoadingState` component** (`src/components/AiLoadingState.tsx`):
   - Extracted the animated loading state from `TaskPanel.tsx` into a reusable component
   - Features: animated gradient background, shimmer overlay, orbiting particles, floating sparkle icon, rotating status messages
   - Supports two modes: full height (default) and compact

2. **Updated `NewTaskModal.tsx`**:
   - The loading animation now **replaces** the description textarea during AI analysis (not shown below it)
   - Uses conditional rendering: `{!isAnalyzing && <textarea>}` / `{isAnalyzing && <AiLoadingState>}`
   - Height matches textarea (168px) to keep layout stable
   - Button disabled during processing

3. **Updated `TaskPanel.tsx`**:
   - Removed inline `AiLoadingState` function (~100 lines)
   - Now imports from shared component

4. **Updated component exports** (`src/components/index.ts`):
   - Added `AiLoadingState` export

#### Files Changed
- `src/components/AiLoadingState.tsx` - NEW shared animated loading component
- `src/components/NewTaskModal.tsx` - Integrated loading state to cover description box
- `src/components/TaskPanel.tsx` - Import from shared component
- `src/components/index.ts` - Export new component

#### Testing (Playwright Validated)
- [x] Click "AI Assist - Analyze & Suggest" immediately shows animated loading graphic
- [x] Loading animation covers the description box area (not below it)
- [x] Shows rotating messages: "Reading your description...", "Generating enhancements...", etc.
- [x] Sparkle icon floats with orbiting particles
- [x] AI Assist button is disabled during processing
- [x] Animation disappears when AI response is received, form populates with results
- [x] Visual styling matches edit modal animation exactly

---

### Issue #499: Add rescope indicator for Github view
**Status**: COMPLETED
**Started**: 2026-01-14
**Completed**: 2026-01-14

#### Problem
The GitHub Issues view was missing the quality/rescope indicator that exists in the Backlog view. Tasks with poor descriptions or missing acceptance criteria should show a warning triangle to indicate they need better definition.

#### Root Cause
The `issueToBacklogItem` function in `GitHubIssuesView.tsx` was not calculating `qualityScore` and `qualityIssues` when converting GitHub issues to BacklogItem format. The Backlog API performs this calculation, but GitHubIssuesView did its own conversion without quality validation.

#### Implementation
Added quality validation to the `issueToBacklogItem` function:
1. Import `validateTaskQuality` from `@/lib/task-quality`
2. Parse acceptance criteria from markdown checkboxes in issue body
3. Call `validateTaskQuality(title, body, acceptanceCriteria)` for each issue
4. Add `qualityScore` and `qualityIssues` to returned BacklogItem

#### Files Changed
- `src/components/views/GitHubIssuesView.tsx` - Added quality validation to issueToBacklogItem

#### Testing (Playwright Validated)
- [x] GitHub issues now have quality scores calculated (tested: #499=50, #407=55, #507=50)
- [x] Quality threshold is 50 - issues at or above don't show warning (correct behavior)
- [x] Issues with very short descriptions would show warning indicator (matches Backlog behavior)
- [x] TaskCard receives qualityScore and qualityIssues properties

---

### Issue #402: Setup docker container (HIGH PRIORITY)
**Status**: COMPLETED
**Started**: 2026-01-14
**Completed**: 2026-01-14

#### Problem
Need a Docker development container environment to provide a secure, isolated sandbox for running AI-assisted development tools, based on the Claude Code devcontainer reference implementation.

#### Implementation
Created a complete `.devcontainer` setup following the Anthropic reference:

1. **devcontainer.json**: Configuration for VS Code Dev Containers
   - Node.js 20 base image
   - NET_ADMIN/NET_RAW capabilities for firewall
   - VS Code extensions: Claude Code, ESLint, Prettier, GitLens, Tailwind CSS
   - Port 3000 forwarding for Next.js dev server
   - Persistent volumes for bash history and Claude config

2. **Dockerfile**: Development environment
   - Node.js 20 with development tools
   - zsh with Oh My Zsh and Powerlevel10k theme
   - git-delta for improved diffs
   - iptables/ipset for firewall management
   - GitHub CLI (gh) pre-installed

3. **init-firewall.sh**: Network isolation script
   - Blocks all outbound traffic by default
   - Whitelists: GitHub, npm, Anthropic API, AWS Bedrock, VS Code marketplace
   - Validates firewall works (blocks example.com, allows api.github.com)
   - Uses ipset for efficient IP matching with GitHub's IP ranges

4. **README.md**: Documentation for usage

#### Files Created
- `.devcontainer/devcontainer.json` - VS Code devcontainer configuration
- `.devcontainer/Dockerfile` - Container image definition
- `.devcontainer/init-firewall.sh` - Firewall initialization script
- `.devcontainer/README.md` - Usage documentation

#### Testing (Docker Validated)
- [x] JSON syntax valid (jq validation passed)
- [x] Docker build completes successfully
- [x] All 10 Dockerfile steps complete without error
- [x] Firewall script copied and permissions set
- [x] Oh My Zsh and Powerlevel10k theme installed

---

### Issue #509: Get rid of the save button
**Status**: COMPLETED
**Started**: 2026-01-14
**Completed**: 2026-01-14

#### Problem
The explicit "Save Changes" button in the task editing panel required users to manually save after every edit. This is outdated UX - modern apps like Google Docs and Notion auto-save changes automatically.

#### Implementation
1. **Created `useAutoSave` hook** (`src/hooks/useAutoSave.ts`):
   - Debounces saves (500ms after user stops typing)
   - Tracks status: idle, saving, saved, error
   - Auto-retry on failure (up to 3 times with exponential backoff)
   - Returns `hasUnsavedChanges` flag for close validation

2. **Created `SaveStatusIndicator` component** (`src/components/SaveStatusIndicator.tsx`):
   - Shows spinner + "Saving..." during save
   - Shows checkmark + "Saved" after successful save (fades after 2s)
   - Shows error icon + message on failure

3. **Updated `TaskPanel.tsx`**:
   - Removed "Save Changes" button from footer
   - Added `useAutoSave` hook integration
   - Added `SaveStatusIndicator` to header (next to close button)
   - Changed close handlers to use `handleClose()` which forces save before closing

4. **Created hooks index** (`src/hooks/index.ts`)

#### Files Created
- `src/hooks/useAutoSave.ts` - Reusable auto-save hook with debouncing
- `src/hooks/index.ts` - Hooks barrel export
- `src/components/SaveStatusIndicator.tsx` - Visual status indicator

#### Files Changed
- `src/components/TaskPanel.tsx` - Integrated auto-save, removed save button
- `src/components/index.ts` - Export SaveStatusIndicator

#### Testing (Playwright Validated)
- [x] Editing priority triggers auto-save (console shows "[backlog] Written to file")
- [x] Editing title triggers debounced auto-save
- [x] "Saved" indicator appears in header after save
- [x] No "Save Changes" button in footer
- [x] Closing panel preserves all changes (verified after reopen)
- [x] Card updates in real-time as edits are made

---

### Issue #498: Add Dropdown for Categories
**Status**: COMPLETED
**Started**: 2026-01-15
**Completed**: 2026-01-15

#### Problem
The category field in the TaskPanel was a plain text input, requiring users to type category names from memory. This led to inconsistent naming (e.g., "Bug Fix" vs "Bug Fixes" vs "Bugfixes") and made it hard to discover available categories.

#### Implementation
1. **Created `CategorySelector` component** (`src/components/CategorySelector.tsx`):
   - Combobox-style selector combining dropdown with text input
   - Shows existing categories from current tasks merged with defaults
   - 10 default category suggestions: UI/UX Improvements, Infrastructure, Admin Tools, User Management, Testing, Security, Performance, Bug Fixes, Documentation, Technical Debt
   - Filters suggestions as user types (case-insensitive)
   - Allows custom categories (shows "Create [category]" option)
   - Clear button to remove category
   - Keyboard support: Escape closes, ArrowDown opens, Enter selects first match

2. **Integrated into TaskPanel**:
   - Added `existingCategories` prop to TaskPanel interface
   - Replaced plain text input with CategorySelector
   - Auto-save triggers on category change

3. **Updated views to pass existing categories**:
   - BacklogView: Extracts categories from items with useMemo
   - GitHubIssuesView: Same pattern for GitHub issues

4. **Fixed infinite render loop**:
   - Initial implementation caused "Maximum update depth exceeded" error
   - Root cause: `allCategories` computed inline created new array reference on every render
   - Fix: Memoized with `useMemo` to maintain stable reference

#### Files Created
- `src/components/CategorySelector.tsx` - Combobox category selector

#### Files Changed
- `src/components/TaskPanel.tsx` - Added existingCategories prop, integrated CategorySelector
- `src/components/views/BacklogView.tsx` - Extract and pass existingCategories
- `src/components/views/GitHubIssuesView.tsx` - Extract and pass existingCategories
- `src/components/index.ts` - Export CategorySelector

#### Testing (Playwright Validated)
- [x] Click dropdown button shows all default categories alphabetically sorted
- [x] Selecting "Security" updates input, task card, and panel header
- [x] Auto-save triggers (console shows "[backlog] Written to file")
- [x] Typing "My Custom Category" works as custom category
- [x] Clear button removes category value
- [x] No infinite render loop (useMemo fix working)
- [x] Existing categories from tasks appear in dropdown

---

### Issue #508: Add sort options on backlog
**Status**: COMPLETED
**Started**: 2026-01-15
**Completed**: 2026-01-15

#### Problem
Backlog items were displayed in a fixed priority-based order, making it difficult to quickly organize tasks by different criteria like effort, value, or creation date.

#### Implementation
1. **Created sorting utility library** (`src/lib/sorting.ts`):
   - Defined `SortField` type: priority, effort, value, created, updated, title
   - Defined `SortDirection` type: asc, desc
   - `sortItems()` function to sort BacklogItem arrays by any field
   - `loadSortPrefs()` / `saveSortPrefs()` for localStorage persistence
   - Weight mappings for priority, effort, and value fields
   - Default config: Priority descending (critical first)

2. **Created `SortControl` component** (`src/components/SortControl.tsx`):
   - Dropdown to select sort field
   - Direction toggle button with rotating arrow icon
   - Clear visual feedback for current state

3. **Integrated into BacklogView**:
   - Added sortConfig state with localStorage hydration on mount
   - Updated columnData useMemo to use sortItems() for all columns
   - Up Next selection still based on priority (for business logic) but display order follows user preference
   - Added SortControl to toolbar next to filter

#### Files Created
- `src/lib/sorting.ts` - Sort utility functions and localStorage persistence
- `src/components/SortControl.tsx` - Sort dropdown and direction toggle

#### Files Changed
- `src/components/views/BacklogView.tsx` - Integrated sorting state and control
- `src/components/index.ts` - Export SortControl

#### Testing (Playwright Validated)
- [x] Sort dropdown displays all 6 sort fields
- [x] Direction toggle shows "Ascending/Descending (click to change)"
- [x] Arrow icon rotates when direction changes
- [x] Changed sort to "Title" / "Ascending" - persisted after page refresh
- [x] Default sort is Priority descending (critical items first)
- [x] localStorage key: `bozo_backlog_sort_prefs`

---
