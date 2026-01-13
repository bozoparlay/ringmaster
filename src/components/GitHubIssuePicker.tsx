'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface GitHubIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  created_at: string;
  labels: Array<{ name: string; color: string }>;
}

interface GitHubIssuePickerProps {
  repo: string;
  token: string;
  value?: number;
  onChange: (issueNumber: number | undefined, issueUrl: string | undefined) => void;
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Convert hex color to readable text color
function getContrastColor(hexColor: string): string {
  const r = parseInt(hexColor.slice(0, 2), 16);
  const g = parseInt(hexColor.slice(2, 4), 16);
  const b = parseInt(hexColor.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
}

export function GitHubIssuePicker({ repo, token, value, onChange }: GitHubIssuePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<GitHubIssue | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const debouncedQuery = useDebounce(query, 300);

  // Fetch issues when query changes or dropdown opens
  const fetchIssues = useCallback(async (searchQuery: string) => {
    if (!repo || !token) {
      setError('GitHub not configured');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        repo,
        token,
        ...(searchQuery && { q: searchQuery }),
      });

      const response = await fetch(`/api/github/issues?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch issues');
      }

      setIssues(data.issues || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch issues');
      setIssues([]);
    } finally {
      setLoading(false);
    }
  }, [repo, token]);

  // Fetch when debounced query changes
  useEffect(() => {
    if (isOpen) {
      fetchIssues(debouncedQuery);
    }
  }, [debouncedQuery, isOpen, fetchIssues]);

  // Fetch selected issue details if we have a value but no selectedIssue
  useEffect(() => {
    if (value && !selectedIssue && repo && token) {
      // Try to find it in current issues first
      const found = issues.find(i => i.number === value);
      if (found) {
        setSelectedIssue(found);
      } else {
        // Fetch it directly
        fetch(`/api/github/issues?repo=${repo}&token=${token}&q=${value}`)
          .then(res => res.json())
          .then(data => {
            const issue = data.issues?.find((i: GitHubIssue) => i.number === value);
            if (issue) setSelectedIssue(issue);
          })
          .catch(() => {});
      }
    }
  }, [value, selectedIssue, issues, repo, token]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(i => Math.min(i + 1, issues.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (issues[highlightedIndex]) {
          handleSelect(issues[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (issue: GitHubIssue) => {
    setSelectedIssue(issue);
    onChange(issue.number, issue.html_url);
    setIsOpen(false);
    setQuery('');
  };

  const handleClear = () => {
    setSelectedIssue(null);
    onChange(undefined, undefined);
    setQuery('');
  };

  const handleOpen = () => {
    setIsOpen(true);
    setHighlightedIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // If we have a selected issue, show the compact badge
  if (selectedIssue || value) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg">
          {/* GitHub icon */}
          <svg className="w-4 h-4 text-surface-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>

          {/* Issue number */}
          <span className="font-mono text-sm text-purple-400 font-medium">
            #{selectedIssue?.number || value}
          </span>

          {/* Issue title */}
          {selectedIssue && (
            <span className="text-sm text-surface-300 truncate">
              {selectedIssue.title}
            </span>
          )}

          {/* Link to GitHub */}
          {selectedIssue && (
            <a
              href={selectedIssue.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 text-surface-500 hover:text-surface-300 transition-colors"
              onClick={(e) => e.stopPropagation()}
              title="Open in GitHub"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>

        {/* Clear button */}
        <button
          type="button"
          onClick={handleClear}
          className="p-2 text-surface-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          title="Unlink issue"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  // Otherwise show the search combobox
  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        className="w-full flex items-center gap-2 px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-left hover:border-surface-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all group"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <svg className="w-4 h-4 text-surface-500 group-hover:text-surface-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
        <span className="flex-1 text-sm text-surface-500">Link to GitHub Issue...</span>
        <svg className="w-4 h-4 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-surface-850 border border-surface-700 rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Search input */}
          <div className="p-2 border-b border-surface-800">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search issues by number or keyword..."
                className="w-full pl-9 pr-3 py-2 bg-surface-900 border border-surface-700 rounded-md text-sm text-surface-200 placeholder-surface-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all"
                autoComplete="off"
              />
            </div>
          </div>

          {/* Results */}
          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8 gap-2">
                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-surface-400">Searching...</span>
              </div>
            ) : error ? (
              <div className="py-6 px-4 text-center">
                <svg className="w-8 h-8 text-red-400/60 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <p className="text-sm text-red-400">{error}</p>
              </div>
            ) : issues.length === 0 ? (
              <div className="py-6 px-4 text-center">
                <svg className="w-8 h-8 text-surface-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
                <p className="text-sm text-surface-500">
                  {query ? 'No issues found' : 'No open issues'}
                </p>
              </div>
            ) : (
              <ul
                ref={listRef}
                role="listbox"
                className="py-1"
              >
                {issues.map((issue, index) => (
                  <li
                    key={issue.number}
                    role="option"
                    aria-selected={index === highlightedIndex}
                    onClick={() => handleSelect(issue)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`
                      flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors
                      ${index === highlightedIndex
                        ? 'bg-purple-500/10 border-l-2 border-purple-500'
                        : 'border-l-2 border-transparent hover:bg-surface-800'
                      }
                    `}
                  >
                    {/* Issue state indicator */}
                    <div className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center ${
                      issue.state === 'open'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-purple-500/20 text-purple-400'
                    }`}>
                      {issue.state === 'open' ? (
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 16 16">
                          <circle cx="8" cy="8" r="4" />
                        </svg>
                      ) : (
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
                          <path d="M4 8l3 3 5-5" />
                        </svg>
                      )}
                    </div>

                    {/* Issue content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-purple-400">#{issue.number}</span>
                        <span className={`text-sm truncate ${
                          index === highlightedIndex ? 'text-surface-100' : 'text-surface-300'
                        }`}>
                          {issue.title}
                        </span>
                      </div>

                      {/* Labels */}
                      {issue.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {issue.labels.slice(0, 3).map(label => (
                            <span
                              key={label.name}
                              className="px-1.5 py-0.5 text-[10px] font-medium rounded"
                              style={{
                                backgroundColor: `#${label.color}25`,
                                color: `#${label.color}`,
                                border: `1px solid #${label.color}40`,
                              }}
                            >
                              {label.name}
                            </span>
                          ))}
                          {issue.labels.length > 3 && (
                            <span className="px-1.5 py-0.5 text-[10px] text-surface-500">
                              +{issue.labels.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-2 border-t border-surface-800 bg-surface-900/50">
            <div className="flex items-center justify-between text-[10px] text-surface-500">
              <span>↑↓ navigate</span>
              <span>↵ select</span>
              <span>esc close</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
