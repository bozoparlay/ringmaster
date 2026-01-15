'use client';

import { useState, useEffect } from 'react';
import {
  Header,
  NewTaskModal,
  CleanupWizard,
  ProjectSelector,
  GitHubConnectionPrompt,
  GitHubSettingsModal,
  SettingsModal,
  SourceSelector,
  BacklogView,
  GitHubIssuesView,
  QuickTasksView,
  addQuickTask,
} from '@/components';
import type { DataSource } from '@/components';
import { useBacklog } from '@/hooks/useBacklog';
import { useProjectConfig } from '@/hooks/useProjectConfig';
import { getUserGitHubConfig } from '@/lib/storage/project-config';
import { setStorageMode, getStorageMode } from '@/lib/storage';

const LAST_PATH_KEY = 'ringmaster-last-path';
const LAST_SOURCE_KEY = 'ringmaster-last-source';

function getLastPath(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return localStorage.getItem(LAST_PATH_KEY) || undefined;
}

function setLastPath(path: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_PATH_KEY, path);
}

function getLastSource(): DataSource {
  if (typeof window === 'undefined') return 'backlog';
  return (localStorage.getItem(LAST_SOURCE_KEY) as DataSource) || 'backlog';
}

function setLastSource(source: DataSource): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_SOURCE_KEY, source);
}

export default function Home() {
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [isCleanupOpen, setIsCleanupOpen] = useState(false);
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
  const [isGitHubSettingsOpen, setIsGitHubSettingsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [backlogPath, setBacklogPath] = useState<string | undefined>(undefined);
  const [activeSource, setActiveSource] = useState<DataSource>('backlog');
  const [quickTasksKey, setQuickTasksKey] = useState(0); // For forcing QuickTasksView refresh

  // Auto-detect project from git remote
  const {
    project,
    isStale: isProjectStale,
    refreshProject,
    showGitHubPrompt,
    dismissPrompt,
    isGitHubRepo,
    isGitHubConnected,
    gitHubUser,
  } = useProjectConfig();

  // Load last path and source from localStorage on mount
  // GAP #16 FIX: Also auto-set storage mode to 'file' if we have a saved path
  useEffect(() => {
    const savedPath = getLastPath();
    if (savedPath) {
      setBacklogPath(savedPath);
      // GAP #16: If we have a saved file path, ensure storage mode is set to 'file'
      // This provides seamless continuation from previous session
      const currentMode = getStorageMode();
      if (currentMode !== 'file') {
        setStorageMode('file');
      }
    }
    const savedSource = getLastSource();
    setActiveSource(savedSource);
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
    importItem,
    updateItem,
    deleteItem,
    reorderItems,
    updatePRStatus,
    refresh,
    exportToMarkdown,
  } = useBacklog({ path: backlogPath });

  const handleChangePath = (newPath: string) => {
    setBacklogPath(newPath);
    setLastPath(newPath);
  };

  const handleSourceChange = (source: DataSource) => {
    setActiveSource(source);
    setLastSource(source);
  };

  const handleNewTask = async (task: { title: string; description: string; priority?: 'critical' | 'high' | 'medium' | 'low' | 'someday'; effort?: 'trivial' | 'low' | 'medium' | 'high' | 'very_high'; value?: 'low' | 'medium' | 'high'; category?: string; acceptanceCriteria?: string[] }) => {
    if (activeSource === 'quick') {
      // Add to Quick Tasks (localStorage)
      addQuickTask({
        title: task.title,
        description: task.description,
        priority: task.priority,
      });
      setQuickTasksKey(k => k + 1); // Trigger refresh
    } else {
      // Add to Backlog (file mode)
      await addItem(task.title, task.description, task.priority, task.effort, task.value, task.category);
    }
    setIsNewTaskOpen(false);
  };

  const handleCleanupWorktrees = async () => {
    try {
      const response = await fetch('/api/cleanup-worktrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoDir: filePath ? filePath.replace(/\/[^/]+$/, '') : undefined }),
      });
      const result = await response.json();
      if (result.success) {
        const freedMB = (result.freedBytes / (1024 * 1024)).toFixed(1);
        if (result.cleaned.length > 0) {
          alert(`Cleaned ${result.cleaned.length} orphaned worktrees, freed ${freedMB} MB`);
        } else {
          alert('No orphaned worktrees found');
        }
      } else {
        alert(`Cleanup failed: ${result.error}`);
      }
    } catch (err) {
      alert(`Cleanup error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Get GitHub token for the GitHub view
  const githubConfig = getUserGitHubConfig();

  // Calculate counts for each source
  const sourceCounts = {
    backlog: items.length,
    github: 0, // Will be updated by GitHubIssuesView internally
    quick: 0, // Will be updated by QuickTasksView internally
  };

  // Try to get quick tasks count from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ringmaster:quick-tasks');
      if (stored) {
        const tasks = JSON.parse(stored);
        sourceCounts.quick = tasks.length;
      }
    } catch {
      // Ignore errors
    }
  }, [activeSource]);

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
            window.location.reload();
          }}
          onExportMarkdown={exportToMarkdown}
          onSync={undefined} // No auto-sync in new architecture
          isSyncing={false}
          onCleanup={() => setIsCleanupOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          detectedRepo={project ? { owner: project.owner, repo: project.repo } : undefined}
          isProjectStale={isProjectStale}
          onRefreshProject={refreshProject}
          gitHubUser={gitHubUser}
          isGitHubConnected={isGitHubConnected}
          onOpenGitHubSettings={() => setIsGitHubSettingsOpen(true)}
          onCleanupWorktrees={handleCleanupWorktrees}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {/* Source Selector Tabs */}
        <SourceSelector
          source={activeSource}
          onSourceChange={handleSourceChange}
          counts={sourceCounts}
          isGitHubConnected={isGitHubConnected}
          repoName={project ? `${project.owner}/${project.repo}` : undefined}
        />

        {/* Error banner */}
        {error && activeSource === 'backlog' && (
          <div className="px-6 py-3 bg-red-500/10 border-b border-red-500/20">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Content based on active source */}
        <div className="flex-1 overflow-hidden">
          {activeSource === 'backlog' && (
            <BacklogView
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
          )}

          {activeSource === 'github' && (
            <GitHubIssuesView
              repo={project ? { owner: project.owner, repo: project.repo } : undefined}
              token={githubConfig?.token}
              searchQuery={searchQuery}
              onAddToBacklog={async (item) => {
                await importItem(item);
              }}
            />
          )}

          {activeSource === 'quick' && (
            <QuickTasksView
              key={quickTasksKey}
              onPromoteToBacklog={async (item) => {
                await importItem(item);
              }}
              onNewTask={() => setIsNewTaskOpen(true)}
            />
          )}
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
            window.location.reload();
          }}
          detectedRepo={project ? { owner: project.owner, repo: project.repo } : undefined}
        />

        {/* Settings Modal */}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </main>
    </>
  );
}
