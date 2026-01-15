'use client';

import { useState, useMemo, useCallback } from 'react';
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
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { BacklogItem, Priority, Status } from '@/types/backlog';
import { COLUMN_ORDER, PRIORITY_WEIGHT } from '@/types/backlog';
import { KanbanColumn } from '../KanbanColumn';
import { TaskCard } from '../TaskCard';
import { TaskPanel } from '../TaskPanel';
import { TackleModal } from '../TackleModal';
import { ReviewModal } from '../ReviewModal';
import { Toast, ToastType } from '../Toast';
import { TrashDropZone } from '../TrashDropZone';
import { DeleteConfirmationModal } from '../DeleteConfirmationModal';
import type { AuxiliarySignals } from '@/lib/local-storage-cache';
import { getGitHubSyncConfig, GitHubSyncService } from '@/lib/storage/github-sync';
import { getUserGitHubConfig } from '@/lib/storage/project-config';

/**
 * Close a GitHub issue when deleting a task that's linked to one.
 * Fails silently if GitHub is not configured or the API call fails.
 */
async function closeGitHubIssue(item: BacklogItem): Promise<boolean> {
  if (!item.githubIssueNumber) return false;

  const config = getGitHubSyncConfig();
  if (!config || !config.token || config.token === 'server-managed') {
    // Try user config as fallback
    const userConfig = getUserGitHubConfig();
    if (!userConfig?.token) return false;

    // Get repo from sync config or return false
    if (!config?.repo) return false;

    try {
      await fetch(`https://api.github.com/repos/${config.repo}/issues/${item.githubIssueNumber}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${userConfig.token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({ state: 'closed' }),
      });
      return true;
    } catch (err) {
      console.error('[BacklogView] Failed to close GitHub issue:', err);
      return false;
    }
  }

  try {
    const service = new GitHubSyncService(config);
    await service.closeIssue(item.githubIssueNumber);
    return true;
  } catch (err) {
    console.error('[BacklogView] Failed to close GitHub issue:', err);
    return false;
  }
}

/**
 * Sync task changes to a linked GitHub issue.
 * Updates the issue title, body, labels, and state.
 */
async function syncToGitHub(item: BacklogItem): Promise<boolean> {
  if (!item.githubIssueNumber) return false;

  const config = getGitHubSyncConfig();
  if (!config) return false;

  // Resolve token - try sync config first, then user config
  let token: string | undefined = config.token;
  if (!token || token === 'server-managed') {
    const userConfig = getUserGitHubConfig();
    token = userConfig?.token;
  }

  if (!token) return false;

  try {
    const service = new GitHubSyncService({ ...config, token: token });
    await service.updateIssue(item.githubIssueNumber, item);
    return true;
  } catch (err) {
    console.error('[BacklogView] Failed to sync to GitHub:', err);
    return false;
  }
}

// Priority levels in order from highest to lowest
const PRIORITY_ORDER: Priority[] = ['critical', 'high', 'medium', 'low', 'someday'];

// Up Next sizing configuration
const UP_NEXT_CONFIG = {
  SMALL_THRESHOLD: 5,
  SMALL_LIMIT: 1,
  MEDIUM_THRESHOLD: 10,
  MEDIUM_LIMIT: 3,
  LARGE_THRESHOLD: 15,
  LARGE_LIMIT: 4,
  MAX_LIMIT: 5,
} as const;

function downgradePriority(current: Priority): Priority {
  const index = PRIORITY_ORDER.indexOf(current);
  if (index >= PRIORITY_ORDER.length - 1) return current;
  return PRIORITY_ORDER[index + 1];
}

function upgradePriority(current: Priority): Priority {
  const index = PRIORITY_ORDER.indexOf(current);
  if (index <= 0) return current;
  return PRIORITY_ORDER[index - 1];
}

function calculateUpNextLimit(backlogSize: number): number {
  if (backlogSize < UP_NEXT_CONFIG.SMALL_THRESHOLD) return UP_NEXT_CONFIG.SMALL_LIMIT;
  if (backlogSize < UP_NEXT_CONFIG.MEDIUM_THRESHOLD) return UP_NEXT_CONFIG.MEDIUM_LIMIT;
  if (backlogSize < UP_NEXT_CONFIG.LARGE_THRESHOLD) return UP_NEXT_CONFIG.LARGE_LIMIT;
  return UP_NEXT_CONFIG.MAX_LIMIT;
}

interface ScopeAnalysis {
  aligned: boolean;
  needsRescope: boolean;
  completeness: 'complete' | 'partial' | 'minimal';
  missingRequirements: string[];
  scopeCreep: string[];
  reason?: string;
}

interface ReviewResult {
  passed: boolean;
  summary: string;
  issues: Array<{
    severity: 'critical' | 'major' | 'minor' | 'suggestion';
    file?: string;
    line?: number;
    message: string;
  }>;
  scope?: ScopeAnalysis;
}

export interface BacklogViewProps {
  items: BacklogItem[];
  onUpdateItem: (item: BacklogItem) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onReorderItems: (items: BacklogItem[]) => Promise<void>;
  onNewTask: () => void;
  isLoading?: boolean;
  searchQuery?: string;
  backlogPath?: string;
  signals?: AuxiliarySignals;
  onUpdatePRStatus?: (taskId: string, status: AuxiliarySignals['prStatus'][string]) => void;
}

export function BacklogView({
  items,
  onUpdateItem,
  onDeleteItem,
  onReorderItems,
  onNewTask,
  isLoading,
  searchQuery = '',
  backlogPath,
  signals,
  onUpdatePRStatus,
}: BacklogViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<BacklogItem | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isTackleOpen, setIsTackleOpen] = useState(false);
  const [tackleItem, setTackleItem] = useState<BacklogItem | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  // Review modal state
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [reviewError, setReviewError] = useState<string | undefined>();
  const [reviewItem, setReviewItem] = useState<BacklogItem | null>(null);
  const [prUrl, setPrUrl] = useState<string | undefined>();
  const [prNumber, setPrNumber] = useState<number | undefined>();
  const [prError, setPrError] = useState<string | undefined>();

  // Delete confirmation modal state
  const [itemToDelete, setItemToDelete] = useState<BacklogItem | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  const triggerReview = async (item: BacklogItem) => {
    setReviewItem(item);
    setIsReviewOpen(true);
    setIsReviewLoading(true);
    setReviewResult(null);
    setReviewError(undefined);
    setPrUrl(undefined);
    setPrNumber(undefined);
    setPrError(undefined);

    try {
      const response = await fetch('/api/review-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: item.id,
          title: item.title,
          description: item.description,
          branch: item.branch,
          worktreePath: item.worktreePath,
          backlogPath,
          githubIssueNumber: item.githubIssueNumber,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setReviewResult(data.result);
        if (data.prUrl) setPrUrl(data.prUrl);
        if (data.prNumber) setPrNumber(data.prNumber);
        if (data.prError) setPrError(data.prError);
      } else {
        setReviewError(data.error || 'Review failed');
      }
    } catch (error) {
      console.error('Review error:', error);
      setReviewError(error instanceof Error ? error.message : 'Review failed');
    } finally {
      setIsReviewLoading(false);
    }
  };

  const handleReviewContinue = async () => {
    if (!reviewItem) return;
    await onUpdateItem({ ...reviewItem, status: 'ready_to_ship' });
    setIsReviewOpen(false);
    setReviewItem(null);
    showToast('Task moved to Ready to Ship!', 'success');
  };

  const handleReviewRetry = async () => {
    if (!reviewItem) return;

    let feedbackParts: string[] = [];
    if (reviewResult) {
      if (!reviewResult.passed) {
        feedbackParts.push(reviewResult.summary);
      }
      if (reviewResult.scope) {
        if (reviewResult.scope.needsRescope && reviewResult.scope.reason) {
          feedbackParts.push(`Rescope needed: ${reviewResult.scope.reason}`);
        }
        if (reviewResult.scope.missingRequirements.length > 0) {
          feedbackParts.push(`Missing: ${reviewResult.scope.missingRequirements.join(', ')}`);
        }
      }
    }

    const feedback = feedbackParts.length > 0 ? feedbackParts.join(' | ') : undefined;
    await onUpdateItem({
      ...reviewItem,
      status: 'in_progress',
      reviewFeedback: feedback,
    });
    setIsReviewOpen(false);
    setReviewItem(null);

    if (reviewResult?.scope?.needsRescope) {
      showToast('Task returned to In Progress - review the scope requirements', 'info');
    } else if (feedback) {
      showToast('Task returned to In Progress with review feedback', 'info');
    }
  };

  const isSearching = searchQuery.trim().length > 0;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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

  const columnData = useMemo(() => {
    let filtered = priorityFilter === 'all'
      ? items
      : items.filter(item => item.priority === priorityFilter);

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(item =>
        item.title.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query) ||
        item.category?.toLowerCase().includes(query) ||
        item.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    const columns: Record<Status, BacklogItem[]> = {
      backlog: [],
      up_next: [],
      in_progress: [],
      review: [],
      ready_to_ship: [],
    };

    filtered.forEach((item) => {
      if (item.status === 'up_next') {
        columns.backlog.push(item);
      } else {
        columns[item.status].push(item);
      }
    });

    columns.backlog.sort((a, b) => {
      const priorityDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.order - b.order;
    });

    let upNextItemIds = new Set<string>();
    if (!isSearching) {
      const eligibleForUpNext = columns.backlog.filter(
        item => item.priority === 'critical' || item.priority === 'high' || item.priority === 'medium'
      );
      const upNextLimit = calculateUpNextLimit(columns.backlog.length);
      const upNextItems = eligibleForUpNext.slice(0, upNextLimit);
      upNextItemIds = new Set(upNextItems.map(item => item.id));
      columns.up_next = upNextItems;
    }

    ['in_progress', 'review', 'ready_to_ship'].forEach((status) => {
      columns[status as Status].sort((a, b) => {
        const priorityDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.order - b.order;
      });
    });

    return { columnItems: columns, upNextIds: upNextItemIds };
  }, [items, priorityFilter, searchQuery, isSearching]);

  const { columnItems, upNextIds } = columnData;
  const activeItem = activeId ? items.find(i => i.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeItem = items.find(i => i.id === active.id);
    if (!activeItem) return;

    const overId = over.id as string;

    // Check if dropped on trash zone
    if (overId === 'trash-drop-zone') {
      setItemToDelete(activeItem);
      setIsDeleteConfirmOpen(true);
      return;
    }

    if (COLUMN_ORDER.includes(overId as Status)) {
      const isInUpNext = columnItems.up_next.some(i => i.id === activeItem.id);
      const isInBacklog = columnItems.backlog.some(i => i.id === activeItem.id);

      if (isInUpNext && overId === 'backlog') {
        const newPriority = downgradePriority(activeItem.priority);
        onUpdateItem({ ...activeItem, priority: newPriority });
        return;
      }

      if (isInBacklog && overId === 'up_next') {
        let newPriority = upgradePriority(activeItem.priority);
        const priorityIndex = PRIORITY_ORDER.indexOf(newPriority);
        const mediumIndex = PRIORITY_ORDER.indexOf('medium');
        if (priorityIndex > mediumIndex) {
          newPriority = 'medium';
        }
        onUpdateItem({ ...activeItem, priority: newPriority });
        return;
      }

      const targetStatus = overId === 'up_next' ? 'backlog' : overId as Status;
      if (activeItem.status !== targetStatus) {
        if (targetStatus === 'review' && activeItem.status === 'in_progress') {
          const updatedItem = { ...activeItem, status: 'review' as Status };
          onUpdateItem(updatedItem);
          triggerReview(updatedItem);
          return;
        }
        onUpdateItem({ ...activeItem, status: targetStatus });
      }
      return;
    }

    const overItem = items.find(i => i.id === overId);
    if (overItem) {
      let activeVisualColumn: Status | null = null;
      let targetVisualColumn: Status | null = null;

      for (const [status, columnList] of Object.entries(columnItems)) {
        if (columnList.some(item => item.id === active.id)) {
          activeVisualColumn = status as Status;
        }
        if (columnList.some(item => item.id === overId)) {
          targetVisualColumn = status as Status;
        }
      }

      if (targetVisualColumn && activeVisualColumn !== targetVisualColumn) {
        if (activeVisualColumn === 'up_next' && targetVisualColumn === 'backlog') {
          const newPriority = downgradePriority(activeItem.priority);
          onUpdateItem({ ...activeItem, priority: newPriority });
          return;
        }

        if (activeVisualColumn === 'backlog' && targetVisualColumn === 'up_next') {
          let newPriority = upgradePriority(activeItem.priority);
          const priorityIndex = PRIORITY_ORDER.indexOf(newPriority);
          const mediumIndex = PRIORITY_ORDER.indexOf('medium');
          if (priorityIndex > mediumIndex) {
            newPriority = 'medium';
          }
          onUpdateItem({ ...activeItem, priority: newPriority });
          return;
        }

        const actualStatus = targetVisualColumn === 'up_next' ? 'backlog' : targetVisualColumn;
        if (actualStatus === 'review' && activeItem.status === 'in_progress') {
          const updatedItem = { ...activeItem, status: 'review' as Status };
          onUpdateItem(updatedItem);
          triggerReview(updatedItem);
          return;
        }
        onUpdateItem({ ...activeItem, status: actualStatus });
        return;
      }

      if (targetVisualColumn && activeVisualColumn === targetVisualColumn) {
        const columnItemsList = columnItems[targetVisualColumn];
        const oldIndex = columnItemsList.findIndex(i => i.id === active.id);
        const newIndex = columnItemsList.findIndex(i => i.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = arrayMove(columnItemsList, oldIndex, newIndex);
          const updatedItems = items.map(item => {
            const reorderedIndex = reordered.findIndex(r => r.id === item.id);
            if (reorderedIndex !== -1) {
              return { ...item, order: reorderedIndex };
            }
            return item;
          });
          onReorderItems(updatedItems);
        }
      }
    }
  };

  const handleItemClick = (item: BacklogItem) => {
    setSelectedItem(item);
    setIsPanelOpen(true);
  };

  const handleSaveItem = async (item: BacklogItem) => {
    await onUpdateItem(item);
    // Sync to GitHub if linked (fire and forget - don't block UI)
    if (item.githubIssueNumber) {
      syncToGitHub(item).then(synced => {
        if (synced) {
          showToast(`Synced to GitHub issue #${item.githubIssueNumber}`, 'success');
        }
      });
    }
    setSelectedItem(null);
  };

  const handleDeleteItem = async (id: string) => {
    // Find the item to check for GitHub link
    const itemToDelete = items.find(i => i.id === id);
    if (itemToDelete) {
      // Close GitHub issue if linked
      const closedGitHub = await closeGitHubIssue(itemToDelete);
      if (closedGitHub) {
        showToast(`Closed GitHub issue #${itemToDelete.githubIssueNumber}`, 'success');
      }
    }
    await onDeleteItem(id);
    setSelectedItem(null);
    setIsPanelOpen(false);
  };

  // Trash drop zone handlers
  const handleConfirmTrashDelete = async () => {
    if (itemToDelete) {
      // Close GitHub issue if linked
      const closedGitHub = await closeGitHubIssue(itemToDelete);
      await onDeleteItem(itemToDelete.id);

      if (closedGitHub) {
        showToast(`Deleted "${itemToDelete.title}" and closed GitHub issue #${itemToDelete.githubIssueNumber}`, 'success');
      } else {
        showToast(`Deleted "${itemToDelete.title}"`, 'info');
      }
      setItemToDelete(null);
      setIsDeleteConfirmOpen(false);
    }
  };

  const handleCancelTrashDelete = () => {
    setItemToDelete(null);
    setIsDeleteConfirmOpen(false);
  };

  const handleTackle = (item: BacklogItem) => {
    setTackleItem(item);
    setIsTackleOpen(true);
    setIsPanelOpen(false);
  };

  const handleShip = async (item: BacklogItem) => {
    try {
      const response = await fetch('/api/ship-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: item.id,
          title: item.title,
          branch: item.branch,
          worktreePath: item.worktreePath,
          backlogPath,
        }),
      });

      const result = await response.json();
      if (!result.success) {
        showToast(`Ship failed: ${result.error}`, 'error');
        return;
      }

      await onDeleteItem(item.id);

      if (backlogPath) {
        try {
          await fetch('/api/commit-backlog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              backlogPath,
              message: `Ship: ${item.title}`,
            }),
          });
        } catch (commitError) {
          console.warn('Failed to commit backlog change:', commitError);
        }
      }

      showToast(`Shipped! Branch ${result.branch} pushed to remote.`, 'success');
    } catch (error) {
      console.error('Ship error:', error);
      showToast('Ship failed. Check console for details.', 'error');
    }
  };

  const handleStartWork = async (item: BacklogItem) => {
    try {
      const response = await fetch('/api/create-worktree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: item.id,
          title: item.title,
          backlogPath,
        }),
      });

      const result = await response.json();
      if (result.success) {
        await onUpdateItem({
          ...item,
          status: 'in_progress',
          branch: result.branch,
          worktreePath: result.worktreePath,
        });

        if (result.alreadyExists) {
          // GAP #17 FIX: More helpful message when worktree exists
          showToast(`Opening existing worktree at ${result.worktreePath}`, 'success');
        } else {
          showToast(`Created worktree at ${result.worktreePath}`, 'success');
        }
      } else {
        await onUpdateItem({ ...item, status: 'in_progress' });
        showToast(`Could not create worktree: ${result.error}`, 'error');
      }
    } catch (error) {
      await onUpdateItem({ ...item, status: 'in_progress' });
      console.error('Worktree creation failed:', error);
      showToast('Worktree creation failed, but task moved to In Progress', 'error');
    }

    setIsTackleOpen(false);
    setTackleItem(null);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-surface-800/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-surface-500 uppercase tracking-wider">Filter:</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as Priority | 'all')}
              className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-1.5 text-sm text-surface-200 focus:outline-none focus:border-accent/50 transition-colors"
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="someday">Someday</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-surface-500">
          {isSearching && (
            <>
              <span className="font-mono text-accent">{Object.values(columnItems).flat().length} matches</span>
              <span className="text-surface-700">|</span>
            </>
          )}
          <span className="font-mono">{items.length} total</span>
          <span className="text-surface-700">|</span>
          <span className="font-mono text-accent">{columnItems.in_progress.length} active</span>
        </div>
      </div>

      {/* Board */}
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
                isLoading={isLoading}
                activeTaskId={undefined}
                upNextIds={upNextIds}
                onAddItem={status === 'backlog' ? onNewTask : undefined}
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

      {/* Task Panel */}
      <TaskPanel
        item={selectedItem}
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        onSave={handleSaveItem}
        onDelete={handleDeleteItem}
        onTackle={handleTackle}
        onReview={triggerReview}
        onShip={handleShip}
        onUnlinkGitHub={async (item) => {
          await onUpdateItem({
            ...item,
            githubIssueNumber: undefined,
            githubIssueUrl: undefined,
          });
          showToast(`Unlinked task from GitHub Issue #${item.githubIssueNumber}`, 'info');
          setSelectedItem(null);
          setIsPanelOpen(false);
        }}
        onSendToGitHub={async (item) => {
          const syncConfig = getGitHubSyncConfig();
          const userConfig = getUserGitHubConfig();
          const repo = syncConfig?.repo;
          const token = userConfig?.token;

          if (!repo) {
            showToast('Configure GitHub repository in settings first', 'error');
            throw new Error('GitHub repository not configured');
          }

          // Send full task object for proper formatting with all metadata
          const response = await fetch('/api/github/create-issue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              task: item,
              repo,
              token: token || 'server-managed',
            }),
          });

          const data = await response.json();
          if (!response.ok) {
            showToast(data.error || 'Failed to create issue', 'error');
            throw new Error(data.error || 'Failed to create issue');
          }

          // Update the item with the new GitHub link
          await onUpdateItem({
            ...item,
            githubIssueNumber: data.issue.number,
            githubIssueUrl: data.issue.url,
          });

          showToast(`Created GitHub Issue #${data.issue.number}`, 'success');
          return { issueNumber: data.issue.number, issueUrl: data.issue.url };
        }}
        backlogPath={backlogPath}
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
        backlogPath={backlogPath}
      />

      {/* Review Modal */}
      <ReviewModal
        isOpen={isReviewOpen}
        isLoading={isReviewLoading}
        result={reviewResult}
        error={reviewError}
        onClose={() => {
          setIsReviewOpen(false);
          setReviewItem(null);
        }}
        onContinue={handleReviewContinue}
        onRetry={handleReviewRetry}
        taskTitle={reviewItem?.title || ''}
        prUrl={prUrl}
        prNumber={prNumber}
        prError={prError}
      />

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        item={itemToDelete}
        isOpen={isDeleteConfirmOpen}
        onConfirm={handleConfirmTrashDelete}
        onCancel={handleCancelTrashDelete}
      />

      {/* Floating Action Button */}
      <button
        onClick={onNewTask}
        className="fixed bottom-8 right-8 w-14 h-14 bg-accent hover:bg-accent-hover text-surface-900 rounded-full shadow-glow-amber hover:shadow-glow-amber transition-all duration-200 hover:scale-105 flex items-center justify-center z-30"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}
