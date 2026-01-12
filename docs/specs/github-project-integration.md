# GitHub Project Integration Specification

> **Status**: ✅ Implemented (PR #9)
> **Author**: Principal Engineer
> **Created**: 2026-01-11
> **Last Updated**: 2026-01-12

## Executive Summary

This specification defines the enhancement of Ringmaster's GitHub integration from a **manual, single-repo configuration** to an **auto-detected, per-project system** with seamless workflow integration.

### Current State Problems

1. **Manual Configuration**: Users must manually enter `owner/repo` despite the app running in a git repository
2. **Global PAT**: Single token/repo pair stored globally, not per-project
3. **No Workflow Integration**: Tackle/Ship don't interact with GitHub Issues
4. **Silent Fallback**: No guidance when GitHub sync would benefit the user

### Target State

1. **Auto-Detection**: Repo detected from `git remote get-url origin` on page load
2. **Per-Project Config**: Each project remembers its storage mode independently
3. **Workflow Integration**: Tackle assigns issues, Ship links PRs to issues
4. **Smart Onboarding**: First-visit prompt offers GitHub connection

---

## Implementation Summary

> **Merged**: PR #9 on 2026-01-12

### Files Added/Modified

| File | Purpose |
|------|---------|
| `src/app/api/repo-info/route.ts` | Auto-detect repo from git remote |
| `src/app/api/github/status/route.ts` | Validate PAT and return connection status |
| `src/app/api/github/tackle/route.ts` | Assign issue + apply labels on Tackle |
| `src/app/api/github/ship/route.ts` | Link PRs to issues on Ship |
| `src/hooks/useProjectConfig.ts` | Central hook for project config management |
| `src/components/GitHubConnectionPrompt.tsx` | First-time connection prompt |
| `src/lib/storage/project-config.ts` | Per-project config storage helpers |
| `src/lib/storage/github-sync.ts` | GitHub sync utilities |
| `src/lib/storage/types.ts` | Type definitions for storage layer |

### Key Implementation Notes

1. **Stale Detection**: Config cached for 24h with manual refresh button in header
2. **GitHub Status in Header**: Shows connection state, sync timestamp, user avatar
3. **Label-Based Workflow**: Tasks sync state via GitHub labels (configurable)
4. **Migration**: Existing global PAT migrated to user-level storage automatically

### Implementation Deviations

| Spec Item | Status | Notes |
|-----------|--------|-------|
| P3-2: Link existing issues | ⏳ Deferred | Complex matching logic; manual linking preferred for v1 |
| P3-5: PR references issue | ✅ Via existing flow | Handled in `/api/create-pr`, not `/api/github/ship` |
| P3-9: Sync conflict handling | ⏳ Deferred | v1 uses last-write-wins; conflicts rare for single-user |
| P4-5: GitHub Enterprise | ⏳ Deferred | Requires custom API URL configuration |
| P4-6: Offline mode | ⏳ Deferred | localStorage works offline; GitHub sync is opportunistic |
| P4-7: Keyboard shortcut | ⏳ Deferred | Low priority; header button sufficient |

### Future Work

Items deferred to future iterations:

1. **Issue Linking UI** (P3-2): Bulk match local tasks to existing GitHub issues by title similarity
2. **Conflict Resolution** (P3-9): Detect divergent changes, offer merge/overwrite options
3. **GitHub Enterprise** (P4-5): Custom `apiUrl` in project config for enterprise deployments
4. **Offline Queue** (P4-6): Queue mutations when offline, sync when reconnected
5. **Bi-directional Sync**: Poll GitHub for issue updates, import new issues to Ringmaster

---

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Page Load                                  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  1. useProjectConfig() hook initializes                             │
│     - Check localStorage for cached project config                  │
│     - If missing/stale: fetch /api/repo-info                       │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. /api/repo-info endpoint                                         │
│     - Runs: git remote get-url origin                               │
│     - Parses URL → { owner, repo, repoUrl, provider }              │
│     - Returns project context to frontend                           │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. Frontend caches + renders                                       │
│     - Store in localStorage keyed by repoUrl hash                  │
│     - Pre-populate GitHubSettingsModal with detected repo          │
│     - Show connection status in header                              │
└─────────────────────────────────────────────────────────────────────┘
```

### Storage Schema

```typescript
// User-Level (shared across all projects)
interface UserConfig {
  // Key: 'ringmaster:user:github'
  token: string;              // GitHub PAT
  tokenCreatedAt: string;     // ISO timestamp
  username?: string;          // Cached GitHub username
}

// Project-Level (per repository)
interface ProjectConfig {
  // Key: 'ringmaster:project:{repoUrlHash}'
  repoUrl: string;            // Full git remote URL
  owner: string;              // GitHub owner (org or user)
  repo: string;               // Repository name
  provider: 'github' | 'gitlab' | 'bitbucket' | 'unknown';

  storageMode: StorageMode;   // 'local' | 'file' | 'github'

  // GitHub-specific settings
  github?: {
    syncEnabled: boolean;
    labelMapping: {           // Map Ringmaster states to GitHub labels
      'up-next': string;
      'in-progress': string;
      'review': string;
      'ready-to-ship': string;
    };
    autoAssign: boolean;      // Assign issues when Tackling
    linkPRsToIssues: boolean; // Reference issues in PR descriptions
  };

  // Metadata
  configuredAt: string;       // ISO timestamp
  lastSyncAt?: string;        // Last successful GitHub sync
}

// Task Storage (existing, unchanged)
interface TaskStorage {
  // Key: 'ringmaster:tasks:{repoUrlHash}'
  tasks: BacklogItem[];
  meta: { lastModified: string; version: number; };
}
```

### Key Design Decisions

#### Decision 1: Single PAT, Per-Project Repo

**Choice**: Store one GitHub PAT at user level, auto-detect repo per project.

**Rationale**:
- Most developers use one GitHub account across projects
- Reduces friction (enter PAT once, use everywhere)
- Per-project repo detection handles multi-project naturally
- Future: Could support multiple PATs for enterprise vs personal

**Trade-off**: Can't use different tokens for different repos. Acceptable for v1.

#### Decision 2: Lazy Repo Detection with Caching

**Choice**: Detect repo on first page load, cache in localStorage for 24 hours.

**Rationale**:
- Avoids API call overhead on every page load
- Git remote rarely changes during development
- 24-hour cache balances freshness vs performance
- Manual refresh button for edge cases

**Implementation**:
```typescript
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function isProjectConfigStale(config: ProjectConfig): boolean {
  const configuredAt = new Date(config.configuredAt).getTime();
  return Date.now() - configuredAt > CACHE_TTL_MS;
}
```

#### Decision 3: Opt-In GitHub Sync

**Choice**: Default to localStorage mode, prompt for GitHub connection.

**Rationale**:
- Respects user autonomy (don't assume they want GitHub sync)
- localStorage works offline, zero setup
- Prompt is non-blocking, dismissible
- Remembers choice per-project

**UX Flow**:
```
First Visit to Project
         │
         ▼
┌─────────────────────────┐
│ Detect GitHub remote?   │
│         │               │
│    Yes  │  No           │
│         ▼               │
│ ┌─────────────────┐     │
│ │ Show prompt:    │     │
│ │ "Connect to     │     │ → Use localStorage silently
│ │  GitHub Issues?"│     │
│ └────────┬────────┘     │
│     │         │         │
│   Accept    Dismiss     │
│     │         │         │
│     ▼         ▼         │
│  GitHub    localStorage │
│   Mode       Mode       │
└─────────────────────────┘
```

#### Decision 4: Label-Based Workflow Sync

**Choice**: Use GitHub labels to represent Ringmaster task states.

**Rationale**:
- Labels are visible in GitHub UI (good for team visibility)
- Don't require GitHub Projects setup
- Simple mapping: state → label
- User can customize label names

**Default Label Mapping**:
```typescript
const DEFAULT_LABELS = {
  'up-next': 'priority: up-next',
  'in-progress': 'status: in-progress',
  'review': 'status: review',
  'ready-to-ship': 'status: ready-to-ship',
};
```

---

## API Specifications

### GET /api/repo-info

Returns information about the current repository.

**Response**:
```typescript
interface RepoInfoResponse {
  // Detected from git remote
  repoUrl: string;           // "git@github.com:owner/repo.git"
  owner: string;             // "owner"
  repo: string;              // "repo"
  provider: 'github' | 'gitlab' | 'bitbucket' | 'unknown';

  // Additional context
  defaultBranch: string;     // "main"
  currentBranch: string;     // "feature/foo"

  // Ringmaster state
  hasBacklogFile: boolean;   // BACKLOG.md exists
  hasLocalStorage: boolean;  // Tasks exist in localStorage for this repo
}
```

**Implementation Notes**:
```bash
# Primary detection
git remote get-url origin
# Returns: git@github.com:owner/repo.git
#      or: https://github.com/owner/repo.git

# Fallback for default branch
git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'
# Returns: main

# Current branch
git branch --show-current
# Returns: feature/foo
```

**URL Parsing**:
```typescript
function parseGitRemoteUrl(url: string): { owner: string; repo: string; provider: string } {
  // SSH format: git@github.com:owner/repo.git
  const sshMatch = url.match(/git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return {
      provider: detectProvider(sshMatch[1]),
      owner: sshMatch[2],
      repo: sshMatch[3],
    };
  }

  // HTTPS format: https://github.com/owner/repo.git
  const httpsMatch = url.match(/https?:\/\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    return {
      provider: detectProvider(httpsMatch[1]),
      owner: httpsMatch[2],
      repo: httpsMatch[3],
    };
  }

  return { provider: 'unknown', owner: '', repo: '' };
}

function detectProvider(host: string): string {
  if (host.includes('github')) return 'github';
  if (host.includes('gitlab')) return 'gitlab';
  if (host.includes('bitbucket')) return 'bitbucket';
  return 'unknown';
}
```

### GET /api/github/status

Validates GitHub configuration and returns connection status.

**Request Headers**:
```
Authorization: Bearer <github_pat>
```

**Response**:
```typescript
interface GitHubStatusResponse {
  connected: boolean;
  user?: {
    login: string;
    name: string;
    avatarUrl: string;
  };
  repo?: {
    fullName: string;        // "owner/repo"
    private: boolean;
    hasIssues: boolean;      // Issues enabled on repo
    defaultBranch: string;
  };
  permissions?: {
    canReadIssues: boolean;
    canWriteIssues: boolean;
    canCreatePRs: boolean;
  };
  error?: string;            // If not connected
}
```

### POST /api/github/tackle

Handles GitHub integration when tackling a task (assigns issue, adds label).

**Request**:
```typescript
interface TackleRequest {
  issueNumber: number;
  repo: string;                    // "owner/repo"
  inProgressLabel?: string;        // Default: "status: in-progress"
}
```

**Response**:
```typescript
interface TackleResponse {
  success: boolean;
  assigned: boolean;
  labeled: boolean;
  username?: string;
  error?: string;
}
```

### POST /api/github/ship

Handles GitHub integration when shipping a task (updates labels).

**Request**:
```typescript
interface ShipRequest {
  issueNumber: number;
  repo: string;                    // "owner/repo"
  fromLabel?: string;              // Default: "status: in-progress"
  toLabel?: string;                // Default: "status: review"
}
```

**Response**:
```typescript
interface ShipResponse {
  success: boolean;
  removedLabel: boolean;
  addedLabel: boolean;
  error?: string;
}
```

---

## Component Specifications

### useProjectConfig Hook

Central hook for accessing and managing project configuration.
**Implementation**: `src/hooks/useProjectConfig.ts`

```typescript
interface UseProjectConfigReturn {
  // Project info (from /api/repo-info)
  project: {
    owner: string;
    repo: string;
    repoUrl: string;
    provider: 'github' | 'gitlab' | 'bitbucket' | 'unknown';
    defaultBranch: string;
    currentBranch: string;
    hasBacklogFile: boolean;
  } | null;

  // Configuration state
  config: ProjectConfig | null;
  storageMode: StorageMode;

  // GitHub-specific
  isGitHubRepo: boolean;
  isGitHubConnected: boolean;
  gitHubUser: { login: string; name: string; avatarUrl: string } | null;

  // Prompt state
  showGitHubPrompt: boolean;

  // Actions
  setStorageMode: (mode: StorageMode) => void;
  connectGitHub: (token: string) => Promise<boolean>;
  disconnectGitHub: () => void;
  refreshProject: () => Promise<void>;
  dismissPrompt: (permanent?: boolean) => void;

  // Status
  isLoading: boolean;
  isStale: boolean;
  error: string | null;
}
```

### GitHubConnectionPrompt Component

Non-blocking prompt shown on first visit to a GitHub-hosted project.

```typescript
interface GitHubConnectionPromptProps {
  project: { owner: string; repo: string };
  onConnect: () => void;    // Opens GitHubSettingsModal
  onDismiss: () => void;    // Hides prompt, remembers choice
}
```

**Design**:
```
┌──────────────────────────────────────────────────────────────┐
│  🔗 This project is hosted on GitHub                         │
│                                                              │
│  Connect to sync tasks with GitHub Issues?                   │
│  • See tasks in GitHub's issue tracker                      │
│  • Tackle assigns issues automatically                       │
│  • Ship links PRs to issues                                  │
│                                                              │
│  [Connect to GitHub]              [Maybe Later]  [×]        │
└──────────────────────────────────────────────────────────────┘
```

**Behavior**:
- Shown once per project (tracked in localStorage)
- Dismissible with "Maybe Later" (can access later from dropdown)
- "×" permanently dismisses for this project
- Auto-hides after 10 seconds if no interaction

### Enhanced GitHubSettingsModal

Updated modal with auto-detected repo and better UX.

**Changes from Current**:
1. **Auto-populated repo**: Pre-fill with detected `owner/repo`
2. **Connection test on mount**: If PAT exists, test it immediately
3. **Permission display**: Show what the token can/can't do
4. **Label configuration**: Let users customize state→label mapping

```typescript
interface GitHubSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect?: () => void;

  // New props
  detectedRepo?: { owner: string; repo: string };  // Pre-fill
  showPermissions?: boolean;                        // Show token capabilities
}
```

### Header GitHub Status Indicator

Shows connection status in the header area.

**States**:
```
[Not Connected]     → Gray, shows "Connect" on hover
[Connected: @user]  → Green dot, shows avatar + username
[Syncing...]        → Animated spinner
[Sync Error]        → Red dot, shows error on hover
```

---

## Phases

### Phase 0: Backend Foundation ✅
**Goal**: Add repo detection API, establish data layer
**Implemented**: Commit `a1bc6e4`

**Tasks**:

| ID | Task | Acceptance Criteria |
|----|------|---------------------|
| P0-1 | Create `/api/repo-info` endpoint | Returns owner, repo, provider parsed from git remote |
| P0-2 | Handle SSH and HTTPS URL formats | Both `git@github.com:o/r.git` and `https://github.com/o/r` work |
| P0-3 | Detect default branch | Returns actual default branch, not hardcoded "main" |
| P0-4 | Add `/api/github/status` endpoint | Validates PAT, returns user info and permissions |
| P0-5 | Create `ProjectConfig` type definitions | Types defined in `src/lib/storage/types.ts` |
| P0-6 | Add project config localStorage helpers | `getProjectConfig()`, `setProjectConfig()` functions |

