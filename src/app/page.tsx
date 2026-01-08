'use client';

import { useState, useEffect } from 'react';
import { Header, KanbanBoard, NewTaskModal, CleanupWizard, ProjectSelector } from '@/components';
import { useBacklog } from '@/hooks/useBacklog';

const LAST_PATH_KEY = 'ringmaster-last-path';

function getLastPath(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return localStorage.getItem(LAST_PATH_KEY) || undefined;
}

function setLastPath(path: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_PATH_KEY, path);
}

export default function Home() {
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [isCleanupOpen, setIsCleanupOpen] = useState(false);
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [backlogPath, setBacklogPath] = useState<string | undefined>(undefined);

  // Load last path from localStorage on mount
  useEffect(() => {
    const savedPath = getLastPath();
    if (savedPath) {
      setBacklogPath(savedPath);
    }
  }, []);

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
  } = useBacklog({ path: backlogPath });

  const handleChangePath = (newPath: string) => {
    setBacklogPath(newPath);
    setLastPath(newPath);
  };

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
        onChangePath={handleChangePath}
        onCleanup={() => setIsCleanupOpen(true)}
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
          backlogPath={filePath ?? undefined}
        />
      </div>

      {/* New Task Modal (from header button) */}
      <NewTaskModal
        isOpen={isNewTaskOpen}
        onClose={() => setIsNewTaskOpen(false)}
        onSubmit={handleNewTask}
        backlogPath={filePath ?? undefined}
      />

      {/* Cleanup Wizard */}
      <CleanupWizard
        isOpen={isCleanupOpen}
        onClose={() => setIsCleanupOpen(false)}
        items={items}
        onUpdateItem={updateItem}
        workDir={filePath ? filePath.replace(/\/[^/]+$/, '') : undefined}
      />

      {/* Project Selector */}
      <ProjectSelector
        isOpen={isProjectSelectorOpen}
        onClose={() => setIsProjectSelectorOpen(false)}
        currentPath={filePath}
        onSelectPath={handleChangePath}
      />
    </main>
  );
}
