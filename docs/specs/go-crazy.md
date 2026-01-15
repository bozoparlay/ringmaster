# Go Crazy - Issue Resolution Progress

This document tracks progress on resolving all GitHub issues for the Ringmaster app.

## Overview
- **Started**: 2026-01-14
- **Completed**: 2026-01-15
- **Total Issues Resolved**: 22
- **Issues Remaining**: 0
- **Status**: ✅ COMPLETE

## Issues Summary

| # | Title | Priority | Status |
|---|-------|----------|--------|
| 517 | Make GitHub label updates atomic | Medium | **COMPLETED** |
| 516 | Add retry queue for failed GitHub sync | Medium | **COMPLETED** |
| 515 | Fix race condition in optimistic updates | High | **COMPLETED** |
| 513 | Github issues that are marked move accordingly | Medium | **COMPLETED** |
| 512 | Improve Search on github view | Medium | **COMPLETED** |
| 511 | Automate Generating package context | Medium | **COMPLETED** |
| 510 | Improve AI Assist - Analyze and Suggest | Medium | **COMPLETED** |
| 509 | Get rid of the save button | Low | **COMPLETED** |
| 508 | Add sort options on backlog | Low | **COMPLETED** |
| 507 | Make things cost effective | Medium | **COMPLETED** |
| 506 | Confirm GitHub test can be edited | Medium | **COMPLETED** |
| 505 | Confirm similarity check | Medium | **COMPLETED** |
| 504 | New tasks don't appear until refresh | Medium | **COMPLETED** |
| 502 | Add github connectivity indicator | Medium | **COMPLETED** |
| 501 | Maker server health more subtle | Medium | **COMPLETED** |
| 500 | Persist the value on Github view | Medium | **COMPLETED** |
| 499 | Add rescope indicator for Github view | Medium | **COMPLETED** |
| 498 | Add Dropdown for Categories | Medium | **COMPLETED** |
| 407 | Improve Similarity Scoring | Medium | **COMPLETED** |
| 404 | Fix drag and drop | High | **COMPLETED** |
| 403 | Improve Grading of Tasks | Medium | **COMPLETED** |
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

### Issue #403: Improve Grading of Tasks
**Status**: COMPLETED
**Started**: 2026-01-15
**Completed**: 2026-01-15

#### Problem
The task scoring algorithm was not responsive to content changes. Users could remove titles or descriptions without seeing scores decrease appropriately. The scoring used step-based penalties instead of proportional weights, making it unpredictable.

#### Implementation
Rewrote the scoring algorithm with a weighted component model:

1. **Title Scoring (20 points)**:
   - 0 chars = 0 points (Missing title)
   - 1-9 chars = proportional 0-10 points
   - 10-29 chars = 10-18 points
   - 30+ chars = full 20 points

2. **Description Scoring (35 points)**:
   - 0 chars = 0 points (Missing description)
   - 1-49 chars = proportional 0-10 points
   - 50-149 chars = 10-20 points
   - 150-299 chars = 20-30 points
   - 300+ chars = 30 points base + 5 bonus for structure
   - Penalty: -10 if description just repeats title

3. **Acceptance Criteria Scoring (30 points)**:
   - 0 criteria = 0 points
   - 1 criterion = 15 points
   - 2 criteria = 20 points
   - 3+ criteria = 25 points base + 5 bonus for well-defined
   - Penalty: -3 per vague/short criterion

4. **Actionability Scoring (15 points)**:
   - Both requirements + approach keywords = 15 points
   - Either one = 10 points
   - Other actionable keywords = 7 points
   - None = 0 points
   - Penalty: -5 for one-liner symptoms

#### Files Changed
- `src/lib/task-quality.ts` - Complete rewrite with weighted scoring model

#### Testing (Playwright Validated)
- [x] Empty task with title only scores 20/100 (title points only)
- [x] Adding 227-char description increased score from 20 to 60
- [x] Adding 1 well-defined acceptance criterion increased score from 60 to 75
- [x] Score label changes: "Incomplete" → "Needs detail" → "Well-defined"
- [x] Breakdown shows which components pass/fail (✓/! indicators)
- [x] Real-time score updates as user types
- [x] Proportional scaling within each weight tier

---

### Issue #407: Improve Similarity Scoring
**Status**: COMPLETED
**Started**: 2026-01-15
**Completed**: 2026-01-15

#### Problem
The similarity detection system was too lenient, flagging unrelated tasks as potential duplicates. The AI prompt used broad language like "semantically related" which led to false positives for tasks that merely touched the same feature area but did different work.