**Estimated Complexity**: Low-Medium
**Dependencies**: None

### Phase 1: Per-Project Configuration ✅
**Goal**: Migrate from global config to per-project, add auto-detection
**Implemented**: Commits `f129e7c`, `ddc442d`

**Tasks**:

| ID | Task | Acceptance Criteria |
|----|------|---------------------|
| P1-1 | Create `useProjectConfig` hook | Hook provides project info, config, and actions |
| P1-2 | Fetch repo-info on app mount | `/api/repo-info` called once, cached for 24h |
| P1-3 | Migrate PAT to user-level storage | Move from `ringmaster:github:*` to `ringmaster:user:github` |
| P1-4 | Key project config by repo hash | Each project has isolated config |
| P1-5 | Pre-fill GitHubSettingsModal with detected repo | Repo field shows detected value, editable |
| P1-6 | Add "Refresh" button for stale detection | Manual override if remote changed |
| P1-7 | Migrate existing configs on first load | One-time migration preserves user data |

**Estimated Complexity**: Medium
**Dependencies**: Phase 0

### Phase 2: First-Time Experience ✅
**Goal**: Smart onboarding for new projects
**Implemented**: Commit `fc6d927`

**Tasks**:

| ID | Task | Acceptance Criteria |
|----|------|---------------------|
| P2-1 | Create `GitHubConnectionPrompt` component | Non-blocking banner with Connect/Dismiss |
| P2-2 | Show prompt on first visit to GitHub project | Only if: GitHub repo detected AND not configured AND not dismissed |
| P2-3 | Track prompt dismissal per-project | Dismissal persists in localStorage |
| P2-4 | Add "permanent dismiss" option | "Don't ask again for this project" |
| P2-5 | Auto-hide after 10 seconds | Timer with smooth fade-out |
| P2-6 | Add "Connect to GitHub" to storage dropdown | Entry point after dismissing prompt |

