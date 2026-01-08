'use client';

import { useState } from 'react';
import { Header, KanbanBoard, NewTaskModal } from '@/components';
import { useBacklog } from '@/hooks/useBacklog';

export default function Home() {
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const {
    items,
    loading,
    error,
    filePath,
    fileExists,
    addItem,
    updateItem,
    deleteItem,
    reorderItems,
    refresh,
  } = useBacklog();

  const handleNewTask = async (task: { title: string; description: string; priority?: 'critical' | 'high' | 'medium' | 'low' | 'someday'; effort?: 'low' | 'medium' | 'high' | 'very_high'; value?: 'low' | 'medium' | 'high'; category?: string }) => {
    await addItem(task.title, task.description, task.priority, task.effort, task.value, task.category);
    setIsNewTaskOpen(false);
  };

  return (
    <main className="h-screen flex flex-col bg-surface-950 relative overflow-hidden">
      {/* Header */}
      <Header
        filePath={filePath}
        fileExists={fileExists}
        onNewTask={() => setIsNewTaskOpen(true)}
        onRefresh={refresh}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Error banner */}
      {error && (
        <div className="px-6 py-3 bg-red-500/10 border-b border-red-500/20">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Board */}
      <div className="flex-1 overflow-hidden">
        <KanbanBoard
          items={items}
          onUpdateItem={updateItem}
          onDeleteItem={deleteItem}
          onReorderItems={reorderItems}
          onNewTask={() => setIsNewTaskOpen(true)}
          isLoading={loading}
          searchQuery={searchQuery}
          backlogPath={filePath}
        />
      </div>

      {/* New Task Modal (from header button) */}
      <NewTaskModal
        isOpen={isNewTaskOpen}
        onClose={() => setIsNewTaskOpen(false)}
        onSubmit={handleNewTask}
      />
    </main>
  );
}
