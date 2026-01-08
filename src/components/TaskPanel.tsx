'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { BacklogItem, Priority, Status, Effort, Value } from '@/types/backlog';
import { PRIORITY_LABELS, STATUS_LABELS, COLUMN_ORDER, EFFORT_LABELS, VALUE_LABELS } from '@/types/backlog';

interface TaskPanelProps {
  item: BacklogItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: BacklogItem) => void;
  onDelete: (id: string) => void;
  onTackle: (item: BacklogItem) => void;
}

// AI Loading State Messages
const AI_LOADING_MESSAGES = [
  'Reading your description...',
  'Understanding the context...',
  'Analyzing requirements...',
  'Generating enhancements...',
  'Crafting improvements...',
  'Polishing the details...',
];

// AI Loading State Component
function AiLoadingState() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % AI_LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full h-[200px] rounded-lg overflow-hidden">
      {/* Animated gradient background */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-purple-900/40 via-surface-800 to-blue-900/40 animate-ai-gradient"
        style={{ backgroundSize: '200% 200%' }}
      />

      {/* Shimmer overlay */}
      <div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/10 to-transparent animate-ai-shimmer"
        style={{ backgroundSize: '200% 100%' }}
      />

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(168, 85, 247, 0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(168, 85, 247, 0.4) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Border glow */}
      <div className="absolute inset-0 border border-purple-500/30 rounded-lg shadow-[inset_0_0_30px_rgba(168,85,247,0.1)]" />

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* Orbital animation container */}
        <div className="relative w-20 h-20 mb-4">
          {/* Central pulsing icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative">
              {/* Glow effect */}
              <div className="absolute inset-0 bg-purple-500/30 rounded-full blur-xl animate-ai-pulse" />

              {/* Icon container */}
              <div className="relative w-12 h-12 flex items-center justify-center bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl shadow-lg shadow-purple-500/30 animate-ai-float">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Orbiting particles */}
          <div className="absolute inset-0 animate-ai-orbit">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-purple-400 rounded-full shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
          </div>
          <div className="absolute inset-0 animate-ai-orbit-reverse" style={{ animationDelay: '-1s' }}>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-blue-400 rounded-full shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
          </div>
          <div className="absolute inset-0 animate-ai-orbit" style={{ animationDelay: '-2s' }}>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-indigo-400 rounded-full shadow-[0_0_6px_rgba(129,140,248,0.8)]" />
          </div>
        </div>

        {/* Status text */}
        <div className="text-center">
          <p
            key={messageIndex}
            className="text-sm font-medium text-purple-300 animate-ai-text-cycle"
          >
            {AI_LOADING_MESSAGES[messageIndex]}
          </p>
          <div className="flex items-center justify-center gap-1 mt-2">
            <div className="w-1.5 h-1.5 bg-purple-400/60 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 bg-purple-400/60 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 bg-purple-400/60 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>

      {/* Corner accents */}
      <div className="absolute top-3 left-3 w-2 h-2 border-t border-l border-purple-500/40 rounded-tl" />
      <div className="absolute top-3 right-3 w-2 h-2 border-t border-r border-purple-500/40 rounded-tr" />
      <div className="absolute bottom-3 left-3 w-2 h-2 border-b border-l border-purple-500/40 rounded-bl" />
      <div className="absolute bottom-3 right-3 w-2 h-2 border-b border-r border-purple-500/40 rounded-br" />
    </div>
  );
}

const priorityOptions: Priority[] = ['critical', 'high', 'medium', 'low', 'someday'];
const effortOptions: Effort[] = ['low', 'medium', 'high', 'very_high'];
const valueOptions: Value[] = ['low', 'medium', 'high'];

const priorityColors: Record<Priority, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-green-500',
  someday: 'bg-surface-500',
};

const effortColors: Record<Effort, string> = {
  low: 'bg-emerald-600',
  medium: 'bg-blue-500',
  high: 'bg-purple-500',
  very_high: 'bg-red-600',
};

const valueColors: Record<Value, string> = {
  low: 'bg-surface-600',
  medium: 'bg-blue-500',
  high: 'bg-emerald-500',
};

