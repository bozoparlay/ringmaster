# Ringmaster - Claude Code Guidelines

## Task Worktree Testing

When working on tasks in worktrees (`.tasks/task-*`), always run the dev server on a separate port to avoid conflicts with the main branch:

```bash
npm run dev -- -p 3001
```

Port assignments:
- **Port 3000**: Main branch / production testing
- **Port 3001+**: Task worktrees (increment for multiple concurrent tasks)

This ensures you can compare changes side-by-side and avoid confusion about which version you're viewing.
