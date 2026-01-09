'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { TextDiff } from './TextDiff';
import type { BacklogItem, Priority, Status, Effort, Value } from '@/types/backlog';
import { PRIORITY_LABELS, STATUS_LABELS, COLUMN_ORDER, EFFORT_LABELS, VALUE_LABELS } from '@/types/backlog';
import { validateTaskQuality, QUALITY_THRESHOLD } from '@/lib/task-quality';
import { taskNeedsCleanup } from '@/lib/task-validator';

interface TaskPanelProps {
  item: BacklogItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: BacklogItem) => void;
  onDelete: (id: string) => Promise<void>;
  onTackle: (item: BacklogItem) => void;
  onShip?: (item: BacklogItem) => Promise<void>;
  backlogPath?: string;
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

export function TaskPanel({ item, isOpen, onClose, onSave, onDelete, onTackle, onShip, backlogPath }: TaskPanelProps) {
  const [editedItem, setEditedItem] = useState<BacklogItem | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isShipping, setIsShipping] = useState(false);
  const [isRescoping, setIsRescoping] = useState(false);
  const [preAiItem, setPreAiItem] = useState<BacklogItem | null>(null);
  const [showAiInput, setShowAiInput] = useState(false);
  const [aiComment, setAiComment] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const [qualityWarning, setQualityWarning] = useState<{ score: number; issues: string[] } | null>(null);
  const [showSaveWarning, setShowSaveWarning] = useState(false);
  const [pendingQuality, setPendingQuality] = useState<{ score: number; issues: string[] } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const aiInputRef = useRef<HTMLTextAreaElement>(null);

  const hasAiChanges = preAiItem !== null;
  const isReadyToShip = editedItem?.status === 'ready_to_ship';
  const hasBranch = !!editedItem?.branch;
  const hasReviewFeedback = !!editedItem?.reviewFeedback;
  const isLowQuality = editedItem?.qualityScore !== undefined && editedItem.qualityScore < QUALITY_THRESHOLD;
  const needsRescope = editedItem ? taskNeedsCleanup(editedItem) : false;
  const [rescopeDismissed, setRescopeDismissed] = useState(false);

  useEffect(() => {
    if (item) {
      setEditedItem({ ...item });
      setIsPreviewMode(false);
      setPreAiItem(null);
      setShowAiInput(false);
      setAiComment('');
      setShowDiff(false);
      setQualityWarning(null);
      setShowSaveWarning(false);
      setPendingQuality(null);
      setRescopeDismissed(false);
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

  const handleSave = (forceIgnoreQuality = false) => {
    if (!editedItem || !editedItem.title.trim()) {
      onClose();
      return;
    }

    // Check quality before saving
    const quality = validateTaskQuality(editedItem.title, editedItem.description || '', editedItem.acceptanceCriteria);

    // If low quality and not forcing, show warning
    if (!forceIgnoreQuality && quality.score < QUALITY_THRESHOLD) {
      setPendingQuality({ score: quality.score, issues: quality.issues });
      setShowSaveWarning(true);
      return;
    }

    // Save with quality scores attached
    onSave({
      ...editedItem,
      qualityScore: quality.score,
      qualityIssues: quality.issues,
    });
    onClose();
  };

  const handleForceSave = () => {
    setShowSaveWarning(false);
    handleSave(true);
  };

  const handleCancelSave = () => {
    setShowSaveWarning(false);
    setPendingQuality(null);
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

        // Check for quality warnings
        if (analysis.quality && !analysis.quality.isValid) {
          setQualityWarning({
            score: analysis.quality.score,
            issues: analysis.quality.issues || [],
          });
        } else {
          setQualityWarning(null);
        }
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
      setQualityWarning(null);
    }
  };

  const handleAcceptAiChanges = () => {
    setPreAiItem(null);
    setShowDiff(false);
    // Keep quality warning visible after accepting so user can address issues
  };

  const handleRescope = async () => {
    if (!editedItem?.title.trim()) return;

    setIsAnalyzing(true);
    setRescopeDismissed(true); // Hide the banner while processing
    // Store current state before AI changes
    setPreAiItem({ ...editedItem });

    // Build a rescope-specific prompt based on quality issues
    const qualityIssues = editedItem.qualityIssues || [];
    const rescopePrompt = `Please improve this task definition to meet quality standards. Current issues: ${qualityIssues.join(', ')}. Add proper Description, Requirements, Technical Approach, and Success Criteria sections. Make it actionable and specific.`;

    try {
      const response = await fetch('/api/analyze-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editedItem.title.trim(),
          description: editedItem.description?.trim() || '',
          comments: rescopePrompt,
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
          // Update quality scores from the new analysis
          qualityScore: analysis.quality?.score,
          qualityIssues: analysis.quality?.issues,
        });
        setShowDiff(true);

        // Check for quality warnings
        if (analysis.quality && !analysis.quality.isValid) {
          setQualityWarning({
            score: analysis.quality.score,
            issues: analysis.quality.issues || [],
          });
        } else {
          setQualityWarning(null);
        }
      } else {
        console.error('Rescope request failed:', response.status);
        setPreAiItem(null);
        setRescopeDismissed(false); // Show banner again on failure
      }
    } catch (error) {
      console.error('Rescope failed:', error);
      setPreAiItem(null);
      setRescopeDismissed(false); // Show banner again on failure
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleShip = async () => {
    if (!editedItem || !onShip) return;

    setIsShipping(true);
    try {
      await onShip(editedItem);
      onClose();
    } catch (error) {
      console.error('Ship error:', error);
    } finally {
      setIsShipping(false);
    }
  };

  const handleAiRescope = async () => {
    if (!editedItem) return;

    setIsRescoping(true);
    setPreAiItem({ ...editedItem });

    try {
      const workDir = backlogPath ? backlogPath.replace(/\/[^/]+$/, '') : undefined;
      const response = await fetch('/api/suggest-cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: editedItem, workDir }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.suggestion) {
          const suggestion = result.suggestion;
          setEditedItem({
            ...editedItem,
            title: suggestion.title || editedItem.title,
            description: suggestion.description || editedItem.description,
            acceptanceCriteria: suggestion.acceptanceCriteria || editedItem.acceptanceCriteria,
            notes: suggestion.notes || editedItem.notes,
            priority: (suggestion.priority as Priority) || editedItem.priority,
            effort: (suggestion.effort as Effort) || editedItem.effort,
            value: (suggestion.value as Value) || editedItem.value,
          });
          setShowDiff(true);
        }
      } else {
        console.error('AI Rescope failed:', response.status);
        setPreAiItem(null);
      }
    } catch (error) {
      console.error('AI Rescope error:', error);
      setPreAiItem(null);
    } finally {
      setIsRescoping(false);
    }
  };

  if (!isOpen || !editedItem) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-fade-in"
        onClick={() => handleSave()}
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
              onClick={async () => {
                if (confirm('Delete this task?')) {
                  await onDelete(editedItem.id);
                  // onDelete handler closes the panel
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
              onClick={() => handleSave()}
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
          {/* AI Rescope Loading State */}
          {isRescoping && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-amber-300">AI Rescoping Task...</h4>
                <span className="text-xs text-surface-500">This may take up to a minute</span>
              </div>
              <AiLoadingState />
            </div>
          )}

          {/* Rescope Banner for Low Quality Tasks (score-based) */}
          {isLowQuality && !rescopeDismissed && !isAnalyzing && !showDiff && !isRescoping && (
            <div className="relative overflow-hidden rounded-xl border border-red-500/30 bg-gradient-to-r from-red-500/10 via-orange-500/10 to-red-500/10">
              {/* Animated background pulse */}
              <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-orange-500/5 animate-pulse" />

              <div className="relative p-4">
                <div className="flex items-start gap-3">
                  {/* Warning icon */}
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-red-300">Needs Rescoping</h3>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-500/30 text-red-300">
                        Score: {editedItem.qualityScore}/100
                      </span>
                    </div>
                    <p className="text-xs text-surface-400 mb-3">
                      This task doesn&apos;t have enough detail to be actionable. Let AI help define proper requirements.
                    </p>

                    {/* Quality Issues */}
                    {editedItem.qualityIssues && editedItem.qualityIssues.length > 0 && (
                      <ul className="text-xs text-surface-500 space-y-0.5 mb-3">
                        {editedItem.qualityIssues.map((issue, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="text-red-400/60">•</span>
                            {issue}
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRescope}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg transition-all shadow-lg hover:shadow-purple-500/25"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Rescope with AI
                      </button>
                      <button
                        onClick={() => setRescopeDismissed(true)}
                        className="px-3 py-2 text-xs font-medium text-surface-400 hover:text-surface-200 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>

                  {/* Close button */}
                  <button
                    onClick={() => setRescopeDismissed(true)}
                    className="flex-shrink-0 p-1 text-surface-500 hover:text-surface-300 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Needs Rescope Banner (structure-based - missing fields) */}
          {needsRescope && !isLowQuality && !showDiff && !isRescoping && (
            <div className="p-4 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-xl">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-amber-300">Task Needs Rescoping</h4>
                  <p className="text-xs text-amber-400/70 mt-0.5">
                    Missing required fields: {!editedItem.description || editedItem.description.length < 20 ? 'description' : ''}
                    {(!editedItem.description || editedItem.description.length < 20) && (!editedItem.acceptanceCriteria || editedItem.acceptanceCriteria.length === 0) ? ', ' : ''}
                    {!editedItem.acceptanceCriteria || editedItem.acceptanceCriteria.length === 0 ? 'acceptance criteria' : ''}
                  </p>
                </div>
                <button
                  onClick={handleAiRescope}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-sm font-medium rounded-lg transition-all shadow-lg hover:shadow-amber-500/20"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  AI Rescope
                </button>
              </div>
            </div>
          )}

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

            {/* Quality Warning */}
            {qualityWarning && (
              <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-yellow-300">
                      Low Quality Description (Score: {qualityWarning.score}/100)
                    </p>
                    <p className="text-xs text-yellow-300/70 mt-1">
                      Consider improving to avoid rescope issues later:
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {qualityWarning.issues.map((issue, idx) => (
                        <li key={idx} className="text-xs text-yellow-300/80 flex items-start gap-1">
                          <span>•</span>
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Diff View - Show unified diff when AI made changes */}
            {showDiff && preAiItem && (
              <div className="mt-3 space-y-3">
                <TextDiff
                  before={preAiItem.description || ''}
                  after={editedItem.description || ''}
                />

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
          {/* Branch info */}
          {hasBranch && (
            <div className="flex items-center gap-2 px-3 py-2 bg-surface-800/50 rounded-lg border border-surface-700/50">
              <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs font-mono text-surface-300 truncate flex-1">
                {editedItem.branch}
              </span>
              {editedItem.worktreePath && (
                <span className="text-[10px] text-surface-500 font-mono">
                  {editedItem.worktreePath}
                </span>
              )}
            </div>
          )}

          {/* Review feedback */}
          {hasReviewFeedback && (
            <div className="px-3 py-2 bg-orange-500/10 rounded-lg border border-orange-500/30">
              <div className="flex items-center gap-1.5 mb-1">
                <svg className="w-3.5 h-3.5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-xs font-medium text-orange-400">Review Feedback</span>
              </div>
              <p className="text-xs text-orange-300/80">{editedItem.reviewFeedback}</p>
            </div>
          )}

          {/* Ship button (for ready_to_ship status) */}
          {isReadyToShip && onShip && (
            <button
              onClick={handleShip}
              disabled={isShipping}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-green-600/50 disabled:to-emerald-600/50 text-white font-medium py-3 px-4 rounded-lg transition-all shadow-lg hover:shadow-green-500/25 disabled:cursor-not-allowed"
            >
              {isShipping ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Shipping...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" />
                  </svg>
                  Commit & Push
                </>
              )}
            </button>
          )}

          {/* Tackle button (not shown when ready to ship) */}
          {!isReadyToShip && (
            <button
              onClick={() => onTackle(editedItem)}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-medium py-2.5 px-4 rounded-lg transition-all shadow-lg hover:shadow-purple-500/25"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Tackle with Claude Code
            </button>
          )}

          <button
            onClick={() => handleSave()}
            className="w-full bg-accent hover:bg-accent-hover text-surface-900 font-medium py-2.5 px-4 rounded-lg transition-colors shadow-glow-amber-sm hover:shadow-glow-amber"
          >
            Save Changes
          </button>
        </div>
      </div>

      {/* Low Quality Save Warning Modal */}
      {showSaveWarning && pendingQuality && (
        <>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]" onClick={handleCancelSave} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-surface-900 border border-surface-700 rounded-xl shadow-2xl z-[60] p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-surface-100 mb-1">Low Quality Task</h3>
                <p className="text-sm text-surface-400">
                  This task scores {pendingQuality.score}/100 and may need rescoping later.
                </p>
              </div>
            </div>

            <div className="bg-surface-800 rounded-lg p-3 mb-4">
              <p className="text-xs font-medium text-surface-400 mb-2">Issues found:</p>
              <ul className="space-y-1">
                {pendingQuality.issues.map((issue, idx) => (
                  <li key={idx} className="text-sm text-surface-300 flex items-start gap-2">
                    <span className="text-red-400">•</span>
                    {issue}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCancelSave}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium bg-surface-800 hover:bg-surface-700 text-surface-300 transition-colors"
              >
                Go Back & Fix
              </button>
              <button
                onClick={handleForceSave}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                Save Anyway
              </button>
            </div>

            <p className="text-xs text-surface-500 mt-3 text-center">
              Tip: Use AI Assist to improve task quality
            </p>
          </div>
        </>
      )}
    </>
  );
}
