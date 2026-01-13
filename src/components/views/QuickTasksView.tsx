'use client';

import { useState, useEffect, useCallback } from 'react';
import { TaskCard } from '../TaskCard';
import { TaskPanel } from '../TaskPanel';
import { TackleModal } from '../TackleModal';
import { Toast, ToastType } from '../Toast';
import type { BacklogItem, Priority, Effort, Status } from '@/types/backlog';
import { v4 as uuidv4 } from 'uuid';

const QUICK_TASKS_KEY = 'ringmaster:quick-tasks';

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [selectedItem, setSelectedItem] = useState<BacklogItem | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isTackleOpen, setIsTackleOpen] = useState(false);
  const [tackleItem, setTackleItem] = useState<BacklogItem | null>(null);

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

  const toggleComplete = useCallback((id: string) => {
    const task = tasks.find(t => t.id === id);
    if (task) {
      const newStatus: Status = task.status === 'ready_to_ship' ? 'backlog' : 'ready_to_ship';
      updateTask({ ...task, status: newStatus });
    }
  }, [tasks, updateTask]);

  const handlePromote = useCallback((item: BacklogItem) => {
    if (onPromoteToBacklog) {
      onPromoteToBacklog(item);
      deleteTask(item.id);
      showToast('Task promoted to Backlog!', 'success');
    } else {
      showToast('Promote to Backlog coming in Phase 5!', 'info');
    }
  }, [onPromoteToBacklog, deleteTask]);

  const startEdit = (task: BacklogItem) => {
    setEditingId(task.id);
    setEditTitle(task.title);
  };

  const saveEdit = () => {
    if (editingId && editTitle.trim()) {
      const task = tasks.find(t => t.id === editingId);
      if (task) {
        updateTask({ ...task, title: editTitle.trim() });
      }
    }
    setEditingId(null);
    setEditTitle('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
  };

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

  // Separate tasks by status: backlog/in_progress are pending, ready_to_ship are completed
  const pendingTasks = tasks.filter(t => t.status !== 'ready_to_ship');
  const inProgressTasks = pendingTasks.filter(t => t.status === 'in_progress');
  const backlogTasks = pendingTasks.filter(t => t.status === 'backlog');
  const completedTasks = tasks.filter(t => t.status === 'ready_to_ship');

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
      <div className="px-6 py-4 border-b border-surface-800/50">
        <QuickTaskInput onAdd={addTask} />
      </div>

      {/* Tasks List */}
      <div className="flex-1 overflow-auto p-6">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
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
          <div className="space-y-6">
            {/* In Progress Tasks */}
            {inProgressTasks.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-purple-400 uppercase tracking-wider mb-3">
                  In Progress ({inProgressTasks.length})
                </h3>
                <div className="space-y-2">
                  {inProgressTasks.map(task => (
                    <div
                      key={task.id}
                      className="group flex items-center gap-3 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg hover:border-purple-500/50 transition-colors cursor-pointer"
                      onClick={() => handleItemClick(task)}
                    >
                      {/* Progress indicator */}
                      <div className="w-5 h-5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />

                      {/* Title */}
                      <span className="flex-1 text-surface-200 text-sm font-medium">
                        {task.title}
                      </span>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleComplete(task.id);
                          }}
                          className="p-1.5 hover:bg-green-500/20 rounded text-surface-400 hover:text-green-400 transition-colors"
                          title="Mark as complete"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Backlog Tasks */}
            {backlogTasks.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-3">
                  To Do ({backlogTasks.length})
                </h3>
                <div className="space-y-2">
                  {backlogTasks.map(task => (
                    <div
                      key={task.id}
                      className="group flex items-center gap-3 p-3 bg-surface-850 border border-surface-800 rounded-lg hover:border-surface-700 transition-colors cursor-pointer"
                      onClick={() => handleItemClick(task)}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleComplete(task.id);
                        }}
                        className="w-5 h-5 rounded border border-surface-600 hover:border-accent flex items-center justify-center transition-colors"
                      >
                        {task.status === 'ready_to_ship' && (
                          <svg className="w-3 h-3 text-accent" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>

                      {/* Title */}
                      {editingId === task.id ? (
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={saveEdit}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit();
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          autoFocus
                          className="flex-1 bg-transparent border-b border-accent text-surface-100 text-sm focus:outline-none"
                        />
                      ) : (
                        <span className="flex-1 text-surface-200 text-sm">
                          {task.title}
                        </span>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTackle(task);
                          }}
                          className="p-1.5 hover:bg-purple-500/20 rounded text-surface-400 hover:text-purple-300 transition-colors"
                          title="Tackle this task"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePromote(task);
                          }}
                          className="p-1.5 hover:bg-surface-700 rounded text-surface-400 hover:text-accent transition-colors"
                          title="Promote to Backlog"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15m0-3-3-3m0 0-3 3m3-3V15" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteTask(task.id);
                          }}
                          className="p-1.5 hover:bg-surface-700 rounded text-surface-400 hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Completed Tasks */}
            {completedTasks.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-3">
                  Completed ({completedTasks.length})
                </h3>
                <div className="space-y-2">
                  {completedTasks.map(task => (
                    <div
                      key={task.id}
                      className="group flex items-center gap-3 p-3 bg-surface-900/50 border border-surface-800/50 rounded-lg"
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleComplete(task.id)}
                        className="w-5 h-5 rounded bg-accent/20 border border-accent flex items-center justify-center"
                      >
                        <svg className="w-3 h-3 text-accent" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </button>

                      {/* Title */}
                      <span className="flex-1 text-surface-500 text-sm line-through">
                        {task.title}
                      </span>

                      {/* Delete */}
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-surface-700 rounded text-surface-400 hover:text-red-400 transition-all"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats footer */}
      <div className="px-6 py-3 border-t border-surface-800/50 flex items-center justify-between text-xs text-surface-500">
        <span>Stored in browser localStorage</span>
        <span className="font-mono">{pendingTasks.length} pending • {completedTasks.length} done</span>
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
