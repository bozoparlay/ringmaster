# GitHub Sync Workflow Guide

This guide explains how to set up and use GitHub bidirectional sync in Ringmaster. Once configured, your local tasks sync with GitHub Issues - you can work offline and changes merge automatically.

## Quick Start

1. **Connect GitHub** - Click your avatar (or "Connect GitHub" prompt) → Enter PAT
2. **Initial Sync** - Click the sync button (↻) to push local tasks to GitHub Issues
3. **Work normally** - Changes sync automatically every 5 minutes

## Setup

### Step 1: Generate a GitHub Personal Access Token (PAT)

1. Go to [GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens](https://github.com/settings/tokens?type=beta)
2. Click **"Generate new token"**
3. Configure:
   - **Name**: `Ringmaster`
   - **Expiration**: 90 days (or longer)
   - **Repository access**: Select "Only select repositories" → choose your project repo
   - **Permissions**:
     - **Issues**: Read and write
     - **Metadata**: Read (required)
4. Click **"Generate token"** and copy it

### Step 2: Configure Your Token

You have three options for storing your PAT (in priority order):

#### Option A: Environment Variable (Recommended for developers)

Add to your project's `.env.local` file:

```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_USERNAME=your-username  # optional
```

This survives browser cache clears and is the most robust option.

#### Option B: Config File (Recommended for most users)

1. Open Ringmaster in a GitHub-backed repo
2. You'll see a **"Connect GitHub"** prompt
3. Click **"Set Up"** (or click your avatar → GitHub settings)
4. Paste your PAT token
5. Click **"Connect"**

Token is saved to `~/.ringmaster/config.json` - survives browser cache clears.

#### Option C: Via UI (Legacy)

Same as Option B, but if server-side storage fails, falls back to browser localStorage. This is cleared if you clear browser data.

Ringmaster will verify the token has correct permissions and display your GitHub username. The settings modal shows where your token is stored.

### Step 3: Initial Sync (Local → GitHub)

If you already have local tasks and no GitHub issues:

1. Click the **sync button** (↻) in the header
2. Ringmaster creates GitHub Issues for each task
3. Tasks are tagged with:
   - `ringmaster` - identifies Ringmaster-managed issues
   - `priority:high`, `priority:medium`, etc.
   - `status:backlog`, `status:in-progress`, etc.
   - `effort:low`, `effort:high`, etc.
   - Custom category labels

### Step 4: Ongoing Sync

After initial setup, sync happens automatically:
- **Every 5 minutes** while Ringmaster is open
- **When you return** to the Ringmaster tab
- **When coming back online** after being offline

You can also click the sync button anytime for immediate sync.

## How Sync Works

### Push (Local → GitHub)

When you modify a task locally:
1. Task is marked as "pending sync"
2. Next sync pushes changes to the linked GitHub Issue
3. Issue body, title, labels, and state are updated

### Pull (GitHub → Local)

When someone modifies an issue on GitHub:
1. Ringmaster detects the change via `updated_at` timestamp
2. Local task is updated with GitHub changes
3. New GitHub Issues tagged `ringmaster` are pulled as new tasks

### Conflict Resolution

When both local and remote change the same task:
1. A **conflict modal** appears
2. You see side-by-side comparison of local vs. GitHub versions
3. Choose **"Keep Local"** or **"Keep GitHub"**
4. The chosen version overwrites the other

## Label Schema

Ringmaster creates and manages these labels:

| Label | Description |
|-------|-------------|
| `ringmaster` | Identifies Ringmaster-managed issues |
| `priority:critical` | Critical priority (red) |
| `priority:high` | High priority (orange) |
| `priority:medium` | Medium priority (yellow) |
| `priority:low` | Low priority (green) |
| `priority:someday` | Someday/maybe (light blue) |
| `status:backlog` | In backlog column |
| `status:up-next` | Up next column |
| `status:in-progress` | In progress column |
| `status:review` | In review column |
| `status:ready-to-ship` | Ready to ship column |
| `effort:trivial` | Trivial effort |
| `effort:low` | Low effort |
| `effort:medium` | Medium effort |
| `effort:high` | High effort |
| `effort:very-high` | Very high effort |

Category names become additional labels (e.g., `feature`, `bug`, `docs`).

## Working Offline

1. Make changes normally while offline
2. Tasks are saved locally with "pending" status
3. When you're back online, sync resumes automatically
4. Any conflicts are presented for resolution

## Token Storage

Ringmaster checks for tokens in this order:

| Priority | Location | Survives Cache Clear | Notes |
|----------|----------|---------------------|-------|
| 1 | `.env.local` (GITHUB_TOKEN) | Yes | Best for developers |
| 2 | `~/.ringmaster/config.json` | Yes | Best for most users |
| 3 | Browser localStorage | No | Legacy fallback |

The settings modal shows which source your token is coming from.

## Troubleshooting

### "Token expired" or "Bad credentials"

1. Generate a new PAT (tokens expire based on your settings)
2. Update token based on your storage method:
   - **env var**: Edit `.env.local`, restart server
   - **config file**: Click avatar → GitHub settings → Change token
   - **localStorage**: Click avatar → GitHub settings → update token

### "Resource not accessible by integration"

Your token doesn't have the required permissions:
1. Delete the current token on GitHub
2. Generate a new one with **Issues: Read and write** permission

### Tasks not syncing

1. Check the sync status indicator in the header
2. Click the sync button to force a sync
3. Check browser console for detailed error messages

### Duplicate issues created

This can happen if the initial sync is interrupted. To fix:
1. Delete duplicate issues on GitHub
2. Sync again - Ringmaster will link existing issues by task ID

### Labels not appearing

First sync creates all labels. If missing:
1. They'll be auto-created on next sync
2. Or manually create them on GitHub with the colors from the schema

## Best Practices

1. **Don't edit the hidden comment** - Each issue body contains `<!-- ringmaster-task-id:xxx -->` - don't delete this
2. **Let Ringmaster manage labels** - Avoid manually changing Ringmaster labels
3. **Resolve conflicts promptly** - Don't let conflicts pile up
4. **Use server-side token storage** - Prefer `.env.local` or `~/.ringmaster/config.json` over browser localStorage
5. **Keep tokens secure** - Don't commit `.env.local` to git (it's already in `.gitignore`)