**Estimated Complexity**: Medium
**Dependencies**: Phase 1

### Phase 3: Workflow Integration ✅
**Goal**: Tackle and Ship interact with GitHub Issues
**Implemented**: Commit `9cc8fd8`

**Tasks**:

| ID | Task | Acceptance Criteria |
|----|------|---------------------|
| P3-1 | Store GitHub issue number on tasks | `BacklogItem.githubIssueNumber` field |
| P3-2 | Link existing issues on first sync | Match by title, offer merge UI |
| P3-3 | **Tackle**: Assign issue to current user | When Tackling, if GitHub mode, assign issue |
| P3-4 | **Tackle**: Add "in-progress" label | Label applied via GitHub API |
| P3-5 | **Ship**: Reference issue in PR description | PR body includes "Closes #123" |
| P3-6 | **Ship**: Update issue labels | Remove "in-progress", add "review" |
| P3-7 | Add sync status to TaskCard | Show linked issue number, sync indicator |
| P3-8 | Add GitHub link to TaskPanel | Click to open issue in GitHub |
| P3-9 | Handle sync conflicts | If issue changed on GitHub, show conflict UI |
| P3-10 | Label mapping configuration | Users can customize which labels map to states |

**Estimated Complexity**: High
**Dependencies**: Phase 1

