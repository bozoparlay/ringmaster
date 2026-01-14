'use client';

import { useDroppable } from '@dnd-kit/core';

interface TrashDropZoneProps {
  isActive?: boolean;
}

/**
 * Trash can drop zone for deleting tasks via drag-and-drop.
 * Appears in the bottom-right corner of the Kanban board.
 */
export function TrashDropZone({ isActive }: TrashDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'trash-drop-zone',
  });

  return (
    <div
      ref={setNodeRef}
      className={`
        fixed bottom-8 right-24 w-14 h-14
        flex items-center justify-center
        rounded-full border-2 border-dashed
        transition-all duration-200
        ${isOver
          ? 'bg-red-500/30 border-red-500 scale-110'
          : isActive
            ? 'bg-surface-800/80 border-surface-600 opacity-100'
            : 'bg-surface-800/50 border-surface-700 opacity-0'
        }
        ${isActive ? 'pointer-events-auto' : 'pointer-events-none'}
      `}
    >
      <svg
        className={`w-6 h-6 transition-colors ${isOver ? 'text-red-400' : 'text-surface-400'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
        />
      </svg>
    </div>
  );
}
