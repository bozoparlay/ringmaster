'use client';

import * as Diff from 'diff';

interface TextDiffProps {
  before: string;
  after: string;
  className?: string;
}

export function TextDiff({ before, after, className = '' }: TextDiffProps) {
  const changes = Diff.diffLines(before || '', after || '', { newlineIsToken: false });

  return (
    <div className={`font-mono text-xs rounded-lg overflow-hidden border border-surface-700 ${className}`}>
      <div className="bg-surface-800/50 px-3 py-1.5 border-b border-surface-700 flex items-center gap-2">
        <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
        </svg>
        <span className="text-surface-400 text-[10px] uppercase tracking-wider font-medium">Changes</span>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {changes.map((part, index) => {
          const lines = part.value.split('\n').filter((line, i, arr) =>
            // Keep all lines except trailing empty line
            !(i === arr.length - 1 && line === '')
          );

          if (lines.length === 0) return null;

          return lines.map((line, lineIndex) => {
            if (part.added) {
              return (
                <div
                  key={`${index}-${lineIndex}`}
                  className="flex bg-green-500/10 border-l-2 border-green-500"
                >
                  <span className="w-6 flex-shrink-0 text-center text-green-500 select-none py-0.5">+</span>
                  <span className="flex-1 text-green-300 py-0.5 pr-3 whitespace-pre-wrap break-all">
                    {line || ' '}
                  </span>
                </div>
              );
            }
            if (part.removed) {
              return (
                <div
                  key={`${index}-${lineIndex}`}
                  className="flex bg-red-500/10 border-l-2 border-red-500"
                >
                  <span className="w-6 flex-shrink-0 text-center text-red-500 select-none py-0.5">−</span>
                  <span className="flex-1 text-red-300 py-0.5 pr-3 whitespace-pre-wrap break-all line-through opacity-70">
                    {line || ' '}
                  </span>
                </div>
              );
            }
            // Unchanged
            return (
              <div
                key={`${index}-${lineIndex}`}
                className="flex border-l-2 border-transparent"
              >
                <span className="w-6 flex-shrink-0 text-center text-surface-600 select-none py-0.5"> </span>
                <span className="flex-1 text-surface-500 py-0.5 pr-3 whitespace-pre-wrap break-all">
                  {line || ' '}
                </span>
              </div>
            );
          });
        })}
      </div>

      {/* Summary footer */}
      <div className="bg-surface-800/50 px-3 py-1.5 border-t border-surface-700 flex items-center gap-4 text-[10px]">
        <span className="text-green-400">
          +{changes.filter(c => c.added).reduce((acc, c) => acc + c.value.split('\n').filter(l => l).length, 0)} added
        </span>
        <span className="text-red-400">
          −{changes.filter(c => c.removed).reduce((acc, c) => acc + c.value.split('\n').filter(l => l).length, 0)} removed
        </span>
      </div>
    </div>
  );
}
