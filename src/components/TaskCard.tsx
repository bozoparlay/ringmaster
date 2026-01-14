'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BacklogItem, Priority } from '@/types/backlog';
import { QUALITY_THRESHOLD } from '@/lib/task-quality';

interface TaskCardProps {
  item: BacklogItem;
  onClick: () => void;
  isDragging?: boolean;
  isInUpNext?: boolean; // Task is also in Up Next column
}

const priorityConfig: Record<Priority, { bg: string; text: string; dot: string }> = {
  critical: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500' },
  high: { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'bg-orange-500' },
  medium: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-500' },
  low: { bg: 'bg-green-500/10', text: 'text-green-400', dot: 'bg-green-500' },
  someday: { bg: 'bg-surface-600/30', text: 'text-surface-400', dot: 'bg-surface-500' },
};

export function TaskCard({ item, onClick, isDragging, isInUpNext }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priority = priorityConfig[item.priority];
  const dragging = isDragging || isSortableDragging;
  const isLowQuality = item.qualityScore !== undefined && item.qualityScore < QUALITY_THRESHOLD;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`
        group relative
        bg-surface-850 hover:bg-surface-800
        border hover:border-surface-600
        rounded-lg p-3.5
        cursor-pointer select-none
        ${dragging
          ? 'shadow-card-dragging scale-[1.04] rotate-[1deg] z-50 border-accent/20 bg-surface-800 animate-card-lift'
          : 'shadow-card hover:shadow-card-hover hover:-translate-y-0.5 border-surface-700/50 transition-all duration-200 ease-out'
        }
      `}
    >
      {/* Priority indicator line */}
      <div
        className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-full ${priority.dot} opacity-60`}
      />

      {/* Low quality warning indicator (top-left) - caution triangle similar to star style */}
      {/* Moved from top-right to top-left, changed from red dot to caution triangle */}
      {isLowQuality && !isInUpNext && (
        <div
          className="absolute -top-1.5 -left-1.5 z-10 drop-shadow-[0_0_6px_rgba(239,68,68,0.6)]"
          title={`Low quality (${item.qualityScore}/100): ${item.qualityIssues?.join(', ')}`}
        >
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="url(#cautionGradient)"
          >
            <defs>
              <linearGradient id="cautionGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FCA5A5" />
                <stop offset="50%" stopColor="#EF4444" />
                <stop offset="100%" stopColor="#B91C1C" />
              </linearGradient>
            </defs>
            <path d="M12 2L1 21h22L12 2zm0 3.17L20.24 19H3.76L12 5.17zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z" />
          </svg>
        </div>
      )}

      {/* Up Next indicator (top-left) - gold star shows when a backlog item is prioritized */}
      {isInUpNext && (
        <div
          className="absolute -top-1.5 -left-1.5 z-10 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]"
          title="Priority: Up Next"
        >
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="url(#starGradient)"
          >
            <defs>
              <linearGradient id="starGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FDE68A" />
                <stop offset="50%" stopColor="#FBBF24" />
                <stop offset="100%" stopColor="#D97706" />
              </linearGradient>
            </defs>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
      )}

      {/* Content */}
      <div className="pl-2.5">
        {/* Header with priority badge */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="font-medium text-sm text-surface-100 leading-snug line-clamp-2 group-hover:text-white transition-colors">
            {item.title}
          </h3>
        </div>

        {/* Description preview */}
        {item.description && (
          <p className="text-xs text-surface-400 line-clamp-2 mb-2.5 leading-relaxed">
            {item.description}
          </p>
        )}

        {/* Footer with category, priority, and metadata */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Category tag */}
          {item.category && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20">
              {item.category}
            </span>
          )}

          {/* Priority badge */}
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${priority.bg} ${priority.text}`}>
            <span className={`w-1 h-1 rounded-full ${priority.dot}`} />
            {item.priority}
          </span>

          {/* Effort indicator */}
          {item.effort && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-surface-400 bg-surface-800 border border-surface-700/50">
              {item.effort === 'very_high' ? 'XL' : item.effort.charAt(0).toUpperCase()}
            </span>
          )}

          {/* Value indicator */}
          {item.value && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
              ${item.value.charAt(0).toUpperCase()}
            </span>
          )}

          {/* GitHub issue link (simple reference, no sync status) */}
          {item.githubIssueNumber && (
            <span
              className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-surface-400 bg-surface-800/50 hover:bg-surface-700/50 transition-colors cursor-pointer"
              title={`GitHub Issue #${item.githubIssueNumber}`}
              onClick={(e) => {
                e.stopPropagation();
                if (item.githubIssueUrl) {
                  window.open(item.githubIssueUrl, '_blank');
                }
              }}
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              #{item.githubIssueNumber}
            </span>
          )}
        </div>
      </div>

      {/* Hover/drag glow effect */}
      <div
        className={`
          absolute inset-0 rounded-lg pointer-events-none transition-opacity duration-300
          bg-gradient-to-br from-accent/5 via-transparent to-transparent
          ${dragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
        `}
      />

      {/* Dragging accent border glow */}
      {dragging && (
        <div className="absolute -inset-[1px] rounded-lg bg-gradient-to-br from-accent/20 via-accent/5 to-transparent pointer-events-none" />
      )}
    </div>
  );
}

export function TaskCardSkeleton() {
  return (
    <div className="bg-surface-850 border border-surface-700/50 rounded-lg p-3.5 animate-pulse">
      <div className="pl-2.5">
        <div className="h-4 bg-surface-700 rounded w-3/4 mb-2" />
        <div className="h-3 bg-surface-700/50 rounded w-full mb-1" />
        <div className="h-3 bg-surface-700/50 rounded w-2/3 mb-3" />
        <div className="flex gap-2">
          <div className="h-4 bg-surface-700/50 rounded w-16" />
          <div className="h-4 bg-surface-700/50 rounded w-12" />
        </div>
      </div>
    </div>
  );
}
