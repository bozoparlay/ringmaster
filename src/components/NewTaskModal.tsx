'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Priority, Effort, Value } from '@/types/backlog';
import { PRIORITY_LABELS, EFFORT_LABELS, VALUE_LABELS } from '@/types/backlog';
import { InlineOptionSelector } from './InlineOptionSelector';
import { AcceptanceCriteriaEditor } from './AcceptanceCriteriaEditor';
import { InlineSimilarityProgress } from './InlineSimilarityProgress';
import { getAISettings } from './SettingsModal';
import { Toast } from './Toast';

interface EnhancedTask {
  title: string;
  description: string;
  priority?: Priority;
  effort?: Effort;
  value?: Value;
  category?: string;
  acceptanceCriteria?: string[];
}

interface SimilarTask {
  id: string;
  title: string;
  similarity: number;
  recommendation: 'merge' | 'extend' | 'duplicate';
  reason: string;
}

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (task: EnhancedTask) => void;
  backlogPath?: string;
}

// Priority options with labels
const priorityOptions: { value: Priority; label: string }[] = [
  { value: 'critical', label: PRIORITY_LABELS.critical },
  { value: 'high', label: PRIORITY_LABELS.high },
  { value: 'medium', label: PRIORITY_LABELS.medium },
  { value: 'low', label: PRIORITY_LABELS.low },
  { value: 'someday', label: PRIORITY_LABELS.someday },
];

// Effort options with labels (descending order - highest first)
const effortOptions: { value: Effort; label: string }[] = [
  { value: 'very_high', label: EFFORT_LABELS.very_high },
  { value: 'high', label: EFFORT_LABELS.high },
  { value: 'medium', label: EFFORT_LABELS.medium },
  { value: 'low', label: EFFORT_LABELS.low },
  { value: 'trivial', label: EFFORT_LABELS.trivial },
];

// Value options with labels (descending order - highest first)
const valueOptions: { value: Value; label: string }[] = [
  { value: 'high', label: VALUE_LABELS.high },
  { value: 'medium', label: VALUE_LABELS.medium },
  { value: 'low', label: VALUE_LABELS.low },
];

// Color maps for each selector (green → yellow → blue → orange → red)
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

