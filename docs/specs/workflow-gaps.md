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

## Next Steps

1. Create task for "Fix commit timing in workflow" addressing GAPs #9, #11, #8
2. Create task for "Add IDE/worktree management" addressing GAPs #6, #4, #12
3. Create task for "Cleanup improvements" addressing GAPs #7, #13
4. Test workflow again with fixes applied
