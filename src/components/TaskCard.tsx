'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BacklogItem, Priority } from '@/types/backlog';

interface TaskCardProps {
  item: BacklogItem;
  onClick: () => void;
  isDragging?: boolean;
}

const priorityConfig: Record<Priority, { bg: string; text: string; dot: string }> = {
  critical: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500' },
  high: { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'bg-orange-500' },
  medium: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-500' },
  low: { bg: 'bg-green-500/10', text: 'text-green-400', dot: 'bg-green-500' },
  someday: { bg: 'bg-surface-600/30', text: 'text-surface-400', dot: 'bg-surface-500' },
};

export function TaskCard({ item, onClick, isDragging }: TaskCardProps) {
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
        border border-surface-700/50 hover:border-surface-600
        rounded-lg p-3.5
        cursor-pointer select-none
        transition-all duration-200 ease-out
        ${dragging
          ? 'shadow-card-hover scale-[1.02] rotate-1 opacity-90 z-50'
          : 'shadow-card hover:shadow-card-hover hover:-translate-y-0.5'
        }
      `}
    >
      {/* Priority indicator line */}
      <div
        className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-full ${priority.dot} opacity-60`}
      />

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

        {/* Footer with priority and tags */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${priority.bg} ${priority.text}`}>
            <span className={`w-1 h-1 rounded-full ${priority.dot}`} />
            {item.priority}
          </span>

          {item.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono text-surface-400 bg-surface-800 border border-surface-700/50"
            >
              {tag}
            </span>
          ))}
          {item.tags.length > 2 && (
            <span className="text-[10px] text-surface-500">
              +{item.tags.length - 2}
            </span>
          )}
        </div>
      </div>

      {/* Hover glow effect */}
      <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none bg-gradient-to-br from-accent/5 via-transparent to-transparent" />
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
