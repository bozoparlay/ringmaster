'use client';

import { useState, useRef, useEffect } from 'react';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface InlineOptionSelectorProps<T extends string> {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  colorMap?: Record<T, string>;
}

export function InlineOptionSelector<T extends string>({
  label,
  options,
  value,
  onChange,
  colorMap,
}: InlineOptionSelectorProps<T>) {
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

  const handleSelect = (optionValue: T) => {
    if (optionValue !== value) {
      onChange(optionValue);
    }
    setIsExpanded(false);
  };

  // Get color with fallback
  const getColor = (optionValue: T) => colorMap?.[optionValue] ?? 'bg-accent';

  return (
    <div ref={containerRef} className="relative">
      {/* Label */}
      <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
        {label}
      </label>

      {/* Selected Value Button - Square, full width */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          w-full py-1.5 px-3 rounded-lg text-xs font-medium text-left
          transition-all duration-200 ease-out
          ${getColor(value)} text-white shadow-lg
          hover:brightness-110
        `}
      >
        {selectedOption?.label}
      </button>

      {/* Expanded Options (appears below) */}
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
        <div className="p-1 flex flex-col gap-0.5">
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const color = getColor(option.value);

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                style={{
                  animationDelay: isExpanded ? `${index * 25}ms` : '0ms',
                }}
                className={`
                  w-full py-1.5 px-3 rounded-md text-xs font-medium text-left
                  transition-all duration-150
                  ${isExpanded ? 'animate-[fadeSlideIn_100ms_ease-out_forwards]' : ''}
                  ${isSelected
                    ? `${color} text-white shadow-md`
                    : 'bg-surface-800 text-surface-400 hover:bg-surface-700 hover:text-surface-200'
                  }
                `}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
