'use client';

import { useState, useEffect, useRef } from 'react';
import type { BacklogItem, Priority, Status } from '@/types/backlog';
import { PRIORITY_LABELS, STATUS_LABELS, COLUMN_ORDER } from '@/types/backlog';

interface TaskPanelProps {
  item: BacklogItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: BacklogItem) => void;
  onDelete: (id: string) => void;
  onTackle: (item: BacklogItem) => void;
}

const priorityOptions: Priority[] = ['critical', 'high', 'medium', 'low', 'someday'];

const priorityColors: Record<Priority, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-green-500',
  someday: 'bg-surface-500',
};

export function TaskPanel({ item, isOpen, onClose, onSave, onDelete, onTackle }: TaskPanelProps) {
  const [editedItem, setEditedItem] = useState<BacklogItem | null>(null);
  const [tagInput, setTagInput] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (item) {
      setEditedItem({ ...item });
    }
  }, [item]);

  useEffect(() => {
    if (isOpen && titleRef.current) {
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) && isOpen) {
        handleSave();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, editedItem]);

  const handleSave = () => {
    if (editedItem && editedItem.title.trim()) {
      onSave(editedItem);
    }
    onClose();
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim() && editedItem) {
      e.preventDefault();
      if (!editedItem.tags.includes(tagInput.trim())) {
        setEditedItem({
          ...editedItem,
          tags: [...editedItem.tags, tagInput.trim()],
        });
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    if (editedItem) {
      setEditedItem({
        ...editedItem,
        tags: editedItem.tags.filter(t => t !== tag),
      });
    }
  };

  if (!isOpen || !editedItem) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-fade-in"
        onClick={handleSave}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-surface-900 border-l border-surface-700/50 shadow-panel z-50 animate-slide-in overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
          <h2 className="font-display text-lg text-surface-100">Edit Task</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (confirm('Delete this task?')) {
                  onDelete(editedItem.id);
                  onClose();
                }
              }}
              className="p-2 rounded-lg text-surface-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Delete task"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <button
              onClick={handleSave}
              className="p-2 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors"
              title="Close"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
              Title
            </label>
            <input
              ref={titleRef}
              type="text"
              value={editedItem.title}
              onChange={(e) => setEditedItem({ ...editedItem, title: e.target.value })}
              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-2.5 text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
              placeholder="Task title..."
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
              Description
            </label>
            <textarea
              value={editedItem.description}
              onChange={(e) => setEditedItem({ ...editedItem, description: e.target.value })}
              rows={6}
              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-2.5 text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors resize-none font-mono text-sm leading-relaxed"
              placeholder="Add a description..."
            />
          </div>

          {/* Status & Priority */}
          <div className="grid grid-cols-2 gap-4">
            {/* Status */}
            <div>
              <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
                Status
              </label>
              <select
                value={editedItem.status}
                onChange={(e) => setEditedItem({ ...editedItem, status: e.target.value as Status })}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-2.5 text-surface-100 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors appearance-none cursor-pointer"
              >
                {COLUMN_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
                Priority
              </label>
              <div className="flex gap-1">
                {priorityOptions.map((p) => (
                  <button
                    key={p}
                    onClick={() => setEditedItem({ ...editedItem, priority: p })}
                    className={`
                      flex-1 py-2.5 rounded-lg text-xs font-medium capitalize transition-all
                      ${editedItem.priority === p
                        ? `${priorityColors[p]} text-white shadow-lg`
                        : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                      }
                    `}
                    title={PRIORITY_LABELS[p]}
                  >
                    {p.slice(0, 1).toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
              Tags
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {editedItem.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-mono bg-surface-800 text-surface-300 border border-surface-700"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="text-surface-500 hover:text-surface-300 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
              placeholder="Add tag and press Enter..."
            />
          </div>

          {/* Metadata */}
          <div className="pt-4 border-t border-surface-800">
            <div className="flex justify-between text-xs text-surface-500">
              <span>Created: {new Date(editedItem.createdAt).toLocaleDateString()}</span>
              <span>Updated: {new Date(editedItem.updatedAt).toLocaleDateString()}</span>
            </div>
            <div className="mt-2 text-xs font-mono text-surface-600 truncate">
              ID: {editedItem.id}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-surface-800 bg-surface-900/80 backdrop-blur space-y-3">
          <button
            onClick={() => onTackle(editedItem)}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-medium py-2.5 px-4 rounded-lg transition-all shadow-lg hover:shadow-purple-500/25"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Tackle with Claude Code
          </button>
          <button
            onClick={handleSave}
            className="w-full bg-accent hover:bg-accent-hover text-surface-900 font-medium py-2.5 px-4 rounded-lg transition-colors shadow-glow-amber-sm hover:shadow-glow-amber"
          >
            Save Changes
          </button>
        </div>
      </div>
    </>
  );
}
