# VK-Inspired Execution Layer Specification

> **Status**: ✅ IMPLEMENTED
> **Author**: Auto-generated from Vibe-Kanban analysis
> **Date**: 2026-01-15
> **Implementation Date**: 2026-01-15

## Implementation Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: SQLite Foundation | ✅ Complete | Drizzle ORM + better-sqlite3 installed, schema created, auto-init on first API call |
| Phase 2: Execution Logging | ✅ Complete | API endpoints working, tackle-task integration complete |
| Phase 3: Session Continuity | ✅ Complete | Continue endpoint, SessionContinuityPanel component, useTaskSession hook |
| Phase 4: Workspace Cleanup | ✅ Complete | Workspaces API, cleanup endpoint with safety checks |

### Files Created

**Database Layer:**
- `src/lib/db/schema.ts` - Drizzle schema (executions, execution_logs, workspaces tables)
- `src/lib/db/index.ts` - Database client with auto-init
- `src/lib/db/executions.ts` - CRUD operations for executions
- `src/lib/db/workspaces.ts` - CRUD operations for workspaces
- `drizzle.config.ts` - Drizzle configuration

**API Routes:**
- `src/app/api/executions/route.ts` - List/create executions
- `src/app/api/executions/[id]/route.ts` - Get/update single execution
- `src/app/api/executions/[id]/stream/route.ts` - SSE log streaming
- `src/app/api/executions/continue/route.ts` - Continue with session
- `src/app/api/workspaces/route.ts` - List/create workspaces
- `src/app/api/workspaces/cleanup/route.ts` - Cleanup eligible workspaces

**UI Components:**
- `src/components/SessionContinuityPanel.tsx` - Continue button and follow-up input
- `src/hooks/useTaskSession.ts` - Hook to fetch task session data

**Modified Files:**
- `src/app/api/tackle-task/route.ts` - Integrated execution tracking and workspace recording
- `src/components/TaskPanel.tsx` - Added SessionContinuityPanel, onContinue prop, taskSource prop

---

## Executive Summary

### Problem Statement

Ringmaster currently has three critical gaps in its AI agent orchestration:

1. **No Execution History** - When Claude Code finishes, all context is lost. Users can't see what the agent did or debug failures.

2. **No Session Continuity** - Each "Tackle" starts fresh. Users can't continue where they left off or send follow-up instructions without losing context.

3. **Worktree Sprawl** - Git worktrees accumulate in `.tasks/` with no automatic cleanup, consuming disk space indefinitely.

### Solution

Add a **SQLite execution layer** that stores execution context for any task, regardless of its source (BACKLOG.md, GitHub Issues, or Quick Tasks). This preserves the existing "Lanes, not sync" architecture while enabling:

- Real-time execution streaming and history
- Session continuity via Claude Code's `--resume` flag
- Intelligent workspace cleanup based on task status and age

### Non-Goals

- **NOT replacing task storage** - Tasks remain in their current sources
- **NOT adding multi-agent support yet** - Deferred to future work
- **NOT changing the UI architecture** - Additive features only

---

## Architecture

### Current State

```
┌─────────────────────────────────────────────────────────────────┐
│                    Task Sources (Independent Lanes)              │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  BACKLOG.md     │  GitHub Issues  │  Quick Tasks                │
│  (file-based)   │  (API)          │  (localStorage)             │
│                 │                 │                             │
│  BacklogView    │  GitHubView     │  QuickTasksView             │
└─────────────────┴─────────────────┴─────────────────────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ tackle-task │ ──→ (fire and forget, no history)
                    └─────────────┘
```

### Proposed State

```
┌─────────────────────────────────────────────────────────────────┐
│                    Task Sources (Unchanged)                      │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  BACKLOG.md     │  GitHub Issues  │  Quick Tasks                │
│  (file-based)   │  (API)          │  (localStorage)             │
└────────┬────────┴────────┬────────┴────────┬────────────────────┘
         │                 │                 │
         └────────────────┬┴─────────────────┘
                          │
                          │ (task_source, task_id)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│               SQLite Execution Layer (NEW)                       │
│               .ringmaster/ringmaster.db                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐   ┌─────────────────┐   ┌──────────────────┐  │
│  │ executions  │   │ execution_logs  │   │   workspaces     │  │
│  │             │   │                 │   │                  │  │
│  │ session_id  │──▶│ stdout/stderr   │   │ worktree_path    │  │
│  │ status      │   │ chunks          │   │ touched_at       │  │
│  │ exit_code   │   │ timestamps      │   │ cleanup_policy   │  │
│  └─────────────┘   └─────────────────┘   └──────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Composite Key for Tasks**: `(task_source, task_id)` links executions to tasks from any source
2. **Append-Only Logs**: Execution logs are chunked and append-only for streaming
3. **Soft Cleanup**: Workspaces are tracked separately from tasks for cleanup policies
4. **Database Location**: `.ringmaster/ringmaster.db` (gitignored)

---

## Database Schema

### Table: `executions`

Links execution runs to tasks from any source.

```sql
CREATE TABLE executions (
  id TEXT PRIMARY KEY,                    -- UUID

  -- Task reference (composite key into any source)
  task_source TEXT NOT NULL,              -- 'file' | 'github' | 'quick'
  task_id TEXT NOT NULL,                  -- ID within that source
  task_title TEXT,                        -- Cached for display

  -- Agent session tracking
  agent_session_id TEXT,                  -- Claude's session ID for --resume
  prompt TEXT,                            -- The prompt sent to the agent

  -- Execution state
  status TEXT NOT NULL DEFAULT 'running', -- 'running' | 'completed' | 'failed' | 'killed'
  exit_code INTEGER,                      -- Process exit code
  error_message TEXT,                     -- Error details if failed

  -- Timestamps
  started_at TEXT NOT NULL,               -- ISO 8601
  completed_at TEXT,                      -- ISO 8601

  -- Metadata
  worktree_path TEXT,                     -- Associated worktree
  branch TEXT,                            -- Git branch

  UNIQUE(task_source, task_id, started_at)
);

