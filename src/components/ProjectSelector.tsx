'use client';

import { useState, useEffect, useRef } from 'react';

interface ProjectSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string | null;
  onSelectPath: (path: string) => void;
}

// Store recent projects in localStorage
const RECENT_PROJECTS_KEY = 'ringmaster_recent_projects';
const MAX_RECENT_PROJECTS = 5;

function getRecentProjects(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentProject(path: string) {
  if (typeof window === 'undefined') return;
  try {
    const recent = getRecentProjects().filter(p => p !== path);
    recent.unshift(path);
    localStorage.setItem(
      RECENT_PROJECTS_KEY,
      JSON.stringify(recent.slice(0, MAX_RECENT_PROJECTS))
    );
  } catch {
    // Ignore localStorage errors
  }
}

export function ProjectSelector({ isOpen, onClose, currentPath, onSelectPath }: ProjectSelectorProps) {
  const [pathInput, setPathInput] = useState('');
  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPathInput(currentPath || '');
      setRecentProjects(getRecentProjects());
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, currentPath]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pathInput.trim()) {
      saveRecentProject(pathInput.trim());
      onSelectPath(pathInput.trim());
      onClose();
    }
  };

  const handleSelectRecent = (path: string) => {
    saveRecentProject(path);
    onSelectPath(path);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-lg bg-surface-900 border border-surface-700/50 rounded-2xl shadow-2xl animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
            <div>
              <h2 className="font-display text-lg text-surface-100">Select Project</h2>
              <p className="text-xs text-surface-500 mt-0.5">Enter the path to your BACKLOG.md file</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
                Backlog File Path
              </label>
              <input
                ref={inputRef}
                type="text"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-3 text-surface-100 font-mono text-sm placeholder:text-surface-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
                placeholder="/path/to/project/BACKLOG.md"
              />
              <p className="text-xs text-surface-500 mt-2">
                Enter an absolute path or relative to the ringmaster directory
              </p>
            </div>

            {/* Recent Projects */}
            {recentProjects.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
                  Recent Projects
                </label>
                <div className="space-y-1">
                  {recentProjects.map((path) => (
                    <button
                      key={path}
                      type="button"
                      onClick={() => handleSelectRecent(path)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm font-mono transition-colors ${
                        path === currentPath
                          ? 'bg-accent/20 text-accent border border-accent/30'
                          : 'bg-surface-800/50 text-surface-300 hover:bg-surface-800 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-surface-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        <span className="truncate">{path}</span>
                        {path === currentPath && (
                          <span className="ml-auto text-xs text-accent">current</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-surface-800 hover:bg-surface-700 text-surface-300 font-medium py-2.5 px-4 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!pathInput.trim()}
                className="flex-1 bg-accent hover:bg-accent-hover disabled:bg-surface-700 disabled:text-surface-500 text-surface-900 font-medium py-2.5 px-4 rounded-lg transition-colors shadow-glow-amber-sm hover:shadow-glow-amber disabled:shadow-none"
              >
                Open Project
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
