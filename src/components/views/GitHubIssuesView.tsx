'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  CollisionDetection,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { KanbanColumn } from '../KanbanColumn';
import { TaskCard } from '../TaskCard';
import { TaskPanel } from '../TaskPanel';
import { TackleModal } from '../TackleModal';
import { Toast, ToastType } from '../Toast';
import { TrashDropZone } from '../TrashDropZone';
import { DeleteConfirmationModal } from '../DeleteConfirmationModal';
import { NewTaskModal } from '../NewTaskModal';
import type { BacklogItem, Priority, Effort, Status, Value } from '@/types/backlog';
import { COLUMN_ORDER, PRIORITY_WEIGHT } from '@/types/backlog';
import { parseAcceptanceCriteriaFromMarkdown } from '@/lib/utils/parse-acceptance-criteria';
import { validateTaskQuality } from '@/lib/task-quality';

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  html_url: string;
  created_at: string;
  updated_at: string;
  labels: Array<{ name: string; color: string }>;
  assignee: { login: string } | null;
  user: { login: string };
}

// Auto-sync polling interval (in milliseconds)
// GitHub recommends no more than once per minute for authenticated requests
// We use 60 seconds by default, configurable via localStorage
const DEFAULT_SYNC_INTERVAL_MS = 60000; // 60 seconds
const MIN_SYNC_INTERVAL_MS = 30000; // 30 seconds minimum

/**
 * Get configured sync interval from localStorage
 * Key: ringmaster:github:syncInterval (in seconds)
 */
function getSyncInterval(): number {
  if (typeof window === 'undefined') return DEFAULT_SYNC_INTERVAL_MS;
  const stored = localStorage.getItem('ringmaster:github:syncInterval');
  if (stored) {
    const seconds = parseInt(stored, 10);
    if (!isNaN(seconds) && seconds >= MIN_SYNC_INTERVAL_MS / 1000) {
      return seconds * 1000;
    }
  }
  return DEFAULT_SYNC_INTERVAL_MS;
}

// Up Next sizing configuration (same as BacklogView)
const UP_NEXT_CONFIG = {
  SMALL_THRESHOLD: 5,
  SMALL_LIMIT: 1,
  MEDIUM_THRESHOLD: 10,
  MEDIUM_LIMIT: 3,
  LARGE_THRESHOLD: 15,
  LARGE_LIMIT: 4,
  MAX_LIMIT: 5,
} as const;

function calculateUpNextLimit(backlogSize: number): number {
  if (backlogSize < UP_NEXT_CONFIG.SMALL_THRESHOLD) return UP_NEXT_CONFIG.SMALL_LIMIT;
  if (backlogSize < UP_NEXT_CONFIG.MEDIUM_THRESHOLD) return UP_NEXT_CONFIG.MEDIUM_LIMIT;
  if (backlogSize < UP_NEXT_CONFIG.LARGE_THRESHOLD) return UP_NEXT_CONFIG.LARGE_LIMIT;
  return UP_NEXT_CONFIG.MAX_LIMIT;
}

// Map status to GitHub label
const STATUS_TO_LABEL: Record<Status, string | null> = {
  'backlog': 'status: backlog',
  'in_progress': 'status: in-progress',
  'ai_review': 'status: ai-review',
  'human_review': 'status: human-review',
  'ready_to_ship': 'status: ready-to-ship',
};

