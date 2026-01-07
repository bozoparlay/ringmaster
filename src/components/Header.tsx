'use client';

interface HeaderProps {
  filePath: string | null;
  fileExists: boolean;
  onNewTask: () => void;
  onRefresh: () => void;
}

export function Header({ filePath, fileExists, onNewTask, onRefresh }: HeaderProps) {
  return (
    <header className="relative z-10 border-b border-surface-800/50 bg-surface-950/80 backdrop-blur-xl">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Logo & Title */}
        <div className="flex items-center gap-4">
          {/* Logo mark */}
          <div className="relative w-10 h-10 flex items-center justify-center">
            {/* Ring */}
            <div className="absolute inset-0 rounded-full border-2 border-accent/30" />
            <div className="absolute inset-1 rounded-full border border-accent/50" />
            {/* Center dot */}
            <div className="w-2 h-2 rounded-full bg-accent shadow-glow-amber-sm" />
          </div>

          <div>
            <h1 className="font-display text-xl text-surface-100 tracking-tight">
              Ringmaster
            </h1>
            <p className="text-xs text-surface-500 font-mono tracking-wide">
              Direct the circus
            </p>
          </div>
        </div>

        {/* File Status */}
        <div className="hidden md:flex items-center gap-3 px-4 py-2 rounded-lg bg-surface-900/50 border border-surface-800">
          <div className={`w-2 h-2 rounded-full ${fileExists ? 'bg-green-500' : 'bg-yellow-500'}`} />
          <span className="text-xs text-surface-400 font-mono truncate max-w-[300px]">
            {filePath || 'No file loaded'}
          </span>
          <button
            onClick={onRefresh}
            className="p-1 text-surface-500 hover:text-surface-300 transition-colors"
            title="Refresh"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onNewTask}
            className="hidden sm:flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-surface-900 font-medium text-sm rounded-lg transition-all shadow-glow-amber-sm hover:shadow-glow-amber"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Task
          </button>

          {/* Mobile menu button */}
          <button className="sm:hidden p-2 text-surface-400 hover:text-surface-100 hover:bg-surface-800 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent" />
    </header>
  );
}
