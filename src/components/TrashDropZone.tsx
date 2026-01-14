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
 * Styled to match the app's premium dark theme with amber accents.
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
        rounded-full
        backdrop-blur-sm
        transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
        z-30
        animate-trash-appear
        ${isHovering
          ? 'scale-110 bg-red-500/20 border-2 border-red-400/60 shadow-glow-red'
          : 'scale-100 bg-surface-800/90 border-2 border-surface-600/50 shadow-trash-zone'
        }
      `}
    >
      {/* Ambient glow ring */}
      <div
        className={`
          absolute inset-0 rounded-full
          transition-opacity duration-300
          pointer-events-none
          ${isHovering ? 'opacity-100' : 'opacity-0'}
        `}
        style={{
          background: 'radial-gradient(circle at center, rgba(239, 68, 68, 0.15) 0%, transparent 70%)',
        }}
      />

      {/* Pulsing ring when hovering */}
      {isHovering && (
        <div
          className="absolute inset-0 rounded-full border-2 border-red-400/40 animate-trash-pulse pointer-events-none"
        />
      )}

      {/* Trash icon */}
      <svg
        className={`
          w-6 h-6 relative z-10
          transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
          ${isHovering
            ? 'text-red-400 scale-110 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]'
            : 'text-surface-400'
          }
        `}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.75}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
        />
      </svg>
    </div>
  );
}