// Convert GitHub issue to BacklogItem format for display
function issueToBacklogItem(issue: GitHubIssue): BacklogItem {
  // Extract priority from labels if present
  let priority: Priority = 'medium';
  const priorityLabel = issue.labels.find(l => l.name.startsWith('priority:'));
  if (priorityLabel) {
    const p = priorityLabel.name.replace('priority:', '').trim().toLowerCase();
    if (['critical', 'high', 'medium', 'low', 'someday'].includes(p)) {
      priority = p as Priority;
    }
  }

  // Extract effort from labels if present
  let effort: Effort | undefined;
  const effortLabel = issue.labels.find(l => l.name.startsWith('effort:'));
  if (effortLabel) {
    const e = effortLabel.name.replace('effort:', '').trim().toLowerCase().replace(' ', '_');
    if (['trivial', 'low', 'medium', 'high', 'very_high'].includes(e)) {
      effort = e as Effort;
    }
  }

  // Extract value from labels if present
  let value: Value | undefined;
  const valueLabel = issue.labels.find(l => l.name.startsWith('value:'));
  if (valueLabel) {
    const v = valueLabel.name.replace('value:', '').trim().toLowerCase();
    if (['low', 'medium', 'high'].includes(v)) {
      value = v as Value;
    }
  }

  // Determine status from labels
  let status: Status = 'backlog';
  if (issue.labels.some(l => l.name === 'status: in-progress')) {
    status = 'in_progress';
  } else if (issue.labels.some(l => l.name === 'status: ai-review' || l.name === 'status: review')) {
    status = 'ai_review';  // Map old 'review' label to ai_review
  } else if (issue.labels.some(l => l.name === 'status: human-review')) {
    status = 'human_review';
  } else if (issue.labels.some(l => l.name === 'status: ready-to-ship')) {
    status = 'ready_to_ship';
  }
  // Note: 'status: backlog', 'status: up-next', or no status label all map to 'backlog'

  // Extract category from category: label if present
  const categoryLabel = issue.labels.find(l => l.name.startsWith('category:'));
  const category = categoryLabel ? categoryLabel.name.replace('category:', '').trim() : undefined;

  // Extract tags from other labels (excluding all metadata labels)
  const tags = issue.labels
    .filter(l =>
      !l.name.startsWith('priority:') &&
      !l.name.startsWith('effort:') &&
      !l.name.startsWith('value:') &&
      !l.name.startsWith('status:') &&
      !l.name.startsWith('category:') &&
      l.name !== 'ringmaster'
    )
    .map(l => l.name);

  // Parse acceptance criteria from issue body checkboxes
  const acceptanceCriteria = parseAcceptanceCriteriaFromMarkdown(issue.body);

  // Calculate quality score for rescope indicator
  const quality = validateTaskQuality(
    issue.title,
    issue.body || '',
    acceptanceCriteria.length > 0 ? acceptanceCriteria : undefined
  );

  return {
    id: `github-${issue.number}`,
    title: issue.title,
    description: issue.body || '',
    priority,
    effort,
    value,
    status,
    tags,
    acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : undefined,
    category,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    order: issue.number,
    githubIssueNumber: issue.number,
    githubIssueUrl: issue.html_url,
    qualityScore: quality.score,
    qualityIssues: quality.issues.length > 0 ? quality.issues : undefined,
  };
}

interface GitHubIssuesViewProps {
  repo?: { owner: string; repo: string };
  token?: string;
  onTackle?: (item: BacklogItem) => void;
  onAddToBacklog?: (item: BacklogItem) => Promise<void>;
  /** Search query to filter issues by title/description */
  searchQuery?: string;
}

// Failed operation type for retry queue
interface FailedOperation {
  type: 'status' | 'labels';
  issueNumber: number;
  payload: unknown;
  retryCount: number;
  lastAttempt: number;
}