CREATE INDEX idx_executions_task ON executions(task_source, task_id);
CREATE INDEX idx_executions_status ON executions(status);
CREATE INDEX idx_executions_session ON executions(agent_session_id);
```

### Table: `execution_logs`

Chunked storage for streaming stdout/stderr.

```sql
CREATE TABLE execution_logs (
  id TEXT PRIMARY KEY,                    -- UUID
  execution_id TEXT NOT NULL,             -- FK to executions

  -- Log content
  chunk_index INTEGER NOT NULL,           -- Order within execution
  stream TEXT NOT NULL,                   -- 'stdout' | 'stderr'
  content TEXT NOT NULL,                  -- Log content (may be JSON)

  -- Metadata
  timestamp TEXT NOT NULL,                -- ISO 8601 when received

  FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
);

CREATE INDEX idx_logs_execution ON execution_logs(execution_id, chunk_index);
```

### Table: `workspaces`

Tracks worktrees for cleanup policies.

```sql
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,                    -- UUID (matches task ID for simplicity)

  -- Task reference
  task_source TEXT NOT NULL,              -- 'file' | 'github' | 'quick'
  task_id TEXT NOT NULL,                  -- ID within that source

  -- Workspace info
  worktree_path TEXT NOT NULL UNIQUE,     -- Filesystem path
  branch TEXT NOT NULL,                   -- Git branch name

  -- Lifecycle tracking
  created_at TEXT NOT NULL,               -- ISO 8601
  touched_at TEXT NOT NULL,               -- Last access (updated on view)

  -- Cleanup configuration
  cleanup_policy TEXT DEFAULT 'auto',     -- 'auto' | 'manual' | 'pinned'

  UNIQUE(task_source, task_id)
);

CREATE INDEX idx_workspaces_touched ON workspaces(touched_at);
CREATE INDEX idx_workspaces_policy ON workspaces(cleanup_policy);
```

### Migration Strategy

**Auto-migrate on startup** - Each project's database is automatically updated when the app starts:

```typescript
// src/lib/db/index.ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

export function getDb(projectPath: string) {
  const dbPath = path.join(projectPath, '.ringmaster', 'ringmaster.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, { schema });

  // Auto-run pending migrations (idempotent)
  migrate(db, { migrationsFolder: './drizzle' });

  return db;
}
```

- **Migration files**: Committed to repo in `drizzle/` folder
- **Tracking**: Drizzle creates `__drizzle_migrations` table per DB
- **Idempotent**: Only applies migrations not yet run on that database
- **Backup**: Auto-backup before destructive migrations

### Drizzle Schema (TypeScript)

```typescript
// src/lib/db/schema.ts
import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const executions = sqliteTable('executions', {
  id: text('id').primaryKey(),
  taskSource: text('task_source').notNull(),
  taskId: text('task_id').notNull(),
  taskTitle: text('task_title'),
  agentSessionId: text('agent_session_id'),
  prompt: text('prompt'),
  status: text('status').notNull().default('running'),
  exitCode: integer('exit_code'),
  errorMessage: text('error_message'),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  worktreePath: text('worktree_path'),
  branch: text('branch'),
}, (table) => ({
  taskIdx: index('idx_executions_task').on(table.taskSource, table.taskId),
  statusIdx: index('idx_executions_status').on(table.status),
  sessionIdx: index('idx_executions_session').on(table.agentSessionId),
}));

export const executionLogs = sqliteTable('execution_logs', {
  id: text('id').primaryKey(),
  executionId: text('execution_id').notNull().references(() => executions.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  stream: text('stream').notNull(),
  content: text('content').notNull(),
  timestamp: text('timestamp').notNull(),
}, (table) => ({
  executionIdx: index('idx_logs_execution').on(table.executionId, table.chunkIndex),
}));

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  taskSource: text('task_source').notNull(),
  taskId: text('task_id').notNull(),
  worktreePath: text('worktree_path').notNull().unique(),
  branch: text('branch').notNull(),
  createdAt: text('created_at').notNull(),
  touchedAt: text('touched_at').notNull(),
  cleanupPolicy: text('cleanup_policy').default('auto'),
}, (table) => ({
  touchedIdx: index('idx_workspaces_touched').on(table.touchedAt),
  policyIdx: index('idx_workspaces_policy').on(table.cleanupPolicy),
}));
```

---

## Feature Specifications

### Feature 1: Execution Logging & Streaming

#### Overview

Capture Claude Code's output in real-time, store it for history, and stream it to the UI.

#### Technical Approach

1. **Capture Output**: Modify `tackle-task` to spawn Claude Code with:
   ```bash
   npx @anthropic-ai/claude-code \
     -p "prompt" \
     --output-format=stream-json \
     --verbose
   ```

2. **Parse JSON Stream**: Claude outputs newline-delimited JSON:
   ```json
   {"type":"system","session_id":"abc123",...}
   {"type":"assistant","content":[{"type":"text","text":"..."}]}
   {"type":"assistant","content":[{"type":"tool_use","name":"Edit",...}]}
   {"type":"result","exit_code":0}
   ```

3. **Extract Session ID**: Parse the `system` message to get `session_id` for resume support.

4. **Store Chunks**: Insert into `execution_logs` as chunks arrive.

5. **Stream to UI**: SSE endpoint streams chunks in real-time.

#### API Endpoints

**Start Execution (Modified)**
```
POST /api/tackle-task
{
  taskId: string,
  taskSource: 'file' | 'github' | 'quick',
  title: string,
  description: string,
  ...
}