### Phase 4: Header Integration & Polish ✅
**Goal**: Visible status, edge cases, polish
**Implemented**: Commit `9cc8fd8`

**Tasks**:

| ID | Task | Acceptance Criteria |
|----|------|---------------------|
| P4-1 | Add GitHub status to header | Shows connected state, user avatar |
| P4-2 | Manual sync button | "Sync Now" pulls latest from GitHub |
| P4-3 | Last sync timestamp | Shows "Synced 5m ago" in header |
| P4-4 | Handle token expiration | Graceful error, prompt to re-authenticate |
| P4-5 | Support GitHub Enterprise URLs | Custom API URL in settings |
| P4-6 | Offline mode graceful degradation | Queue syncs, apply when online |
| P4-7 | Add keyboard shortcut for sync | `Cmd+Shift+S` triggers sync |
| P4-8 | Sync error recovery | Retry logic, clear error states |

**Estimated Complexity**: Medium
**Dependencies**: Phase 3

---

## Testing Strategy

### Unit Tests

| Component | Test Cases |
|-----------|------------|
| `parseGitRemoteUrl()` | SSH format, HTTPS format, enterprise URLs, invalid URLs |
| `useProjectConfig` | Initial load, cache hit, cache miss, error states |
| `ProjectConfig` storage | Save, load, migrate, clear |