export function GitHubIssuesView({ repo, token, onTackle, onAddToBacklog, searchQuery = '' }: GitHubIssuesViewProps) {
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<BacklogItem | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isTackleOpen, setIsTackleOpen] = useState(false);
  const [tackleItem, setTackleItem] = useState<BacklogItem | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  // Note: updatingIssue state removed - now using optimistic updates

  // Delete confirmation modal state (for closing GitHub issues)
  const [itemToDelete, setItemToDelete] = useState<BacklogItem | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // New task modal state
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);

  // Auto-sync state
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Per-issue local modification tracking (for race condition prevention)
  // Maps issue number → timestamp of last local modification
  // When sync completes, we preserve local state if it's newer than GitHub's updated_at
  const localModificationsRef = useRef<Map<number, number>>(new Map());

  // Retry queue for failed sync operations
  // Instead of immediately rolling back, we queue failed operations for retry
  const failedOperationsRef = useRef<FailedOperation[]>([]);
  const [pendingRetries, setPendingRetries] = useState(0);
  const MAX_RETRIES = 3;
  const RETRY_BACKOFF_MS = [2000, 5000, 10000]; // Exponential backoff

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  // Process retry queue - called after successful sync
  const processRetryQueue = useCallback(async () => {
    const queue = failedOperationsRef.current;
    if (queue.length === 0) return;

    const now = Date.now();
    const toRetry = queue.filter(op => {
      const backoff = RETRY_BACKOFF_MS[Math.min(op.retryCount, RETRY_BACKOFF_MS.length - 1)];
      return now - op.lastAttempt >= backoff;
    });

    if (toRetry.length === 0) return;

    console.log(`[GitHubSync] Retrying ${toRetry.length} failed operations`);

    for (const op of toRetry) {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const endpoint = op.type === 'status' ? '/api/github/update-status' : '/api/github/update-labels';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(op.payload),
        });

        if (response.ok) {
          // Success - remove from queue
          failedOperationsRef.current = failedOperationsRef.current.filter(o => o !== op);
          console.log(`[GitHubSync] Retry succeeded for #${op.issueNumber}`);
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (err) {
        op.retryCount++;
        op.lastAttempt = now;

        if (op.retryCount >= MAX_RETRIES) {
          // Max retries exceeded - remove from queue, show error
          failedOperationsRef.current = failedOperationsRef.current.filter(o => o !== op);
          showToast(`Failed to sync #${op.issueNumber} after ${MAX_RETRIES} retries`, 'error');
          // Clear local modification tracking so next sync takes GitHub state
          localModificationsRef.current.delete(op.issueNumber);
        }
      }
    }

    setPendingRetries(failedOperationsRef.current.length);
  }, [token]);

  // Helper to queue a failed operation
  const queueFailedOperation = (type: 'status' | 'labels', issueNumber: number, payload: unknown) => {
    failedOperationsRef.current.push({
      type,
      issueNumber,
      payload,
      retryCount: 0,
      lastAttempt: Date.now(),
    });
    setPendingRetries(failedOperationsRef.current.length);
  };

  // Handle creating a new GitHub issue from the modal with optimistic update
  const handleCreateGitHubTask = async (task: {
    title: string;
    description: string;
    priority?: Priority;
    effort?: Effort;
    value?: Value;
    category?: string;
    acceptanceCriteria?: string[];
  }) => {
    if (!repo || !token) {
      showToast('GitHub not configured', 'error');
      return;
    }

    // Generate a temporary negative ID for optimistic update
    const tempId = -Date.now();
    const now = new Date().toISOString();
    const priority = task.priority || 'medium';

    // Create optimistic issue that will appear immediately
    const optimisticIssue: GitHubIssue = {
      number: tempId,
      title: task.title,
      body: task.description,
      state: 'open',
      html_url: '',
      created_at: now,
      updated_at: now,
      labels: [
        { name: `priority:${priority}`, color: 'FBCA04' },
        { name: 'status: backlog', color: 'EDEDED' },
        ...(task.effort ? [{ name: `effort:${task.effort}`, color: 'FEF2C0' }] : []),
        ...(task.value ? [{ name: `value:${task.value}`, color: 'EDEDED' }] : []),
        ...(task.category ? [{ name: `category:${task.category}`, color: 'EDEDED' }] : []),
      ],
      assignee: null,
      user: { login: 'you' },
    };

    // Optimistically add the issue to the list
    setIssues(prev => [optimisticIssue, ...prev]);
    setIsNewTaskOpen(false);
    showToast('Creating issue...', 'info');

    setIsCreatingIssue(true);
    try {
      const response = await fetch('/api/github/create-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: {
            title: task.title,
            description: task.description,
            priority,
            effort: task.effort,
            value: task.value,
            category: task.category,
            acceptanceCriteria: task.acceptanceCriteria,
            status: 'backlog',
          },
          repo: `${repo.owner}/${repo.repo}`,
          token,
        }),
      });

      const result = await response.json();
      if (result.success) {
        // Replace optimistic issue with the real one from the API
        setIssues(prev => prev.map(issue =>
          issue.number === tempId
            ? {
                number: result.issue.number,
                title: result.issue.title,
                body: result.issue.body,
                state: result.issue.state,
                html_url: result.issue.html_url,
                created_at: result.issue.created_at,
                updated_at: result.issue.updated_at,
                labels: result.issue.labels || optimisticIssue.labels,
                assignee: result.issue.assignee,
                user: result.issue.user,
              }
            : issue
        ));
        showToast(`Created issue #${result.issue.number}: ${result.issue.title}`, 'success');
      } else {
        // Remove optimistic issue on failure
        setIssues(prev => prev.filter(issue => issue.number !== tempId));
        showToast(`Failed to create issue: ${result.error}`, 'error');
      }
    } catch (err) {
      console.error('Failed to create GitHub issue:', err);
      // Remove optimistic issue on failure
      setIssues(prev => prev.filter(issue => issue.number !== tempId));
      showToast('Failed to create GitHub issue', 'error');
    } finally {
      setIsCreatingIssue(false);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Custom collision detection that prioritizes columns over items
  // This ensures dropping near column headers works correctly
  const customCollisionDetection: CollisionDetection = useCallback((args) => {
    // First check for pointer within droppables (columns)
    const pointerCollisions = pointerWithin(args);

    // Find column collisions (status IDs)
    const columnCollisions = pointerCollisions.filter(
      collision => COLUMN_ORDER.includes(collision.id as Status)
    );

    // If pointer is within a column, prioritize that
    if (columnCollisions.length > 0) {
      return columnCollisions;
    }

    // Fall back to closestCenter for sorting within columns
    return closestCenter(args);
  }, []);

  const fetchIssues = useCallback(async (isBackgroundSync = false) => {
    if (!repo) {
      setLoading(false);
      setError('No repository configured. Open Settings to connect GitHub.');
      return;
    }

    if (isBackgroundSync) {
      setIsSyncing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      // Use the server-side API which has access to GITHUB_TOKEN from .env.local
      const params = new URLSearchParams({
        repo: `${repo.owner}/${repo.repo}`,
        per_page: '100',
      });
      // Optionally pass client token if available
      if (token) {
        params.set('token', token);
      }

      const response = await fetch(`/api/github/issues?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `API error: ${response.status}`);
      }

      const incomingIssues: GitHubIssue[] = data.issues || [];

      // RACE CONDITION FIX: Per-issue merge with local modification tracking
      // For background sync, preserve local state for issues modified locally
      // within the last 10 seconds (gives time for GitHub API to update)
      if (isBackgroundSync) {
        const LOCAL_MOD_WINDOW_MS = 10000; // 10 second window
        const now = Date.now();
        const localMods = localModificationsRef.current;

        setIssues(prevIssues => {
          // Create a map of previous issues by number for quick lookup
          const prevIssueMap = new Map(prevIssues.map(i => [i.number, i]));

          // Merge incoming issues with local modifications
          const mergedIssues = incomingIssues.map(incomingIssue => {
            const localModTime = localMods.get(incomingIssue.number);

            // If we have a recent local modification for this issue...
            if (localModTime && now - localModTime < LOCAL_MOD_WINDOW_MS) {
              const localIssue = prevIssueMap.get(incomingIssue.number);
              if (localIssue) {
                // Compare timestamps: incoming updated_at vs our local mod time
                const incomingUpdatedAt = new Date(incomingIssue.updated_at).getTime();

                // If GitHub's data is older than our local modification, keep local
                if (incomingUpdatedAt < localModTime) {
                  console.log(`[GitHubSync] Preserving local state for #${incomingIssue.number} (local mod: ${localModTime}, GitHub: ${incomingUpdatedAt})`);
                  return localIssue;
                }
                // If GitHub's data is newer, use it and clear local mod tracking
                localMods.delete(incomingIssue.number);
              }
            }

            return incomingIssue;
          });

          // Include any temp issues (negative IDs) that are pending creation
          const tempIssues = prevIssues.filter(i => i.number < 0);

          return [...tempIssues, ...mergedIssues];
        });
      } else {
        // Full refresh (manual): replace all issues, clear local mod tracking
        localModificationsRef.current.clear();
        setIssues(incomingIssues);
      }

      setLastSyncTime(new Date());

      if (isBackgroundSync) {
        console.log('[GitHubSync] Background sync complete');
        // Process any queued retry operations after successful sync
        processRetryQueue();
      }
    } catch (err) {
      console.error('Failed to fetch GitHub issues:', err);
      if (!isBackgroundSync) {
        setError(err instanceof Error ? err.message : 'Failed to fetch issues');
      }
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  }, [repo, token, processRetryQueue]);

  // Initial fetch on mount
  useEffect(() => {
    fetchIssues(false);
  }, [fetchIssues]);

  // Auto-sync polling
  useEffect(() => {
    const interval = getSyncInterval();

    // Clear existing interval
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
    }

    // Only start polling if repo is configured
    if (repo) {
      console.log(`[GitHubSync] Starting auto-sync every ${interval / 1000}s`);
      syncIntervalRef.current = setInterval(() => {
        fetchIssues(true);
      }, interval);
    }

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [repo, fetchIssues]);

  const items = useMemo(() => issues.map(issueToBacklogItem), [issues]);

  // Extract existing categories from all items for dropdown
  const existingCategories = useMemo(() => {
    return Array.from(
      new Set(items.map((item) => item.category).filter(Boolean) as string[])
    ).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }, [items]);

  // Check if actively searching
  const isSearching = searchQuery.trim().length > 0;

  // Organize items by column with Up Next calculation and search filtering
  const columnData = useMemo(() => {
    // Apply search filter first (case-insensitive, partial matches on title and description)
    let filtered = items;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = items.filter(item =>
        item.title.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query) ||
        item.category?.toLowerCase().includes(query) ||
        item.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    const columns: Record<Status, BacklogItem[]> = {
      backlog: [],
      in_progress: [],
      ai_review: [],
      human_review: [],
      ready_to_ship: [],
    };

    filtered.forEach((item) => {
      columns[item.status].push(item);
    });

    // Sort all columns by priority
    Object.keys(columns).forEach((status) => {
      columns[status as Status].sort((a, b) => {
        const priorityDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.order - b.order;
      });
    });

    // Track prioritized items for star display
    const prioritizedIds = new Set(
      items.filter(item => item.isPrioritized).map(item => item.id)
    );

    // Calculate total filtered count
    const filteredCount = filtered.length;

    return { columnItems: columns, prioritizedIds, filteredCount };
  }, [items, searchQuery]);

  const { columnItems, prioritizedIds, filteredCount } = columnData;

  const activeItem = activeId ? items.find(i => i.id === activeId) : null;

  // Update GitHub issue metadata labels (priority, effort, value)
  // Uses OPTIMISTIC UPDATES: UI updates instantly, syncs to GitHub in background
  const updateIssueLabels = (
    issueNumber: number,
    changes: {
      priority?: { old?: Priority; new: Priority };
      effort?: { old?: Effort; new: Effort };
      value?: { old?: Value; new: Value };
    }
  ) => {
    if (!repo) {
      showToast('GitHub repository not configured', 'error');
      return;
    }

    // Track this specific issue's modification time for race condition prevention
    localModificationsRef.current.set(issueNumber, Date.now());

    // 1. OPTIMISTIC UPDATE - Update local state immediately
    const previousIssues = [...issues];

    setIssues(prev => prev.map(i => {
      if (i.number === issueNumber) {
        let updatedLabels = [...i.labels];

        // Update priority label
        if (changes.priority) {
          updatedLabels = updatedLabels.filter(l => !l.name.startsWith('priority:'));
          updatedLabels.push({ name: `priority:${changes.priority.new}`, color: 'FBCA04' });
        }

        // Update effort label
        if (changes.effort) {
          updatedLabels = updatedLabels.filter(l => !l.name.startsWith('effort:'));
          updatedLabels.push({ name: `effort:${changes.effort.new}`, color: 'FEF2C0' });
        }

        // Update value label
        if (changes.value) {
          updatedLabels = updatedLabels.filter(l => !l.name.startsWith('value:'));
          updatedLabels.push({ name: `value:${changes.value.new}`, color: 'EDEDED' });
        }

        return { ...i, labels: updatedLabels };
      }
      return i;
    }));

    // 2. BACKGROUND SYNC - Fire and forget, handle errors with rollback
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    fetch('/api/github/update-labels', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        repo: `${repo.owner}/${repo.repo}`,
        issueNumber,
        ...changes,
      }),
    })
      .then(async response => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed: ${response.status}`);
        }
        // Sync succeeded silently
      })
      .catch(err => {
        // 3. QUEUE FOR RETRY instead of immediate rollback
        console.error('[labels-sync] Failed to sync, queuing for retry:', err);
        queueFailedOperation('labels', issueNumber, {
          repo: `${repo.owner}/${repo.repo}`,
          issueNumber,
          ...changes,
        });
        // Don't rollback - keep optimistic state, let retry handle it
        showToast(`Sync failed for #${issueNumber}, will retry...`, 'info');
      });
  };

  // Update GitHub issue labels when status changes
  // Uses OPTIMISTIC UPDATES: UI updates instantly, syncs to GitHub in background
  const updateIssueStatus = (issueNumber: number, fromStatus: Status, toStatus: Status) => {
    if (!repo) {
      showToast('GitHub repository not configured', 'error');
      return;
    }

    // Track this specific issue's modification time for race condition prevention
    localModificationsRef.current.set(issueNumber, Date.now());

    // 1. OPTIMISTIC UPDATE - Save previous state for rollback, then update UI immediately
    const previousIssues = [...issues];
    const newLabel = STATUS_TO_LABEL[toStatus];

    setIssues(prev => prev.map(i => {
      if (i.number === issueNumber) {
        // Remove old status labels, add new one
        const updatedLabels = i.labels
          .filter(l => !l.name.startsWith('status:'))
          .concat(newLabel ? [{ name: newLabel, color: '000000' }] : []);
        return { ...i, labels: updatedLabels };
      }
      return i;
    }));

    // 2. BACKGROUND SYNC - Fire and forget, handle errors with rollback
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    fetch('/api/github/update-status', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        repo: `${repo.owner}/${repo.repo}`,
        issueNumber,
        oldStatus: fromStatus,
        newStatus: toStatus,
      }),
    })
      .then(async response => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed: ${response.status}`);
        }
        // Sync succeeded silently - no toast needed for success
      })
      .catch(err => {
        // 3. QUEUE FOR RETRY instead of immediate rollback
        console.error('[status-sync] Failed to sync, queuing for retry:', err);
        queueFailedOperation('status', issueNumber, {
          repo: `${repo.owner}/${repo.repo}`,
          issueNumber,
          oldStatus: fromStatus,
          newStatus: toStatus,
        });
        // Don't rollback - keep optimistic state, let retry handle it
        showToast(`Sync failed for #${issueNumber}, will retry...`, 'info');
      });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const draggedItem = items.find(i => i.id === active.id);
    if (!draggedItem) return;

    const overId = over.id as string;

    // Check if dropped on trash zone
    if (overId === 'trash-drop-zone') {
      setItemToDelete(draggedItem);
      setIsDeleteConfirmOpen(true);
      return;
    }

    // If dropped on a column
    if (COLUMN_ORDER.includes(overId as Status)) {
      const targetStatus = overId as Status;
      if (draggedItem.status !== targetStatus && draggedItem.githubIssueNumber) {
        updateIssueStatus(draggedItem.githubIssueNumber, draggedItem.status, targetStatus);
      }
      return;
    }

    // If dropped on another item, move to that item's column
    const overItem = items.find(i => i.id === overId);
    if (overItem && overItem.status !== draggedItem.status && draggedItem.githubIssueNumber) {
      updateIssueStatus(draggedItem.githubIssueNumber, draggedItem.status, overItem.status);
    }
  };

  const handleItemClick = (item: BacklogItem) => {
    setSelectedItem(item);
    setIsPanelOpen(true);
  };

  const handleTackle = (item: BacklogItem) => {
    setTackleItem(item);
    setIsTackleOpen(true);
    setIsPanelOpen(false);
  };

  const handleStartWork = (item: BacklogItem) => {
    // For GitHub issues, we just update the status label (optimistic update)
    if (item.githubIssueNumber) {
      updateIssueStatus(item.githubIssueNumber, item.status, 'in_progress');
      showToast(`Started work on issue #${item.githubIssueNumber}`, 'success');
    }
    setIsTackleOpen(false);
    setTackleItem(null);
  };

  // Close GitHub issue (for trash drop zone and delete button)
  // Uses the server-side API route which has access to GITHUB_TOKEN from .env.local
  const closeGitHubIssue = async (issueNumber: number) => {
    if (!repo) {
      showToast('GitHub repository not configured', 'error');
      return false;
    }

    try {
      // Use the server-side API route which handles token resolution
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Pass client token as fallback if available
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/github/close-issue', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          repo: `${repo.owner}/${repo.repo}`,
          issueNumber,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to close issue: ${response.status}`);
      }

      // Remove from local state
      setIssues(prev => prev.filter(i => i.number !== issueNumber));
      showToast(`Closed issue #${issueNumber}`, 'success');
      return true;
    } catch (err) {
      console.error('Failed to close issue:', err);
      showToast(`Failed to close issue #${issueNumber}`, 'error');
      return false;
    }
  };

  // Trash drop zone handlers
  const handleConfirmTrashDelete = async () => {
    if (itemToDelete?.githubIssueNumber) {
      await closeGitHubIssue(itemToDelete.githubIssueNumber);
    }
    setItemToDelete(null);
    setIsDeleteConfirmOpen(false);
  };

  const handleCancelTrashDelete = () => {
    setItemToDelete(null);
    setIsDeleteConfirmOpen(false);
  };


  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-surface-400 text-sm">Loading GitHub issues...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-surface-300">{error}</p>
          <button
            onClick={() => fetchIssues(false)}
            className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-surface-200 rounded-lg text-sm transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Show "no results" for search, "no issues" for empty repo
  if (items.length === 0 || (isSearching && filteredCount === 0)) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <div className="w-12 h-12 rounded-full bg-surface-800 flex items-center justify-center">
            {isSearching ? (
              <svg className="w-6 h-6 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-surface-400" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10Z" />
              </svg>
            )}
          </div>
          <p className="text-surface-300">
            {isSearching ? 'No tasks found' : 'No open issues found'}
          </p>
          <p className="text-surface-500 text-sm">
            {isSearching
              ? `No issues match "${searchQuery.trim()}"`
              : repo ? `in ${repo.owner}/${repo.repo}` : 'Connect a repository to see issues'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-surface-800/50">
        <div className="flex items-center gap-4">
          <span className="text-xs text-surface-500 uppercase tracking-wider">
            {repo?.owner}/{repo?.repo}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-surface-500">
          <span className="font-mono">
            {isSearching ? `${filteredCount} of ${items.length}` : items.length} open issues
          </span>
          <span className="text-surface-700">|</span>
          <span className="font-mono text-accent">{columnItems.in_progress.length} active</span>
          {/* Pending retries indicator */}
          {pendingRetries > 0 && (
            <span className="text-amber-400 text-[10px] flex items-center gap-1" title={`${pendingRetries} operation(s) pending retry`}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {pendingRetries} retry
            </span>
          )}
          {/* Sync indicator - shows last sync time and current sync status */}
          {lastSyncTime && (
            <span className="text-surface-600 text-[10px]" title={`Auto-syncs every ${getSyncInterval() / 1000}s`}>
              {isSyncing ? (
                <span className="text-accent animate-pulse">syncing...</span>
              ) : (
                `synced ${Math.round((Date.now() - lastSyncTime.getTime()) / 1000)}s ago`
              )}
            </span>
          )}
          <button
            onClick={() => fetchIssues(false)}
            disabled={loading}
            className={`p-1.5 hover:bg-surface-800 rounded-lg transition-colors ${loading || isSyncing ? 'opacity-50' : ''}`}
            title="Refresh now"
          >
            <svg className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={customCollisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 p-6 h-full w-full">
            {COLUMN_ORDER.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                items={columnItems[status]}
                onItemClick={handleItemClick}
                isLoading={false}
                activeTaskId={undefined}
                prioritizedIds={prioritizedIds}
              />
            ))}
          </div>

          <DragOverlay>
            {activeItem ? (
              <TaskCard
                item={activeItem}
                onClick={() => {}}
                isDragging
              />
            ) : null}
          </DragOverlay>

          {/* Trash Drop Zone - appears when dragging */}
          <TrashDropZone isDragging={!!activeId} />
        </DndContext>
      </div>

      {/* Task Panel - view-only for GitHub issues */}
      <TaskPanel
        item={selectedItem}
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        onSave={(updatedItem) => {
          if (selectedItem && updatedItem.githubIssueNumber) {
            // Check if status changed - sync to GitHub
            if (updatedItem.status !== selectedItem.status) {
              updateIssueStatus(updatedItem.githubIssueNumber, selectedItem.status, updatedItem.status);
            }

            // Check if priority, effort, or value changed - sync to GitHub
            const labelChanges: {
              priority?: { old?: Priority; new: Priority };
              effort?: { old?: Effort; new: Effort };
              value?: { old?: Value; new: Value };
            } = {};

            if (updatedItem.priority !== selectedItem.priority) {
              labelChanges.priority = { old: selectedItem.priority, new: updatedItem.priority };
            }
            if (updatedItem.effort !== selectedItem.effort) {
              labelChanges.effort = { old: selectedItem.effort, new: updatedItem.effort! };
            }
            if (updatedItem.value !== selectedItem.value) {
              labelChanges.value = { old: selectedItem.value, new: updatedItem.value! };
            }

            // Only call updateIssueLabels if there are label changes
            if (Object.keys(labelChanges).length > 0) {
              updateIssueLabels(updatedItem.githubIssueNumber, labelChanges);
            }
          }
          setIsPanelOpen(false);
        }}
        onDelete={async () => {
          // Close the GitHub issue when delete is clicked
          if (selectedItem?.githubIssueNumber) {
            const closed = await closeGitHubIssue(selectedItem.githubIssueNumber);
            if (closed) {
              setIsPanelOpen(false);
              setSelectedItem(null);
            }
          }
        }}
        onTackle={handleTackle}
        onAddToBacklog={onAddToBacklog ? async (item) => {
          await onAddToBacklog(item);
          showToast(`Added "${item.title}" to Backlog`, 'success');
          setIsPanelOpen(false);
        } : undefined}
        isGitHubView
        taskSource="github"
        existingCategories={existingCategories}
      />

      {/* Tackle Modal */}
      <TackleModal
        item={tackleItem}
        isOpen={isTackleOpen}
        onClose={() => {
          setIsTackleOpen(false);
          setTackleItem(null);
        }}
        onStartWork={handleStartWork}
        onShowToast={showToast}
        isGitHubView
      />

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Delete Confirmation Modal (closes GitHub issue) */}
      <DeleteConfirmationModal
        item={itemToDelete}
        isOpen={isDeleteConfirmOpen}
        onConfirm={handleConfirmTrashDelete}
        onCancel={handleCancelTrashDelete}
      />

      {/* New Task Modal - creates GitHub issue with AI assist */}
      <NewTaskModal
        isOpen={isNewTaskOpen}
        onClose={() => setIsNewTaskOpen(false)}
        onSubmit={handleCreateGitHubTask}
        existingItems={items.map(item => ({
          id: item.id,
          title: item.title,
          description: item.description,
          category: item.category,
        }))}
      />

      {/* Floating Action Button - opens native task creation modal */}
      {repo && (
        <button
          onClick={() => setIsNewTaskOpen(true)}
          disabled={isCreatingIssue}
          className="fixed bottom-8 right-8 w-14 h-14 bg-accent hover:bg-accent-hover disabled:bg-accent/50 text-surface-900 rounded-full shadow-glow-amber hover:shadow-glow-amber transition-all duration-200 hover:scale-105 disabled:scale-100 flex items-center justify-center z-30"
          title="Create new GitHub issue"
        >
          {isCreatingIssue ? (
            <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