## Known Gaps and Limitations

### GitHub Issues View

| Feature | Status | Notes |
|---------|--------|-------|
| **Delete closes GitHub issues** | ✅ Working | Clicking delete in GitHub view closes the issue on GitHub |
| **Acceptance criteria parsed** | ✅ Working | Parses `- [ ]` and `- [x]` checkboxes from issue body |
| **Value field populated** | ✅ Working | Reads `value:*` labels and displays in dropdown |
| **Status sync (drag-drop)** | ✅ Working | Dragging between columns updates `status:*` labels on GitHub |

### Backlog View

| Gap | Current Behavior | Expected Behavior | Status |
|-----|------------------|-------------------|--------|
| **Delete closes GitHub issue** | ✅ Working - deleting a backlog item with linked GitHub issue closes it | N/A | Implemented |
| **Update syncs to GitHub** | ✅ Working - editing a synced task pushes changes to GitHub | N/A | Implemented |

### Create Flow

| Feature | Status | Notes |
|---------|--------|-------|
| **Create from GitHub view** | ✅ Working | Native task modal with AI assist, creates GitHub issue directly |
| **All metadata transfers** | ✅ Working | Priority, effort, value, category, acceptance criteria all transfer to GitHub |
| **Acceptance criteria as checkboxes** | ✅ Working | Criteria rendered as `- [ ]` checklist in GitHub |
| **Labels auto-created** | ✅ Working | priority:*, effort:*, value:*, category labels all created |

---

## Gap Specifications (Historical)

> **Note:** All gaps below have been implemented. This section is retained for historical reference.

### Gap 1: Parse Acceptance Criteria from GitHub Issue Body ✅ IMPLEMENTED

**Problem Statement:**
When viewing/editing a GitHub issue in Ringmaster, the acceptance criteria section shows "0 criteria" even when the issue body contains `- [ ]` checkbox items. This means users cannot see or interact with acceptance criteria that were either created on GitHub directly or synced from Ringmaster previously.

