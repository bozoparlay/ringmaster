'use client';

import { useDroppable } from '@dnd-kit/core';

interface TrashDropZoneProps {
  /** Whether a drag operation is currently active */
  isDragging: boolean;
  /** Whether an item is currently hovering over the trash zone */
  isOver?: boolean;
}

/**
 * Trash can drop zone for deleting tasks via drag-and-drop.
 * Appears in the bottom-right corner when dragging, next to the FAB.
 */
export function TrashDropZone({ isDragging, isOver: externalIsOver }: TrashDropZoneProps) {
  const { setNodeRef, isOver: dndIsOver } = useDroppable({
    id: 'trash-drop-zone',
  });

  const isHovering = externalIsOver ?? dndIsOver;

  // Only render when dragging
  if (!isDragging) return null;

  return (
    <div
      ref={setNodeRef}
      className={`
        fixed bottom-8 right-24 w-14 h-14
        flex items-center justify-center
        rounded-full border-2 border-dashed
        transition-all duration-200 ease-out
        z-30
        ${isHovering
          ? 'bg-red-500/30 border-red-500 scale-110 shadow-lg shadow-red-500/20'
          : 'bg-surface-800/80 border-surface-500 scale-100'
        }
      `}
    >
      <svg
        className={`w-6 h-6 transition-all duration-200 ${
          isHovering ? 'text-red-400 scale-110' : 'text-surface-400'
        }`}
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
