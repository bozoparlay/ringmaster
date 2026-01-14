'use client';

import type { BacklogItem } from '@/types/backlog';

interface DeleteConfirmationModalProps {
  /** The item to be deleted */
  item: BacklogItem | null;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Called when user confirms deletion */
  onConfirm: () => void;
  /** Called when user cancels */
  onCancel: () => void;
}

/**
 * Confirmation modal shown before deleting a task via drag-and-drop.
 */
export function DeleteConfirmationModal({
  item,
  isOpen,
  onConfirm,
  onCancel,
}: DeleteConfirmationModalProps) {
  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div
        className="bg-surface-900 border border-surface-700 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-surface-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-surface-100">Delete Task?</h2>
            <p className="text-sm text-surface-400">This action cannot be undone</p>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <div className="bg-surface-800/50 rounded-lg p-4 border border-surface-700">
            <h3 className="font-medium text-surface-200 line-clamp-2">{item.title}</h3>
            {item.description && (
              <p className="text-sm text-surface-400 mt-2 line-clamp-2">{item.description}</p>
            )}
            <div className="flex items-center gap-2 mt-3">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                item.priority === 'critical' ? 'bg-red-500/20 text-red-400' :
                item.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                item.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                item.priority === 'low' ? 'bg-blue-500/20 text-blue-400' :
                'bg-surface-700 text-surface-400'
              }`}>
                {item.priority}
              </span>
              {item.category && (
                <span className="px-2 py-0.5 rounded text-xs bg-surface-700 text-surface-300">
                  {item.category}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-surface-800 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
          >
            Delete Task
          </button>
        </div>
      </div>
    </div>
  );
}
