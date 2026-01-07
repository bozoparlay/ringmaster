'use client';

import { useState } from 'react';
import { Header, KanbanBoard, NewTaskModal } from '@/components';
import { useBacklog } from '@/hooks/useBacklog';

export default function Home() {
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);

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

  const handleNewTask = async (title: string, description: string) => {
    await addItem(title, description);
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
          onAddItem={addItem}
          isLoading={loading}
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