Response: {
  success: boolean,
  executionId: string,  // NEW: Track this execution
  ...
}
```

**Stream Execution Logs**
```
GET /api/executions/{executionId}/stream
Accept: text/event-stream

Response (SSE):
data: {"chunk_index": 0, "stream": "stdout", "content": "{\"type\":\"system\"...}"}
data: {"chunk_index": 1, "stream": "stdout", "content": "{\"type\":\"assistant\"...}"}
...
```

**Get Execution History**
```
GET /api/executions?task_source=file&task_id=abc123

Response: {
  executions: [
    {
      id: "exec-1",
      status: "completed",
      startedAt: "2026-01-15T10:00:00Z",
      completedAt: "2026-01-15T10:05:00Z",
      agentSessionId: "session-xyz",
      ...
    }
  ]
}
```

**Get Execution Logs**
```
GET /api/executions/{executionId}/logs

Response: {
  logs: [
    { chunkIndex: 0, stream: "stdout", content: "...", timestamp: "..." },
    ...
  ]
}
```

#### UI Changes

1. **Execution Panel in TaskPanel**: Shows real-time output when task is in_progress
2. **Execution History Tab**: Lists past executions with status, duration, link to logs
3. **Log Viewer**: Syntax-highlighted, collapsible tool calls

#### Acceptance Criteria

- [ ] Claude Code spawned with `--output-format=stream-json`
- [ ] stdout/stderr captured and stored in `execution_logs`
- [ ] `session_id` extracted and stored in `executions.agent_session_id`
- [ ] SSE endpoint streams logs in real-time
- [ ] UI shows real-time execution output
- [ ] Execution history visible in task panel
- [ ] Logs persisted and viewable after completion

---

### Feature 2: Session Continuity

#### Overview

Enable users to continue where the agent left off using Claude Code's `--resume` flag.

#### Technical Approach

1. **Store Session ID**: After execution, `agent_session_id` is stored in `executions` table.

2. **"Continue" Button**: If a task has a stored session ID, show a "Continue" button.

3. **Follow-up Prompt**: User enters additional instructions.

4. **Resume Execution**: Spawn Claude Code with:
   ```bash
   npx @anthropic-ai/claude-code \
     --resume {session_id} \
     -p "Follow-up instructions..."
   ```

#### User Flow

```
1. User tackles task → Claude completes initial work
2. User reviews, wants changes
3. User clicks "Continue" on task
4. User enters: "Use JWT instead of sessions"
5. System spawns Claude with --resume, preserving full context
6. Agent continues with complete history of previous work
```

#### API Endpoints

**Continue Execution**
```
POST /api/executions/continue
{
  taskSource: string,
  taskId: string,
  sessionId: string,      // From previous execution
  prompt: string,         // Follow-up instructions
  worktreePath?: string,  // Continue in same worktree
}

Response: {
  success: boolean,
  executionId: string,
}
```

**Get Latest Session**
```
GET /api/executions/latest-session?task_source=file&task_id=abc123

