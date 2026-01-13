# Ringmaster

> Direct the circus. Orchestrate your backlog.

A kanban-style backlog management tool with AI-powered task analysis and Claude Code integration.

## Features

- **Kanban Board**: Drag-and-drop tasks across Backlog, Up Next, In Progress, Review, and Ready to Ship columns
- **GitHub Sync**: Bidirectional sync with GitHub Issues - work offline, auto-merge changes ([workflow guide](docs/guides/github-sync-workflow.md))
- **AI Assist**: Analyze and enhance task descriptions with Claude via AWS Bedrock
- **Claude Code Integration**: One-click to open VS Code with task context copied to clipboard
- **Git Worktrees**: Automatic worktree creation for isolated task development
- **Smart Prioritization**: Up Next column auto-populates with high-priority items
- **Search**: Filter tasks by title, description, category, or tags
- **Markdown Support**: Full markdown rendering in task descriptions
- **Health Monitoring**: Real-time server health indicator with circuit breaker status

## Installation

```bash
# Clone the repo
git clone https://github.com/bozoparlay/ringmaster.git
cd ringmaster

# Run the install script
./scripts/install.sh
```

The install script will:
- Install npm dependencies
- Add `ringmaster` and `ringmaster-stop` shell aliases
- Set up `ringmaster.local` as a local domain

After installation, reload your shell:
```bash
source ~/.zshrc  # or ~/.bashrc
```

## Usage

```bash
# Start the server (runs in background)
ringmaster

# Open in browser
open http://ringmaster.local:3000

# Stop the server
ringmaster-stop
```

Or run manually:
```bash
npm run dev
# Then visit http://localhost:3000
```

## Configuration

### AWS Bedrock (for AI features)

The AI Assist feature uses Claude via AWS Bedrock. Set up your credentials:

```bash
# In .env.local
AWS_REGION=us-east-1
AWS_PROFILE=your-profile-name
```

Or configure via AWS CLI:
```bash
aws configure --profile your-profile-name
```

### GitHub Sync

To sync tasks with GitHub Issues:

1. Generate a [fine-grained PAT](https://github.com/settings/tokens?type=beta) with **Issues: Read and write** permission
2. Click the GitHub settings icon (or the "Connect GitHub" prompt)
3. Paste your token and connect

See the [GitHub Sync Workflow Guide](docs/guides/github-sync-workflow.md) for detailed setup instructions.

### Backlog File

By default, Ringmaster looks for a `BACKLOG.md` file in common locations. You can also drag and drop a markdown file onto the board.

## Development

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run lint     # Run linter
```

## Architecture

### API Resilience

All API routes are protected with timeouts and circuit breakers to prevent hung processes:

- **Timeouts**: External operations (Bedrock API, git commands) have configurable timeouts
- **Circuit Breakers**: After repeated failures, circuits "open" to fail fast and allow recovery
- **Health Endpoint**: `GET /api/health` returns server status and circuit breaker states

The health indicator in the header shows real-time server status:
- 🟢 Green = Healthy
- 🟡 Yellow (pulsing) = Degraded (some services unavailable)
- 🔴 Red (pulsing) = Unhealthy (server not responding)

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server health and circuit breaker status |
| `/api/backlog` | GET/POST | Read/write backlog file |
| `/api/analyze-task` | POST | AI-powered task analysis |
| `/api/create-worktree` | POST | Create git worktree for task |
| `/api/tackle-task` | POST | Open VS Code with task context |
| `/api/ship-task` | POST | Push branch and create PR |
| `/api/review-task` | POST | AI code review for task |
| `/api/github/sync` | POST | Bidirectional sync with GitHub Issues |
| `/api/github/status` | GET | GitHub connection status |
| `/api/repo-info` | GET | Git repository info (owner/repo) |

## Tech Stack

- Next.js 14 (App Router)
- React 18
- Tailwind CSS
- @dnd-kit (drag and drop)
- AWS Bedrock (Claude AI)

## Project Structure

```
src/
├── app/
│   ├── api/              # API routes
│   │   ├── health/       # Health check endpoint
│   │   ├── backlog/      # Backlog CRUD
│   │   ├── github/       # GitHub sync & status
│   │   └── ...
│   └── page.tsx          # Main app
├── components/           # React components
│   ├── KanbanBoard.tsx
│   ├── HealthIndicator.tsx
│   ├── SyncConflictModal.tsx
│   └── ...
├── hooks/
│   ├── useBacklog.ts     # Backlog state management
│   ├── useAutoSync.ts    # GitHub auto-sync
│   └── useProjectConfig.ts
└── lib/
    ├── resilience.ts     # Timeout, circuit breaker utilities
    └── storage/          # Storage providers & GitHub sync
```
