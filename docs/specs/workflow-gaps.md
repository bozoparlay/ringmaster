# Ringmaster Workflow Gaps & Improvements Spec

**Date**: 2026-01-13
**Test Task**: Add favicon (ID: 354819bc)
**Status**: Workflow completed with multiple gaps identified

---

## Executive Summary

Tested the complete backlog-to-merge workflow using the "Add favicon" task as a guinea pig. The workflow fundamentally works but has critical gaps around **commit timing** and **git state visibility** that cause downstream failures (no PR created, review doesn't see changes).

---

## Gaps Identified (Priority Order)

### CRITICAL

#### GAP #9: Review Doesn't Detect Uncommitted Changes
**Severity**: Critical
**Impact**: Review passes incorrectly, no PR created, false sense of completion

**Current Behavior**:
- Review API compares `git diff main...task-branch`
- If changes are uncommitted, diff is empty
- Review returns "No changes detected" and passes
- PR auto-creation is skipped because diff was empty

**Root Cause**: The workflow allows moving to Review without committing first. The review API assumes changes are committed.

**Fix Options**:
1. **Enforce commit before review** - When clicking "Submit for Review", first commit all changes in worktree
2. **Review uncommitted changes** - Change review to use `git diff HEAD` to see working tree changes
3. **Block review if uncommitted** - Check for uncommitted changes and warn user to commit first

**Recommended**: Option 1 - Auto-commit before review with generated message

---

#### GAP #11: Stage/Git State Mismatch
**Severity**: Critical
**Impact**: Confusing UX, user thinks they're further along than they are

**Current Behavior**:
- Task moves to "Ready to Ship" before changes are committed
- "Commit & Push" button appears AFTER reaching "Ready to Ship"
- User expects "Ready to Ship" means PR is ready for merge

**Expected Behavior**:
- Git state should match workflow stage
- "Ready to Ship" should mean PR exists and is mergeable

**Fix**: Restructure workflow so commit happens during review phase, not ship phase

---

### HIGH

#### GAP #8: No Guidance on When to Commit
**Severity**: High
**Impact**: Users don't know when to commit, leading to empty reviews

**Current Behavior**: No indication that changes need to be committed before review

**Fix**:
- Add "Commit Changes" button in task panel for in_progress tasks
- Show uncommitted file count in task panel
- Add warning when submitting for review with uncommitted changes

---

#### GAP #12: Shell Session Breaks After Ship
**Severity**: High
**Impact**: Developer tooling breaks, can't run git commands

**Current Behavior**:
- Ship operation deletes worktree
- If Claude Code's bash session was in the worktree, session breaks completely
- Even `echo "test"` fails with exit code 1

**Fix**:
- Ship API should not delete worktree directory while it might be in use
- Consider async cleanup or user-triggered cleanup
- At minimum, change to worktree's parent directory before deletion

---

#### GAP #6: No Re-open IDE Button
**Severity**: High
**Impact**: If user closes IDE, no way to reopen at worktree from UI

**Current Behavior**: After "Start Working", "Tackle" button disappears. No way to reopen IDE.

**Fix**: Add "Open in IDE" button for in_progress tasks that have worktree

---

### MEDIUM

#### GAP #3: Branch Name Not Shown Before Creation
**Severity**: Medium
**Impact**: User doesn't know what branch will be created

**Current Behavior**: Tackle modal shows "Branch: Auto-generated on launch"

**Fix**: Show actual branch name that will be created (e.g., `task/354819bc-add-favicon`)

---

#### GAP #4: No "Start Without IDE" Option
**Severity**: Medium
**Impact**: Users who work in terminal only must close unwanted IDE

**Current Behavior**: Must click "Open in VS Code" - no way to just create worktree

**Fix**: Add "Create Worktree Only" option that creates worktree without opening IDE

---

#### GAP #5: Unclear Success Feedback
**Severity**: Medium
**Impact**: User unsure if operation succeeded

**Current Behavior**: Toast says "Worktree already exists" but doesn't confirm if IDE opened

**Fix**: More specific toasts: "Worktree created, opening VS Code..." → "VS Code opened successfully"

---

#### GAP #10: Status Updates Before Operation Completes
**Severity**: Medium
**Impact**: If operation fails, task is in wrong column

**Current Behavior**: Task moves to Review column immediately when clicking "Submit for Review", before review actually runs

**Fix**: Show loading state, only move after review API returns success

---

### LOW

#### GAP #1: File Selector Button Text Misleading
**Severity**: Low
**Impact**: Minor confusion

**Current Behavior**: Shows "No file loaded" even when file path is configured but not yet loaded

**Fix**: Show actual state - "Click to load" or show the configured path

---

#### GAP #2: Low Quality Tasks Can Start Work
**Severity**: Low
**Impact**: Poor task definitions get worked on

**Current Behavior**: No gate preventing starting work on 15/100 quality task

**Fix**: Optional - warn when starting work on tasks below quality threshold

---

#### GAP #7: Orphaned Worktree Directories
**Severity**: Low
**Impact**: Disk space waste

**Current Behavior**: Old worktree directories (task-4b99d7e3, task-515b06ae) remain with .next caches

**Fix**: Cleanup job or manual cleanup command for orphaned worktrees

---

#### GAP #13: Old Worktrees Not Fully Cleaned
**Severity**: Low
**Impact**: Disk space waste, confusion

**Current Behavior**: Worktree removed from git but directory may contain build artifacts

**Fix**: Ensure full directory deletion including .next, node_modules, etc.

---

#### GAP #14: Ship Doesn't Create PR (Downstream of GAP #9)
**Severity**: Low (fixed by fixing #9)
**Impact**: User must manually create PR

**Note**: This is a symptom of GAP #9. Review API auto-creates PR when diff exists and review passes. Empty diff = no PR.

---

## Recommended Fix Order

1. **GAP #9** - Fix review to handle uncommitted changes (Critical)
2. **GAP #11** - Align stages with git state (Critical)
3. **GAP #8** - Add commit guidance/button (High)
4. **GAP #12** - Fix shell session breaking (High)
5. **GAP #6** - Add re-open IDE button (High)
6. Remaining gaps in priority order

---

## Workflow After Fixes

```
Backlog → Start Working → [Creates worktree, opens IDE]
                           ↓
                    In Progress → [User works, sees uncommitted count]
                           ↓
                    "Commit & Review" button → [Commits changes, runs review]
                           ↓
                    Review → [Shows review results, auto-creates PR]
                           ↓
                    Ready to Ship → [PR exists, task shows PR link]
                           ↓
                    "Merge" button → [Merges PR, cleans up worktree]
                           ↓
                    Done (removed from board)
```

---

## Test Notes

- **Favicon task**: Branch `task/354819bc-add-favicon` was pushed but no PR created due to GAP #9
- **Files created**: `src/app/icon.tsx`, `src/app/apple-icon.tsx`
- **Manual cleanup needed**: Create PR and merge, or delete branch

---

## Implementation Status (2026-01-13)

### FIXED ✅

| Gap | Fix Description | Files Changed |
|-----|-----------------|---------------|
| **#9** | Review API auto-commits uncommitted changes before reviewing | `src/app/api/review-task/route.ts` |
| **#11** | Button renamed to "Commit & Review", removed premature status change | `src/components/TaskPanel.tsx` |
| **#8** | Added guidance text below "Commit & Review" button | `src/components/TaskPanel.tsx` |
| **#12** | Ship API now defers worktree cleanup by default | `src/app/api/ship-task/route.ts` |
| **#6** | Added "Open in IDE" button for in_progress tasks | `src/components/TaskPanel.tsx` |
| **#15** | Ship API now merges PR via `gh pr merge` before completing | `src/app/api/ship-task/route.ts` |

### REMAINING (Lower Priority)

| Gap | Description | Status |
|-----|-------------|--------|
| **#3** | Branch name not shown before creation | Not fixed |
| **#4** | No "Start Without IDE" option | Not fixed |
| **#5** | Unclear success feedback | Not fixed |
| **#10** | Status updates before operation completes | Partially fixed (review flow improved) |
| **#1** | File selector button text misleading | Not fixed |
| **#2** | Low quality tasks can start work | Not fixed |
| **#7** | Orphaned worktree directories | Not fixed |
| **#13** | Old worktrees not fully cleaned | Not fixed |

---

## Iteration 2: Test Results (2026-01-13)

**Test Task**: Improve Needs Rescope Indicator (ID: 248b5807)
**Test Method**: Playwright MCP browser automation + manual observation
**Server**: Port 3001 (dev server)

### Fixes Verified Working ✅

| Gap | Test Result | Evidence |
|-----|-------------|----------|
| **#9** | ✅ **WORKING** | Uncommitted changes (1 file) were auto-committed with "WIP:" prefix, pushed to remote, review ran on actual diff |
| **#11** | ✅ **WORKING** | Button shows "Commit & Review", status doesn't change until review completes |
| **#8** | ✅ **WORKING** | Guidance text visible: "Auto-commits changes, pushes to remote, runs AI review, and creates PR" |
| **#12** | ✅ **WORKING** | Worktree `.tasks/task-248b5807` still exists after ship - not deleted |
| **#6** | ✅ **WORKING** | "Open in IDE" button visible in In Progress state |

### PR Created Successfully

- **PR #490**: https://github.com/bozoparlay/ringmaster/pull/490
- Review result: **PASSED** with 2 minor issues
- Scope analysis: **Complete** - "Implementation aligns well with task requirements"

### New Gaps Discovered

#### GAP #15: "Merge & Ship" Doesn't Actually Merge PR
**Severity**: CRITICAL
**Impact**: PR remains open, user thinks task is shipped but code not merged

**Current Behavior**:
- Clicking "Merge & Ship" removes task from board
- PR remains in OPEN state (not merged)
- User believes task is complete but PR is still pending

**Evidence**: PR #490 state is "OPEN" after clicking "Merge & Ship"

**Fix**: Ship API should call GitHub API or `gh pr merge` to actually merge the PR

---

#### GAP #16: Storage Mode Friction on Fresh Load
**Severity**: Medium
**Impact**: User must manually configure storage on each session

**Current Behavior**:
- App starts in "Local Storage" mode
- User must click storage selector → BACKLOG.md File → enter path → Open
- 4 clicks + typing path to load backlog

**Fix**: Persist storage mode preference in localStorage, auto-load last used file

---

#### GAP #17: Toast Message "Worktree already exists" is Confusing
**Severity**: Low
**Impact**: User unsure if operation succeeded

**Current Behavior**: When worktree exists, toast says "Worktree already exists"

**Expected**: Should say "Opening existing worktree..." or "Opened worktree at .tasks/task-248b5807"

---

#### GAP #18: No "Open in IDE" in Ready to Ship State
**Severity**: Medium
**Impact**: Can't make last-minute fixes before merge

**Current Behavior**: Ready to Ship panel shows only "Merge & Ship" button, no way to re-open IDE

**Expected**: Should have "Open in IDE" for last-minute fixes (if worktree still exists)

---

#### GAP #3 Still Exists: Branch Name Not Shown
**Severity**: Medium

**Test Observation**: Start Working modal still shows "Branch: Auto-generated on launch" instead of actual branch name `task/248b5807-improve-needs-rescope-indicator`

---

### Iteration 2 Summary

**Critical Fixes Applied**: GAPs #9, #11, #8, #12, #6 all verified working

**New Critical Issue Found**: GAP #15 - Ship doesn't merge PR

**Workflow Completeness** (at end of Iteration 2):
```
Backlog → Start Working  ✅ Working
In Progress → Commit & Review  ✅ Working (auto-commits, pushes, reviews, creates PR)
Review → Ready to Ship  ✅ Working (via modal "Move to Ready to Ship")
Ready to Ship → Ship  ⚠️ PARTIAL (removes from board but doesn't merge PR)
```

---

## Iteration 3: GAP #15 Fix (2026-01-14)

**Fix Applied**: Ship API now merges PR via `gh pr merge --squash --delete-branch`

**Files Changed**: `src/app/api/ship-task/route.ts`

**Changes**:
1. Added `mergePR()` helper function that uses `gh pr view` to check mergeable state
2. Added `skipMerge` and `prNumber` parameters for flexibility
3. Ship flow now: commit → push → **merge PR** → worktree cleanup (deferred)
4. Returns `merged: true/false` and `mergeInfo` in response

**Test**: PR #490 manually merged to verify guinea pig task changes are in main ✓

**Workflow Completeness** (after Iteration 3):
```
Backlog → Start Working  ✅ Working
In Progress → Commit & Review  ✅ Working (auto-commits, pushes, reviews, creates PR)
Review → Ready to Ship  ✅ Working (via modal "Move to Ready to Ship")
Ready to Ship → Ship  ✅ WORKING (merges PR, removes from board)
```

---

## Next Steps

1. ~~Create task for "Fix commit timing in workflow" addressing GAPs #9, #11, #8~~ ✅ Done
2. ~~Create task for "Add IDE/worktree management" addressing GAPs #6, #4, #12~~ ✅ Partially done (#6, #12 fixed)
3. ~~**CRITICAL**: Fix GAP #15 - Ship should actually merge the PR~~ ✅ Done
4. Create task for "Cleanup improvements" addressing GAPs #7, #13
5. Address remaining UX gaps (#16, #17, #18, #3)