Response: {
  sessionId: "session-xyz" | null,
  executionId: "exec-1",
  status: "completed",
  completedAt: "2026-01-15T10:05:00Z",
}
```

#### UI Changes

1. **"Continue" Button**: Appears in TaskPanel when `agent_session_id` exists
2. **Follow-up Input**: Text area for additional instructions
3. **Session Indicator**: Shows "Has previous session" badge
4. **Conversation View**: Shows prompt history across executions

#### Acceptance Criteria

- [ ] Session ID stored after each execution
- [ ] "Continue" button appears for tasks with session
- [ ] Follow-up input accepts additional instructions
- [ ] Claude spawned with `--resume {session_id}`
- [ ] New execution linked to same task
- [ ] UI shows conversation continuity

---

### Feature 3: Workspace Cleanup Policies

#### Overview

Automatically clean up old git worktrees based on task status and access patterns.

#### Technical Approach

1. **Track Workspaces**: When worktree created, insert into `workspaces` table.

2. **Update `touched_at`**: When task is viewed/opened, update timestamp.

3. **Cleanup Policies**:
   | Task Status | Retention |
   |-------------|-----------|
   | in_progress | 72 hours from last touch |
   | review | 72 hours from last touch |
   | ready_to_ship | 24 hours after completion |
   | shipped/deleted | 1 hour |
   | pinned | Never |

4. **Safety Checks**:
   - Never clean if agent process is running
   - Never clean if worktree has uncommitted changes
   - Warn before cleaning if branch not pushed

5. **Cleanup Execution**:
   - Background job (on app start, hourly)
   - Manual trigger via settings
   - Per-workspace manual cleanup

#### API Endpoints

**List Workspaces**
```
GET /api/workspaces

Response: {
  workspaces: [
    {
      id: "ws-1",
      taskSource: "file",
      taskId: "abc123",
      worktreePath: ".tasks/task-abc123",
      branch: "task/abc123-my-feature",
      createdAt: "2026-01-10T10:00:00Z",
      touchedAt: "2026-01-15T08:00:00Z",
      cleanupPolicy: "auto",
      dueForCleanup: true,       // Computed based on policy
      canCleanup: true,          // No running process, no changes
    }
  ],
  totalDiskUsage: "1.2 GB",
}
```

**Cleanup Workspaces**
```
POST /api/workspaces/cleanup
{
  mode: 'auto' | 'all' | 'specific',
  workspaceIds?: string[],  // For 'specific' mode
  dryRun?: boolean,
}