export function NewTaskModal({ isOpen, onClose, onSubmit, backlogPath }: NewTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [effort, setEffort] = useState<Effort>('medium');
  const [value, setValue] = useState<Value>('medium');
  const [category, setCategory] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCheckingSimilarity, setIsCheckingSimilarity] = useState(false);
  const [similarTasks, setSimilarTasks] = useState<SimilarTask[]>([]);
  const [showSimilarModal, setShowSimilarModal] = useState(false);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState<string[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortCheckRef = useRef<AbortController | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setPriority('medium');
      setEffort('medium');
      setValue('medium');
      setCategory('');
      setSimilarTasks([]);
      setIsCheckingSimilarity(false);
      setShowSimilarModal(false);
      setAcceptanceCriteria([]);
      abortCheckRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (isCheckingSimilarity) {
          // Cancel check first
          abortCheckRef.current?.abort();
          setIsCheckingSimilarity(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, isCheckingSimilarity, onClose]);

  const submitTask = useCallback(() => {
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      priority,
      effort,
      value,
      category: category.trim() || undefined,
      acceptanceCriteria: acceptanceCriteria.filter(ac => ac.trim()),
    });
    setTitle('');
    setDescription('');
    setSimilarTasks([]);
    setShowSimilarModal(false);
    setAcceptanceCriteria([]);
    setIsCheckingSimilarity(false);
  }, [title, description, priority, effort, value, category, acceptanceCriteria, onSubmit]);

  // Handle similarity check completion
  const handleSimilarityComplete = useCallback((foundTasks: SimilarTask[]) => {
    setIsCheckingSimilarity(false);
    if (foundTasks.length > 0) {
      setSimilarTasks(foundTasks);
      setShowSimilarModal(true);
    } else {
      // No similar tasks, proceed with submission
      submitTask();
    }
  }, [submitTask]);

  // Handle similarity check skipped/error
  const handleSimilaritySkipped = useCallback(() => {
    setIsCheckingSimilarity(false);
    // Proceed with submission when skipped
    submitTask();
  }, [submitTask]);

  const handleAiAssist = async () => {
    if (!title.trim()) return;

    setIsAnalyzing(true);
    setAiError(null); // Clear any previous error
    try {
      // Get AI settings from project config
      const aiSettings = getAISettings();

      const response = await fetch('/api/analyze-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          aiSettings: {
            model: aiSettings.model,
            region: aiSettings.region,
            profile: aiSettings.profile,
            enabled: aiSettings.enabled,
          },
        }),
      });

      if (response.ok) {
        const analysis = await response.json();
        if (analysis.priority) setPriority(analysis.priority);
        if (analysis.effort) setEffort(analysis.effort);
        if (analysis.value) setValue(analysis.value);
        if (analysis.category) setCategory(analysis.category);
        if (typeof analysis.enhancedDescription === 'string' && analysis.enhancedDescription.trim()) {
          setDescription(analysis.enhancedDescription);
        }
        if (Array.isArray(analysis.acceptanceCriteria) && analysis.acceptanceCriteria.length > 0) {
          setAcceptanceCriteria(analysis.acceptanceCriteria);
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errorMessage = errorData.error || `Request failed with status ${response.status}`;
        console.error('AI analysis request failed:', response.status, errorMessage);
        setAiError(`AI Assist failed: ${errorMessage}`);
      }
    } catch (error) {
      console.error('AI analysis failed:', error);
      setAiError('AI Assist failed due to a network error. Please check your connection and try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    // If already checking, skip the check and submit immediately
    if (isCheckingSimilarity) {
      abortCheckRef.current?.abort();
      setIsCheckingSimilarity(false);
      submitTask();
      return;
    }

    // Start similarity check if backlog path exists
    if (backlogPath) {
      setIsCheckingSimilarity(true);
      abortCheckRef.current = new AbortController();
    } else {
      submitTask();
    }
  };

  const handleForceSubmit = () => {
    setShowSimilarModal(false);
    submitTask();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-lg bg-surface-900 border border-surface-700/50 rounded-2xl shadow-2xl animate-scale-in max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
            <h2 className="font-display text-lg text-surface-100">New Task</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
                Title
              </label>
              <input
                ref={inputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isCheckingSimilarity}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-3 text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors disabled:opacity-60"
                placeholder="What needs to be done?"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
                Description <span className="text-surface-600">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                disabled={isCheckingSimilarity}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-3 text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors resize-y min-h-[120px] font-mono text-sm disabled:opacity-60"
                placeholder="Add some details... (supports markdown)"
              />
            </div>

            {/* AI Assist Button */}
            <button
              type="button"
              onClick={handleAiAssist}
              disabled={!title.trim() || isAnalyzing || isCheckingSimilarity}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600/20 to-blue-600/20 hover:from-purple-600/30 hover:to-blue-600/30 border border-purple-500/30 text-purple-300 font-medium py-2.5 px-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAnalyzing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Analyzing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  AI Assist - Analyze & Suggest
                </>
              )}
            </button>

            {/* Task Details */}
            <div className="space-y-4 pt-2 border-t border-surface-800">
              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
                  Category
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={isCheckingSimilarity}
                  className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-accent/50 transition-colors disabled:opacity-60"
                  placeholder="e.g., Security, UX Improvements"
                />
              </div>

              {/* Priority, Effort & Value - 3 Column Grid */}
              <div className="grid grid-cols-3 gap-4">
                <InlineOptionSelector<Priority>
                  label="Priority"
                  options={priorityOptions}
                  value={priority}
                  onChange={(v) => setPriority(v || 'medium')}
                  colorMap={priorityColors}
                />

                <InlineOptionSelector<Effort>
                  label="Effort"
                  options={effortOptions}
                  value={effort}
                  onChange={(v) => setEffort(v || 'medium')}
                  colorMap={effortColors}
                />

                <InlineOptionSelector<Value>
                  label="Value"
                  options={valueOptions}
                  value={value}
                  onChange={(v) => setValue(v || 'medium')}
                  colorMap={valueColors}
                />
              </div>

              {/* Acceptance Criteria */}
              <AcceptanceCriteriaEditor
                criteria={acceptanceCriteria}
                onChange={setAcceptanceCriteria}
                showEmptyWarning
              />
            </div>

            {/* Inline Similarity Progress - shown when checking */}
            {isCheckingSimilarity && backlogPath && (
              <InlineSimilarityProgress
                title={title.trim()}
                description={description.trim()}
                category={category.trim() || undefined}
                backlogPath={backlogPath}
                onComplete={handleSimilarityComplete}
                onSkipped={handleSimilaritySkipped}
              />
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-surface-800 hover:bg-surface-700 text-surface-300 font-medium py-2.5 px-4 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim()}
                className={`flex-1 font-medium py-2.5 px-4 rounded-lg transition-colors ${
                  isCheckingSimilarity
                    ? 'bg-surface-600 hover:bg-surface-500 text-surface-200 border border-surface-500'
                    : 'bg-accent hover:bg-accent-hover disabled:bg-surface-700 disabled:text-surface-500 text-surface-900 shadow-glow-amber-sm hover:shadow-glow-amber disabled:shadow-none'
                }`}
              >
                {isCheckingSimilarity ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                    Skip Checks
                  </span>
                ) : 'Add Task'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Similar Tasks Modal */}
      {showSimilarModal && similarTasks.length > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowSimilarModal(false)}
          />
          <div className="relative w-full max-w-md bg-surface-800 border border-surface-600 rounded-xl shadow-2xl animate-scale-in">
            <div className="px-5 py-4 border-b border-surface-700">
              <h3 className="font-display text-base text-surface-100 flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Similar Tasks Found
              </h3>
              <p className="text-sm text-surface-400 mt-1">
                We found tasks that might be related to what you&apos;re adding.
              </p>
            </div>

            <div className="p-4 space-y-3 max-h-[300px] overflow-y-auto">
              {similarTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-3 bg-surface-900/50 border border-surface-700 rounded-lg"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-medium text-surface-200 text-sm">{task.title}</h4>
                    <span className={`
                      px-2 py-0.5 rounded text-xs font-medium shrink-0
                      ${task.recommendation === 'duplicate' ? 'bg-red-500/20 text-red-300' :
                        task.recommendation === 'merge' ? 'bg-amber-500/20 text-amber-300' :
                        'bg-blue-500/20 text-blue-300'}
                    `}>
                      {task.recommendation === 'duplicate' ? 'Duplicate' :
                       task.recommendation === 'merge' ? 'Consider Merging' :
                       'Related'}
                    </span>
                  </div>
                  <p className="text-xs text-surface-400 mt-1.5">{task.reason}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 bg-surface-700 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${
                          task.similarity >= 0.8 ? 'bg-red-500' :
                          task.similarity >= 0.6 ? 'bg-amber-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${task.similarity * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-surface-500">{Math.round(task.similarity * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-4 border-t border-surface-700 flex gap-3">
              <button
                onClick={() => setShowSimilarModal(false)}
                className="flex-1 bg-surface-700 hover:bg-surface-600 text-surface-300 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleForceSubmit}
                className="flex-1 bg-accent hover:bg-accent-hover text-surface-900 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
              >
                Add Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Error Toast */}
      {aiError && (
        <Toast
          message={aiError}
          type="error"
          duration={6000}
          onClose={() => setAiError(null)}
          action={{
            label: 'Open Settings',
            onClick: () => {
              setAiError(null);
              // Note: Settings modal is controlled by parent - user can click gear icon
            },
          }}
        />
      )}
    </>
  );
}