export function TaskPanel({ item, isOpen, onClose, onSave, onDelete, onTackle }: TaskPanelProps) {
  const [editedItem, setEditedItem] = useState<BacklogItem | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [preAiItem, setPreAiItem] = useState<BacklogItem | null>(null);
  const [showAiInput, setShowAiInput] = useState(false);
  const [aiComment, setAiComment] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const aiInputRef = useRef<HTMLTextAreaElement>(null);

  const hasAiChanges = preAiItem !== null;

  useEffect(() => {
    if (item) {
      setEditedItem({ ...item });
      setIsPreviewMode(false);
      setPreAiItem(null);
      setShowAiInput(false);
      setAiComment('');
      setShowDiff(false);
    }
  }, [item]);

  useEffect(() => {
    if (showAiInput && aiInputRef.current) {
      aiInputRef.current.focus();
    }
  }, [showAiInput]);

  useEffect(() => {
    if (isOpen && titleRef.current) {
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

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

  const handleOpenAiAssist = () => {
    setShowAiInput(true);
    setAiComment('');
  };

  const handleCancelAiAssist = () => {
    setShowAiInput(false);
    setAiComment('');
  };

  const handleSubmitAiAssist = async () => {
    if (!editedItem?.title.trim()) return;

    setIsAnalyzing(true);
    setShowAiInput(false);
    // Store current state before AI changes
    setPreAiItem({ ...editedItem });

    try {
      const response = await fetch('/api/analyze-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editedItem.title.trim(),
          description: editedItem.description?.trim() || '',
          comments: aiComment.trim(),
        }),
      });

      if (response.ok) {
        const analysis = await response.json();
        setEditedItem({
          ...editedItem,
          priority: analysis.priority || editedItem.priority,
          effort: analysis.effort || editedItem.effort,
          value: analysis.value || editedItem.value,
          category: analysis.category || editedItem.category,
          description: (typeof analysis.enhancedDescription === 'string' && analysis.enhancedDescription.trim())
            ? analysis.enhancedDescription
            : editedItem.description,
        });
        setShowDiff(true);
        setAiComment('');
      } else {
        console.error('AI analysis request failed:', response.status);
        setPreAiItem(null);
      }
    } catch (error) {
      console.error('AI analysis failed:', error);
      setPreAiItem(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUndoAiChanges = () => {
    if (preAiItem) {
      setEditedItem({ ...preAiItem });
      setPreAiItem(null);
      setShowDiff(false);
      setIsPreviewMode(false);
    }
  };

  const handleAcceptAiChanges = () => {
    setPreAiItem(null);
    setShowDiff(false);
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
        className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-surface-900 border-l border-surface-700/50 shadow-panel z-50 animate-slide-in overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
          <div>
            <h2 className="font-display text-lg text-surface-100">Edit Task</h2>
            {editedItem.category && (
              <span className="text-xs text-blue-400 font-medium">{editedItem.category}</span>
            )}
          </div>
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
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
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
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider">
                Description
              </label>
              {!isAnalyzing && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsPreviewMode(false)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      !isPreviewMode
                        ? 'bg-surface-700 text-surface-100'
                        : 'text-surface-500 hover:text-surface-300'
                    }`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPreviewMode(true)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      isPreviewMode
                        ? 'bg-surface-700 text-surface-100'
                        : 'text-surface-500 hover:text-surface-300'
                    }`}
                  >
                    Preview
                  </button>
                </div>
              )}
            </div>

            {/* AI Loading State */}
            {isAnalyzing && <AiLoadingState />}

            {!isAnalyzing && (
              isPreviewMode ? (
                <div className="w-full min-h-[200px] max-h-[400px] overflow-y-auto bg-surface-800/50 border border-surface-700 rounded-lg px-4 py-3 prose prose-invert prose-sm max-w-none prose-headings:text-surface-100 prose-p:text-surface-300 prose-strong:text-surface-200 prose-code:text-accent prose-code:bg-surface-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-surface-950 prose-li:text-surface-300 prose-a:text-accent">
                  {editedItem.description ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {editedItem.description}
                    </ReactMarkdown>
                  ) : (
                    <p className="text-surface-500 italic">No description</p>
                  )}
                </div>
              ) : (
                <textarea
                  value={editedItem.description}
                  onChange={(e) => setEditedItem({ ...editedItem, description: e.target.value })}
                  rows={14}
                  className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-2.5 text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors resize-y min-h-[200px] font-mono text-sm leading-relaxed"
                  placeholder="Add a description... (supports markdown)"
                />
              )
            )}
            {/* AI Input Area */}
            {showAiInput && (
              <div className="mt-3 p-3 bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-lg">
                <label className="block text-xs font-medium text-purple-300 mb-2">
                  What would you like to add or change?
                </label>
                <textarea
                  ref={aiInputRef}
                  value={aiComment}
                  onChange={(e) => setAiComment(e.target.value)}
                  rows={3}
                  className="w-full bg-surface-900/80 border border-purple-500/30 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/20 transition-colors resize-none"
                  placeholder="e.g., Add acceptance criteria, include technical approach, add edge cases to consider..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.metaKey) {
                      handleSubmitAiAssist();
                    }
                  }}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-surface-500">⌘+Enter to submit</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCancelAiAssist}
                      className="px-3 py-1.5 text-xs font-medium text-surface-400 hover:text-surface-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitAiAssist}
                      disabled={isAnalyzing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isAnalyzing ? (
                        <>
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Processing...
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Enhance
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Diff View - Show before/after when AI made changes */}
            {showDiff && preAiItem && (
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-surface-400">
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  AI Changes Preview
                </div>

                {/* Before */}
                <div className="relative">
                  <div className="absolute -left-2 top-0 bottom-0 w-1 bg-red-500/50 rounded-full" />
                  <div className="text-[10px] uppercase tracking-wider text-red-400 mb-1 font-medium">Before</div>
                  <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 max-h-32 overflow-y-auto">
                    <pre className="text-xs text-surface-400 whitespace-pre-wrap font-mono">
                      {preAiItem.description || '(no description)'}
                    </pre>
                  </div>
                </div>

                {/* After */}
                <div className="relative">
                  <div className="absolute -left-2 top-0 bottom-0 w-1 bg-green-500/50 rounded-full" />
                  <div className="text-[10px] uppercase tracking-wider text-green-400 mb-1 font-medium">After</div>
                  <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3 max-h-48 overflow-y-auto">
                    <div className="prose prose-invert prose-sm max-w-none prose-headings:text-surface-100 prose-p:text-surface-300 prose-strong:text-surface-200 prose-code:text-accent prose-li:text-surface-300">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {editedItem.description || '(no description)'}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>

                {/* Accept/Undo buttons */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleUndoAiChanges}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-surface-300 bg-surface-800 hover:bg-surface-700 border border-surface-700 rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={handleAcceptAiChanges}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-500 rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Accept Changes
                  </button>
                </div>
              </div>
            )}

            {/* Footer with markdown hint and AI button */}
            {!showAiInput && !showDiff && (
              <div className="mt-2 flex items-center gap-2">
                <p className="text-xs text-surface-600 flex-1">Supports Markdown: **bold**, *italic*, `code`, lists, links</p>
                <button
                  type="button"
                  onClick={handleOpenAiAssist}
                  disabled={isAnalyzing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-purple-600/20 to-blue-600/20 hover:from-purple-600/30 hover:to-blue-600/30 border border-purple-500/30 text-purple-300 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  AI Assist
                </button>
              </div>
            )}
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
              Status
            </label>
            <div className="flex gap-1">
              {COLUMN_ORDER.map((s) => (
                <button
                  key={s}
                  onClick={() => setEditedItem({ ...editedItem, status: s })}
                  className={`
                    flex-1 py-2 rounded-lg text-xs font-medium transition-all
                    ${editedItem.status === s
                      ? 'bg-accent text-surface-900 shadow-lg'
                      : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                    }
                  `}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Priority, Effort, Value Grid */}
          <div className="grid grid-cols-3 gap-4">
            {/* Priority */}
            <div>
              <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
                Priority
              </label>
              <div className="flex flex-col gap-1">
                {priorityOptions.map((p) => (
                  <button
                    key={p}
                    onClick={() => setEditedItem({ ...editedItem, priority: p })}
                    className={`
                      py-1.5 px-2 rounded-lg text-xs font-medium capitalize transition-all text-left
                      ${editedItem.priority === p
                        ? `${priorityColors[p]} text-white shadow-lg`
                        : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                      }
                    `}
                  >
                    {PRIORITY_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            {/* Effort */}
            <div>
              <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
                Effort
              </label>
              <div className="flex flex-col gap-1">
                {effortOptions.map((e) => (
                  <button
                    key={e}
                    onClick={() => setEditedItem({ ...editedItem, effort: editedItem.effort === e ? undefined : e })}
                    className={`
                      py-1.5 px-2 rounded-lg text-xs font-medium capitalize transition-all text-left
                      ${editedItem.effort === e
                        ? `${effortColors[e]} text-white shadow-lg`
                        : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                      }
                    `}
                  >
                    {EFFORT_LABELS[e]}
                  </button>
                ))}
              </div>
            </div>

            {/* Value */}
            <div>
              <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
                Value
              </label>
              <div className="flex flex-col gap-1">
                {valueOptions.map((v) => (
                  <button
                    key={v}
                    onClick={() => setEditedItem({ ...editedItem, value: editedItem.value === v ? undefined : v })}
                    className={`
                      py-1.5 px-2 rounded-lg text-xs font-medium capitalize transition-all text-left
                      ${editedItem.value === v
                        ? `${valueColors[v]} text-white shadow-lg`
                        : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                      }
                    `}
                  >
                    {VALUE_LABELS[v]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
              Category
            </label>
            <input
              type="text"
              value={editedItem.category || ''}
              onChange={(e) => setEditedItem({ ...editedItem, category: e.target.value || undefined })}
              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
              placeholder="e.g., Security, UX Improvements"
            />
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