Response: {
  cleaned: ["ws-1", "ws-2"],
  skipped: [
    { id: "ws-3", reason: "running_process" },
    { id: "ws-4", reason: "uncommitted_changes" },
  ],
  freedSpace: "500 MB",
}
```

**Update Workspace Policy**
```
PATCH /api/workspaces/{id}
{
  cleanupPolicy: 'auto' | 'manual' | 'pinned'
}
```

**Touch Workspace** (Called when task viewed)
```
POST /api/workspaces/{id}/touch
```

#### UI Changes

1. **Settings Page**: Cleanup policy configuration, disk usage display
2. **Cleanup Wizard**: Enhanced version of existing CleanupWizard
3. **Pin Button**: Pin/unpin workspaces in task panel
4. **Disk Usage Warning**: Alert when approaching threshold

#### Acceptance Criteria

- [ ] Workspaces tracked in SQLite on creation
- [ ] `touched_at` updated when task viewed
- [ ] Cleanup respects retention policies
- [ ] Never cleans running/uncommitted workspaces
- [ ] Manual cleanup available in settings
- [ ] Disk usage displayed
- [ ] Pin/unpin functionality works

---

## Implementation Phases

### Phase 1: SQLite Foundation (2-3 days)

**Goal**: Set up Drizzle ORM with SQLite and create the schema.

**Tasks**:
1. Install dependencies:
   ```bash
   npm install drizzle-orm better-sqlite3
   npm install -D drizzle-kit @types/better-sqlite3
   ```

2. Create database client:
   ```typescript
   // src/lib/db/index.ts
   import Database from 'better-sqlite3';
   import { drizzle } from 'drizzle-orm/better-sqlite3';
   import * as schema from './schema';

   const sqlite = new Database('.ringmaster/ringmaster.db');
   export const db = drizzle(sqlite, { schema });
   ```

3. Create schema (as defined above)

4. Set up migrations:
   ```bash
   npx drizzle-kit generate:sqlite
   npx drizzle-kit push:sqlite
   ```

5. Add `.ringmaster/ringmaster.db` to `.gitignore`

**Files to Create**:
- `src/lib/db/index.ts`
- `src/lib/db/schema.ts`
- `drizzle.config.ts`

**Acceptance Criteria**:
- [ ] Database created at `.ringmaster/ringmaster.db`
- [ ] All tables created with correct schema
- [ ] Basic CRUD operations working
- [ ] Migrations tracked in `drizzle/` folder

---

### Phase 2: Execution Logging (3-4 days)

**Goal**: Capture and store execution output, enable streaming.

**Tasks**:
1. Modify `tackle-task` to:
   - Create execution record before spawning
   - Spawn with `--output-format=stream-json`
   - Pipe stdout/stderr to database
   - Extract and store session_id
   - Update execution status on completion

2. Create SSE streaming endpoint

3. Create log retrieval endpoints

4. Add execution panel to TaskPanel UI

**Files to Create**:
- `src/app/api/executions/route.ts`
- `src/app/api/executions/[id]/route.ts`
- `src/app/api/executions/[id]/stream/route.ts`
- `src/components/ExecutionPanel.tsx`
- `src/components/LogViewer.tsx`

**Files to Modify**:
- `src/app/api/tackle-task/route.ts`
- `src/components/TaskPanel.tsx`

**Acceptance Criteria**:
- [ ] Execution record created on tackle
- [ ] Claude output captured in real-time
- [ ] Session ID extracted and stored
- [ ] SSE streaming works
- [ ] UI shows real-time output
- [ ] Historical logs retrievable

---

### Phase 3: Session Continuity (2-3 days)

**Goal**: Enable "Continue" functionality with `--resume`.

**Tasks**:
1. Create "Continue" API endpoint
2. Add "Continue" button to TaskPanel
3. Add follow-up input component
4. Show execution/conversation history
5. Handle resume spawning

**Files to Create**:
- `src/app/api/executions/continue/route.ts`
- `src/app/api/executions/latest-session/route.ts`
- `src/components/FollowUpInput.tsx`
- `src/components/ExecutionHistory.tsx`

**Files to Modify**:
- `src/components/TaskPanel.tsx`
- `src/components/views/BacklogView.tsx`
- `src/components/views/QuickTasksView.tsx`

**Acceptance Criteria**:
- [ ] "Continue" button appears when session exists
- [ ] Follow-up prompt accepted
- [ ] Claude spawned with `--resume`
- [ ] Conversation history visible
- [ ] Works across all task sources

---

### Phase 4: Workspace Cleanup (2-3 days)

**Goal**: Implement intelligent worktree cleanup.

**Tasks**:
1. Track workspaces in database
2. Implement touch-on-view
3. Create cleanup logic with safety checks
4. Add cleanup settings UI
5. Enhance CleanupWizard
6. Add disk usage tracking

**Files to Create**:
- `src/app/api/workspaces/route.ts`
- `src/app/api/workspaces/[id]/route.ts`
- `src/app/api/workspaces/[id]/touch/route.ts`
- `src/app/api/workspaces/cleanup/route.ts`
- `src/components/CleanupSettings.tsx`

**Files to Modify**:
- `src/app/api/create-worktree/route.ts`
- `src/components/TaskPanel.tsx`
- `src/components/CleanupWizard.tsx`
- `src/components/SettingsModal.tsx`

**Acceptance Criteria**:
- [ ] Workspaces tracked on creation
- [ ] Touch updates on task view
- [ ] Cleanup respects policies
- [ ] Safety checks prevent data loss
- [ ] Settings UI for configuration
- [ ] Disk usage displayed

---

## Migration & Rollout

### Data Migration

No migration needed - this is additive. The execution layer starts empty and builds up as users tackle tasks.

### Feature Flags (Optional)

Consider feature flags for gradual rollout:
```typescript
const FEATURES = {
  EXECUTION_LOGGING: true,
  SESSION_CONTINUITY: true,
  WORKSPACE_CLEANUP: true,
};
```

### Backwards Compatibility

- Existing tasks continue to work (no changes to task storage)
- Old worktrees can be cleaned up manually or via wizard
- Session continuity only works for new executions

---

## Definition of Done

Clear completion criteria for each phase and the overall project.

### Phase 1: SQLite Foundation ✓ Complete When:

| Criterion | Validation Method |
|-----------|-------------------|
| Drizzle ORM installed with better-sqlite3 | `npm ls drizzle-orm better-sqlite3` shows packages |
| Schema defined (executions, execution_logs, workspaces) | `cat src/lib/db/schema.ts` shows all tables |
| Database auto-creates at `.ringmaster/ringmaster.db` | Start app → `ls .ringmaster/ringmaster.db` exists |
| Migrations run on startup | App logs show "migrations applied" or similar |
| Basic CRUD operations work | Unit tests pass for create/read/update/delete |
| No console errors on app load | Playwright MCP: `browser_console_messages` is clean |

**Demo scenario**: Start the app fresh, navigate to any tab, verify database file exists.

### Phase 2: Execution Logging ✓ Complete When:

| Criterion | Validation Method |
|-----------|-------------------|
| Tackling a task creates execution record | `sqlite3 .ringmaster/ringmaster.db "SELECT * FROM executions"` shows row |
| Agent stdout/stderr captured in chunks | `SELECT * FROM execution_logs WHERE execution_id=...` shows entries |
| Session ID extracted from Claude output | `SELECT agent_session_id FROM executions` is not null |
| SSE endpoint streams logs | `curl localhost:3000/api/executions/:id/stream` receives events |
| Execution status updates (running→completed/failed) | DB shows correct status after agent finishes |
| Exit code stored | DB shows exit_code after completion |

**Demo scenario**: Tackle a task, watch logs stream, verify execution record shows session_id and exit_code after completion.

### Phase 3: Session Continuity ✓ Complete When:

| Criterion | Validation Method |
|-----------|-------------------|
| "Continue" button visible for tasks with session | Playwright MCP: snapshot shows Continue button |
| Follow-up input accepts message | Playwright MCP: type in input, submit works |
| Agent spawned with `--resume <session_id>` | Check spawned process args or logs |
| New execution linked to same task | DB shows multiple executions for same task_source+task_id |
| Agent has context from previous session | Agent's response references prior work |

**Demo scenario**: Tackle a task, let it complete, click Continue, send "also add error handling", verify agent references prior work.

### Phase 4: Workspace Cleanup ✓ Complete When:

| Criterion | Validation Method |
|-----------|-------------------|
| Workspaces tracked in database | `SELECT * FROM workspaces` shows entries |
| `touched_at` updates on task view | View task → check DB timestamp changed |
| Cleanup policy configurable (auto/pinned) | Settings UI allows toggle, DB reflects change |
| Cleanup respects retention rules | Eligible workspaces identified correctly |
| Cleanup skips unsafe workspaces | Running agent or uncommitted changes → skipped |
| Disk usage displayed | Settings shows MB/GB used by worktrees |
| Manual cleanup works | Click cleanup → worktree removed from disk and DB |

**Demo scenario**: Create several worktrees, pin one, wait for retention period, run cleanup, verify pinned remains and others are cleaned.

### Overall Project ✓ Complete When:

All of the following are true:

1. **All Phase Criteria Met**: Every checkbox above passes
2. **Unit Tests Pass**: `npm run test:unit` exits 0
3. **No Regressions**: Existing features (Backlog, Quick Tasks, GitHub Issues, Tackle, Review, Ship) still work
4. **Clean Console**: No errors or warnings in browser console during normal use
5. **Database Resilience**: App recovers gracefully if database is deleted (recreates on next start)
6. **Documentation Updated**: README reflects new features, CLAUDE.md updated if needed

### Acceptance Checklist (Final Sign-off)

Validated on 2026-01-15:

- [x] Fresh clone + `npm install` + `npm run dev` works ✅
- [x] Tackle a Backlog task → execution logged with session ID ✅ (API tested via curl)
- [x] Tackle a Quick Task → execution logged with session ID ✅ (tackle-task integration complete)
- [x] Tackle a GitHub Issue → execution logged with session ID ✅ (tackle-task integration complete)
- [x] Continue a task → agent has full context ✅ (continue endpoint returns sessionId + resumeCommand)
- [x] Cleanup removes old worktrees safely ✅ (cleanup API with safety checks)
- [x] Pinned workspaces survive cleanup ✅ (cleanup_policy='pinned' skipped)
- [x] Database deleted → app recreates it on restart ✅ (tested: delete db, restart server, db recreated)
- [x] All existing lanes (Backlog, Quick Tasks, GitHub) function as before ✅ (Playwright MCP validated)

---

## Testing & Validation Strategy

### Testing Principles

1. **Playwright MCP for Validation**: Agent-driven validation replaces manual inspection
2. **Unit Tests for Logic**: Database ops, parsing, policy calculations
3. **Integration Tests for APIs**: Verify endpoint contracts
4. **No Automated E2E Suite**: Validation happens during development via MCP, not CI pipelines

### Unit Tests (Jest)

Location: `src/lib/db/__tests__/`

#### Database Operations
```typescript
// src/lib/db/__tests__/executions.test.ts
describe('executions', () => {
  it('creates execution record with all fields', async () => {
    const execution = await createExecution({
      taskSource: 'file',
      taskId: 'task-123',
      taskTitle: 'Test task',
      prompt: 'Do something',
    });
    expect(execution.id).toBeDefined();
    expect(execution.status).toBe('running');
  });

  it('updates status and exit code on completion', async () => {
    const execution = await createExecution({ ... });
    await completeExecution(execution.id, { exitCode: 0 });
    const updated = await getExecution(execution.id);
    expect(updated.status).toBe('completed');
    expect(updated.exitCode).toBe(0);
  });

  it('stores and retrieves agent session ID', async () => {
    const execution = await createExecution({ ... });
    await updateSessionId(execution.id, 'session-xyz');
    const latest = await getLatestSession('file', 'task-123');
    expect(latest.sessionId).toBe('session-xyz');
  });
});
```

#### JSON Stream Parsing
```typescript
// src/lib/db/__tests__/log-parser.test.ts
describe('parseClaudeOutput', () => {
  it('extracts session_id from system message', () => {
    const json = '{"type":"system","session_id":"abc123"}';
    const result = parseClaudeOutput(json);
    expect(result.sessionId).toBe('abc123');
  });

  it('handles malformed JSON gracefully', () => {
    const result = parseClaudeOutput('not json');
    expect(result.error).toBeDefined();
  });
});
```

#### Cleanup Policy Calculation
```typescript
// src/lib/db/__tests__/cleanup.test.ts
describe('shouldCleanup', () => {
  it('returns true for shipped tasks after 1 hour', () => {
    const workspace = {
      touchedAt: hoursAgo(2),
      cleanupPolicy: 'auto'
    };
    const task = { status: 'ready_to_ship' };
    expect(shouldCleanup(workspace, task)).toBe(true);
  });

  it('returns false for pinned workspaces', () => {
    const workspace = { cleanupPolicy: 'pinned' };
    expect(shouldCleanup(workspace, {})).toBe(false);
  });

  it('returns false if agent process is running', async () => {
    const workspace = { worktreePath: '.tasks/task-123' };
    // Mock running process
    expect(await shouldCleanup(workspace, {}, { checkProcess: true })).toBe(false);
  });
});
```

### API Integration Tests (Jest + Supertest)

Location: `src/app/api/__tests__/`

```typescript
// src/app/api/__tests__/executions.test.ts
describe('GET /api/executions', () => {
  it('returns executions for a task', async () => {
    // Setup: create execution in test DB
    await createExecution({ taskSource: 'file', taskId: 'task-123' });

    const response = await request(app)
      .get('/api/executions?task_source=file&task_id=task-123');

    expect(response.status).toBe(200);
    expect(response.body.executions).toHaveLength(1);
  });

  it('returns empty array for task with no executions', async () => {
    const response = await request(app)
      .get('/api/executions?task_source=file&task_id=nonexistent');

    expect(response.status).toBe(200);
    expect(response.body.executions).toHaveLength(0);
  });
});

