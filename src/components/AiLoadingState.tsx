'use client';

import { useState, useEffect } from 'react';

// Default messages for AI loading state
const DEFAULT_MESSAGES = [
  'Reading your description...',
  'Understanding the context...',
  'Analyzing requirements...',
  'Generating enhancements...',
  'Crafting improvements...',
  'Polishing the details...',
];

interface AiLoadingStateProps {
  /** Custom messages to cycle through (optional) */
  messages?: string[];
  /** Height of the loading container (default: 200px) */
  height?: string;
  /** Compact mode for smaller spaces */
  compact?: boolean;
}

/**
 * Animated AI loading state with gradient background, shimmer effects,
 * orbiting particles, and rotating status messages.
 */
export function AiLoadingState({
  messages = DEFAULT_MESSAGES,
  height = '200px',
  compact = false,
}: AiLoadingStateProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [messages.length]);

  if (compact) {
    return (
      <div className="relative w-full py-6 rounded-lg overflow-hidden">
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

        {/* Border glow */}
        <div className="absolute inset-0 border border-purple-500/30 rounded-lg shadow-[inset_0_0_20px_rgba(168,85,247,0.1)]" />

        {/* Compact center content */}
        <div className="relative flex items-center justify-center gap-4 px-4">
          {/* Icon */}
          <div className="relative">
            <div className="absolute inset-0 bg-purple-500/20 rounded-full blur-lg animate-ai-pulse" />
            <div className="relative w-10 h-10 flex items-center justify-center bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg shadow-lg shadow-purple-500/20 animate-ai-float">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
              </svg>
            </div>
          </div>

          {/* Status text */}
          <div className="text-left">
            <p
              key={messageIndex}
              className="text-sm font-medium text-purple-300 animate-ai-text-cycle"
            >
              {messages[messageIndex]}
            </p>
            <div className="flex items-center gap-1 mt-1">
              <div className="w-1 h-1 bg-purple-400/60 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
              <div className="w-1 h-1 bg-purple-400/60 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
              <div className="w-1 h-1 bg-purple-400/60 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-lg overflow-hidden" style={{ height }}>
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
            {messages[messageIndex]}
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
