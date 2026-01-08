'use client';

import { useState, useMemo } from 'react';
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
  DragOverEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { BacklogItem, Priority, Status, Effort, Value } from '@/types/backlog';
import { COLUMN_ORDER, PRIORITY_WEIGHT, UP_NEXT_LIMIT } from '@/types/backlog';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { TaskPanel } from './TaskPanel';
import { TackleModal } from './TackleModal';
import { ReviewModal } from './ReviewModal';
import { Toast, ToastType } from './Toast';

interface ReviewResult {
  passed: boolean;
  summary: string;
  issues: Array<{
    severity: 'critical' | 'major' | 'minor' | 'suggestion';
    file?: string;
    line?: number;
    message: string;
  }>;
}

interface KanbanBoardProps {
  items: BacklogItem[];
  onUpdateItem: (item: BacklogItem) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onReorderItems: (items: BacklogItem[]) => Promise<void>;
  onNewTask: () => void;
  isLoading?: boolean;
  searchQuery?: string;
  backlogPath?: string;
}

export function KanbanBoard({
  items,
  onUpdateItem,
  onDeleteItem,
  onReorderItems,
  onNewTask,
  isLoading,
  searchQuery = '',
  backlogPath,
}: KanbanBoardProps) {
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

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  // Trigger code review when moving to review column
  const triggerReview = async (item: BacklogItem) => {
    setReviewItem(item);
    setIsReviewOpen(true);
    setIsReviewLoading(true);
    setReviewResult(null);
    setReviewError(undefined);

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
        }),
      });

      const data = await response.json();
      if (data.success) {
        setReviewResult(data.result);
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

  // Handle review modal actions
  const handleReviewContinue = async () => {
    if (!reviewItem) return;
    // Move to ready_to_ship
    await onUpdateItem({ ...reviewItem, status: 'ready_to_ship' });
    setIsReviewOpen(false);
    setReviewItem(null);
    showToast('Task moved to Ready to Ship!', 'success');
  };

  const handleReviewRetry = async () => {
    if (!reviewItem) return;
    // Store feedback if review failed
    const feedback = reviewResult && !reviewResult.passed
      ? reviewResult.summary
      : undefined;
    // Move back to in_progress with feedback
    await onUpdateItem({
      ...reviewItem,
      status: 'in_progress',
      reviewFeedback: feedback,
    });
    setIsReviewOpen(false);
    setReviewItem(null);
    if (feedback) {
      showToast('Task returned to In Progress with review feedback', 'info');
    }
  };

  const isSearching = searchQuery.trim().length > 0;

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

  // Filter and organize items by column
  const columnItems = useMemo(() => {
    // Apply priority filter
    let filtered = priorityFilter === 'all'
      ? items
      : items.filter(item => item.priority === priorityFilter);

    // Apply search filter
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

    // First pass: distribute items to their actual status columns
    filtered.forEach((item) => {
      // Skip up_next status items - they should go to backlog
      // (up_next is computed, not a stored status)
      if (item.status === 'up_next') {
        columns.backlog.push(item);
      } else {
        columns[item.status].push(item);
      }
    });

    // Sort backlog by priority weight, then by order
    columns.backlog.sort((a, b) => {
      const priorityDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.order - b.order;
    });

    // Compute "Up Next" - take top N high-priority items from backlog
    // Only items with critical, high, or medium priority are eligible
    // When searching, disable auto-population so items stay in their actual columns
    if (!isSearching) {
      const eligibleForUpNext = columns.backlog.filter(
        item => item.priority === 'critical' || item.priority === 'high' || item.priority === 'medium'
      );
      const upNextItems = eligibleForUpNext.slice(0, UP_NEXT_LIMIT);
      const upNextIds = new Set(upNextItems.map(item => item.id));

      // Move Up Next items from backlog display
      columns.up_next = upNextItems;
      columns.backlog = columns.backlog.filter(item => !upNextIds.has(item.id));
    }

    // Sort other columns by priority weight, then by order
    ['in_progress', 'review', 'ready_to_ship'].forEach((status) => {
      columns[status as Status].sort((a, b) => {
        const priorityDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.order - b.order;
      });
    });

    return columns;
  }, [items, priorityFilter, searchQuery, isSearching]);

  const activeItem = activeId ? items.find(i => i.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Don't update status on hover - wait for drop
    // This prevents items from getting "stuck" during drag
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeItem = items.find(i => i.id === active.id);
    if (!activeItem) return;

    const overId = over.id as string;

    // If dropped on a column
    if (COLUMN_ORDER.includes(overId as Status)) {
      // Check if item is being moved FROM up_next TO backlog (deprioritizing)
      const isInUpNext = columnItems.up_next.some(i => i.id === activeItem.id);
      if (isInUpNext && overId === 'backlog') {
        // Downgrade priority to 'low' so it drops out of Up Next
        onUpdateItem({ ...activeItem, priority: 'low' });
        return;
      }

      // up_next is virtual - treat drops there as backlog
      const targetStatus = overId === 'up_next' ? 'backlog' : overId as Status;
      if (activeItem.status !== targetStatus) {
        // Intercept moves to review column - trigger code review
        if (targetStatus === 'review' && activeItem.status === 'in_progress') {
          triggerReview(activeItem);
          return;
        }
        onUpdateItem({ ...activeItem, status: targetStatus });
      }
      return;
    }

    // If dropped on another item
    const overItem = items.find(i => i.id === overId);
    if (overItem) {
      // Find which visual column each item is in (could differ from stored status due to Up Next)
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

      // If dropped on item in a different visual column, move to that column
      if (targetVisualColumn && activeVisualColumn !== targetVisualColumn) {
        // Check if moving FROM up_next TO backlog (deprioritizing)
        if (activeVisualColumn === 'up_next' && targetVisualColumn === 'backlog') {
          onUpdateItem({ ...activeItem, priority: 'low' });
          return;
        }

        // up_next is virtual - treat as backlog
        const actualStatus = targetVisualColumn === 'up_next' ? 'backlog' : targetVisualColumn;
        // Intercept moves to review column - trigger code review
        if (actualStatus === 'review' && activeItem.status === 'in_progress') {
          triggerReview(activeItem);
          return;
        }
        onUpdateItem({ ...activeItem, status: actualStatus });
        return;
      }

      // If same visual column, reorder
      if (targetVisualColumn && activeVisualColumn === targetVisualColumn) {
        const columnItemsList = columnItems[targetVisualColumn];
        const oldIndex = columnItemsList.findIndex(i => i.id === active.id);
        const newIndex = columnItemsList.findIndex(i => i.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = arrayMove(columnItemsList, oldIndex, newIndex);
          // Update order values
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
    setSelectedItem(null);
  };

  const handleDeleteItem = async (id: string) => {
    await onDeleteItem(id);
    setSelectedItem(null);
    setIsPanelOpen(false);
  };

  const handleTackle = (item: BacklogItem) => {
    setTackleItem(item);
    setIsTackleOpen(true);
    setIsPanelOpen(false);
  };

  const handleShip = async (item: BacklogItem) => {
    try {
      // Step 1: Commit, push, and clean up worktree
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

      // Step 2: Delete the task from backlog (updates BACKLOG.md file)
      await onDeleteItem(item.id);

      // Step 3: Commit the backlog change to main repo
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
          // Don't fail the ship - the task was already pushed
        }
      }

      showToast(`Shipped! Branch ${result.branch} pushed to remote.`, 'success');
    } catch (error) {
      console.error('Ship error:', error);
      showToast('Ship failed. Check console for details.', 'error');
    }
  };

  const handleStartWork = async (item: BacklogItem) => {
    // Create worktree for isolated development
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
        // Update item with branch and worktree info
        await onUpdateItem({
          ...item,
          status: 'in_progress',
          branch: result.branch,
          worktreePath: result.worktreePath,
        });

        if (result.alreadyExists) {
          showToast(`Worktree already exists: ${result.worktreePath}`, 'info');
        } else {
          showToast(`Created worktree: ${result.worktreePath} (branch: ${result.branch})`, 'success');
        }
      } else {
        // Still move to in_progress but without worktree
        await onUpdateItem({ ...item, status: 'in_progress' });
        showToast(`Could not create worktree: ${result.error}`, 'error');
      }
    } catch (error) {
      // Fallback - still move to in_progress
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
        {/* Priority Filter */}
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

        {/* Stats */}
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
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
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
        onShip={handleShip}
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
      />

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

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
