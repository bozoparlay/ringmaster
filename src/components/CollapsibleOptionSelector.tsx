'use client';

import { useState, useRef, useEffect } from 'react';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface CollapsibleOptionSelectorProps<T extends string> {
  label: string;
  options: Option<T>[];
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  placeholder?: string;
  colorMap?: Record<T, string>;
  accentColor?: string;
}

export function CollapsibleOptionSelector<T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder = 'None',
  colorMap,
  accentColor = 'bg-accent',
}: CollapsibleOptionSelectorProps<T>) {
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isExpanded]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isExpanded]);

  const selectedOption = options.find((o) => o.value === value);
  const selectedColor = value && colorMap ? colorMap[value] : accentColor;

  const handleSelect = (optionValue: T) => {
    // Toggle off if clicking the same value
    onChange(value === optionValue ? undefined : optionValue);
    setIsExpanded(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Label */}
      <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
        {label}
      </label>

      {/* Collapsed Bubble */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          group relative flex items-center gap-2 px-3 py-2 rounded-lg
          border transition-all duration-200 ease-out
          ${isExpanded
            ? 'border-surface-600 bg-surface-800 ring-1 ring-surface-600'
            : 'border-surface-700 bg-surface-800/50 hover:bg-surface-800 hover:border-surface-600'
          }
        `}
      >
        {/* Color indicator dot */}
        <span
          className={`
            w-2.5 h-2.5 rounded-full shrink-0 transition-all duration-200
            ${selectedOption ? selectedColor : 'bg-surface-600'}
            ${selectedOption ? 'scale-100' : 'scale-75 opacity-50'}
          `}
        />

        {/* Selected value or placeholder */}
        <span
          className={`
            text-sm font-medium transition-colors
            ${selectedOption ? 'text-surface-200' : 'text-surface-500'}
          `}
        >
          {selectedOption?.label || placeholder}
        </span>

        {/* Chevron */}
        <svg
          className={`
            w-3.5 h-3.5 text-surface-500 transition-transform duration-200 ml-auto
            ${isExpanded ? 'rotate-180' : ''}
          `}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded Options Popover */}
      <div
        className={`
          absolute top-full left-0 right-0 mt-1 z-20
          bg-surface-850 border border-surface-700 rounded-lg
          shadow-xl shadow-black/30 overflow-hidden
          transition-all duration-200 ease-out origin-top
          ${isExpanded
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'
          }
        `}
      >
        <div className="p-1.5 space-y-0.5">
          {options.map((option) => {
            const isSelected = value === option.value;
            const optionColor = colorMap ? colorMap[option.value] : accentColor;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`
                  w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md
                  text-left transition-all duration-150
                  ${isSelected
                    ? `${optionColor} text-white shadow-md`
                    : 'text-surface-300 hover:bg-surface-800 hover:text-surface-100'
                  }
                `}
              >
                {/* Selection indicator */}
                <span
                  className={`
                    w-2 h-2 rounded-full shrink-0 transition-all duration-150
                    ${isSelected ? 'bg-white/90 scale-100' : `${optionColor} scale-75 opacity-60`}
                  `}
                />

                <span className="text-sm font-medium">{option.label}</span>

                {/* Checkmark for selected */}
                {isSelected && (
                  <svg
                    className="w-3.5 h-3.5 ml-auto text-white/80"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
