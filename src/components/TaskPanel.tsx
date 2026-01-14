'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { TextDiff } from './TextDiff';
import type { BacklogItem, Priority, Status, Effort, Value } from '@/types/backlog';
import { PRIORITY_LABELS, STATUS_LABELS, COLUMN_ORDER, EFFORT_LABELS, VALUE_LABELS } from '@/types/backlog';
import { validateTaskQuality, QUALITY_THRESHOLD } from '@/lib/task-quality';
import { getGitHubSyncConfig } from '@/lib/storage/github-sync';
import { TaskQualityScore } from './TaskQualityScore';
import { AcceptanceCriteriaEditor } from './AcceptanceCriteriaEditor';
import { InlineOptionSelector } from './InlineOptionSelector';
import { GitHubIssuePicker } from './GitHubIssuePicker';
import { getUserGitHubConfig } from '@/lib/storage/project-config';

// Helper to get configured GitHub repo
function getGitHubRepo(): string | null {
  const config = getGitHubSyncConfig();
  return config?.repo || null;
}

// Helper to strip HTML comments from description (e.g., ringmaster-task-id)
function stripHtmlComments(text: string | undefined): string {
  if (!text) return '';
  return text.replace(/<!--[\s\S]*?-->/g, '').trim();
}

interface TaskPanelProps {
  item: BacklogItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: BacklogItem) => void;
  onDelete: (id: string) => Promise<void>;
  onTackle: (item: BacklogItem) => void;
  onReview?: (item: BacklogItem) => void;
  onShip?: (item: BacklogItem) => Promise<void>;
  onUnlinkGitHub?: (item: BacklogItem) => Promise<void>;
  onSendToGitHub?: (item: BacklogItem) => Promise<{ issueNumber: number; issueUrl: string }>;
  onAddToBacklog?: (item: BacklogItem) => Promise<void>;
  backlogPath?: string;
  isGitHubView?: boolean; // When true, editing opens GitHub instead
  isQuickTaskView?: boolean; // When true, show "Promote to Backlog" option
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

const priorityOptions: { value: Priority; label: string }[] = [
  { value: 'critical', label: PRIORITY_LABELS.critical },
  { value: 'high', label: PRIORITY_LABELS.high },
  { value: 'medium', label: PRIORITY_LABELS.medium },
  { value: 'low', label: PRIORITY_LABELS.low },
  { value: 'someday', label: PRIORITY_LABELS.someday },
];

const effortOptions: { value: Effort; label: string }[] = [
  { value: 'very_high', label: EFFORT_LABELS.very_high },
  { value: 'high', label: EFFORT_LABELS.high },
  { value: 'medium', label: EFFORT_LABELS.medium },
  { value: 'low', label: EFFORT_LABELS.low },
  { value: 'trivial', label: EFFORT_LABELS.trivial },
];

const valueOptions: { value: Value; label: string }[] = [
  { value: 'high', label: VALUE_LABELS.high },
  { value: 'medium', label: VALUE_LABELS.medium },
  { value: 'low', label: VALUE_LABELS.low },
];

// Color schemes: green → yellow → blue → orange → red (5 options)
// For 3 options: green → blue → red
const priorityColors: Record<Priority, string> = {
  someday: 'bg-green-500',
  low: 'bg-yellow-500',
  medium: 'bg-blue-500',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
};

const effortColors: Record<Effort, string> = {
  trivial: 'bg-green-500',
  low: 'bg-yellow-500',
  medium: 'bg-blue-500',
  high: 'bg-orange-500',
  very_high: 'bg-red-500',
};

const valueColors: Record<Value, string> = {
  low: 'bg-green-500',
  medium: 'bg-blue-500',
  high: 'bg-red-500',
};

