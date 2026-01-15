'use client';

import type { SortField, SortDirection, SortConfig } from '@/lib/sorting';
import { SORT_FIELD_LABELS } from '@/lib/sorting';

interface SortControlProps {
  config: SortConfig;
  onChange: (config: SortConfig) => void;
  className?: string;
}

/**
 * A compact sort control with field dropdown and direction toggle.
 * Shows sort field and an arrow indicating direction.
 */
export function SortControl({ config, onChange, className = '' }: SortControlProps) {
  const handleFieldChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...config, field: e.target.value as SortField });
  };

  const toggleDirection = () => {
    onChange({
      ...config,
      direction: config.direction === 'asc' ? 'desc' : 'asc',
    });
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs text-surface-500 uppercase tracking-wider">Sort:</span>
      <select
        value={config.field}
        onChange={handleFieldChange}
        className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-1.5 text-sm text-surface-200 focus:outline-none focus:border-accent/50 transition-colors"
      >
        {(Object.entries(SORT_FIELD_LABELS) as [SortField, string][]).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={toggleDirection}
        className="p-1.5 bg-surface-800 border border-surface-700 rounded-lg text-surface-300 hover:text-surface-100 hover:border-surface-600 focus:outline-none focus:border-accent/50 transition-colors"
        title={config.direction === 'asc' ? 'Ascending (click to change)' : 'Descending (click to change)'}
      >
        <svg
          className={`w-4 h-4 transition-transform ${config.direction === 'asc' ? '' : 'rotate-180'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>
    </div>
  );
}
