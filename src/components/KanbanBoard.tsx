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
import type { BacklogItem, Priority, Status } from '@/types/backlog';
import { COLUMN_ORDER, PRIORITY_WEIGHT } from '@/types/backlog';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { TaskPanel } from './TaskPanel';
import { NewTaskModal } from './NewTaskModal';
import { TackleModal } from './TackleModal';

interface KanbanBoardProps {
  items: BacklogItem[];
  onUpdateItem: (item: BacklogItem) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onReorderItems: (items: BacklogItem[]) => Promise<void>;
  onAddItem: (title: string, description?: string) => Promise<void>;
  isLoading?: boolean;
}

export function KanbanBoard({
  items,
  onUpdateItem,
  onDeleteItem,
  onReorderItems,
  onAddItem,
  isLoading,
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<BacklogItem | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [isTackleOpen, setIsTackleOpen] = useState(false);
  const [tackleItem, setTackleItem] = useState<BacklogItem | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');

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
    const filtered = priorityFilter === 'all'
      ? items
      : items.filter(item => item.priority === priorityFilter);

    const columns: Record<Status, BacklogItem[]> = {
      backlog: [],
      ready: [],
      in_progress: [],
      review: [],
      done: [],
    };

    filtered.forEach((item) => {
      columns[item.status].push(item);
    });

    // Sort by priority weight, then by order
    Object.keys(columns).forEach((status) => {
      columns[status as Status].sort((a, b) => {
        const priorityDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.order - b.order;
      });
    });

    return columns;
  }, [items, priorityFilter]);

  const activeItem = activeId ? items.find(i => i.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeItem = items.find(i => i.id === active.id);
    if (!activeItem) return;

    // Check if dragging over a column
    const overId = over.id as string;
    if (COLUMN_ORDER.includes(overId as Status)) {
      // Moving to a different column
      if (activeItem.status !== overId) {
        const updatedItem = { ...activeItem, status: overId as Status };
        onUpdateItem(updatedItem);
      }
    }
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
      if (activeItem.status !== overId) {
        onUpdateItem({ ...activeItem, status: overId as Status });
      }
      return;
    }

    // If dropped on another item
    const overItem = items.find(i => i.id === overId);
    if (overItem && activeItem.status === overItem.status) {
      const columnItemsList = columnItems[activeItem.status];
      const oldIndex = columnItemsList.findIndex(i => i.id === active.id);
      const newIndex = columnItemsList.findIndex(i => i.id === over.id);

      if (oldIndex !== newIndex) {
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

  const handleNewTask = async (title: string, description: string) => {
    await onAddItem(title, description);
    setIsNewTaskOpen(false);
  };

  const handleTackle = (item: BacklogItem) => {
    setTackleItem(item);
    setIsTackleOpen(true);
    setIsPanelOpen(false);
  };

  const handleStartWork = async (item: BacklogItem) => {
    // Move to in_progress when starting work
    await onUpdateItem({ ...item, status: 'in_progress' });
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
          <div className="flex gap-4 p-6 h-full min-w-max">
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
      />

      {/* New Task Modal */}
      <NewTaskModal
        isOpen={isNewTaskOpen}
        onClose={() => setIsNewTaskOpen(false)}
        onSubmit={handleNewTask}
      />

      {/* Floating Action Button */}
      <button
        onClick={() => setIsNewTaskOpen(true)}
        className="fixed bottom-8 right-8 w-14 h-14 bg-accent hover:bg-accent-hover text-surface-900 rounded-full shadow-glow-amber hover:shadow-glow-amber transition-all duration-200 hover:scale-105 flex items-center justify-center z-30"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}
