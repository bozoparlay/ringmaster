'use client';

import { useState, useRef, useEffect } from 'react';

export interface ActionItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  destructive?: boolean;
}

interface ActionDropdownProps {
  actions: ActionItem[];
  label?: string;
  className?: string;
}

/**
 * ActionDropdown - Consolidates multiple action buttons into a clean dropdown menu.
 *
 * Features:
 * - Accessible with keyboard navigation (Escape to close, Enter/Space to activate)
 * - Click-outside to close
 * - Loading states for async actions
 * - Destructive action styling (red text)
 * - Consistent with app design system
 */
export function ActionDropdown({ actions, label = 'Actions', className = '' }: ActionDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleActionClick = async (action: ActionItem) => {
    if (action.disabled || action.loading) return;
    await action.onClick();
    setIsOpen(false);
  };

  // Filter out actions that have no onClick
  const visibleActions = actions.filter(a => a.onClick);

  if (visibleActions.length === 0) return null;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button - minimal chevron design */}
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`
          p-2 rounded-lg transition-all duration-200
          ${isOpen
            ? 'bg-surface-700 text-surface-100'
            : 'bg-surface-800/60 hover:bg-surface-700/80 text-surface-400 hover:text-surface-200'
          }
          border border-surface-700/50 hover:border-surface-600
        `}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={label}
      >
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute top-full mt-2 right-0 w-56 bg-surface-900 border border-surface-700 rounded-xl shadow-2xl overflow-hidden z-50"
          role="menu"
          aria-orientation="vertical"
        >
          <div className="p-1.5">
            {visibleActions.map((action, index) => (
              <button
                key={action.id}
                onClick={() => handleActionClick(action)}
                disabled={action.disabled || action.loading}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors
                  ${action.disabled || action.loading
                    ? 'opacity-50 cursor-not-allowed'
                    : action.destructive
                      ? 'hover:bg-red-500/10 text-red-400'
                      : 'hover:bg-surface-800 text-surface-300'
                  }
                `}
                role="menuitem"
                tabIndex={isOpen ? 0 : -1}
              >
                <span className={`${action.loading ? 'animate-spin' : ''} ${action.destructive ? 'text-red-400' : 'text-surface-400'}`}>
                  {action.icon}
                </span>
                <span className="flex-1 text-sm font-medium">
                  {action.loading && action.loadingLabel ? action.loadingLabel : action.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