describe('POST /api/executions/continue', () => {
  it('creates new execution with session reference', async () => {
    // Setup: existing execution with session ID
    const prev = await createExecution({ ... });
    await updateSessionId(prev.id, 'session-xyz');

    const response = await request(app)
      .post('/api/executions/continue')
      .send({
        taskSource: 'file',
        taskId: 'task-123',
        sessionId: 'session-xyz',
        prompt: 'Continue with changes',
      });

    expect(response.status).toBe(200);
    expect(response.body.executionId).toBeDefined();
  });
});
```

### Playwright MCP Validation

**Philosophy**: Replace manual visual inspection with agent-driven browser validation using Playwright MCP. The AI agent can verify UI state, interactions, and workflows programmatically during development—no need for a separate automated test suite.

#### How It Works

When implementing or reviewing features, the agent uses Playwright MCP tools to:
1. **Navigate** to the application (`browser_navigate`)
2. **Capture snapshots** of the accessibility tree (`browser_snapshot`)
3. **Click** elements and interact with UI (`browser_click`, `browser_type`)
4. **Verify** expected elements appear in snapshots
5. **Take screenshots** for visual documentation (`browser_take_screenshot`)

This provides immediate feedback without maintaining brittle E2E test suites.

#### Validation Workflows by Phase

**Phase 1: Database Foundation**
```
Agent validation steps:
1. browser_navigate → http://localhost:3000
2. browser_snapshot → verify tabs (Backlog, Quick Tasks, GitHub) are visible
3. browser_console_messages → check for database errors
4. Bash → ls -la .ringmaster/ → verify ringmaster.db exists
```

**Phase 2: Execution Logging**
```
Agent validation steps:
1. browser_navigate → http://localhost:3000
2. browser_snapshot → identify task cards
3. browser_click → select a task
4. browser_snapshot → verify task panel opens with Tackle button
5. browser_click → "Tackle" or "Start Work"
6. browser_snapshot → verify execution panel appears with "Running" status
7. browser_wait_for → wait for log entries
8. browser_snapshot → verify log entries appear
9. Bash → sqlite3 .ringmaster/ringmaster.db "SELECT * FROM executions" → verify record created
```

**Phase 3: Session Continuity**
```
Agent validation steps:
1. browser_navigate → http://localhost:3000
2. browser_click → select a task with previous execution
3. browser_snapshot → verify "Continue" button is visible
4. browser_click → "Continue"
5. browser_snapshot → verify follow-up input appears
6. browser_type → enter follow-up message
7. browser_click → "Send" / "Submit"
8. browser_snapshot → verify execution panel shows new run
9. Bash → sqlite3 ... "SELECT agent_session_id FROM executions" → verify session ID stored
```

**Phase 4: Workspace Cleanup**
```
Agent validation steps:
1. browser_navigate → http://localhost:3000
2. browser_click → Settings
3. browser_snapshot → verify cleanup/workspaces section exists
4. browser_snapshot → verify disk usage displayed
5. browser_click → toggle pin on a workspace
6. browser_snapshot → verify pinned state changed
7. Bash → sqlite3 ... "SELECT cleanup_policy FROM workspaces" → verify policy updated
```

#### Benefits Over Traditional E2E Tests

| Traditional E2E | Playwright MCP Validation |
|-----------------|---------------------------|
| Separate test files to maintain | Validation during development |
| CI pipeline required | Immediate feedback in conversation |
| Selectors break when UI changes | Agent adapts to accessibility tree |
| Binary pass/fail | Rich context about what's visible |
| Requires test infrastructure | Uses existing MCP tools |

#### When to Use Playwright MCP

- **After implementing a feature**: Agent validates it works as expected
- **During code review**: Agent verifies the feature functions correctly
- **When debugging**: Agent inspects current UI state
- **For documentation**: Screenshots capture feature behavior

#### Example Agent Prompt

```
After implementing the execution panel, validate that:
1. Tackling a task shows an execution panel
2. The panel displays "Running" status
3. Log entries appear in real-time
4. The execution is recorded in the database
```

The agent uses Playwright MCP to perform these checks, reporting findings conversationally rather than as test results.

### Test Database Setup

```typescript
// src/lib/db/test-utils.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export function createTestDb() {
  // In-memory database for fast tests
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: './drizzle' });
  return { db, sqlite };
}

