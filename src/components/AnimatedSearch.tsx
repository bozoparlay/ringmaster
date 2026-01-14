'use client';

import { useState, useRef, useEffect } from 'react';

interface AnimatedSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * AnimatedSearch - A search icon that expands into a full input when clicked.
 *
 * Features:
 * - Smooth width animation with CSS transitions
 * - Auto-focus when expanded
 * - Click-outside to collapse (when empty)
 * - Escape key to collapse
 * - Maintains value when collapsed if not empty
 */
export function AnimatedSearch({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
}: AnimatedSearchProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-focus when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  // Close on click outside (only if empty)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        !value
      ) {
        setIsExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value]);

  // Close on Escape (only if empty)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded && !value) {
        setIsExpanded(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, value]);

  const handleToggle = () => {
    if (!isExpanded) {
      setIsExpanded(true);
    }
  };

  const handleClear = () => {
    onChange('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Keep expanded if there's a value
  const showExpanded = isExpanded || !!value;

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center ${className}`}
    >
      {/* Search container with animated width */}
      <div
        className={`
          flex items-center overflow-hidden rounded-lg transition-all duration-300 ease-out
          ${showExpanded
            ? 'w-56 bg-surface-900 border border-surface-700 focus-within:border-surface-500'
            : 'w-9 bg-transparent border border-transparent hover:bg-surface-800/50'
          }
        `}
      >
        {/* Search Icon / Toggle Button */}
        <button
          onClick={handleToggle}
          className={`
            flex-shrink-0 p-2 transition-colors duration-200
            ${showExpanded
              ? 'text-surface-500'
              : 'text-surface-400 hover:text-surface-200'
            }
          `}
          aria-label={showExpanded ? 'Search' : 'Open search'}
          type="button"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </button>

        {/* Input field - always rendered but hidden when collapsed */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`
            flex-1 bg-transparent pr-2 py-2 text-sm text-surface-200 placeholder:text-surface-500
            focus:outline-none transition-opacity duration-200
            ${showExpanded ? 'opacity-100 w-full' : 'opacity-0 w-0'}
          `}
          tabIndex={showExpanded ? 0 : -1}
        />

        {/* Clear button */}
        {value && (
          <button
            onClick={handleClear}
            className="flex-shrink-0 p-1.5 mr-1 rounded text-surface-500 hover:text-surface-300 hover:bg-surface-700 transition-colors"
            aria-label="Clear search"
            type="button"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
