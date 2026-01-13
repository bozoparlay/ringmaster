'use client';

import { useCallback } from 'react';

export type DataSource = 'backlog' | 'github' | 'quick';

interface SourceTab {
  id: DataSource;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const SOURCE_TABS: SourceTab[] = [
  {
    id: 'backlog',
    label: 'Backlog',
    description: 'BACKLOG.md',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
  },
  {
    id: 'github',
    label: 'GitHub',
    description: 'Issues',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10Z" />
      </svg>
    ),
  },
  {
    id: 'quick',
    label: 'Quick Tasks',
    description: 'Local',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
];

interface SourceSelectorProps {
  source: DataSource;
  onSourceChange: (source: DataSource) => void;
  counts?: Record<DataSource, number>;
  disabled?: boolean;
}

export function SourceSelector({
  source,
  onSourceChange,
  counts = { backlog: 0, github: 0, quick: 0 },
  disabled = false,
}: SourceSelectorProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, tabId: DataSource) => {
      if (disabled) return;

      const currentIndex = SOURCE_TABS.findIndex((t) => t.id === tabId);
      let newIndex = currentIndex;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        newIndex = (currentIndex + 1) % SOURCE_TABS.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        newIndex = (currentIndex - 1 + SOURCE_TABS.length) % SOURCE_TABS.length;
      } else if (e.key === 'Home') {
        e.preventDefault();
        newIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        newIndex = SOURCE_TABS.length - 1;
      }

      if (newIndex !== currentIndex) {
        onSourceChange(SOURCE_TABS[newIndex].id);
      }
    },
    [disabled, onSourceChange]
  );

  return (
    <div className="px-6 py-3 border-b border-surface-800/50 bg-surface-900/30">
      <div
        role="tablist"
        aria-label="Data source"
        className="flex items-center gap-1 p-1 bg-surface-850/50 rounded-xl w-fit border border-surface-800/50"
      >
        {SOURCE_TABS.map((tab) => {
          const isSelected = source === tab.id;
          const count = counts[tab.id];

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isSelected}
              aria-controls={`${tab.id}-panel`}
              tabIndex={isSelected ? 0 : -1}
              disabled={disabled}
              onClick={() => !disabled && onSourceChange(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, tab.id)}
              className={`
                relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                transition-all duration-200 ease-out
                focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-1 focus-visible:ring-offset-surface-900
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                ${
                  isSelected
                    ? 'bg-surface-800 text-surface-100 shadow-sm'
                    : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/50'
                }
              `}
            >
              {/* Active indicator line */}
              {isSelected && (
                <span
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-accent rounded-full"
                  style={{
                    animation: 'fadeSlideIn 0.2s ease-out',
                  }}
                />
              )}

              {/* Icon */}
              <span className={`
                transition-colors duration-200
                ${isSelected ? 'text-accent' : 'text-surface-500'}
              `}>
                {tab.icon}
              </span>

              {/* Label */}
              <span>{tab.label}</span>

              {/* Count badge */}
              {count > 0 && (
                <span
                  className={`
                    min-w-[20px] h-5 px-1.5 flex items-center justify-center
                    text-xs font-mono rounded-md
                    transition-all duration-200
                    ${
                      isSelected
                        ? 'bg-accent/15 text-accent'
                        : 'bg-surface-700/50 text-surface-400'
                    }
                  `}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Subtle description of current source */}
      <p className="mt-2 text-xs text-surface-500 font-mono">
        {SOURCE_TABS.find((t) => t.id === source)?.description}
      </p>
    </div>
  );
}
