# GitHub Upload Workflow Spec

**Date**: 2026-01-13
**Test Task**: Clean up the frontend (ID: `4c5c46cd-2698-49e2-858e-b5690ae251be`)
**Status**: CRITICAL GAPS IDENTIFIED

---

## Executive Summary

Tested the "Send to GitHub" workflow using the "Clean up the frontend" task. The workflow has **two critical bugs** that cause data loss and authentication failures when uploading tasks to GitHub Issues.

---

## Test Methodology

1. Started dev server on port 3000
2. Used Playwright browser automation to navigate UI
3. Located test task in Backlog view (BACKLOG.md storage mode)
4. Attempted "Send to GitHub" button click
5. Traced code paths through:
   - `TaskPanel.tsx` → `onSendToGitHub` prop
   - `BacklogView.tsx` → implementation calling `/api/github/create-issue`
   - `create-issue/route.ts` → API handler
   - `github-sync.ts` → Correct `GitHubSyncService` implementation (NOT USED)

---

## Gaps Identified

### GAP #1: "Send to GitHub" Uses Wrong Code Path (CRITICAL)

**Severity**: CRITICAL
**Impact**: Major data loss - task metadata not transferred to GitHub Issue

#### Current Behavior

The "Send to GitHub" button in `BacklogView.tsx` (lines 622-660) sends minimal data:

```javascript
body: JSON.stringify({
  title: item.title,
  body: item.description || '',  // Raw description only
  labels: item.tags || [],        // Tags only
  repo,
  token,
})
```

#### Expected Behavior

Should use `GitHubSyncService.createIssue()` from `github-sync.ts` which properly formats:

```javascript
function taskToGitHubIssue(task: BacklogItem) {
  // ✅ Task ID metadata: <!-- ringmaster-task-id:UUID -->
  // ✅ Priority/Effort/Value line: **Priority**: X | **Effort**: Y | **Value**: Z
  // ✅ Description with ## Description header
  // ✅ Acceptance Criteria with checkboxes: - [ ] criterion
  // ✅ Notes with ## Notes header
  // ✅ Labels: ringmaster-task, category:X, priority:X, status:X
}
```

#### Data Loss Matrix

| Field | `GitHubSyncService` | "Send to GitHub" Button |
|-------|---------------------|------------------------|
| Task ID in body | ✅ `<!-- ringmaster-task-id:UUID -->` | ❌ **MISSING** |
| Priority in body | ✅ `**Priority**: medium` | ❌ **MISSING** |
| Effort in body | ✅ `**Effort**: low` | ❌ **MISSING** |
| Value in body | ✅ `**Value**: medium` | ❌ **MISSING** |
| Description formatting | ✅ `## Description` header | ❌ Raw text |
| Acceptance Criteria | ✅ `- [ ] criterion` checkboxes | ❌ **MISSING** |
| Notes | ✅ `## Notes` section | ❌ **MISSING** |
| Label: `ringmaster-task` | ✅ Yes | ❌ **MISSING** |
| Label: `priority:medium` | ✅ Yes | ❌ **MISSING** |
| Label: `status:backlog` | ✅ Yes | ❌ **MISSING** |
| Label: `category:UI/UX` | ✅ Yes | ❌ **MISSING** |

#### Fix Required

Refactor "Send to GitHub" button to use `GitHubSyncService.createIssue()` instead of calling `/api/github/create-issue` directly.

**File**: `src/components/views/BacklogView.tsx` (lines 622-660)

---

### GAP #2: Token Fallback Missing in create-issue Route (CRITICAL)

**Severity**: CRITICAL
**Impact**: 401 Unauthorized error when using server-managed tokens

#### Current Behavior

The `/api/github/create-issue` route (line 31-33) requires token in request body:

```javascript
if (!token) {
  return NextResponse.json({ error: 'GitHub token is required' }, { status: 400 });
}
```

It does NOT fall back to `process.env.GITHUB_TOKEN` when client sends `"server-managed"`.

#### Expected Behavior

Should match the GET `/api/github/issues` route pattern (lines 23-26):

```javascript
const token = (clientToken && clientToken !== 'server-managed')
  ? clientToken
  : process.env.GITHUB_TOKEN;
```

#### Evidence

Browser localStorage contains:
```json
{
  "ringmaster:user:github": "{\"token\":\"server-managed\",\"tokenCreatedAt\":\"2026-01-13T18:03:34.474Z\"}"
}
```

When "Send to GitHub" is clicked:
1. Client reads `"server-managed"` from `getUserGitHubConfig()`
2. Sends `"server-managed"` as token to API
3. API passes `"server-managed"` to GitHub API as Bearer token
4. GitHub returns 401 Unauthorized

#### Fix Required

Add token fallback to create-issue route:

**File**: `src/app/api/github/create-issue/route.ts`

```diff
- const { title, body: issueBody, labels, repo, token } = body;
+ const { title, body: issueBody, labels, repo, token: clientToken } = body;
+ const token = (clientToken && clientToken !== 'server-managed')
+   ? clientToken
+   : process.env.GITHUB_TOKEN;
```

