'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { BacklogItem } from '@/types/backlog';
import { useIdeSettings, IDE_OPTIONS, type IdeType } from '@/hooks/useIdeSettings';
import { buildTaskPrompt, buildConversationalPrompt } from '@/lib/prompt-builder';
import { QUALITY_THRESHOLD, validateTaskQuality } from '@/lib/task-quality';
import { getWorkModel } from '@/components/SettingsModal';

// Client-side slugify to preview branch name (matches server logic)
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// Generate the branch name that will be created
function getBranchName(taskId: string, title: string): string {
  return `task/${taskId.slice(0, 8)}-${slugify(title)}`;
}

interface TackleModalProps {
  item: BacklogItem | null;
  isOpen: boolean;
  onClose: () => void;
  onStartWork: (item: BacklogItem) => void;
  onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
  backlogPath?: string;
  isGitHubView?: boolean; // When true, skip worktree creation
}

// IDE icon component
function IdeIcon({ ide, className = "w-4 h-4" }: { ide: string; className?: string }) {
  switch (ide) {
    case 'vscode':
    case 'code':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.583 2.005L8.994 9.572l-4.166-3.2-2.33 1.16 3.732 3.477-3.732 3.477 2.33 1.16 4.166-3.2 8.59 7.567 3.903-1.822V3.828l-3.904-1.823zm0 3.783v12.424l-5.588-4.925V10.71l5.588-4.922z"/>
        </svg>
      );
    case 'cursor':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 01.35-.15h6.87a.5.5 0 00.35-.85L6.35 2.86a.5.5 0 00-.85.35z"/>
        </svg>
      );
    case 'kiro':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" strokeWidth="2" stroke="currentColor" fill="none"/>
          <path d="M8 12h8M12 8v8" strokeWidth="2" stroke="currentColor" strokeLinecap="round"/>
        </svg>
      );
    case 'iterm':
      // iTerm2 icon - terminal with colored bars representing the classic iTerm look
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 8h18" />
          <circle cx="6" cy="6" r="1" fill="#EF4444" stroke="none" />
          <circle cx="9" cy="6" r="1" fill="#FBBF24" stroke="none" />
          <circle cx="12" cy="6" r="1" fill="#22C55E" stroke="none" />
          <path d="M7 12l3 2-3 2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 16h4" strokeLinecap="round" />
        </svg>
      );
    case 'terminal':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'folder':
    default:
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      );
  }
}

