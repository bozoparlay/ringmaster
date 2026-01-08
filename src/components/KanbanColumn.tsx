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
  onStartItem?: (item: BacklogItem) => void;
  isLoading?: boolean;
  subtitle?: string;
}

const columnAccents: Record<Status, string> = {
  backlog: 'from-surface-600/20',
  up_next: 'from-cyan-500/15',
  in_progress: 'from-accent/10',
  review: 'from-purple-500/10',
  ready_to_ship: 'from-green-500/10',
};

const columnDots: Record<Status, string> = {
  backlog: 'bg-surface-500',
  up_next: 'bg-cyan-400',
  in_progress: 'bg-accent',
  review: 'bg-purple-500',
  ready_to_ship: 'bg-green-500',
};

export function KanbanColumn({ status, items, onItemClick, onStartItem, isLoading, subtitle }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  const isUpNext = status === 'up_next';

  return (
    <div className={`flex flex-col ${isUpNext ? 'min-w-[280px] max-w-[280px]' : 'min-w-[240px] flex-1'}`}>
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${columnDots[status]} ${isUpNext ? 'animate-pulse' : ''}`} />
            <h2 className={`font-medium text-sm tracking-wide ${isUpNext ? 'text-cyan-300' : 'text-surface-200'}`}>
              {STATUS_LABELS[status]}
            </h2>
            <span className="text-xs font-mono text-surface-500 tabular-nums">
              {items.length}
            </span>
          </div>
          {subtitle && (
            <span className="text-[10px] text-surface-500 ml-4">{subtitle}</span>
          )}
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
                <div key={item.id} className="relative group/card">
                  <TaskCard
                    item={item}
                    onClick={() => onItemClick(item)}
                  />
                  {isUpNext && onStartItem && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartItem(item);
                      }}
                      className="absolute bottom-2 right-2 opacity-0 group-hover/card:opacity-100 transition-opacity bg-accent hover:bg-accent-hover text-surface-900 text-xs font-medium px-3 py-1.5 rounded-md shadow-lg flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Start
                    </button>
                  )}
                </div>
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