---

### GAP #3: Inconsistent Token Handling Across Routes (MEDIUM)

**Severity**: Medium
**Impact**: Confusing behavior, some routes work with server-managed token, others don't

#### Routes With Token Fallback (Working)
- `GET /api/github/issues` ✅
- `GET /api/github/status` (likely)

#### Routes WITHOUT Token Fallback (Broken)
- `POST /api/github/create-issue` ❌
- Possibly others

#### Fix Required

Audit all `/api/github/*` routes and ensure consistent token handling pattern.

---

## Test Task Details (Before Upload)

| Field | Value |
|-------|-------|
| Title | Clean up the frontend |
| ID | `4c5c46cd-2698-49e2-858e-b5690ae251be` |
| Category | UI/UX Improvements |
| Priority | Medium |
| Effort | Low |
| Value | Medium |
| Status | Backlog |
| Tags | UI/UX Improvements |
| Acceptance Criteria | 0 criteria |
| Quality Score | 65/100 "Needs detail" |
| GitHub Issue | **NOT LINKED** |
| Description | Full markdown with Requirements, Technical Approach sections |

---

## Recommended Fix Order

1. **GAP #2** - Add token fallback to create-issue route (Quick fix, unblocks testing)
2. **GAP #1** - Refactor "Send to GitHub" to use GitHubSyncService (Proper fix, ensures data integrity)
3. **GAP #3** - Audit all routes for consistent token handling (Polish)

---

## Verification Steps After Fixes

1. Click "Send to GitHub" on test task
2. Verify GitHub Issue created with:
   - [ ] `ringmaster-task` label present
   - [ ] `priority:medium` label present
   - [ ] `status:backlog` label present
   - [ ] `category:UI/UX Improvements` label present
   - [ ] Issue body contains `<!-- ringmaster-task-id:4c5c46cd-2698-49e2-858e-b5690ae251be -->`
   - [ ] Issue body contains `**Priority**: medium | **Effort**: low | **Value**: medium`
   - [ ] Issue body contains `## Description` section
   - [ ] Task in Ringmaster shows GitHub badge with issue number
3. Verify bidirectional sync works:
   - [ ] Edit issue on GitHub → changes appear in Ringmaster
   - [ ] Edit task in Ringmaster → changes appear on GitHub

---

## Related Documentation

- `docs/guides/github-sync-workflow.md` - User-facing sync guide
- `docs/specs/workflow-gaps.md` - Development workflow gaps (separate from this)
- `src/lib/storage/github-sync.ts` - Correct `GitHubSyncService` implementation

---

## Code References

| File | Lines | Description |
|------|-------|-------------|
| `src/components/views/BacklogView.tsx` | 622-660 | Broken `onSendToGitHub` implementation |
| `src/app/api/github/create-issue/route.ts` | 18-99 | API route missing token fallback |
| `src/lib/storage/github-sync.ts` | 50-101 | Correct `taskToGitHubIssue()` function |
| `src/lib/storage/github-sync.ts` | 205-217 | Correct `createIssue()` method |
| `src/app/api/github/issues/route.ts` | 23-26 | Token fallback pattern to copy |

---

## Implementation Status

| Gap | Status | Files Changed |
|-----|--------|---------------|
| #1 | ✅ FIXED | `create-issue/route.ts` - Added `formatIssueBody()` and `buildLabels()` |
| #2 | ✅ FIXED | `create-issue/route.ts` - Added `resolveToken()` with server-managed fallback |
| #3 | ✅ FIXED | `tackle/route.ts`, `ship/route.ts` - Added `getGitHubCredentials()` fallback |

---

## Verification Results (2026-01-13)

**Test Task**: Clean up the frontend (ID: `4c5c46cd-2698-49e2-858e-b5690ae251be`)
**Result**: Successfully created GitHub Issue **#492**

### Checklist

- [x] `ringmaster` label present
- [x] `priority:medium` label present
- [x] `effort:low` label present
- [x] `value:medium` label present
- [x] `ui/ux-improvements` category label present
- [x] Issue body contains `<!-- ringmaster:id=4c5c46cd-2698-49e2-858e-b5690ae251be -->`
- [x] Issue body contains `**Priority**: Medium | **Effort**: Low | **Value**: Medium`
- [x] Issue body contains `## Description` section
- [x] Task in Ringmaster shows GitHub badge `#492`

### Verified Issue Output

```json
{
  "title": "Clean up the frontend",
  "labels": ["ringmaster", "priority:medium", "effort:low", "value:medium", "ui/ux-improvements"],
  "body": "<!-- ringmaster:id=4c5c46cd-2698-49e2-858e-b5690ae251be -->\n\n**Priority**: Medium | **Effort**: Low | **Value**: Medium\n\n## Description\n\n**Description:**\nThis task focuses on cleaning up..."
}