export function TackleModal({ item, isOpen, onClose, onStartWork, onShowToast, backlogPath, isGitHubView }: TackleModalProps) {
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'plan' | 'prompt'>('plan');
  const [isLaunching, setIsLaunching] = useState(false);
  const [showIdeSelector, setShowIdeSelector] = useState(false);
  const { selectedIde, setIde, currentIde, isLoaded } = useIdeSettings();

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      setMode('plan');
      setIsLaunching(false);
      setShowIdeSelector(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (showIdeSelector) {
          setShowIdeSelector(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, showIdeSelector]);

  if (!isOpen || !item) return null;

  // Build task input for the shared prompt builder
  const taskInput = {
    title: item.title,
    id: item.id,  // GAP #3: Pass ID to compute branch name preview
    priority: item.priority,
    category: item.category,
    tags: item.tags,
    description: item.description,
    acceptanceCriteria: item.acceptanceCriteria,
    notes: item.notes,
    effort: item.effort,
    value: item.value,
    branch: item.branch,
  };

  // Generate preview with placeholders shown (for user visibility)
  const generatePlan = () => buildTaskPrompt(taskInput, {
    showPlaceholders: true,
    showBranchPlaceholder: !item.branch,
  });

  // Generate conversational prompt for pasting into existing chats
  const generatePrompt = () => buildConversationalPrompt(taskInput);

  const handleCopy = async () => {
    const text = mode === 'plan' ? generatePlan() : generatePrompt();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLaunch = async () => {
    if (!item) return;

    setIsLaunching(true);
    try {
      const response = await fetch('/api/tackle-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: item.id,
          title: item.title,
          description: item.description,
          category: item.category,
          priority: item.priority,
          tags: item.tags,
          acceptanceCriteria: item.acceptanceCriteria,
          notes: item.notes,
          effort: item.effort,
          value: item.value,
          backlogPath,
          worktreePath: item.worktreePath,
          ide: selectedIde,
          model: getWorkModel().cliName,  // Pass the configured Claude CLI model
        }),
      });

      if (response.ok) {
        // Set task to in progress
        onStartWork(item);

        // Show appropriate toast based on IDE
        if (selectedIde === 'worktree') {
          onShowToast?.('Worktree created! Navigate to .tasks/ directory to start working.', 'success');
        } else if (selectedIde === 'terminal') {
          onShowToast?.('Task prompt copied to clipboard! Paste in your terminal to start.', 'success');
        } else if (selectedIde === 'iterm-interactive') {
          onShowToast?.('Opening iTerm with Claude... Interact directly in the terminal!', 'success');
        } else {
          onShowToast?.(`Opening ${currentIde.name}... Task prompt copied to clipboard!`, 'success');
        }
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

  const handleIdeSelect = (ide: IdeType) => {
    setIde(ide);
    setShowIdeSelector(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-fade-in"
        onClick={() => {
          if (showIdeSelector) {
            setShowIdeSelector(false);
          } else {
            onClose();
          }
        }}
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
              <h2 className="font-display text-lg text-surface-100">Start Working</h2>
              <p className="text-xs text-surface-500">Generate a plan to tackle this task</p>
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
          <div className="flex items-center gap-2 mb-2">
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
          {/* GAP #3 FIX: Show actual branch name */}
          <div className="flex items-center gap-2 text-xs text-surface-500">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="font-mono text-surface-400">{getBranchName(item.id, item.title)}</span>
          </div>
        </div>

        {/* Low quality task warning - compute quality dynamically if not already set */}
        {(() => {
          const quality = item.qualityScore !== undefined
            ? { score: item.qualityScore, issues: item.qualityIssues || [] }
            : validateTaskQuality(item.title, item.description || '', item.acceptanceCriteria);

          if (quality.score >= QUALITY_THRESHOLD) return null;

          return (
            <div className="mx-6 mt-3 px-3 py-2 bg-orange-500/10 rounded-lg border border-orange-500/30">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-orange-400">Low quality task ({quality.score}/100)</p>
                  <p className="text-xs text-orange-300/80 mt-0.5">
                    Consider improving the task definition before starting work.
                    {quality.issues.length > 0 && (
                      <span className="block mt-1 text-orange-300/60">
                        Issues: {quality.issues.join(', ')}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Mode tabs */}
        <div className="flex border-b border-surface-800">
          <button
            onClick={() => setMode('plan')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative
              ${mode === 'plan' ? 'text-accent' : 'text-surface-400 hover:text-surface-200'}`}
          >
            Task Brief
            {mode === 'plan' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
          </button>
          <button
            onClick={() => setMode('prompt')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative
              ${mode === 'prompt' ? 'text-accent' : 'text-surface-400 hover:text-surface-200'}`}
          >
            AI Prompt
            {mode === 'prompt' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="prose prose-invert prose-sm max-w-none
            prose-headings:text-surface-100 prose-headings:font-display prose-headings:font-semibold
            prose-h1:text-lg prose-h1:mb-3 prose-h1:mt-0
            prose-h2:text-base prose-h2:mb-2 prose-h2:mt-4
            prose-p:text-surface-300 prose-p:leading-relaxed prose-p:mb-3
            prose-strong:text-surface-200 prose-strong:font-semibold
            prose-code:text-accent prose-code:text-xs prose-code:bg-surface-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
            prose-pre:bg-surface-950 prose-pre:border prose-pre:border-surface-800 prose-pre:text-xs
            prose-ul:text-surface-300 prose-ul:my-2 prose-li:my-1
            prose-ol:text-surface-300 prose-ol:my-2
            prose-a:text-accent prose-a:no-underline hover:prose-a:underline
            prose-blockquote:border-l-accent prose-blockquote:text-surface-400"
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Preserve code blocks with their formatting
                pre: ({ children, ...props }) => (
                  <pre className="bg-surface-950 border border-surface-800 rounded-lg p-4 overflow-x-auto" {...props}>
                    {children}
                  </pre>
                ),
                // Style inline code
                code: ({ children, ...props }) => (
                  <code className="text-accent bg-surface-800 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                    {children}
                  </code>
                ),
              }}
            >
              {mode === 'plan' ? generatePlan() : generatePrompt()}
            </ReactMarkdown>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-surface-800 bg-surface-900/80 space-y-3">
          {/* IDE Selection */}
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-surface-500 uppercase tracking-wider">Open with</span>
              <button
                onClick={() => setShowIdeSelector(!showIdeSelector)}
                className="flex items-center gap-2 text-xs text-surface-400 hover:text-surface-200 transition-colors"
              >
                <IdeIcon ide={currentIde.icon} className="w-3.5 h-3.5" />
                <span>{currentIde.name}</span>
                <svg className={`w-3 h-3 transition-transform ${showIdeSelector ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {/* IDE Dropdown */}
            {showIdeSelector && (
              <div className="absolute bottom-full right-0 mb-2 w-56 bg-surface-800 border border-surface-700 rounded-lg shadow-xl z-10 py-1 animate-in slide-in-from-bottom-2 duration-150">
                {IDE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleIdeSelect(option.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors
                      ${selectedIde === option.id
                        ? 'bg-accent/10 text-accent'
                        : 'text-surface-300 hover:bg-surface-700'
                      }`}
                  >
                    <IdeIcon ide={option.icon} className="w-4 h-4" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{option.name}</div>
                      <div className="text-[10px] text-surface-500 truncate">{option.description}</div>
                    </div>
                    {selectedIde === option.id && (
                      <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Launch Button - Primary Action */}
          <button
            onClick={handleLaunch}
            disabled={isLaunching || !isLoaded}
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
                <IdeIcon ide={currentIde.icon} className="w-5 h-5" />
                {selectedIde === 'worktree'
                  ? 'Create Worktree'
                  : selectedIde === 'terminal'
                    ? 'Copy & Start'
                    : selectedIde === 'iterm-interactive'
                      ? 'Start with Claude'
                      : `Open in ${currentIde.name}`}
              </>
            )}
          </button>

          {/* Secondary action */}
          <button
            onClick={handleCopy}
            className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium transition-all
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
        </div>
      </div>
    </>
  );
}
