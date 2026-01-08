# Ringmaster

> Direct the circus. Orchestrate your backlog.

A kanban-style backlog management tool with AI-powered task analysis and Claude Code integration.

## Features

- **Kanban Board**: Drag-and-drop tasks across Backlog, Up Next, In Progress, and Done columns
- **AI Assist**: Analyze and enhance task descriptions with Claude
- **Claude Code Integration**: One-click to open VS Code with task context copied to clipboard
- **Smart Prioritization**: Up Next column auto-populates with high-priority items
- **Search**: Filter tasks by title, description, category, or tags
- **Markdown Support**: Full markdown rendering in task descriptions

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

### Backlog File

By default, Ringmaster looks for a `BACKLOG.md` file in common locations. You can also drag and drop a markdown file onto the board.

## Development

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run lint     # Run linter
```

## Tech Stack

- Next.js 14 (App Router)
- React 18
- Tailwind CSS
- @dnd-kit (drag and drop)
- AWS Bedrock (Claude AI)
