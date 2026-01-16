'use client';

import { useState } from 'react';
import { getHooksConfigJson } from '@/lib/hooks/config';

interface HookSetupPanelProps {
  baseUrl?: string;
}

/**
 * Panel for displaying and copying Claude Code hook configuration.
 * Can be embedded in settings or shown as a standalone guide.
 */
export function HookSetupPanel({ baseUrl = 'http://localhost:3000' }: HookSetupPanelProps) {
  const [copied, setCopied] = useState(false);
  const configJson = getHooksConfigJson(baseUrl);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(configJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('Failed to copy to clipboard');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-surface-200">Subagent Tracking</h3>
          <p className="text-xs text-surface-500 mt-1">
            Track Task tool subagents by configuring Claude Code hooks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400">
            Optional
          </span>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-surface-800/50 border border-surface-700/50 rounded-lg p-4 space-y-3">
        <p className="text-sm text-surface-300">
          Add this to your Claude Code settings to enable subagent tracking:
        </p>

        <div className="text-xs text-surface-400 space-y-1">
          <p>• Global: <code className="bg-surface-700 px-1 rounded">~/.claude/settings.json</code></p>
          <p>• Project: <code className="bg-surface-700 px-1 rounded">.claude/settings.json</code></p>
        </div>
      </div>

      {/* Config JSON */}
      <div className="relative">
        <pre className="bg-surface-900 border border-surface-700/50 rounded-lg p-4 text-xs text-surface-300 overflow-x-auto">
          <code>{configJson}</code>
        </pre>
        <button
          onClick={handleCopy}
          className={`absolute top-2 right-2 px-3 py-1.5 rounded text-xs font-medium transition-all ${
            copied
              ? 'bg-green-500/20 text-green-400'
              : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
          }`}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Status indicator (future: show if hooks are reporting) */}
      <div className="flex items-center gap-2 text-xs text-surface-500">
        <div className="w-2 h-2 rounded-full bg-surface-600" />
        <span>Hook status will appear here when configured</span>
      </div>

      {/* Help link */}
      <div className="pt-2 border-t border-surface-700/50">
        <p className="text-xs text-surface-500">
          Subagent executions will appear nested under their parent task in the execution history.
        </p>
      </div>
    </div>
  );
}

export default HookSetupPanel;
