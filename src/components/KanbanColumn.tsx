'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { BacklogItem, Status } from '@/types/backlog';
import { STATUS_LABELS } from '@/types/backlog';
import { TaskCard, TaskCardSkeleton } from './TaskCard';

interface KanbanColumnProps {
  status: Status;
  items: BacklogItem[];
  onItemClick: (item: BacklogItem) => void;
  isLoading?: boolean;
}

const columnAccents: Record<Status, string> = {
  backlog: 'from-surface-600/20',
  ready: 'from-blue-500/10',
  in_progress: 'from-accent/10',
  review: 'from-purple-500/10',
  done: 'from-green-500/10',
};

const columnDots: Record<Status, string> = {
  backlog: 'bg-surface-500',
  ready: 'bg-blue-500',
  in_progress: 'bg-accent',
  review: 'bg-purple-500',
  done: 'bg-green-500',
};

export function KanbanColumn({ status, items, onItemClick, isLoading }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px] flex-1">
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${columnDots[status]}`} />
          <h2 className="font-medium text-sm text-surface-200 tracking-wide">
            {STATUS_LABELS[status]}
          </h2>
          <span className="text-xs font-mono text-surface-500 tabular-nums">
            {items.length}
          </span>
        </div>
      </div>

      {/* Column Content */}
      <div
        ref={setNodeRef}
        className={`
          flex-1 rounded-xl p-2
          bg-gradient-to-b ${columnAccents[status]} to-transparent
          border border-surface-800/50
          transition-all duration-200
          ${isOver ? 'bg-surface-800/50 border-surface-600 ring-1 ring-accent/20' : ''}
          overflow-y-auto
        `}
        style={{ minHeight: '200px' }}
      >
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {isLoading ? (
              <>
                <TaskCardSkeleton />
                <TaskCardSkeleton />
              </>
            ) : items.length > 0 ? (
              items.map((item) => (
                <TaskCard
                  key={item.id}
                  item={item}
                  onClick={() => onItemClick(item)}
                />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-surface-800/50 flex items-center justify-center mb-2">
                  <svg className="w-5 h-5 text-surface-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <p className="text-xs text-surface-500">No items</p>
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}