**Root Cause:**
The `githubIssueToBacklogItem()` function in `GitHubIssuesView.tsx` does not parse the issue body for checkbox patterns. It only extracts the title, body text, and label-based metadata.

**Current Behavior:**
1. Create an issue on GitHub with body containing `- [ ] First criterion`
2. Open that issue in Ringmaster's GitHub view
3. Acceptance criteria shows "0 criteria"
4. The checkboxes are visible in the description but not parsed into the AC field

**Expected Behavior:**
1. When loading a GitHub issue, parse `- [ ]` and `- [x]` patterns from the body
2. Populate the `acceptanceCriteria` array with extracted items
3. Display the correct count (e.g., "3 criteria")
4. Show checked/unchecked state based on `[x]` vs `[ ]`

**Implementation Tasks:**

1. **Create parsing utility function**
   - Location: `src/lib/utils/parse-acceptance-criteria.ts` (new file)
   - Function: `parseAcceptanceCriteriaFromMarkdown(body: string): AcceptanceCriterion[]`
   - Parse `- [ ] text` as unchecked, `- [x] text` as checked
   - Handle nested lists (ignore nesting, flatten)
   - Handle edge cases: empty checkboxes, special characters

2. **Update `githubIssueToBacklogItem()` in `GitHubIssuesView.tsx`**
   - Import the parsing utility
   - Call parser on `issue.body`
   - Merge parsed criteria into the returned `BacklogItem`

3. **Handle the ringmaster metadata comment**
   - The body may contain `<!-- ringmaster-task-id:xxx -->`
   - Ensure parser doesn't treat this as content
   - Consider: criteria may be in a dedicated section like `## Acceptance Criteria`

**Acceptance Criteria:**
- [ ] GitHub issues with `- [ ]` items show correct criteria count in edit panel
- [ ] Checked items (`- [x]`) appear as completed in the UI
- [ ] Unchecked items (`- [ ]`) appear as incomplete
- [ ] Criteria text is correctly extracted (no leading/trailing whitespace)
- [ ] Hidden HTML comments are not parsed as criteria
- [ ] Empty checkboxes (`- [ ]` with no text) are ignored
- [ ] Nested checkbox lists are flattened correctly

**Test & Validation Steps:**

1. **Manual Test - Basic parsing:**
   - Create GitHub issue #497 with body:
     ```
     Description here

     ## Acceptance Criteria
     - [ ] First criterion
     - [x] Second criterion (done)
     - [ ] Third criterion
     ```
   - Open in Ringmaster GitHub view
   - Verify: Shows "3 criteria", 1 checked, 2 unchecked

2. **Manual Test - Edge cases:**
   - Create issue with nested checkboxes, empty checkboxes, special chars
   - Verify parsing handles all cases gracefully

3. **Manual Test - Roundtrip:**
   - Create task in Ringmaster with AC → syncs to GitHub
   - Refresh GitHub view → AC should still show correctly

---

### Gap 2: Populate Value Field from GitHub Labels ✅ IMPLEMENTED

**Problem Statement:**
When opening a GitHub issue that has a `value:high`, `value:medium`, or `value:low` label, the Value dropdown in the edit panel shows "Select..." instead of the correct value. This breaks the visual consistency and requires users to re-select the value.

**Root Cause:**
The `githubIssueToBacklogItem()` function parses `priority:*` and `effort:*` labels but does not parse `value:*` labels.

**Current Behavior:**
1. GitHub issue has label `value:high`
2. Open in Ringmaster GitHub view
3. Value dropdown shows "Select..."
4. Priority and Effort correctly show their values

**Expected Behavior:**
1. Parse `value:high`, `value:medium`, `value:low` labels
2. Map to the `Value` type: `'high' | 'medium' | 'low'`
3. Display correctly in the edit panel dropdown

**Implementation Tasks:**

1. **Update label parsing in `githubIssueToBacklogItem()`**
   - Location: `src/components/views/GitHubIssuesView.tsx` (around line 70-120)
   - Add value label parsing alongside existing priority/effort parsing
   - Map label names to Value type values

