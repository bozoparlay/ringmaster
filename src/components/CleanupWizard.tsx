'use client';

import { useState, useEffect, useCallback } from 'react';
import type { BacklogItem, Priority, Effort, Value } from '@/types/backlog';
import { taskNeedsCleanup } from '@/lib/task-validator';
import { PRIORITY_LABELS, EFFORT_LABELS, VALUE_LABELS } from '@/types/backlog';

interface CleanupSuggestion {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  notes?: string;
  priority: string;
  effort?: string;
  value?: string;
}

interface CleanupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  items: BacklogItem[];
  onUpdateItem: (item: BacklogItem) => Promise<void>;
  workDir?: string;
}

export function CleanupWizard({ isOpen, onClose, items, onUpdateItem, workDir }: CleanupWizardProps) {
  const [tasksToClean, setTasksToClean] = useState<BacklogItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [suggestion, setSuggestion] = useState<CleanupSuggestion | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSuggestion, setEditedSuggestion] = useState<CleanupSuggestion | null>(null);
  const [cleanedCount, setCleanedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  // Find tasks that need cleanup when wizard opens
  useEffect(() => {
    if (isOpen) {
      const needsCleanup = items.filter(taskNeedsCleanup);
      setTasksToClean(needsCleanup);
      setCurrentIndex(0);
      setCleanedCount(0);
      setSkippedCount(0);
      setSuggestion(null);
      setIsEditing(false);
    }
  }, [isOpen, items]);

  const currentTask = tasksToClean[currentIndex];

  // Fetch suggestion for current task
  const fetchSuggestion = useCallback(async () => {
    if (!currentTask) return;

    setIsLoading(true);
    setSuggestion(null);
    setEditedSuggestion(null);
    setIsEditing(false);

    // Build a rescope prompt for missing fields
    const missingFields = [];
    if (!currentTask.description || currentTask.description.length < 20) {
      missingFields.push('description');
    }
    if (!currentTask.acceptanceCriteria || currentTask.acceptanceCriteria.length === 0) {
      missingFields.push('acceptance criteria');
    }

    const rescopePrompt = `This task needs to be reformatted to match the standard template. Missing fields: ${missingFields.join(', ')}. Please provide:
- A detailed description (at least 150 words) explaining the problem or feature
- 3-5 specific, testable acceptance criteria
- Clear requirements and technical approach
Preserve all existing information while making it actionable and specific.`;

    // Create abort controller for timeout (60 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch('/api/analyze-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: currentTask.title.trim(),
          description: currentTask.description?.trim() || '',
          comments: rescopePrompt,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const analysis = await response.json();
        // Convert analyze-task response to CleanupSuggestion format
        const suggestion: CleanupSuggestion = {
          title: currentTask.title, // Keep title as-is
          description: analysis.enhancedDescription || currentTask.description || '',
          acceptanceCriteria: analysis.acceptanceCriteria || currentTask.acceptanceCriteria || [],
          notes: currentTask.notes,
          priority: analysis.priority || currentTask.priority,
          effort: analysis.effort || currentTask.effort,
          value: analysis.value || currentTask.value,
        };
        setSuggestion(suggestion);
        setEditedSuggestion(suggestion);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Failed to fetch suggestion:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTask, workDir]);

  useEffect(() => {
    if (currentTask && isOpen) {
      fetchSuggestion();
    }
  }, [currentTask, isOpen, fetchSuggestion]);

  const handleAccept = async () => {
    if (!currentTask || !editedSuggestion) return;

    const updatedTask: BacklogItem = {
      ...currentTask,
      title: editedSuggestion.title,
      description: editedSuggestion.description,
      acceptanceCriteria: editedSuggestion.acceptanceCriteria,
      notes: editedSuggestion.notes || undefined,
      priority: editedSuggestion.priority as Priority,
      effort: editedSuggestion.effort as Effort | undefined,
      value: editedSuggestion.value as Value | undefined,
    };

    await onUpdateItem(updatedTask);

    setCleanedCount((c) => c + 1);
    moveToNext();
  };

  const handleSkip = () => {
    setSkippedCount((c) => c + 1);
    moveToNext();
  };

  const moveToNext = () => {
    if (currentIndex < tasksToClean.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      // Done!
      onClose();
    }
  };

  const handleEditField = (field: keyof CleanupSuggestion, value: string | string[]) => {
    if (!editedSuggestion) return;
    setEditedSuggestion({ ...editedSuggestion, [field]: value });
  };

  if (!isOpen) return null;

  const progress = tasksToClean.length > 0
    ? ((currentIndex + 1) / tasksToClean.length) * 100
    : 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-4xl bg-surface-900 border border-surface-700/50 rounded-2xl shadow-2xl animate-scale-in max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
            <div>
              <h2 className="font-display text-lg text-surface-100">Cleanup Wizard</h2>
              <p className="text-sm text-surface-400 mt-0.5">
                Standardize your backlog tasks
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress bar */}
          <div className="px-6 py-3 border-b border-surface-800/50">
            <div className="flex items-center justify-between text-xs text-surface-400 mb-2">
              <span>Task {currentIndex + 1} of {tasksToClean.length}</span>
              <span>{cleanedCount} cleaned, {skippedCount} skipped</span>
            </div>
            <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {tasksToClean.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8">
                <svg className="w-16 h-16 text-emerald-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-lg font-medium text-surface-100 mb-2">All Clean!</h3>
                <p className="text-surface-400 text-center max-w-md">
                  All your tasks already follow the standard template. No cleanup needed.
                </p>
                <button
                  onClick={onClose}
                  className="mt-6 px-6 py-2 bg-accent hover:bg-accent-hover text-surface-900 font-medium rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            ) : isLoading ? (
              <div className="flex flex-col items-center justify-center h-full p-8">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full border-2 border-surface-700 border-t-purple-500 animate-spin" />
                </div>
                <p className="text-surface-400 mt-4">Analyzing task...</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 p-6 h-full overflow-y-auto">
                {/* Current (Left) */}
                <div className="space-y-3">
                  <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider">Current</h3>
                  <div className="p-4 bg-surface-800/50 border border-surface-700 rounded-xl space-y-3">
                    <h4 className="font-medium text-surface-200">{currentTask?.title}</h4>
                    <div className="flex gap-2 text-xs">
                      <span className="px-2 py-0.5 bg-surface-700 rounded text-surface-300">
                        {PRIORITY_LABELS[currentTask?.priority || 'medium']}
                      </span>
                      {currentTask?.effort && (
                        <span className="px-2 py-0.5 bg-surface-700 rounded text-surface-300">
                          {EFFORT_LABELS[currentTask.effort]}
                        </span>
                      )}
                      {currentTask?.value && (
                        <span className="px-2 py-0.5 bg-surface-700 rounded text-surface-300">
                          {VALUE_LABELS[currentTask.value]}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-surface-400 whitespace-pre-wrap">
                      {currentTask?.description || <em className="text-surface-500">No description</em>}
                    </div>
                    {currentTask?.acceptanceCriteria && currentTask.acceptanceCriteria.length > 0 && (
                      <div>
                        <p className="text-xs text-surface-500 mb-1">Acceptance Criteria:</p>
                        <ul className="text-sm text-surface-400 space-y-1">
                          {currentTask.acceptanceCriteria.map((c, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-surface-600">-</span>
                              {c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* Suggested (Right) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider">Suggested</h3>
                    <button
                      onClick={() => setIsEditing(!isEditing)}
                      className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      {isEditing ? 'Preview' : 'Edit'}
                    </button>
                  </div>

                  {suggestion && editedSuggestion && (
                    <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-3">
                      {isEditing ? (
                        <>
                          <input
                            type="text"
                            value={editedSuggestion.title}
                            onChange={(e) => handleEditField('title', e.target.value)}
                            className="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-surface-100 text-sm"
                          />
                          <textarea
                            value={editedSuggestion.description}
                            onChange={(e) => handleEditField('description', e.target.value)}
                            rows={4}
                            className="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-surface-300 text-sm resize-none"
                          />
                          <div>
                            <p className="text-xs text-surface-500 mb-1">Acceptance Criteria (one per line):</p>
                            <textarea
                              value={editedSuggestion.acceptanceCriteria.join('\n')}
                              onChange={(e) => handleEditField('acceptanceCriteria', e.target.value.split('\n').filter(Boolean))}
                              rows={4}
                              className="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-surface-300 text-sm resize-none"
                            />
                          </div>
                          <div>
                            <p className="text-xs text-surface-500 mb-1">Notes (optional):</p>
                            <textarea
                              value={editedSuggestion.notes || ''}
                              onChange={(e) => handleEditField('notes', e.target.value || '')}
                              rows={2}
                              className="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-surface-300 text-sm resize-none"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <h4 className="font-medium text-surface-200">{editedSuggestion.title}</h4>
                          <div className="flex gap-2 text-xs">
                            <span className="px-2 py-0.5 bg-emerald-500/20 rounded text-emerald-300">
                              {PRIORITY_LABELS[editedSuggestion.priority as Priority] || editedSuggestion.priority}
                            </span>
                            {editedSuggestion.effort && (
                              <span className="px-2 py-0.5 bg-emerald-500/20 rounded text-emerald-300">
                                {EFFORT_LABELS[editedSuggestion.effort as Effort] || editedSuggestion.effort}
                              </span>
                            )}
                            {editedSuggestion.value && (
                              <span className="px-2 py-0.5 bg-emerald-500/20 rounded text-emerald-300">
                                {VALUE_LABELS[editedSuggestion.value as Value] || editedSuggestion.value}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-surface-300 whitespace-pre-wrap">
                            {editedSuggestion.description}
                          </div>
                          {editedSuggestion.acceptanceCriteria.length > 0 && (
                            <div>
                              <p className="text-xs text-emerald-400/70 mb-1">Acceptance Criteria:</p>
                              <ul className="text-sm text-surface-300 space-y-1">
                                {editedSuggestion.acceptanceCriteria.map((c, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="text-emerald-500">-</span>
                                    {c}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {editedSuggestion.notes && (
                            <div>
                              <p className="text-xs text-emerald-400/70 mb-1">Notes:</p>
                              <p className="text-sm text-surface-400 whitespace-pre-wrap">{editedSuggestion.notes}</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {!suggestion && !isLoading && (
                    <div className="p-4 bg-surface-800/50 border border-surface-700 rounded-xl">
                      <p className="text-sm text-surface-400 text-center">
                        Failed to generate suggestion. You can skip this task.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {tasksToClean.length > 0 && !isLoading && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-surface-800">
              <button
                onClick={handleSkip}
                className="px-4 py-2 text-surface-400 hover:text-surface-200 transition-colors text-sm"
              >
                Skip
              </button>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-surface-300 rounded-lg transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAccept}
                  disabled={!suggestion}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-surface-700 disabled:text-surface-500 text-white font-medium rounded-lg transition-colors text-sm"
                >
                  Accept Changes
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