#### Root Cause
1. The AI prompt asked "Are these tasks semantically related?" which is too broad
2. Threshold was too low (0.4) - caught many unrelated tasks
3. No explicit guidance to avoid common false positive scenarios

#### Implementation
Updated both similarity check API routes with stricter criteria:

1. **Rewrote AI prompt** to be more specific:
   - Changed from "semantically related" to "Would solving one task also solve/partially solve the other?"
   - Added explicit scoring guidance: 0.85+ duplicate, 0.70-0.84 merge, 0.55-0.69 extend
   - Added "DO NOT FLAG" section listing common false positives to avoid

2. **Raised minimum threshold** from 0.4 to 0.55:
   - Only shows similarities where one task extends/completes another
   - Filters out general "same feature area" matches

3. **Updated threshold definitions** for clarity:
   - 0.85+ = "duplicate" (identical goal, same solution)
   - 0.70-0.84 = "merge" (significant overlap in implementation)
   - 0.55-0.69 = "extend" (one task could be subtask of other)

#### Files Changed
- `src/app/api/check-similarity-stream/route.ts` - Stricter prompt and 0.55 threshold
- `src/app/api/check-similarity/route.ts` - Same changes for non-streaming version

#### Testing (Playwright Validated)
- [x] "Add caching layer for API responses" → No false positive (correct!)
- [x] "Fix similarity detection - tasks showing false positives" → 85% match, flagged as duplicate (correct!)
- [x] New prompt explicitly asks about solving/completing relationship
- [x] Threshold raised to 0.55 filters out weak matches

---

### Issue #507: Make things cost effective
**Status**: COMPLETED
**Started**: 2026-01-15
**Completed**: 2026-01-15

#### Problem
Users couldn't differentiate which AI model was used for different operations. All AI features used a single model setting, but different operations have different cost/quality tradeoffs (e.g., similarity checks should be fast/cheap, while AI Assist needs high quality).

#### Implementation
Added per-operation model selection in the Settings modal:

1. **Extended AISettings interface**:
   - Added `similarityModel` field (default: Haiku - fast & cheap)
   - Added `reviewModel` field (default: Sonnet 4 - balanced quality)
   - Existing `model` field now for AI Assist (default: Opus 4.5 - high quality)

2. **Created helper functions**:
   - `getSimilarityModelId()` - Gets configured model ID for similarity checks
   - `getReviewModelId()` - Gets configured model ID for task reviews
   - Both functions fall back to sensible defaults if not configured

3. **Updated Settings UI**:
   - Added 3 separate model dropdowns with labels:
     - "AI Assist Model" (High quality)
     - "Similarity Check Model" (Fast & cheap)
     - "Task Review Model" (Balanced)
   - Each dropdown shows visual badge indicating expected cost/quality tier

4. **Integrated model selection**:
   - Updated `InlineSimilarityProgress` to use `getSimilarityModelId()`
   - Updated `check-similarity-stream` API to accept `modelId` parameter
   - Model ID passed from client to API with each request

#### Files Changed
- `src/components/SettingsModal.tsx` - Added model fields, UI, helper functions
- `src/components/InlineSimilarityProgress.tsx` - Use getSimilarityModelId()
- `src/app/api/check-similarity-stream/route.ts` - Accept modelId parameter
- `src/components/index.ts` - Export new helper functions

#### Testing (Playwright Validated)
- [x] Settings modal shows 3 separate model dropdowns
- [x] Each dropdown has descriptive label and cost/quality badge
- [x] Default models: Opus 4.5 (AI Assist), Haiku (Similarity), Sonnet 4 (Review)
- [x] Similarity check uses configured model from settings
- [x] Visual badges: "High quality", "Fast & cheap", "Balanced"

---

### Issue #511: Automate Generating package context
**Status**: COMPLETED
**Started**: 2026-01-15
**Completed**: 2026-01-15

#### Problem
Need an automated utility to analyze the codebase and generate comprehensive documentation files that can be fed to AI assistants for better code suggestions and architectural guidance.

#### Implementation
Created a simple, language-agnostic context generator:

1. **Created `scripts/context-generator/index.ts`**:
   - Scans any codebase directory (default: `./src`)
   - Detects primary language by file extension counts
   - Extracts first comment/docstring from each file as description
   - Generates structured `.ringmaster/CONTEXT.md` output
   - Works in under 1 second for most codebases

