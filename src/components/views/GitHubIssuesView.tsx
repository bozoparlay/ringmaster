'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { KanbanColumn } from '../KanbanColumn';
import { TaskCard } from '../TaskCard';
import { TaskPanel } from '../TaskPanel';
import { TackleModal } from '../TackleModal';
import { Toast, ToastType } from '../Toast';
import { TrashDropZone } from '../TrashDropZone';
import { DeleteConfirmationModal } from '../DeleteConfirmationModal';
import type { BacklogItem, Priority, Effort, Status } from '@/types/backlog';
import { COLUMN_ORDER, PRIORITY_WEIGHT } from '@/types/backlog';

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
  'backlog': null, // No label for backlog
  'up_next': null, // Virtual status
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

  // Determine status from labels
  let status: Status = 'backlog';
  if (issue.labels.some(l => l.name === 'status: in-progress')) {
    status = 'in_progress';
  } else if (issue.labels.some(l => l.name === 'status: review')) {
    status = 'review';
  } else if (issue.labels.some(l => l.name === 'status: ready-to-ship')) {
    status = 'ready_to_ship';
  }

  // Extract tags from other labels
  const tags = issue.labels
    .filter(l => !l.name.startsWith('priority:') && !l.name.startsWith('effort:') && !l.name.startsWith('status:'))
    .map(l => l.name);

  return {
    id: `github-${issue.number}`,
    title: issue.title,
    description: issue.body || '',
    priority,
    effort,
    status,
    tags,
    category: 'GitHub Issues',
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
  const [updatingIssue, setUpdatingIssue] = useState<number | null>(null);

  // Delete confirmation modal state (for closing GitHub issues)
  const [itemToDelete, setItemToDelete] = useState<BacklogItem | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
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
  const updateIssueStatus = async (issueNumber: number, fromStatus: Status, toStatus: Status) => {
    if (!repo || !token) {
      showToast('GitHub token required to update issue status', 'error');
      return false;
    }

    setUpdatingIssue(issueNumber);

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${token}`,
      };

      // Get current labels
      const issue = issues.find(i => i.number === issueNumber);
      if (!issue) return false;

      const currentLabels = issue.labels.map(l => l.name);

      // Remove old status label, add new one
      const oldLabel = STATUS_TO_LABEL[fromStatus];
      const newLabel = STATUS_TO_LABEL[toStatus];

      let updatedLabels = currentLabels.filter(l => !l.startsWith('status:'));
      if (newLabel) {
        updatedLabels.push(newLabel);
      }

      // Update labels via GitHub API
      const response = await fetch(
        `https://api.github.com/repos/${repo.owner}/${repo.repo}/issues/${issueNumber}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ labels: updatedLabels }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update issue: ${response.status}`);
      }

      // Update local state
      setIssues(prev => prev.map(i => {
        if (i.number === issueNumber) {
          return {
            ...i,
            labels: updatedLabels.map(name => ({ name, color: '000000' })),
          };
        }
        return i;
      }));

      showToast(`Issue #${issueNumber} moved to ${toStatus.replace('_', ' ')}`, 'success');
      return true;
    } catch (err) {
      console.error('Failed to update issue status:', err);
      showToast(`Failed to update issue #${issueNumber}`, 'error');
      return false;
    } finally {
      setUpdatingIssue(null);
    }
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
        await updateIssueStatus(draggedItem.githubIssueNumber, draggedItem.status, targetStatus);
      }
      return;
    }

    // If dropped on another item, move to that item's column
    const overItem = items.find(i => i.id === overId);
    if (overItem && overItem.status !== draggedItem.status && draggedItem.githubIssueNumber) {
      await updateIssueStatus(draggedItem.githubIssueNumber, draggedItem.status, overItem.status);
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

  const handleStartWork = async (item: BacklogItem) => {
    // For GitHub issues, we just update the status label
    if (item.githubIssueNumber) {
      const success = await updateIssueStatus(item.githubIssueNumber, item.status, 'in_progress');
      if (success) {
        showToast(`Started work on issue #${item.githubIssueNumber}`, 'success');
      }
    }
    setIsTackleOpen(false);
    setTackleItem(null);
  };

  // Close GitHub issue (for trash drop zone)
  const closeGitHubIssue = async (issueNumber: number) => {
    if (!repo || !token) {
      showToast('GitHub token required to close issues', 'error');
      return false;
    }

    setUpdatingIssue(issueNumber);

    try {
      const response = await fetch(
        `https://api.github.com/repos/${repo.owner}/${repo.repo}/issues/${issueNumber}`,
        {
          method: 'PATCH',
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ state: 'closed' }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to close issue: ${response.status}`);
      }

      // Remove from local state
      setIssues(prev => prev.filter(i => i.number !== issueNumber));
      showToast(`Closed issue #${issueNumber}`, 'success');
      return true;
    } catch (err) {
      console.error('Failed to close issue:', err);
      showToast(`Failed to close issue #${issueNumber}`, 'error');
      return false;
    } finally {
      setUpdatingIssue(null);
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
          {updatingIssue && (
            <span className="text-xs text-accent flex items-center gap-2">
              <div className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />
              Updating #{updatingIssue}...
            </span>
          )}
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
          collisionDetection={closestCenter}
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

      {/* Task Panel - opens GitHub issue on view */}
      <TaskPanel
        item={selectedItem}
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        onSave={async () => {
          // GitHub issues are edited on GitHub directly
          if (selectedItem?.githubIssueUrl) {
            window.open(selectedItem.githubIssueUrl, '_blank');
          }
          setIsPanelOpen(false);
        }}
        onDelete={async () => {
          // Can't delete GitHub issues from here
          showToast('Close issues directly on GitHub', 'info');
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

      {/* Floating Action Button - opens GitHub new issue page */}
      {repo && (
        <button
          onClick={() => window.open(`https://github.com/${repo.owner}/${repo.repo}/issues/new`, '_blank')}
          className="fixed bottom-8 right-8 w-14 h-14 bg-accent hover:bg-accent-hover text-surface-900 rounded-full shadow-glow-amber hover:shadow-glow-amber transition-all duration-200 hover:scale-105 flex items-center justify-center z-30"
          title="Create new issue on GitHub"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}
    </div>
  );
}