**Acceptance Criteria:**
- [ ] Issues with `value:high` label show "High" in dropdown
- [ ] Issues with `value:medium` label show "Medium" in dropdown
- [ ] Issues with `value:low` label show "Low" in dropdown
- [ ] Issues without value labels show "Select..."
- [ ] Value persists after saving changes

**Test & Validation Steps:**

1. **Manual Test - Existing issue:**
   - Find or create GitHub issue with `value:high` label
   - Open in Ringmaster GitHub view
   - Verify: Value dropdown shows "High"

2. **Manual Test - All values:**
   - Test with `value:medium` and `value:low` labels
   - Verify each displays correctly

3. **Manual Test - No value:**
   - Open issue without value label
   - Verify: Shows "Select..." (not broken)

---

### Gap 3: Bidirectional Status Sync in GitHub View ✅ IMPLEMENTED

**Problem Statement:**
When changing a task's status in the GitHub Issues view (e.g., moving from "Backlog" to "In Progress"), the change is only reflected locally in the UI. The corresponding `status:*` label on GitHub is not updated.

**Root Cause:**
The status change handlers in `GitHubIssuesView.tsx` only update local state. There's no call to the GitHub API to update labels when status changes.

**Current Behavior:**
1. Open issue in GitHub view, currently in "Backlog" column
2. Click "In Progress" status button
3. UI updates, issue moves to In Progress column
4. GitHub still has `status:backlog` label (not `status:in-progress`)
5. On refresh, issue snaps back to Backlog

**Expected Behavior:**
1. Change status in UI
2. API call removes old `status:*` label
3. API call adds new `status:*` label
4. GitHub issue reflects the change
5. On refresh, issue stays in correct column

**Implementation Tasks:**

1. **Create status update API route**
   - Location: `src/app/api/github/update-status/route.ts` (new file)
   - Accepts: `{ repo, issueNumber, oldStatus, newStatus }`
   - Removes old `status:*` label, adds new `status:*` label
   - Uses server-side token resolution (like close-issue route)

2. **Update status change handlers in `GitHubIssuesView.tsx`**
   - After local state update, call the new API route
   - Handle loading state (show spinner on card while updating)
   - Handle errors (revert local state on failure, show toast)

3. **Handle drag-and-drop status changes**
   - The kanban drag handler should also trigger the API call
   - Ensure `handleDragEnd` calls the status update API

**Acceptance Criteria:**
- [ ] Clicking status button updates GitHub label
- [ ] Dragging card between columns updates GitHub label
- [ ] Old status label is removed (not accumulated)
- [ ] Loading indicator shown during update
- [ ] Error toast shown if update fails
- [ ] Local state reverts on API failure
- [ ] Refresh shows issue in correct column

**Test & Validation Steps:**

1. **Manual Test - Button click:**
   - Open issue currently in Backlog
   - Click "In Progress" status button
   - Verify: GitHub issue now has `status:in-progress` label (not `status:backlog`)

2. **Manual Test - Drag and drop:**
   - Drag issue from "Up Next" to "Review" column
   - Verify: GitHub labels updated accordingly

3. **Manual Test - Error handling:**
   - Disconnect network, try to change status
   - Verify: Error toast appears, issue stays in original column

4. **Manual Test - Persistence:**
   - Change status, click Refresh button
   - Verify: Issue remains in new column

---

## Data Flow

```
┌─────────────────┐         ┌─────────────────┐
│  Local Storage  │◄───────►│  GitHub Issues  │
│   (IndexedDB)   │   Sync  │                 │
└─────────────────┘         └─────────────────┘
        ▲                           ▲
        │                           │
        │    ┌─────────────────┐    │
        └────│   Ringmaster    │────┘
             │  (Next.js App)  │
             └────────┬────────┘
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
    .env.local   ~/.ringmaster   Browser
    (GITHUB_     /config.json   localStorage
     TOKEN)                      (fallback)
```

- **Local-first**: All operations work offline
- **Bidirectional**: Changes flow both ways
- **Conflict-aware**: Detects and presents conflicts for resolution
- **Server-side config**: PAT stored securely outside browser
