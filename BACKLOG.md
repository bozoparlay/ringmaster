# Backlog

## Phase 1: Multi-Agent Support

### Create Agent Abstraction Layer
- **Priority:** high
- **Effort:** medium
- **Value:** high
- **Tags:** agent, architecture, multi-agent
- **Status:** backlog

**Description:**
Create a pluggable agent interface that abstracts away the specifics of Claude Code, Codex, Cursor, Gemini, etc. This enables users to choose their preferred agent per task and switch easily.

VK's `StandardCodingAgentExecutor` trait is the model:
- spawn(): Start initial execution
- spawn_follow_up(): Continue with session
- normalize_logs(): Parse agent-specific output
- get_availability_info(): Check if agent is installed/authenticated

**Acceptance Criteria:**
- [ ] AgentConfig interface defined: type, command, capabilities, mcpConfigPath
- [ ] AgentType enum: 'claude-code' | 'codex' | 'cursor' | 'gemini' | 'amp'
- [ ] AgentCapability enum: 'session-fork' | 'mcp' | 'setup-helper'
- [ ] Agent registry with spawn/follow-up methods per agent type
- [ ] agents table in database: id, type, config (JSON), created_at
- [ ] Default agent configurable in settings
- [ ] Agent selection dropdown when tackling a task
- [ ] Claude Code adapter implemented as first agent
- [ ] Agent availability check (is installed? authenticated?)

**Notes:**
```typescript
interface AgentExecutor {
  type: AgentType;
  spawn(workDir: string, prompt: string): Promise<ExecutionHandle>;
  spawnFollowUp(workDir: string, prompt: string, sessionId: string): Promise<ExecutionHandle>;
  normalizeOutput(chunk: string): NormalizedLogEntry[];
  checkAvailability(): Promise<AvailabilityStatus>;
}
```

Start with Claude Code fully implemented, then add others.

---

### Add Agent Configuration UI
- **Priority:** medium
- **Effort:** medium
- **Value:** medium
- **Tags:** agent, ui, settings
- **Status:** backlog

**Description:**
Create a settings page where users can configure available agents, set defaults, and manage agent-specific settings (API keys, MCP configs, model preferences).

**Acceptance Criteria:**
- [ ] Settings page accessible from nav/menu
- [ ] List of supported agents with enabled/disabled toggle
- [ ] Default agent selector
- [ ] Per-agent configuration:
  - Claude Code: model preference, MCP config path, permission mode
  - Codex: API key, model
  - Cursor: path to cursor executable
- [ ] Agent availability status shown (installed, authenticated, unavailable)
- [ ] "Test Connection" button for each agent
- [ ] Settings persisted to database
- [ ] Settings exportable/importable as JSON

**Notes:**
VK stores agent configs in ExecutorConfigs with profiles. Consider a simpler approach first - just store configs per agent type.

---

### Implement Codex Agent Support
- **Priority:** medium
- **Effort:** medium
- **Value:** medium
- **Tags:** agent, codex, multi-agent
- **Status:** backlog

**Description:**
Add OpenAI Codex CLI as a supported agent. Codex has different CLI flags and output format than Claude Code, so we need a dedicated adapter.

**Acceptance Criteria:**
- [ ] Codex agent adapter implementing AgentExecutor interface
- [ ] Codex spawn command: `npx codex -p "prompt" --json`
- [ ] Codex output parsing (different JSON format than Claude)
- [ ] Session continuity for Codex (if supported)
- [ ] Codex availability check (API key configured?)
- [ ] Codex-specific settings in agent config UI
- [ ] Documentation for setting up Codex

**Notes:**
Codex may have different capabilities than Claude Code. Document what features are agent-specific vs universal.

---

## Phase 2: Operations & Polish

### Add Dev Server Management
- **Priority:** low
- **Effort:** medium
- **Value:** medium
- **Tags:** operations, devserver, workflow
- **Status:** backlog

**Description:**
Allow users to start/stop dev servers for tasks, with automatic port management and status tracking. This is especially useful for web development where you want to preview changes.

**Acceptance Criteria:**
- [ ] dev_server_script field on tasks (e.g., "npm run dev")
- [ ] "Start Dev Server" button in task detail view
- [ ] Automatic port assignment to avoid conflicts
- [ ] Dev server process tracked in execution_processes table
- [ ] "Stop Dev Server" button
- [ ] Dev server status indicator (running, stopped)
- [ ] Open in browser button (localhost:port)
- [ ] Only one dev server per project at a time (stop old when starting new)
- [ ] Dev server logs captured

**Notes:**
VK has a sophisticated dev server system with project-level scripts. Start simpler: per-task scripts, manual port config.

---

### Add Real-time Execution Streaming UI
- **Priority:** medium
- **Effort:** medium
- **Value:** high
- **Tags:** ui, streaming, execution
- **Status:** backlog

**Description:**
Show real-time agent output in the UI while a task is being worked on. This gives users visibility into what the agent is doing and allows them to interrupt if needed.

**Acceptance Criteria:**
- [ ] Execution panel in task detail view
- [ ] Real-time log streaming via SSE or WebSocket
- [ ] Syntax highlighting for code in logs
- [ ] Collapsible tool call sections (Read, Edit, Bash, etc.)
- [ ] Progress indicator (agent is thinking, using tool, waiting)
- [ ] "Stop" button to kill running agent
- [ ] Auto-scroll with "scroll to bottom" button
- [ ] Timestamps on log entries
- [ ] Different styling for stdout vs stderr
- [ ] Filter by log type (tool calls, text, errors)

**Notes:**
VK normalizes Claude's JSON output into structured entries (NormalizedEntry). Consider similar approach:
```typescript
type NormalizedEntryType =
  | 'AssistantMessage'
  | 'ToolUse'
  | 'ToolResult'
  | 'Thinking'
  | 'SystemMessage'
  | 'ErrorMessage';
```

---

### Add Keyboard Shortcuts
- **Priority:** low
- **Effort:** trivial
- **Value:** low
- **Tags:** ui, ux, shortcuts
- **Status:** backlog

**Description:**
Add keyboard shortcuts for common actions to improve power user experience.

**Acceptance Criteria:**
- [ ] Cmd/Ctrl+N: New task
- [ ] Cmd/Ctrl+T: Tackle selected task
- [ ] Cmd/Ctrl+R: Review selected task
- [ ] Cmd/Ctrl+S: Ship selected task
- [ ] Escape: Close modal/detail view
- [ ] Arrow keys: Navigate between tasks
- [ ] Enter: Open selected task
- [ ] ?: Show keyboard shortcut help
- [ ] Shortcuts work globally (not just when focused on specific element)
- [ ] Shortcuts displayed in tooltips

**Notes:**
Use a library like `react-hotkeys-hook` or build simple custom hook.

---

## Future Considerations

### Subtasks / Task Hierarchies
- **Priority:** someday
- **Effort:** high
- **Value:** medium
- **Tags:** tasks, hierarchy, future
- **Status:** backlog

**Description:**
Support parent-child task relationships for breaking down complex features into smaller pieces. Would require UI for creating subtasks, collapsible task groups, and dependency tracking.

---

### Image/Screenshot Attachments
- **Priority:** someday
- **Effort:** medium
- **Value:** low
- **Tags:** tasks, attachments, future
- **Status:** backlog

**Description:**
Allow attaching images to tasks for mockups, bug screenshots, or visual context. Store in .ringmaster/attachments/ or use base64 in database.

---
