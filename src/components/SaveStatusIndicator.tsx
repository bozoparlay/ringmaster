'use client';

import { useEffect, useState } from 'react';
import type { SaveStatus } from '@/hooks/useAutoSave';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  error?: string | null;
  className?: string;
}

/**
 * Visual indicator for auto-save status.
 *
 * Shows:
 * - Nothing when idle (clean UI)
 * - Spinning indicator + "Saving..." when saving
 * - Checkmark + "Saved" when saved (fades out after 2s)
 * - Error icon + message when failed
 */
export function SaveStatusIndicator({ status, error, className = '' }: SaveStatusIndicatorProps) {
  const [visible, setVisible] = useState(false);

  // Show indicator when not idle
  useEffect(() => {
    if (status !== 'idle') {
      setVisible(true);
    } else {
      // Delay hiding for smooth transition
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [status]);

  if (!visible && status === 'idle') return null;

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 text-xs font-medium transition-all duration-300
        ${status === 'idle' ? 'opacity-0' : 'opacity-100'}
        ${className}
      `}
    >
      {status === 'saving' && (
        <>
          <svg className="w-3.5 h-3.5 animate-spin text-surface-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-surface-400">Saving...</span>
        </>
      )}

      {status === 'saved' && (
        <>
          <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-green-400">Saved</span>
        </>
      )}

      {status === 'error' && (
        <>
          <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-red-400" title={error || 'Save failed'}>
            {error ? (error.length > 30 ? error.substring(0, 30) + '...' : error) : 'Save failed'}
          </span>
        </>
      )}
    </div>
  );
}