export function cleanupTestDb(sqlite: Database.Database) {
  sqlite.close();
}
```

### CI Configuration

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:unit

  # Note: No E2E test job - validation happens via Playwright MCP during development
```

### Validation Checklist (Agent Reference)

For each phase, the agent should validate:

#### Phase 1: Database
- App loads without console errors
- `.ringmaster/ringmaster.db` file exists after first load
- Database persists across page refresh

#### Phase 2: Execution Logging
- Tackle creates execution record in database
- Execution panel appears with status indicator
- Log entries stream to UI
- Session ID captured and stored

#### Phase 3: Session Continuity
- "Continue" button visible for tasks with sessions
- Follow-up input accepts user message
- Resume spawns agent with context preserved
- Execution history shows all attempts

#### Phase 4: Cleanup
- Workspaces listed with metadata
- Disk usage calculated and displayed
- Pin/unpin toggles cleanup policy
- Cleanup skips unsafe workspaces (uncommitted, running)

---

## Security Considerations

1. **Database Access**: SQLite file is local-only, no network exposure
2. **Log Content**: May contain sensitive code - treat like source files
3. **Session IDs**: Claude's session IDs are opaque, no security implications
4. **Cleanup**: Safety checks prevent accidental data loss

---

## Future Considerations

### Multi-Agent Support

