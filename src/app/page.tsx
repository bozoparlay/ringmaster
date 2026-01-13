'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header, KanbanBoard, NewTaskModal, CleanupWizard, ProjectSelector, GitHubConnectionPrompt, GitHubSettingsModal, SyncConflictModal } from '@/components';
import { useBacklog } from '@/hooks/useBacklog';
import { useProjectConfig } from '@/hooks/useProjectConfig';
import { useAutoSync } from '@/hooks/useAutoSync';
import { getGitHubSyncConfig } from '@/lib/storage/github-sync';
import type { SyncConflict } from '@/lib/storage/types';

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
  const [isGitHubSettingsOpen, setIsGitHubSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [backlogPath, setBacklogPath] = useState<string | undefined>(undefined);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncConflicts, setSyncConflicts] = useState<SyncConflict[]>([]);

  // Auto-detect project from git remote
  const {
    project,
    isStale: isProjectStale,
    refreshProject,
    isLoading: isProjectLoading,
    showGitHubPrompt,
    dismissPrompt,
    connectGitHub,
    isGitHubRepo,
    isGitHubConnected,
    gitHubUser,
  } = useProjectConfig();

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
    signals,
    storageMode,
    addItem,
    updateItem,
    deleteItem,
    reorderItems,
    updatePRStatus,
    refresh,
    exportToMarkdown,
  } = useBacklog({ path: backlogPath });

  // Auto-sync with GitHub
  const {
    status: syncStatus,
    lastSyncAt,
    error: autoSyncError,
    isOnline,
    sync: handleSync,
    pendingCount,
    conflicts: autoSyncConflicts,
  } = useAutoSync({
    items,
    onUpdateItem: updateItem,
    onAddItem: addItem,
    enabled: isGitHubConnected,
    onConflicts: (conflicts) => setSyncConflicts(conflicts),
  });

  // Update syncError from autoSync
  useEffect(() => {
    if (autoSyncError) {
      setSyncError(autoSyncError);
    }
  }, [autoSyncError]);

  const handleChangePath = (newPath: string) => {
    setBacklogPath(newPath);
    setLastPath(newPath);
  };

  const handleNewTask = async (task: { title: string; description: string; priority?: 'critical' | 'high' | 'medium' | 'low' | 'someday'; effort?: 'trivial' | 'low' | 'medium' | 'high' | 'very_high'; value?: 'low' | 'medium' | 'high'; category?: string; acceptanceCriteria?: string[] }) => {
    await addItem(task.title, task.description, task.priority, task.effort, task.value, task.category);
    setIsNewTaskOpen(false);
  };

  // Handle conflict resolution
  const handleResolveConflict = useCallback(async (taskId: string, resolution: 'local' | 'remote') => {
    const conflict = syncConflicts.find(c => c.taskId === taskId);
    if (!conflict) return;

    const config = getGitHubSyncConfig();
    if (!config) return;

    if (resolution === 'local') {
      // Keep local: push local version to GitHub (force update)
      const localTask = items.find(t => t.id === taskId);
      if (localTask) {
        // Clear lastLocalModifiedAt to allow push
        await updateItem({
          ...localTask,
          lastSyncedAt: undefined, // Clear sync timestamp to force push
        }, { fromSync: true });
        // Re-sync to push the local version
        await handleSync();
      }
    } else {
      // Keep remote: update local with remote version
      await updateItem({
        ...conflict.remoteVersion,
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString(),
      }, { fromSync: true });
    }

    // Remove this conflict from the list
    setSyncConflicts(prev => prev.filter(c => c.taskId !== taskId));
    setSyncError(null);
  }, [syncConflicts, items, updateItem, handleSync]);

  return (
    <>
      {/* GitHub Connection Prompt (first-time experience) - outside main for z-index */}
      <GitHubConnectionPrompt
        isOpen={showGitHubPrompt && isGitHubRepo}
        repo={project ? { owner: project.owner, repo: project.repo } : undefined}
        onConnect={() => setIsGitHubSettingsOpen(true)}
        onDismiss={dismissPrompt}
      />

      <main className="h-screen flex flex-col bg-surface-950 relative overflow-hidden">
        {/* Header */}
        <Header
        filePath={filePath}
        fileExists={fileExists}
        storageMode={storageMode}
        onNewTask={() => setIsNewTaskOpen(true)}
        onRefresh={refresh}
        onChangePath={handleChangePath}
        onStorageModeChange={() => {
          // Storage mode changed - page will reload data via refresh
          // The useBacklog hook will reinitialize with the new mode
          window.location.reload();
        }}
        onExportMarkdown={exportToMarkdown}
        onSync={handleSync}
        isSyncing={syncStatus === 'syncing'}
        onCleanup={() => setIsCleanupOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        detectedRepo={project ? { owner: project.owner, repo: project.repo } : undefined}
        isProjectStale={isProjectStale}
        onRefreshProject={refreshProject}
        gitHubUser={gitHubUser}
        isGitHubConnected={isGitHubConnected}
        onOpenGitHubSettings={() => setIsGitHubSettingsOpen(true)}
      />

      {/* Error banner */}
      {error && (
        <div className="px-6 py-3 bg-red-500/10 border-b border-red-500/20">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Sync error banner */}
      {syncError && (
        <div className="px-6 py-3 bg-yellow-500/10 border-b border-yellow-500/20 flex items-center justify-between">
          <p className="text-sm text-yellow-400">{syncError}</p>
          <button
            onClick={() => setSyncError(null)}
            className="text-yellow-400 hover:text-yellow-300 p-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
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
          signals={signals}
          onUpdatePRStatus={updatePRStatus}
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

      {/* GitHub Settings Modal */}
      <GitHubSettingsModal
        isOpen={isGitHubSettingsOpen}
        onClose={() => setIsGitHubSettingsOpen(false)}
        onConnect={() => {
          setIsGitHubSettingsOpen(false);
          // Refresh to pick up the new storage mode
          window.location.reload();
        }}
        detectedRepo={project ? { owner: project.owner, repo: project.repo } : undefined}
      />

      {/* Sync Conflict Resolution Modal */}
      <SyncConflictModal
        isOpen={syncConflicts.length > 0}
        onClose={() => setSyncConflicts([])}
        conflicts={syncConflicts}
        onResolve={handleResolveConflict}
      />
    </main>
    </>
  );
}
