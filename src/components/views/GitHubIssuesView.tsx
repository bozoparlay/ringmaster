'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  'up_next': 'status: up-next',
  'in_progress': 'status: in-progress',
  'review': 'status: review',
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
  } else if (issue.labels.some(l => l.name === 'status: review')) {
    status = 'review';
  } else if (issue.labels.some(l => l.name === 'status: ready-to-ship')) {
    status = 'ready_to_ship';
  } else if (issue.labels.some(l => l.name === 'status: up-next')) {
    status = 'up_next';
  }
  // Note: 'status: backlog' label or no status label both map to 'backlog'

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
  };
}

interface GitHubIssuesViewProps {
  repo?: { owner: string; repo: string };
  token?: string;
  onTackle?: (item: BacklogItem) => void;
  onAddToBacklog?: (item: BacklogItem) => Promise<void>;
}

export function GitHubIssuesView({ repo, token, onTackle, onAddToBacklog }: GitHubIssuesViewProps) {
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

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  // Handle creating a new GitHub issue from the modal
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

    setIsCreatingIssue(true);
    try {
      const response = await fetch('/api/github/create-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: {
            title: task.title,
            description: task.description,
            priority: task.priority || 'medium',
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
        showToast(`Created issue #${result.issue.number}: ${result.issue.title}`, 'success');
        setIsNewTaskOpen(false);
        // Refresh the issue list
        fetchIssues();
      } else {
        showToast(`Failed to create issue: ${result.error}`, 'error');
      }
    } catch (err) {
      console.error('Failed to create GitHub issue:', err);
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

  const fetchIssues = useCallback(async () => {
    if (!repo) {
      setLoading(false);
      setError('No repository configured. Open Settings to connect GitHub.');
      return;
    }

    setLoading(true);
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

      setIssues(data.issues || []);
    } catch (err) {
      console.error('Failed to fetch GitHub issues:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch issues');
    } finally {
      setLoading(false);
    }
  }, [repo, token]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const items = useMemo(() => issues.map(issueToBacklogItem), [issues]);

  // Organize items by column with Up Next calculation
  const columnData = useMemo(() => {
    const columns: Record<Status, BacklogItem[]> = {
      backlog: [],
      up_next: [],
      in_progress: [],
      review: [],
      ready_to_ship: [],
    };

    items.forEach((item) => {
      if (item.status === 'up_next') {
        columns.backlog.push(item);
      } else {
        columns[item.status].push(item);
      }
    });

    // Sort backlog by priority
    columns.backlog.sort((a, b) => {
      const priorityDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.order - b.order;
    });

    // Calculate Up Next from high-priority backlog items
    let upNextItemIds = new Set<string>();
    const eligibleForUpNext = columns.backlog.filter(
      item => item.priority === 'critical' || item.priority === 'high' || item.priority === 'medium'
    );
    const upNextLimit = calculateUpNextLimit(columns.backlog.length);
    const upNextItems = eligibleForUpNext.slice(0, upNextLimit);
    upNextItemIds = new Set(upNextItems.map(item => item.id));
    columns.up_next = upNextItems;

    // Sort other columns by priority
    ['in_progress', 'review', 'ready_to_ship'].forEach((status) => {
      columns[status as Status].sort((a, b) => {
        const priorityDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.order - b.order;
      });
    });

    return { columnItems: columns, upNextIds: upNextItemIds };
  }, [items]);

  const { columnItems, upNextIds } = columnData;

  const activeItem = activeId ? items.find(i => i.id === activeId) : null;

  // Update GitHub issue labels when status changes
  // Uses OPTIMISTIC UPDATES: UI updates instantly, syncs to GitHub in background
  const updateIssueStatus = (issueNumber: number, fromStatus: Status, toStatus: Status) => {
    if (!repo) {
      showToast('GitHub repository not configured', 'error');
      return;
    }

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
        // 3. ROLLBACK on failure
        console.error('[status-sync] Failed to sync:', err);
        setIssues(previousIssues);
        showToast(`Failed to sync status change for #${issueNumber}`, 'error');
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
      const targetStatus = overId === 'up_next' ? 'backlog' : overId as Status;
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
            onClick={fetchIssues}
            className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-surface-200 rounded-lg text-sm transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <div className="w-12 h-12 rounded-full bg-surface-800 flex items-center justify-center">
            <svg className="w-6 h-6 text-surface-400" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10Z" />
            </svg>
          </div>
          <p className="text-surface-300">No open issues found</p>
          <p className="text-surface-500 text-sm">
            {repo ? `in ${repo.owner}/${repo.repo}` : 'Connect a repository to see issues'}
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
          <span className="font-mono">{items.length} open issues</span>
          <span className="text-surface-700">|</span>
          <span className="font-mono text-accent">{columnItems.in_progress.length} active</span>
          <button
            onClick={fetchIssues}
            className="p-1.5 hover:bg-surface-800 rounded-lg transition-colors"
            title="Refresh"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                upNextIds={upNextIds}
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
          // Check if status changed - if so, sync to GitHub (optimistic update)
          if (selectedItem && updatedItem.status !== selectedItem.status && updatedItem.githubIssueNumber) {
            updateIssueStatus(updatedItem.githubIssueNumber, selectedItem.status, updatedItem.status);
          }
          // Other fields are edited on GitHub directly via the "Edit on GitHub" link
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
