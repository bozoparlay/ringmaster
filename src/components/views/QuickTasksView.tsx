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
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { KanbanColumn } from '../KanbanColumn';
import { TaskCard } from '../TaskCard';
import { TaskPanel } from '../TaskPanel';
import { TackleModal } from '../TackleModal';
import { Toast, ToastType } from '../Toast';
import type { BacklogItem, Priority, Status } from '@/types/backlog';
import { PRIORITY_WEIGHT } from '@/types/backlog';
import { v4 as uuidv4 } from 'uuid';

const QUICK_TASKS_KEY = 'ringmaster:quick-tasks';

// Simplified column order for Quick Tasks (no Up Next or Review)
const QUICK_TASK_COLUMNS: Status[] = ['backlog', 'in_progress', 'ready_to_ship'];

// Column display names for Quick Tasks
const COLUMN_LABELS: Record<Status, string> = {
  backlog: 'To Do',
  up_next: 'Up Next',
  in_progress: 'In Progress',
  review: 'Review',
  ready_to_ship: 'Done',
};

// Simple inline task creator
function QuickTaskInput({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onAdd(title.trim());
      setTitle('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a quick task..."
        className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-4 py-2 text-sm text-surface-200 placeholder-surface-500 focus:outline-none focus:border-accent/50 transition-colors"
      />
      <button
        type="submit"
        disabled={!title.trim()}
        className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:bg-surface-700 disabled:text-surface-500 text-surface-900 rounded-lg text-sm font-medium transition-colors"
      >
        Add
      </button>
    </form>
  );
}

export interface QuickTasksViewProps {
  onPromoteToBacklog?: (item: BacklogItem) => void;
}

export function QuickTasksView({ onPromoteToBacklog }: QuickTasksViewProps) {
  const [tasks, setTasks] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [selectedItem, setSelectedItem] = useState<BacklogItem | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isTackleOpen, setIsTackleOpen] = useState(false);
  const [tackleItem, setTackleItem] = useState<BacklogItem | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  // Load tasks from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(QUICK_TASKS_KEY);
      if (stored) {
        setTasks(JSON.parse(stored));
      }
    } catch (err) {
      console.error('Failed to load quick tasks:', err);
    }
    setLoading(false);
  }, []);

  // Save tasks to localStorage
  const saveTasks = useCallback((newTasks: BacklogItem[]) => {
    setTasks(newTasks);
    try {
      localStorage.setItem(QUICK_TASKS_KEY, JSON.stringify(newTasks));
    } catch (err) {
      console.error('Failed to save quick tasks:', err);
      showToast('Failed to save tasks', 'error');
    }
  }, []);

  const addTask = useCallback((title: string) => {
    const now = new Date().toISOString();
    const newTask: BacklogItem = {
      id: uuidv4(),
      title,
      description: '',
      priority: 'medium',
      status: 'backlog',
      tags: [],
      category: 'Quick Tasks',
      createdAt: now,
      updatedAt: now,
      order: tasks.length,
    };
    saveTasks([...tasks, newTask]);
    showToast('Task added', 'success');
  }, [tasks, saveTasks]);

  const updateTask = useCallback((updatedTask: BacklogItem) => {
    const newTasks = tasks.map(t =>
      t.id === updatedTask.id
        ? { ...updatedTask, updatedAt: new Date().toISOString() }
        : t
    );
    saveTasks(newTasks);
  }, [tasks, saveTasks]);

  const deleteTask = useCallback((id: string) => {
    const newTasks = tasks.filter(t => t.id !== id);
    saveTasks(newTasks);
    showToast('Task deleted', 'info');
  }, [tasks, saveTasks]);

  const handlePromote = useCallback((item: BacklogItem) => {
    if (onPromoteToBacklog) {
      onPromoteToBacklog(item);
      deleteTask(item.id);
      showToast('Task promoted to Backlog!', 'success');
    } else {
      showToast('Promote to Backlog not available', 'info');
    }
  }, [onPromoteToBacklog, deleteTask]);

  // Open task panel when clicking on a task
  const handleItemClick = useCallback((item: BacklogItem) => {
    setSelectedItem(item);
    setIsPanelOpen(true);
  }, []);

  // Open tackle modal
  const handleTackle = useCallback((item: BacklogItem) => {
    setTackleItem(item);
    setIsTackleOpen(true);
    setIsPanelOpen(false);
  }, []);

  // Start work on a task (from TackleModal)
  const handleStartWork = useCallback((item: BacklogItem) => {
    // Mark task as in_progress
    updateTask({ ...item, status: 'in_progress' });
    showToast(`Started work on "${item.title}"`, 'success');
    setIsTackleOpen(false);
    setTackleItem(null);
  }, [updateTask]);

  // Save edited task from panel
  const handleSaveTask = useCallback((updatedItem: BacklogItem) => {
    updateTask(updatedItem);
    setIsPanelOpen(false);
    setSelectedItem(null);
  }, [updateTask]);

  // Delete task from panel
  const handleDeleteTask = useCallback(async (id: string) => {
    deleteTask(id);
    setIsPanelOpen(false);
    setSelectedItem(null);
  }, [deleteTask]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Organize tasks into columns
  const columnItems = useMemo(() => {
    const columns: Record<Status, BacklogItem[]> = {
      backlog: [],
      up_next: [],
      in_progress: [],
      review: [],
      ready_to_ship: [],
    };

    tasks.forEach((task) => {
      // Map any status to our simplified columns
      if (task.status === 'up_next' || task.status === 'review') {
        // Up Next goes to backlog, Review goes to in_progress for quick tasks
        columns[task.status === 'up_next' ? 'backlog' : 'in_progress'].push(task);
      } else {
        columns[task.status].push(task);
      }
    });

    // Sort each column by priority then order
    QUICK_TASK_COLUMNS.forEach((status) => {
      columns[status].sort((a, b) => {
        const priorityDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.order - b.order;
      });
    });

    return columns;
  }, [tasks]);

  const activeItem = activeId ? tasks.find(i => i.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const draggedItem = tasks.find(i => i.id === active.id);
    if (!draggedItem) return;

    const overId = over.id as string;

    // Dropped on a column
    if (QUICK_TASK_COLUMNS.includes(overId as Status)) {
      const targetStatus = overId as Status;
      if (draggedItem.status !== targetStatus) {
        updateTask({ ...draggedItem, status: targetStatus });
      }
      return;
    }

    // Dropped on another item
    const overItem = tasks.find(i => i.id === overId);
    if (overItem) {
      // Find which column the target item is in
      let targetColumn: Status | null = null;
      for (const status of QUICK_TASK_COLUMNS) {
        if (columnItems[status].some(item => item.id === overId)) {
          targetColumn = status;
          break;
        }
      }

      if (targetColumn) {
        // If moving to a different column, update status
        if (draggedItem.status !== targetColumn) {
          updateTask({ ...draggedItem, status: targetColumn });
          return;
        }

        // Same column - reorder
        const columnList = columnItems[targetColumn];
        const oldIndex = columnList.findIndex(i => i.id === active.id);
        const newIndex = columnList.findIndex(i => i.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = arrayMove(columnList, oldIndex, newIndex);
          const updatedTasks = tasks.map(task => {
            const reorderedIndex = reordered.findIndex(r => r.id === task.id);
            if (reorderedIndex !== -1) {
              return { ...task, order: reorderedIndex };
            }
            return task;
          });
          saveTasks(updatedTasks);
        }
      }
    }
  };

  // Stats
  const todoCount = columnItems.backlog.length;
  const inProgressCount = columnItems.in_progress.length;
  const doneCount = columnItems.ready_to_ship.length;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-surface-400 text-sm">Loading quick tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar with Quick Add */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-surface-800/50">
        <div className="flex-1 max-w-xl">
          <QuickTaskInput onAdd={addTask} />
        </div>
        <div className="flex items-center gap-4 text-xs text-surface-500 ml-4">
          <span className="font-mono">{todoCount} to do</span>
          <span className="text-surface-700">|</span>
          <span className="font-mono text-purple-400">{inProgressCount} active</span>
          <span className="text-surface-700">|</span>
          <span className="font-mono text-green-400">{doneCount} done</span>
        </div>
      </div>

      {/* Kanban Board */}
      {tasks.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-6">
          <div className="w-12 h-12 rounded-full bg-surface-800 flex items-center justify-center">
            <svg className="w-6 h-6 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          <p className="text-surface-300">No quick tasks yet</p>
          <p className="text-surface-500 text-sm max-w-xs">
            Quick tasks are stored locally in your browser. Use them for scratch notes and ideas before promoting to your Backlog.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 p-6 h-full w-full">
              {QUICK_TASK_COLUMNS.map((status) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  items={columnItems[status]}
                  onItemClick={handleItemClick}
                  isLoading={false}
                  activeTaskId={undefined}
                  columnLabel={COLUMN_LABELS[status]}
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
      )}

      {/* Stats footer */}
      <div className="px-6 py-3 border-t border-surface-800/50 flex items-center justify-between text-xs text-surface-500">
        <span>Stored in browser localStorage</span>
        <span className="font-mono">{tasks.length} total tasks</span>
      </div>

      {/* Task Panel */}
      <TaskPanel
        item={selectedItem}
        isOpen={isPanelOpen}
        onClose={() => {
          setIsPanelOpen(false);
          setSelectedItem(null);
        }}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        onTackle={handleTackle}
        onAddToBacklog={onPromoteToBacklog ? async (item) => {
          onPromoteToBacklog(item);
          // Remove from quick tasks after promoting
          setTasks(prev => prev.filter(t => t.id !== item.id));
          showToast(`Promoted "${item.title}" to Backlog`, 'success');
          setIsPanelOpen(false);
          setSelectedItem(null);
        } : undefined}
        isQuickTaskView
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
      />

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
