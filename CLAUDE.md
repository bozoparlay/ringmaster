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

## Server Health & Debugging

### Health Endpoint

Check if the server is responsive:
```bash
curl http://localhost:3000/api/health
```

Returns:
```json
{
  "status": "healthy",
  "timestamp": 1234567890,
  "uptime": 12345,
  "circuits": [
    { "name": "bedrock-api", "isOpen": false, "failures": 0 },
    { "name": "git-operations", "isOpen": false, "failures": 0 }
  ]
}
```

Status values:
- `healthy` - All systems operational
- `degraded` - Some circuit breakers are open (AI features may be unavailable)
- `unhealthy` - Server is not responding properly

### Circuit Breakers

The app uses circuit breakers to prevent cascading failures:

| Circuit | Opens After | Resets After | Affects |
|---------|-------------|--------------|---------|
| `bedrock-api` | 3 failures | 30 seconds | AI task analysis |
| `git-operations` | 5 failures | 60 seconds | Worktree creation |

When a circuit is open, operations fail fast instead of hanging.

### Timeouts

All external operations have timeouts to prevent hung processes:

| Operation | Timeout |
|-----------|---------|
| Bedrock API calls | 30s |
| Git commands | 15s |
| Worktree creation | 30s |
| VS Code/clipboard | 5s |

## Resilience Library

When adding new API routes that call external services, use the utilities in `src/lib/resilience.ts`:

```typescript
import { withTimeout, execWithTimeout, bedrockCircuitBreaker } from '@/lib/resilience';

// Wrap async operations with timeout
const result = await withTimeout(
  someAsyncOperation(),
  10000, // 10 second timeout
  'Operation name'
);

// Execute shell commands with timeout
const { stdout } = await execWithTimeout(
  'git status',
  { cwd: '/path/to/repo' },
  15000 // 15 second timeout
);

// Use circuit breaker for external APIs
const response = await bedrockCircuitBreaker.execute(async () => {
  return await callExternalApi();
});
```