### Integration Tests (Playwright)

| Test | Steps |
|------|-------|
| **Auto-detection** | Load app → verify repo detected → check localStorage |
| **First-time prompt** | Clear storage → load app → verify prompt shown → dismiss → verify not shown again |
| **GitHub connection** | Open settings → enter PAT → verify connection → check status in header |
| **Tackle workflow** | Create task → Tackle → verify issue assigned + labeled (mock GitHub API) |
| **Ship workflow** | Ship task → verify PR references issue (mock GitHub API) |

### Manual Testing Checklist

- [x] Fresh install shows prompt for GitHub repo
- [x] Non-GitHub repo (GitLab, local) doesn't show GitHub prompt
- [x] PAT entered once, works across page refreshes
- [x] Different projects have independent storage modes
- [x] Tackle assigns issue (with valid PAT)
- [x] Ship updates issue labels
- [x] Sync error shows clear message
- [ ] ~~Offline mode queues changes~~ (deferred to future work)

---

## Security Considerations

### PAT Storage

**Risk**: PAT stored in localStorage is accessible to XSS attacks.

**Mitigations**:
1. Use minimal scope PAT (`repo` or `public_repo` only)
2. Recommend short expiration (90 days)
3. Future: Consider encrypted storage or OAuth flow

### API Proxy

**Risk**: PAT exposed in network requests visible in dev tools.

**Mitigations**:
1. All GitHub API calls go through backend proxy
2. PAT sent via header, not query string
3. Backend validates requests before forwarding

### Token Validation

**Risk**: Stale or revoked tokens cause confusing errors.

