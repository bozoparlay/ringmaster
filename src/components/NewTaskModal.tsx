'use client';

import { useState, useEffect, useRef } from 'react';
import type { Priority, Effort, Value } from '@/types/backlog';
import { PRIORITY_LABELS, EFFORT_LABELS, VALUE_LABELS } from '@/types/backlog';

interface EnhancedTask {
  title: string;
  description: string;
  priority?: Priority;
  effort?: Effort;
  value?: Value;
  category?: string;
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

export function NewTaskModal({ isOpen, onClose, onSubmit, backlogPath }: NewTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority | undefined>(undefined);
  const [effort, setEffort] = useState<Effort | undefined>(undefined);
  const [value, setValue] = useState<Value | undefined>(undefined);
  const [category, setCategory] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [similarTasks, setSimilarTasks] = useState<SimilarTask[]>([]);
  const [isCheckingSimilarity, setIsCheckingSimilarity] = useState(false);
  const [showSimilarModal, setShowSimilarModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setPriority(undefined);
      setEffort(undefined);
      setValue(undefined);
      setCategory('');
      setShowAdvanced(false);
      setSimilarTasks([]);
      setShowSimilarModal(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const checkSimilarity = async (): Promise<boolean> => {
    if (!backlogPath || !title.trim()) return true; // Proceed if no path or title

    setIsCheckingSimilarity(true);
    try {
      const response = await fetch('/api/check-similarity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category: category.trim() || undefined,
          backlogPath,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.similar && result.similar.length > 0) {
          setSimilarTasks(result.similar);
          setShowSimilarModal(true);
          return false; // Don't proceed, show modal
        }
      }
      return true; // Proceed with task creation
    } catch (error) {
      console.error('Similarity check failed:', error);
      return true; // Proceed on error
    } finally {
      setIsCheckingSimilarity(false);
    }
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleAiAssist = async () => {
    if (!title.trim()) return;

    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/analyze-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim() }),
      });

      if (response.ok) {
        const analysis = await response.json();
        if (analysis.priority) setPriority(analysis.priority);
        if (analysis.effort) setEffort(analysis.effort);
        if (analysis.value) setValue(analysis.value);
        if (analysis.category) setCategory(analysis.category);
        // Always set description if enhancedDescription exists and has content
        if (typeof analysis.enhancedDescription === 'string' && analysis.enhancedDescription.trim()) {
          setDescription(analysis.enhancedDescription);
        }
        setShowAdvanced(true);
      } else {
        console.error('AI analysis request failed:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('AI analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const submitTask = () => {
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      priority: priority || 'medium',
      effort,
      value,
      category: category.trim() || undefined,
    });
    setTitle('');
    setDescription('');
    setSimilarTasks([]);
    setShowSimilarModal(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    // Check for similar tasks first
    const shouldProceed = await checkSimilarity();
    if (shouldProceed) {
      submitTask();
    }
    // If not proceeding, the similar tasks modal will be shown
  };

  const handleForceSubmit = () => {
    // User chose to add anyway despite similar tasks
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
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-3 text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
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
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-3 text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors resize-y min-h-[120px] font-mono text-sm"
                placeholder="Add some details... (supports markdown)"
              />
            </div>

            {/* AI Assist Button */}
            <button
              type="button"
              onClick={handleAiAssist}
              disabled={!title.trim() || isAnalyzing}
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

            {/* Advanced Options Toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-surface-400 hover:text-surface-300 transition-colors"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {showAdvanced ? 'Hide' : 'Show'} priority, effort & value
            </button>

            {/* Advanced Options */}
            {showAdvanced && (
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
                    className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-accent/50 transition-colors"
                    placeholder="e.g., Security, UX Improvements"
                  />
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
                        type="button"
                        onClick={() => setPriority(priority === p ? undefined : p)}
                        className={`
                          flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-all
                          ${priority === p
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

                {/* Effort & Value */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
                      Effort
                    </label>
                    <div className="flex flex-col gap-1">
                      {effortOptions.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => setEffort(effort === e ? undefined : e)}
                          className={`
                            py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-left
                            ${effort === e
                              ? 'bg-blue-500 text-white shadow-lg'
                              : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                            }
                          `}
                        >
                          {EFFORT_LABELS[e]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
                      Value
                    </label>
                    <div className="flex flex-col gap-1">
                      {valueOptions.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setValue(value === v ? undefined : v)}
                          className={`
                            py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-left
                            ${value === v
                              ? 'bg-emerald-500 text-white shadow-lg'
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
              </div>
            )}

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
                disabled={!title.trim() || isCheckingSimilarity}
                className="flex-1 bg-accent hover:bg-accent-hover disabled:bg-surface-700 disabled:text-surface-500 text-surface-900 font-medium py-2.5 px-4 rounded-lg transition-colors shadow-glow-amber-sm hover:shadow-glow-amber disabled:shadow-none"
              >
                {isCheckingSimilarity ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Checking...
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
    </>
  );
}
