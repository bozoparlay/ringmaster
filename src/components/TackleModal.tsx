'use client';

import { useState, useEffect } from 'react';
import type { BacklogItem } from '@/types/backlog';

interface TackleModalProps {
  item: BacklogItem | null;
  isOpen: boolean;
  onClose: () => void;
  onStartWork: (item: BacklogItem) => void;
  onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
  backlogPath?: string;
}

export function TackleModal({ item, isOpen, onClose, onStartWork, onShowToast, backlogPath }: TackleModalProps) {
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'plan' | 'prompt'>('plan');
  const [isLaunching, setIsLaunching] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      setMode('plan');
      setIsLaunching(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  const generatePlan = () => {
    const priorityContext = {
      critical: 'This is a critical priority task that needs immediate attention.',
      high: 'This is a high priority task that should be addressed soon.',
      medium: 'This is a medium priority task.',
      low: 'This is a lower priority task.',
      someday: 'This task can be addressed when time permits.',
    };

    return `## Task: ${item.title}

### Priority
${priorityContext[item.priority]}

### Description
${item.description || 'No description provided.'}

### Tags
${item.tags.length > 0 ? item.tags.map(t => `- ${t}`).join('\n') : 'No tags'}

### Suggested Approach

1. **Understand the Requirements**
   - Review the task description thoroughly
   - Identify any dependencies or blockers
   - Clarify any ambiguous requirements

2. **Plan the Implementation**
   - Break down into smaller subtasks
   - Identify files that need modification
   - Consider edge cases and error handling

3. **Execute**
   - Start with the core functionality
   - Write tests as you go
   - Commit changes incrementally

4. **Verify**
   - Test the implementation
   - Review for code quality
   - Update documentation if needed`;
  };

  const generatePrompt = () => {
    return `I need to work on the following task from my backlog:

**Task:** ${item.title}
**Priority:** ${item.priority}
**Tags:** ${item.tags.join(', ') || 'none'}

**Description:**
${item.description || 'No description provided.'}

Please help me:
1. Understand what needs to be done
2. Create a detailed implementation plan
3. Identify the files that need to be modified
4. Start implementing the solution

Let's begin by exploring the codebase to understand the current state and then create a plan.`;
  };

  const handleCopy = async () => {
    const text = mode === 'plan' ? generatePlan() : generatePrompt();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartWork = () => {
    onStartWork(item);
    onClose();
  };

  const handleLaunchClaude = async () => {
    if (!item) return;

    setIsLaunching(true);
    try {
      const response = await fetch('/api/tackle-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          description: item.description,
          category: item.category,
          priority: item.priority,
          backlogPath,
        }),
      });

      if (response.ok) {
        // Set task to in progress
        onStartWork(item);
        onShowToast?.('Task prompt copied! Open VS Code terminal and paste (⌘V) to start Claude Code.', 'success');
        onClose();
      } else {
        onShowToast?.('Failed to prepare task. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Launch error:', error);
      onShowToast?.('Failed to launch. Please try again.', 'error');
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl md:max-h-[80vh] bg-surface-900 border border-surface-700/50 rounded-2xl shadow-2xl z-50 animate-scale-in flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h2 className="font-display text-lg text-surface-100">Tackle Task</h2>
              <p className="text-xs text-surface-500">Generate a plan to attack this work</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Task summary */}
        <div className="px-6 py-3 bg-surface-850 border-b border-surface-800">
          <h3 className="font-medium text-surface-100 mb-1">{item.title}</h3>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-1.5 py-0.5 rounded uppercase font-medium
              ${item.priority === 'critical' ? 'bg-red-500/20 text-red-400' :
                item.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                item.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                item.priority === 'low' ? 'bg-green-500/20 text-green-400' :
                'bg-surface-700 text-surface-400'}`}
            >
              {item.priority}
            </span>
            {item.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-xs text-surface-500 font-mono">{tag}</span>
            ))}
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-surface-800">
          <button
            onClick={() => setMode('plan')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative
              ${mode === 'plan' ? 'text-accent' : 'text-surface-400 hover:text-surface-200'}`}
          >
            Action Plan
            {mode === 'plan' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
          </button>
          <button
            onClick={() => setMode('prompt')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative
              ${mode === 'prompt' ? 'text-accent' : 'text-surface-400 hover:text-surface-200'}`}
          >
            Claude Code Prompt
            {mode === 'prompt' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <pre className="whitespace-pre-wrap text-sm text-surface-300 font-mono leading-relaxed">
            {mode === 'plan' ? generatePlan() : generatePrompt()}
          </pre>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-surface-800 bg-surface-900/80 space-y-3">
          {/* Launch Claude Code - Primary Action */}
          <button
            onClick={handleLaunchClaude}
            disabled={isLaunching}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-purple-600/50 disabled:to-blue-600/50 text-white font-medium py-3 px-4 rounded-lg transition-all shadow-lg hover:shadow-purple-500/25 disabled:cursor-not-allowed"
          >
            {isLaunching ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Launching...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Launch Claude Code
              </>
            )}
          </button>

          {/* Secondary actions */}
          <div className="flex gap-3">
            <button
              onClick={handleCopy}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium transition-all
                ${copied
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-surface-800 hover:bg-surface-700 text-surface-300 border border-surface-700'
                }`}
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy Plan
                </>
              )}
            </button>
            <button
              onClick={handleStartWork}
              className="flex-1 flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-surface-900 font-medium py-2.5 px-4 rounded-lg transition-colors shadow-glow-amber-sm hover:shadow-glow-amber"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Mark In Progress
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