**Mitigations**:
1. Validate token on connection
2. Check token on app load (if configured)
3. Clear prompt to re-authenticate if invalid

---

## Migration Plan

### From Current State

Users with existing configuration need seamless migration.

**Migration Logic**:
```typescript
function migrateGitHubConfig(): void {
  // Check for old-style config
  const oldToken = localStorage.getItem('ringmaster:github:token');
  const oldRepo = localStorage.getItem('ringmaster:github:repo');

  if (oldToken && oldRepo) {
    // Migrate to new structure
    const userConfig: UserConfig = {
      token: oldToken,
      tokenCreatedAt: new Date().toISOString(),
    };
    localStorage.setItem('ringmaster:user:github', JSON.stringify(userConfig));

    // Note: Project config will be created on next repo-info fetch
    // The old repo value will be compared against detected repo

    // Clean up old keys
    localStorage.removeItem('ringmaster:github:token');
    localStorage.removeItem('ringmaster:github:repo');
    localStorage.removeItem('ringmaster:github:apiUrl');
  }
}
```

**Migration Trigger**: Run on app initialization, before `useProjectConfig` hook.

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Auto-detection accuracy | >95% | % of GitHub repos correctly detected |
| Onboarding completion | >30% | % of users who connect GitHub when prompted |
| Workflow adoption | >50% | % of GitHub-connected users who Tackle via Ringmaster |
| Sync reliability | >99% | % of sync operations that succeed |

---

## Open Questions (Resolved)

1. **Multi-account support**: Should we support multiple GitHub accounts (personal + work)?
   - *Decision*: **No** — Single PAT stored at user level. Works for most developers.
   - *Revisit trigger*: Enterprise users requesting work/personal separation.

2. **GitLab/Bitbucket support**: Should we support other providers?
   - *Decision*: **Detect only** — Provider detected in `/api/repo-info` but only GitHub sync implemented.
   - *Revisit trigger*: Significant user demand for GitLab/Bitbucket.

3. **Bi-directional sync**: Should changes on GitHub sync back to Ringmaster?
   - *Decision*: **Not in v1** — Tackle/Ship push to GitHub; no pull-back implemented.
   - *Revisit trigger*: Team workflows where multiple people edit the same issues.

4. **Issue templates**: Should we use GitHub issue templates when creating?
   - *Decision*: **No** — Tasks use simple title/description. Templates add complexity.
   - *Revisit trigger*: Users requesting structured issue creation.

---

## Appendix A: URL Parsing Examples

| Input | Output |
|-------|--------|
| `git@github.com:owner/repo.git` | `{ provider: 'github', owner: 'owner', repo: 'repo' }` |
| `https://github.com/owner/repo.git` | `{ provider: 'github', owner: 'owner', repo: 'repo' }` |
| `https://github.com/owner/repo` | `{ provider: 'github', owner: 'owner', repo: 'repo' }` |
| `git@gitlab.com:owner/repo.git` | `{ provider: 'gitlab', owner: 'owner', repo: 'repo' }` |
| `https://github.enterprise.com/org/repo.git` | `{ provider: 'github', owner: 'org', repo: 'repo' }` |
| `git@bitbucket.org:owner/repo.git` | `{ provider: 'bitbucket', owner: 'owner', repo: 'repo' }` |

## Appendix B: Label Mapping Defaults

| Ringmaster State | Default GitHub Label | Color |
|------------------|---------------------|-------|
| Backlog | (no label) | - |
| Up Next | `priority: up-next` | `#fbca04` (yellow) |
| In Progress | `status: in-progress` | `#0e8a16` (green) |
| Review | `status: review` | `#1d76db` (blue) |
| Ready to Ship | `status: ready-to-ship` | `#5319e7` (purple) |

Labels are created automatically if they don't exist (with user permission).

## Appendix C: Error Messages

| Error Code | User Message | Recovery Action |
|------------|--------------|-----------------|
| `INVALID_TOKEN` | "GitHub token is invalid or expired" | Open settings, re-enter token |
| `REPO_NOT_FOUND` | "Repository not found or no access" | Check repo name, verify token scope |
| `RATE_LIMITED` | "GitHub API rate limit reached" | Wait, or authenticate for higher limit |
| `NETWORK_ERROR` | "Couldn't connect to GitHub" | Check internet, retry |
| `NO_ISSUES_PERMISSION` | "Token doesn't have Issues access" | Re-create token with `repo` scope |
