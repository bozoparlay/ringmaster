# GitHub Sync Workflow Guide

This guide explains how to set up and use GitHub bidirectional sync in Ringmaster. Once configured, your local tasks sync with GitHub Issues - you can work offline and changes merge automatically.

## Quick Start

1. **Connect GitHub** - Click your avatar (or "Connect GitHub" prompt) → Enter PAT
2. **Initial Sync** - Click the sync button (↻) to push local tasks to GitHub Issues
3. **Work normally** - Changes sync automatically every 5 minutes

## Setup

### Step 1: Generate a GitHub Personal Access Token (PAT)

1. Go to [GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens](https://github.com/settings/tokens?type=beta)
2. Click **"Generate new token"**
3. Configure:
   - **Name**: `Ringmaster`
   - **Expiration**: 90 days (or longer)
   - **Repository access**: Select "Only select repositories" → choose your project repo
   - **Permissions**:
     - **Issues**: Read and write
     - **Metadata**: Read (required)
4. Click **"Generate token"** and copy it

### Step 2: Configure Your Token

You have three options for storing your PAT (in priority order):

#### Option A: Environment Variable (Recommended for developers)

Add to your project's `.env.local` file:

```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_USERNAME=your-username  # optional
```

This survives browser cache clears and is the most robust option.

#### Option B: Config File (Recommended for most users)

1. Open Ringmaster in a GitHub-backed repo
2. You'll see a **"Connect GitHub"** prompt
3. Click **"Set Up"** (or click your avatar → GitHub settings)
4. Paste your PAT token
5. Click **"Connect"**

Token is saved to `~/.ringmaster/config.json` - survives browser cache clears.

#### Option C: Via UI (Legacy)

Same as Option B, but if server-side storage fails, falls back to browser localStorage. This is cleared if you clear browser data.

Ringmaster will verify the token has correct permissions and display your GitHub username. The settings modal shows where your token is stored.

### Step 3: Initial Sync (Local → GitHub)

If you already have local tasks and no GitHub issues:

1. Click the **sync button** (↻) in the header
2. Ringmaster creates GitHub Issues for each task
3. Tasks are tagged with:
   - `ringmaster` - identifies Ringmaster-managed issues
   - `priority:high`, `priority:medium`, etc.
   - `status:backlog`, `status:in-progress`, etc.
   - `effort:low`, `effort:high`, etc.
   - Custom category labels

### Step 4: Ongoing Sync

After initial setup, sync happens automatically:
- **Every 5 minutes** while Ringmaster is open
- **When you return** to the Ringmaster tab
- **When coming back online** after being offline

You can also click the sync button anytime for immediate sync.

## How Sync Works

### Push (Local → GitHub)

When you modify a task locally:
1. Task is marked as "pending sync"
2. Next sync pushes changes to the linked GitHub Issue
3. Issue body, title, labels, and state are updated

### Pull (GitHub → Local)

When someone modifies an issue on GitHub:
1. Ringmaster detects the change via `updated_at` timestamp
2. Local task is updated with GitHub changes
3. New GitHub Issues tagged `ringmaster` are pulled as new tasks

### Conflict Resolution

When both local and remote change the same task:
1. A **conflict modal** appears
2. You see side-by-side comparison of local vs. GitHub versions
3. Choose **"Keep Local"** or **"Keep GitHub"**
4. The chosen version overwrites the other

## Label Schema

Ringmaster creates and manages these labels:

| Label | Description |
|-------|-------------|
| `ringmaster` | Identifies Ringmaster-managed issues |
| `priority:critical` | Critical priority (red) |
| `priority:high` | High priority (orange) |
| `priority:medium` | Medium priority (yellow) |
| `priority:low` | Low priority (green) |
| `priority:someday` | Someday/maybe (light blue) |
| `status:backlog` | In backlog column |
| `status:up-next` | Up next column |
| `status:in-progress` | In progress column |
| `status:review` | In review column |
| `status:ready-to-ship` | Ready to ship column |
| `effort:trivial` | Trivial effort |
| `effort:low` | Low effort |
| `effort:medium` | Medium effort |
| `effort:high` | High effort |
| `effort:very-high` | Very high effort |

Category names become additional labels (e.g., `feature`, `bug`, `docs`).

## Working Offline

1. Make changes normally while offline
2. Tasks are saved locally with "pending" status
3. When you're back online, sync resumes automatically
4. Any conflicts are presented for resolution

## Token Storage

Ringmaster checks for tokens in this order:

| Priority | Location | Survives Cache Clear | Notes |
|----------|----------|---------------------|-------|
| 1 | `.env.local` (GITHUB_TOKEN) | Yes | Best for developers |
| 2 | `~/.ringmaster/config.json` | Yes | Best for most users |
| 3 | Browser localStorage | No | Legacy fallback |

The settings modal shows which source your token is coming from.

## Troubleshooting

### "Token expired" or "Bad credentials"

1. Generate a new PAT (tokens expire based on your settings)
2. Update token based on your storage method:
   - **env var**: Edit `.env.local`, restart server
   - **config file**: Click avatar → GitHub settings → Change token
   - **localStorage**: Click avatar → GitHub settings → update token

### "Resource not accessible by integration"

Your token doesn't have the required permissions:
1. Delete the current token on GitHub
2. Generate a new one with **Issues: Read and write** permission

### Tasks not syncing

1. Check the sync status indicator in the header
2. Click the sync button to force a sync
3. Check browser console for detailed error messages

### Duplicate issues created

This can happen if the initial sync is interrupted. To fix:
1. Delete duplicate issues on GitHub
2. Sync again - Ringmaster will link existing issues by task ID

### Labels not appearing

First sync creates all labels. If missing:
1. They'll be auto-created on next sync
2. Or manually create them on GitHub with the colors from the schema

## Best Practices

1. **Don't edit the hidden comment** - Each issue body contains `<!-- ringmaster-task-id:xxx -->` - don't delete this
2. **Let Ringmaster manage labels** - Avoid manually changing Ringmaster labels
3. **Resolve conflicts promptly** - Don't let conflicts pile up
4. **Use server-side token storage** - Prefer `.env.local` or `~/.ringmaster/config.json` over browser localStorage
5. **Keep tokens secure** - Don't commit `.env.local` to git (it's already in `.gitignore`)

## Data Flow

```
┌─────────────────┐         ┌─────────────────┐
│  Local Storage  │◄───────►│  GitHub Issues  │
│   (IndexedDB)   │   Sync  │                 │
└─────────────────┘         └─────────────────┘
        ▲                           ▲
        │                           │
        │    ┌─────────────────┐    │
        └────│   Ringmaster    │────┘
             │  (Next.js App)  │
             └────────┬────────┘
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
    .env.local   ~/.ringmaster   Browser
    (GITHUB_     /config.json   localStorage
     TOKEN)                      (fallback)
```

- **Local-first**: All operations work offline
- **Bidirectional**: Changes flow both ways
- **Conflict-aware**: Detects and presents conflicts for resolution
- **Server-side config**: PAT stored securely outside browser
