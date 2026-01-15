'use client';

import { useState, useRef, useEffect, useMemo } from 'react';

// Stable empty array to prevent infinite re-renders when existingCategories isn't provided
// Using [] directly in default params creates a new reference each render!
const EMPTY_CATEGORIES: string[] = [];

// Default category suggestions for new projects
const DEFAULT_CATEGORIES = [
  'UI/UX Improvements',
  'Infrastructure',
  'Admin Tools',
  'User Management',
  'Testing',
  'Security',
  'Performance',
  'Bug Fixes',
  'Documentation',
  'Technical Debt',
];

interface CategorySelectorProps {
  value: string | undefined;
  onChange: (category: string | undefined) => void;
  /** Existing categories from current tasks (will be merged with defaults) */
  existingCategories?: string[];
  placeholder?: string;
  className?: string;
}

/**
 * A combobox-style category selector that combines a dropdown with text input.
 *
 * Features:
 * - Shows existing categories from current tasks
 * - Includes default category suggestions
 * - Allows typing custom categories
 * - Filters suggestions as user types
 */
export function CategorySelector({
  value,
  onChange,
  existingCategories = EMPTY_CATEGORIES,
  placeholder = 'Select or type category...',
  className = '',
}: CategorySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value || '');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Combine existing categories with defaults, remove duplicates
  // Must be memoized to prevent infinite re-renders in the useEffect that depends on it
  const allCategories = useMemo(() =>
    Array.from(
      new Set([
        ...existingCategories.filter(Boolean),
        ...DEFAULT_CATEGORIES,
      ])
    ).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
    [existingCategories]
  );

  // Update input value when prop changes
  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  // Filter categories based on input - using useMemo instead of useEffect+setState
  // to avoid triggering re-renders that could cause infinite loops
  const filteredCategories = useMemo(() => {
    if (!inputValue.trim()) {
      return allCategories;
    }
    const searchTerm = inputValue.toLowerCase();
    return allCategories.filter((cat) =>
      cat.toLowerCase().includes(searchTerm)
    );
  }, [inputValue, allCategories]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setIsOpen(true);
    onChange(newValue || undefined);
  };

  const handleSelectCategory = (category: string) => {
    setInputValue(category);
    onChange(category);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    setInputValue('');
    onChange(undefined);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown' && !isOpen) {
      setIsOpen(true);
    } else if (e.key === 'Enter' && filteredCategories.length > 0) {
      // Select first match on Enter
      handleSelectCategory(filteredCategories[0]);
    }
  };

  // Check if the current input matches an existing category (case-insensitive)
  const isExistingCategory = allCategories.some(
    (cat) => cat.toLowerCase() === inputValue.toLowerCase()
  );

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full bg-surface-800 border border-surface-700 rounded-lg pl-4 pr-16 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
          placeholder={placeholder}
        />

        {/* Right side buttons */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {/* Clear button */}
          {inputValue && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-surface-500 hover:text-surface-300 transition-colors"
              title="Clear"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Dropdown toggle */}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 text-surface-500 hover:text-surface-300 transition-colors"
            title="Show categories"
          >
            <svg
              className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-surface-800 border border-surface-700 rounded-lg shadow-xl"
        >
          {filteredCategories.length > 0 ? (
            filteredCategories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => handleSelectCategory(category)}
                className={`
                  w-full px-4 py-2 text-sm text-left transition-colors
                  ${category.toLowerCase() === inputValue.toLowerCase()
                    ? 'bg-accent/20 text-accent'
                    : 'text-surface-200 hover:bg-surface-700'
                  }
                `}
              >
                {category}
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-sm text-surface-500">
              {inputValue ? (
                <span>
                  Press Enter to use &quot;<span className="text-accent">{inputValue}</span>&quot; as a new category
                </span>
              ) : (
                'No categories available'
              )}
            </div>
          )}

          {/* Show "Add new" option if typing a custom category */}
          {inputValue && !isExistingCategory && filteredCategories.length > 0 && (
            <button
              type="button"
              onClick={() => handleSelectCategory(inputValue)}
              className="w-full px-4 py-2 text-sm text-left text-surface-400 hover:bg-surface-700 border-t border-surface-700"
            >
              <span className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create &quot;{inputValue}&quot;
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