export function TaskPanel({ item, isOpen, onClose, onSave, onDelete, onTackle, onReview, onShip, onUnlinkGitHub, onSendToGitHub, onAddToBacklog, backlogPath, isGitHubView, isQuickTaskView }: TaskPanelProps) {
  const [editedItem, setEditedItem] = useState<BacklogItem | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isShipping, setIsShipping] = useState(false);
  const [isSendingToGitHub, setIsSendingToGitHub] = useState(false);
  const [isAddingToBacklog, setIsAddingToBacklog] = useState(false);
  const [preAiItem, setPreAiItem] = useState<BacklogItem | null>(null);
  const [showAiInput, setShowAiInput] = useState(false);
  const [aiComment, setAiComment] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const [qualityWarning, setQualityWarning] = useState<{ score: number; issues: string[] } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const aiInputRef = useRef<HTMLTextAreaElement>(null);

  const hasAiChanges = preAiItem !== null;
  const isReadyToShip = editedItem?.status === 'ready_to_ship';
  const isInReview = editedItem?.status === 'review';
  const isInProgress = editedItem?.status === 'in_progress';
  const isInBacklog = editedItem?.status === 'backlog' || editedItem?.status === 'up_next';
  const hasBranch = !!editedItem?.branch;
  const hasReviewFeedback = !!editedItem?.reviewFeedback;
  const isLowQuality = editedItem?.qualityScore !== undefined && editedItem.qualityScore < QUALITY_THRESHOLD;

  useEffect(() => {
    if (item) {
      // Strip HTML comments (e.g., ringmaster-task-id) from description for display
      setEditedItem({
        ...item,
        description: stripHtmlComments(item.description),
      });
      setIsPreviewMode(false);
      setPreAiItem(null);
      setShowAiInput(false);
      setAiComment('');
      setShowDiff(false);
      setQualityWarning(null);
      setAiError(null);
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
    if (!editedItem || !editedItem.title.trim()) {
      onClose();
      return;
    }

    // Calculate quality score to save with the item
    const quality = validateTaskQuality(editedItem.title, editedItem.description || '', editedItem.acceptanceCriteria);

    // Save with quality scores attached
    onSave({
      ...editedItem,
      qualityScore: quality.score,
      qualityIssues: quality.issues,
    });
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
    setAiError(null);
    // Store current state before AI changes
    setPreAiItem({ ...editedItem });

    // Create abort controller for timeout (60 seconds for AI operations)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch('/api/analyze-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editedItem.title.trim(),
          description: editedItem.description?.trim() || '',
          comments: aiComment.trim(),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

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
          acceptanceCriteria: Array.isArray(analysis.acceptanceCriteria) && analysis.acceptanceCriteria.length > 0
            ? analysis.acceptanceCriteria
            : editedItem.acceptanceCriteria,
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
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errorMessage = errorData.error || `Request failed with status ${response.status}`;
        console.error('AI analysis request failed:', response.status, errorMessage);
        setAiError(`AI Assist failed: ${errorMessage}`);
        setPreAiItem(null);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('AI analysis failed:', error);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          setAiError('AI Assist timed out after 60 seconds. Please try again or simplify your request.');
        } else {
          setAiError(`AI Assist failed: ${error.message}`);
        }
      } else {
        setAiError('AI Assist failed due to a network error. Please check your connection and try again.');
      }
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
    setAiError(null);
    // Store current state before AI changes
    setPreAiItem({ ...editedItem });

    // Build a rescope-specific prompt based on quality issues
    const qualityIssues = editedItem.qualityIssues || [];
    const rescopePrompt = `Please improve this task definition to meet quality standards. Current issues: ${qualityIssues.join(', ')}. Add proper Description, Requirements, Technical Approach, and Success Criteria sections. Make it actionable and specific.`;

    // Create abort controller for timeout (60 seconds for AI operations)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch('/api/analyze-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editedItem.title.trim(),
          description: editedItem.description?.trim() || '',
          comments: rescopePrompt,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

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
          acceptanceCriteria: Array.isArray(analysis.acceptanceCriteria) && analysis.acceptanceCriteria.length > 0
            ? analysis.acceptanceCriteria
            : editedItem.acceptanceCriteria,
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
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errorMessage = errorData.error || `Request failed with status ${response.status}`;
        console.error('Rescope request failed:', response.status, errorMessage);
        setAiError(`Rescope failed: ${errorMessage}`);
        setPreAiItem(null);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Rescope failed:', error);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          setAiError('Rescope timed out after 60 seconds. Please try again.');
        } else {
          setAiError(`Rescope failed: ${error.message}`);
        }
      } else {
        setAiError('Rescope failed due to a network error. Please check your connection and try again.');
      }
      setPreAiItem(null);
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
            <div className="flex items-center gap-2">
              {editedItem.category && (
                <span className="text-xs text-blue-400 font-medium">{editedItem.category}</span>
              )}
              {editedItem.githubIssueNumber && (
                <div className="flex items-center gap-2">
                  <a
                    href={editedItem.githubIssueUrl || `https://github.com/${getGitHubRepo() || ''}/issues/${editedItem.githubIssueNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    #{editedItem.githubIssueNumber}
                  </a>
                  {onUnlinkGitHub && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm(`Unlink this task from GitHub Issue #${editedItem.githubIssueNumber}? The issue will remain on GitHub but won't be linked to this task.`)) {
                          await onUnlinkGitHub(editedItem);
                          setEditedItem({
                            ...editedItem,
                            githubIssueNumber: undefined,
                            githubIssueUrl: undefined,
                          });
                        }
                      }}
                      className="p-1 rounded text-surface-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Unlink from GitHub Issue"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
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
          {/* AI Error Message */}
          {aiError && !isAnalyzing && (
            <div className="relative overflow-hidden rounded-xl border border-red-500/50 bg-gradient-to-r from-red-500/20 via-red-600/20 to-red-500/20">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* Error icon */}
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-red-300 mb-1">AI Operation Failed</h3>
                    <p className="text-xs text-red-200/80">{aiError}</p>
                  </div>

                  {/* Close button */}
                  <button
                    onClick={() => setAiError(null)}
                    className="flex-shrink-0 p-1 text-red-400 hover:text-red-300 transition-colors"
                    title="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
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

          {/* Acceptance Criteria */}
          <AcceptanceCriteriaEditor
            criteria={editedItem.acceptanceCriteria || []}
            onChange={(criteria) => setEditedItem({ ...editedItem, acceptanceCriteria: criteria })}
            showEmptyWarning
          />

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

          {/* Priority, Effort, Value */}
          <div className="grid grid-cols-3 gap-4">
            <InlineOptionSelector<Priority>
              label="Priority"
              options={priorityOptions}
              value={editedItem.priority}
              onChange={(value) => setEditedItem({ ...editedItem, priority: value || 'medium' })}
              colorMap={priorityColors}
            />
            <InlineOptionSelector<Effort>
              label="Effort"
              options={effortOptions}
              value={editedItem.effort}
              onChange={(value) => setEditedItem({ ...editedItem, effort: value || 'medium' })}
              colorMap={effortColors}
            />
            <InlineOptionSelector<Value>
              label="Value"
              options={valueOptions}
              value={editedItem.value}
              onChange={(value) => setEditedItem({ ...editedItem, value: value || 'medium' })}
              colorMap={valueColors}
            />
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

          {/* GitHub Issue Link - Only show for Backlog view (not GitHub view) */}
          {!isGitHubView && (
            <div>
              <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
                GitHub Issue
              </label>
              {(() => {
                const repo = getGitHubRepo();
                const githubConfig = getUserGitHubConfig();
                const token = githubConfig?.token;

                if (!repo || !token) {
                  return (
                    <div className="px-3 py-2 bg-surface-800/50 border border-surface-700/50 rounded-lg">
                      <p className="text-xs text-surface-500">
                        Configure GitHub in Settings to link issues
                      </p>
                    </div>
                  );
                }

                return (
                  <GitHubIssuePicker
                    repo={repo}
                    token={token}
                    value={editedItem.githubIssueNumber}
                    onChange={(issueNumber, issueUrl) => {
                      setEditedItem({
                        ...editedItem,
                        githubIssueNumber: issueNumber,
                        githubIssueUrl: issueUrl,
                      });
                    }}
                  />
                );
              })()}
            </div>
          )}

          {/* Metadata */}
          <div className="pt-4 border-t border-surface-800">
            <div className="flex justify-between text-xs text-surface-500">
              <span>Created: {new Date(editedItem.createdAt).toLocaleDateString()}</span>
              <span>Updated: {new Date(editedItem.updatedAt).toLocaleDateString()}</span>
            </div>

            {/* Quality Score Indicator */}
            {(() => {
              const quality = validateTaskQuality(
                editedItem.title,
                editedItem.description,
                editedItem.acceptanceCriteria
              );
              return (
                <TaskQualityScore
                  score={quality.score}
                  issues={quality.issues}
                  onRescope={handleRescope}
                  isRescoping={isAnalyzing}
                />
              );
            })()}

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

          {/* GAP #6 FIX: Open in IDE button for in_progress tasks with worktree */}
          {isInProgress && editedItem.worktreePath && (
            <button
              onClick={() => onTackle(editedItem)}
              className="w-full flex items-center justify-center gap-2 bg-surface-800 hover:bg-surface-700 border border-surface-600 text-surface-200 font-medium py-2 px-4 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              Open in IDE
            </button>
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

          {/* GAP #18 FIX: Open in IDE button for ready_to_ship tasks (last-minute fixes) */}
          {isReadyToShip && editedItem.worktreePath && (
            <button
              onClick={() => onTackle(editedItem)}
              className="w-full flex items-center justify-center gap-2 bg-surface-800 hover:bg-surface-700 border border-surface-600 text-surface-200 font-medium py-2 px-4 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              Open in IDE
            </button>
          )}

          {/* Ship button (for ready_to_ship status) */}
          {/* GAP #11 FIX: PR should already exist at this point. Button merges and cleans up */}
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
                  Merging...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Merge & Ship
                </>
              )}
            </button>
          )}

          {/* Review button (shown when in review status) */}
          {isInReview && onReview && (
            <button
              onClick={() => onReview(editedItem)}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium py-2.5 px-4 rounded-lg transition-all shadow-lg hover:shadow-cyan-500/25"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Run Code Review
            </button>
          )}

          {/* Commit & Review button (shown when in progress) */}
          {/* GAP #11 FIX: The review API now auto-commits and pushes, so the button reflects this */}
          {isInProgress && onReview && (
            <div className="space-y-2">
              <button
                onClick={() => {
                  // Don't change status until review completes - the review modal will handle that
                  // The review API will auto-commit any uncommitted changes before reviewing
                  onReview(editedItem);
                }}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium py-2.5 px-4 rounded-lg transition-all shadow-lg hover:shadow-cyan-500/25"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Commit & Review
              </button>
              {/* GAP #8 FIX: Guidance about what the button does */}
              <p className="text-xs text-surface-500 text-center">
                Auto-commits changes, pushes to remote, runs AI review, and creates PR
              </p>
            </div>
          )}

          {/* Tackle button (only shown for backlog/up_next tasks) */}
          {isInBacklog && (
            <button
              onClick={() => onTackle(editedItem)}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-medium py-2.5 px-4 rounded-lg transition-all shadow-lg hover:shadow-purple-500/25"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Start Working
            </button>
          )}

          {/* Send to GitHub button (for backlog items not yet linked) */}
          {!isGitHubView && !editedItem.githubIssueNumber && onSendToGitHub && (
            <button
              onClick={async () => {
                setIsSendingToGitHub(true);
                try {
                  const result = await onSendToGitHub(editedItem);
                  // Update the item with the new GitHub link
                  setEditedItem({
                    ...editedItem,
                    githubIssueNumber: result.issueNumber,
                    githubIssueUrl: result.issueUrl,
                  });
                } finally {
                  setIsSendingToGitHub(false);
                }
              }}
              disabled={isSendingToGitHub}
              className="w-full flex items-center justify-center gap-2 bg-surface-800 hover:bg-surface-700 border border-surface-600 text-surface-200 font-medium py-2 px-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSendingToGitHub ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating Issue...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                  </svg>
                  Send to GitHub
                </>
              )}
            </button>
          )}

          {/* Add to Backlog button (for GitHub or Quick Task items) */}
          {(isGitHubView || isQuickTaskView) && onAddToBacklog && (
            <button
              onClick={async () => {
                setIsAddingToBacklog(true);
                try {
                  await onAddToBacklog(editedItem);
                } finally {
                  setIsAddingToBacklog(false);
                }
              }}
              disabled={isAddingToBacklog}
              className="w-full flex items-center justify-center gap-2 bg-surface-800 hover:bg-surface-700 border border-surface-600 text-surface-200 font-medium py-2 px-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAddingToBacklog ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Adding to Backlog...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {isQuickTaskView ? 'Promote to Backlog' : 'Add to Backlog'}
                </>
              )}
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

    </>
  );
}
