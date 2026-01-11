# Backlog Storage Validation - Ralph Loop Command

Copy and paste this command to start the validation workflow:

---

```
/ralph-loop

## Context

You are a senior engineer completing the **Backlog Management Feature** for Ringmaster. The implementation (Phases 0-4) is substantially complete with uncommitted WIP changes on `main`. Your job is to **validate, commit incrementally, and merge to main**.

## Current State

- **Branch**: `main` (with uncommitted WIP changes)
- **Dev Server**: Should be running on port 3000 (run `npm run dev` if not)
- **TypeScript**: Compiles cleanly
- **Spec**: `docs/specs/backlog-management.md` (read the "Implementation Status & Remaining Work" section starting at line 1043)

## Your Mission

1. **Create feature branch** and make initial commit with all WIP changes
2. **Validate each step** using Playwright MCP tools (browser_navigate, browser_snapshot, browser_click, browser_type)
3. **Commit after each validated step** with descriptive messages
4. **Merge to main** when all validation passes
5. **Push to origin**

## Validation Steps (from spec)

Execute these in order, committing after each:

| Step | What to Validate | Key Playwright Actions |
|------|------------------|------------------------|
| 1 | Storage mode switching (File ↔ Local ↔ GitHub) | Navigate, click dropdown, verify UI updates |
| 2 | Local Storage CRUD | Create task, update, delete, verify persistence |
| 3 | GitHub sync config | Switch to GitHub mode, configure token/repo, test sync button |
| 4 | GitHub pull & conflicts | Modify issue on GitHub, sync, verify conflict modal |
| 5 | Workflow integration | Verify GitHub link in TaskPanel, test Tackle updates labels |
| 6 | Migration wizard | Test BACKLOG.md import flow |
| 7 | Final integration | End-to-end fresh start test |

## Git Workflow

```bash
# Start
git checkout -b feature/backlog-storage-validation
git add -A
git commit -m "feat(storage): implement local-first storage with GitHub sync

- Add TaskStorageProvider interface and factory pattern
- Implement LocalStorageTaskStore and FileBacklogTaskStore
- Add GitHubSyncService with push/pull/conflict detection
- Create StorageModeSelector, GitHubSettingsModal, SyncConflictModal
- Add MigrationWizard for BACKLOG.md import
- Integrate GitHub Issue sync into workflow (Tackle/Ship)
- Add sync status indicators to TaskCard and TaskPanel

Phases 0-4 substantially complete, pending validation."
git push -u origin feature/backlog-storage-validation

# After each validated step
git add -A
git commit -m "<appropriate message per spec>"

# Final merge
git checkout main
git merge feature/backlog-storage-validation --no-ff
git push origin main
```

## Testing Approach

Use Playwright MCP tools for validation:

1. `mcp__playwright__browser_navigate` - Load the app at http://localhost:3000
2. `mcp__playwright__browser_snapshot` - Capture accessibility tree to find element refs
3. `mcp__playwright__browser_click` - Interact with buttons/dropdowns
4. `mcp__playwright__browser_type` - Fill form fields
5. `mcp__playwright__browser_take_screenshot` - Capture evidence
6. `mcp__playwright__browser_evaluate` - Run JS (e.g., clear localStorage)

## Success Criteria

- [ ] All 7 validation steps pass
- [ ] Incremental commits for each step
- [ ] Merged to main
- [ ] Pushed to origin
- [ ] `npm run dev` starts without errors
- [ ] `npx tsc --noEmit` passes
- [ ] Health endpoint returns healthy

## Important Notes

- Read the full spec at `docs/specs/backlog-management.md` for detailed test procedures
- GitHub sync tests require a test repo and PAT - skip if not available, note in commit
- Focus on validating the UI flows work correctly
- If you find bugs, fix them and include in the relevant commit
- The goal is a clean merge to main with verified functionality
```

---

## Usage

In your next Claude Code session, paste the command above (everything between the triple backticks) after running `/ralph-loop`.

The ralph loop will autonomously:
1. Read the spec for detailed instructions
2. Execute each validation step
3. Commit incrementally
4. Complete the merge to main