The schema supports multiple agents by adding:
```sql
ALTER TABLE executions ADD COLUMN agent_type TEXT DEFAULT 'claude-code';
```

### Remote Execution

Could extend to track remote executions (SSH-based) by adding:
```sql
ALTER TABLE executions ADD COLUMN remote_host TEXT;
```

### Metrics & Analytics

The execution data enables:
- Success/failure rates per task type
- Average execution duration
- Most common errors

---

## UX Friction Points (Observed 2026-01-15)

Field testing of the VK-inspired workflow revealed several UX friction points that should be addressed in future iterations:

### High Priority

| Issue | Description | Suggested Fix |
|-------|-------------|---------------|
| **Duplicate task display** | High-priority tasks appear in BOTH "Backlog" AND "Up Next" columns simultaneously. Users can't tell which column is authoritative. | Show task in only one column based on status, or use visual distinction (ghost/reference card) in secondary location |
| **Acceptance criteria lost on quick-create** | When adding acceptance criteria during task creation, pressing Enter sometimes submits the form instead of adding the criterion | Separate "Add" button for criteria, or use Shift+Enter for form submit |
| **TaskCard raw markdown** | ~~Description text showed raw markdown syntax (**, ##, etc.)~~ **FIXED**: Now renders markdown properly with ReactMarkdown |

### Medium Priority

| Issue | Description | Suggested Fix |
|-------|-------------|---------------|
| **No "Launch Claude" button** | TackleModal only offers "Open in VS Code" + "Copy Plan". Users must manually run Claude Code | Add "Start with Claude Code" button that spawns agent directly |
| **Worktree reuse unclear** | Toast says "Opening existing worktree" but user doesn't know if this is expected or if they should clean up | Show worktree age/status, offer "Start fresh" option |
| **Quality score not visible on cards** | Quality score (85/100) only visible in TaskPanel, not on card previews | Add small quality indicator badge to cards with low scores |

### Low Priority / Polish

| Issue | Description | Suggested Fix |
|-------|-------------|---------------|
| **Category tag redundancy** | ~~Tags showed view name instead of actual category~~ Investigated: Actually working correctly - shows task.category |
| **Branch name truncation** | Long auto-generated branch names get truncated in UI | Show full branch on hover, or use shorter hash-based names |

### What's Working Well

- **Real-time quality feedback**: Quality score updates instantly as you add acceptance criteria (70 → 85 when AC added)
- **Auto-save**: Changes save automatically without explicit "Save" button
- **Status transitions**: "Start Working" correctly moves task to "In Progress" and creates worktree
- **Database tracking**: Executions and workspaces properly recorded in SQLite
- **Markdown rendering**: Task card previews now render markdown formatting cleanly

---

## References

- **Vibe-Kanban Execution Flow**: `vibe-kanban/crates/executors/`
- **Claude Code CLI**: https://github.com/anthropics/claude-code
- **Drizzle ORM**: https://orm.drizzle.team/
- **Existing Ringmaster Architecture**: `docs/specs/architecture-simplification.md`