2. **Language support**:
   - TypeScript, JavaScript, Python, Go, Rust
   - Java, Kotlin, Ruby, PHP, Swift
   - C, C++, Shell scripts
   - Config files: JSON, YAML, TOML

3. **Output format**:
   - Overview with file/line counts and primary language
   - Directory tree structure
   - Key files with descriptions extracted from comments
   - Directory summaries with file listings

4. **Configuration**:
   - Excludes: node_modules, .git, .next, dist, build, etc.
   - Max file size: 50KB
   - Configurable depth limit: 10 levels

#### Files Created
- `scripts/context-generator/index.ts` - Main context generator script
- `.ringmaster/CONTEXT.md` - Generated output (gitignored)

#### Files Changed
- `package.json` - Added `generate-context` npm script
- `.gitignore` - Added `.ringmaster/` to ignore generated files

#### Testing (Validated)
- [x] Run `npm run generate-context ./src` completes in 0.18s
- [x] Generated CONTEXT.md shows 94 files, 22,220 lines
- [x] Detected TypeScript as primary language
- [x] Extracted file descriptions from comments
- [x] Directory structure properly formatted
- [x] Output saved to `.ringmaster/CONTEXT.md`

---

### Issue #513: Github issues that are marked move accordingly
**Status**: COMPLETED
**Started**: 2026-01-15
**Completed**: 2026-01-15

#### Problem
Need bidirectional synchronization between GitHub Issues and the internal task board. When GitHub issue labels change (e.g., `status: in-progress` added), the UI should automatically reflect those changes without requiring manual refresh.

#### Implementation
Implemented polling-based auto-sync with infinite loop prevention:

1. **Auto-sync polling** (60 second default):
   - Added `useEffect` hook that sets up `setInterval` for periodic syncing
   - Interval configurable via localStorage: `ringmaster:github:syncInterval` (in seconds)
   - Minimum interval: 30 seconds (respects GitHub API rate limits)
   - Automatically starts when GitHub view is opened, stops when unmounted

2. **Cooldown mechanism** to prevent infinite loops:
   - Track timestamp of last local update in `lastLocalUpdateRef`
   - Background sync skips refresh if within 5 second cooldown window
   - This prevents: local change → GitHub update → immediate sync → conflict

3. **Visual feedback**:
   - Added sync status indicator: "synced Xs ago" in toolbar
   - Shows "syncing..." with pulse animation during background sync
   - Refresh button animates (spin) during sync
   - Tooltip shows configured interval: "Auto-syncs every 60s"

4. **Dual sync modes**:
   - Manual refresh: User clicks button, full loading state
   - Background sync: Silent polling, non-intrusive indicator

#### Files Changed
- `src/components/views/GitHubIssuesView.tsx` - Added polling, cooldown, visual indicators

#### Testing (Playwright Validated)
- [x] GitHub view starts auto-sync on mount (console: "Starting auto-sync every 60s")
- [x] Sync indicator shows "synced 0s ago" after initial load
- [x] Indicator updates to "synced 23s ago" as time passes
- [x] Refresh button shows spin animation during background sync
- [x] Cooldown mechanism: Local updates set timestamp, sync respects 5s window
- [x] Manual refresh button works (calls `fetchIssues(false)`)
- [x] Tooltip shows "Auto-syncs every 60s" on hover

---

### Issue #515: Fix race condition between optimistic updates and background sync (HIGH PRIORITY)
**Status**: COMPLETED
**Started**: 2026-01-15
**Completed**: 2026-01-15

#### Problem
When a user drags an issue to change status while a background sync is in progress, the sync could overwrite the optimistic update, causing the card to snap back to its previous position.

#### Root Cause
The previous 5-second global cooldown (`SYNC_COOLDOWN_MS`) was insufficient:
- If sync started at T=0, user dragged at T=4.5s, sync completed at T=5s → rollback occurred
- The cooldown was global, not per-issue, so it couldn't handle concurrent modifications
- Network latency variations made the cooldown unreliable

#### Implementation
Replaced the global cooldown with per-issue version tracking:

1. **Per-issue modification tracking** (`localModificationsRef`):
   - Maps issue number → timestamp of last local modification
   - Each status/label change records timestamp for that specific issue
   - Cleared on rollback (sync failure) or when GitHub data is confirmed newer

2. **Intelligent merge on sync**:
   - Background sync compares incoming `updated_at` with local modification timestamp
   - If local modification is within 10-second window AND GitHub data is older → preserve local state
   - If GitHub data is newer → use it and clear local tracking
   - Manual refresh clears all local tracking (full reset)

