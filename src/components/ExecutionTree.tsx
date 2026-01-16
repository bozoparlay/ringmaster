'use client';

import { useState } from 'react';
import { type ExecutionWithChildren, type Execution } from '@/hooks/useTaskSession';

interface ExecutionTreeProps {
  executions: ExecutionWithChildren[];
  isLoading?: boolean;
}

/**
 * Displays executions in a nested tree structure.
 * Parent executions show their subagent children when expanded.
 */
export function ExecutionTree({ executions, isLoading }: ExecutionTreeProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-surface-500 py-4">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Loading execution history...
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div className="text-xs text-surface-500 py-4 text-center">
        No executions yet. Tackle the task to start tracking.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
        Execution History
      </div>
      {executions.map((execution) => (
        <ExecutionNode key={execution.id} execution={execution} />
      ))}
    </div>
  );
}

interface ExecutionNodeProps {
  execution: ExecutionWithChildren;
  isChild?: boolean;
}

function ExecutionNode({ execution, isChild = false }: ExecutionNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = execution.children && execution.children.length > 0;

  const statusColors = {
    running: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    killed: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  };

  const sourceColors = {
    subprocess: 'bg-surface-700 text-surface-300',
    hook: 'bg-purple-500/20 text-purple-400',
  };

  const formatDuration = (ms?: number | null) => {
    if (!ms) return null;
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`${isChild ? 'ml-4 border-l border-surface-700/50 pl-3' : ''}`}>
      <div
        className={`rounded-lg border p-3 ${
          isChild
            ? 'bg-surface-800/30 border-surface-700/30'
            : 'bg-surface-800/50 border-surface-700/50'
        }`}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Expand/collapse for children */}
            {hasChildren && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-surface-500 hover:text-surface-300 transition-colors"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            {!hasChildren && !isChild && <div className="w-4" />}

            {/* Status badge */}
            <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${statusColors[execution.status]}`}>
              {execution.status}
            </span>

            {/* Source type (only show for hook-sourced) */}
            {execution.sourceType === 'hook' && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${sourceColors.hook}`}>
                hook
              </span>
            )}

            {/* Subagent type */}
            {execution.subagentType && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-400">
                {execution.subagentType}
              </span>
            )}
          </div>

          {/* Timestamp */}
          <span className="text-[10px] text-surface-500 whitespace-nowrap">
            {formatDate(execution.startedAt)}
          </span>
        </div>

        {/* Prompt preview */}
        {execution.prompt && (
          <div className="mt-2">
            <p className="text-xs text-surface-300 line-clamp-2">
              {execution.prompt}
            </p>
          </div>
        )}

        {/* Metrics row */}
        <div className="flex items-center gap-3 mt-2 text-[10px] text-surface-500">
          {execution.durationMs && (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatDuration(execution.durationMs)}
            </span>
          )}

          {execution.totalTokens && (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
              </svg>
              {execution.totalTokens.toLocaleString()} tokens
            </span>
          )}

          {execution.totalToolUses && (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {execution.totalToolUses} tools
            </span>
          )}

          {hasChildren && (
            <span className="flex items-center gap-1 text-purple-400">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
              {execution.children.length} subagent{execution.children.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="mt-2 space-y-2">
          {execution.children.map((child) => (
            <ExecutionNode
              key={child.id}
              execution={{ ...child, children: [] }}
              isChild
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default ExecutionTree;