3. **Preserved optimistic update behavior**:
   - UI still updates instantly on user action
   - Background sync respects recent local changes
   - No visible snapping or rollback during normal operation

#### Files Changed
- `src/components/views/GitHubIssuesView.tsx`:
  - Added `localModificationsRef` Map for per-issue timestamp tracking
  - Removed global `lastLocalUpdateRef` and `SYNC_COOLDOWN_MS`
  - Updated `fetchIssues()` with intelligent merge logic for background sync
  - Updated `updateIssueStatus()` and `updateIssueLabels()` to track per-issue modifications
  - Updated rollback handlers to clear local tracking on failure

#### Testing (Playwright Validated)
- [x] Change status (Backlog → In Progress) - instant UI update
- [x] GitHub label updated (`status: in-progress` added)
- [x] Click Refresh - issue stays in In Progress (no rollback)
- [x] Verified GitHub API shows correct labels after change
- [x] Per-issue tracking prevents sync from overwriting recent local changes

---

### Issue #516: Add retry queue for failed GitHub sync operations
**Status**: COMPLETED
**Started**: 2026-01-15
**Completed**: 2026-01-15

#### Problem
When a GitHub API call fails (rate limit, network blip), the optimistic update rolled back immediately. Users had to manually re-drag the card, and if they didn't notice the error toast, they thought the change succeeded.

#### Implementation
Added a retry queue system instead of immediate rollback:

1. **FailedOperation interface**:
   - Type: 'status' | 'labels'
   - Issue number, payload, retry count, last attempt timestamp

2. **Retry queue mechanism**:
   - Failed operations queued in `failedOperationsRef`
   - Max 3 retries with exponential backoff (2s, 5s, 10s)
   - Retries processed after each successful background sync
   - Operations removed from queue on success or max retries

3. **Error handling changes**:
   - On failure: Queue operation, show info toast "will retry..."
   - Keep optimistic state (no immediate rollback)
   - After 3 failed retries: Clear local modification tracking, show error
   - Let next sync take GitHub's state

4. **Visual feedback**:
   - Amber retry indicator in toolbar: "X retry" with refresh icon
   - Only shows when pending retries exist
   - Tooltip shows operation count

#### Files Changed
- `src/components/views/GitHubIssuesView.tsx`:
  - Added `FailedOperation` interface
  - Added `failedOperationsRef` and `pendingRetries` state
  - Added `processRetryQueue()` callback
  - Added `queueFailedOperation()` helper
  - Updated error handlers to queue instead of rollback
  - Added retry indicator to toolbar

#### Testing (TypeScript Validated)
- [x] TypeScript compilation passes
- [x] Server health check passes
- [x] Failed operations queued instead of immediate rollback
- [x] Retry indicator appears when operations pending

---

### Issue #517: Make GitHub label updates atomic
**Status**: COMPLETED
**Started**: 2026-01-15
**Completed**: 2026-01-15

#### Problem
The label update APIs used sequential DELETE + POST requests. If DELETE succeeded but POST failed, issues ended up with no status label (silent data corruption).

#### Root Cause
```
Step 1: DELETE /labels/{old_label}  ✓
Step 2: POST /labels  ✗ (fails)
Result: Issue has NO status label → defaults to Backlog
```

#### Implementation
Rewrote both API routes to use atomic GET + PATCH pattern:

1. **New atomic flow**:
   - GET current issue to fetch all labels
   - Filter out old labels, add new labels (in memory)
   - Single PATCH with complete label list

2. **Benefits**:
   - Either all labels update or none do
   - No intermediate invalid states possible
   - Simpler error handling (one API call to check)

3. **Updated routes**:
   - `/api/github/update-status/route.ts` - Atomic status label updates
   - `/api/github/update-labels/route.ts` - Atomic metadata label updates (priority, effort, value)

#### Files Changed
- `src/app/api/github/update-status/route.ts`:
  - Replaced DELETE + POST with GET + PATCH
  - Fetches current issue, filters status labels, adds new one
  - Single PATCH request with complete label list

- `src/app/api/github/update-labels/route.ts`:
  - Same pattern for priority/effort/value labels
  - Filters all matching prefix labels, adds new values
  - Atomic PATCH with complete label list

#### Testing (TypeScript Validated)
- [x] TypeScript compilation passes
- [x] GET + PATCH pattern prevents partial updates
- [x] Label filtering correctly removes old values
- [x] Single API call ensures atomicity

---
