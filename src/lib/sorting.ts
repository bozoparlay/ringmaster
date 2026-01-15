import type { BacklogItem } from '@/types/backlog';
import { PRIORITY_WEIGHT } from '@/types/backlog';

export type SortField = 'priority' | 'effort' | 'value' | 'created' | 'updated' | 'title';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

// Weight mappings for non-priority fields
const EFFORT_WEIGHT: Record<string, number> = {
  trivial: 1,
  low: 2,
  medium: 3,
  high: 4,
  very_high: 5,
};

const VALUE_WEIGHT: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * Compare two BacklogItems by a given field.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
function compareByField(a: BacklogItem, b: BacklogItem, field: SortField): number {
  switch (field) {
    case 'priority':
      return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];

    case 'effort': {
      const aEffort = a.effort ? EFFORT_WEIGHT[a.effort] : 3;
      const bEffort = b.effort ? EFFORT_WEIGHT[b.effort] : 3;
      return (aEffort || 3) - (bEffort || 3);
    }

    case 'value': {
      const aValue = a.value ? VALUE_WEIGHT[a.value] : 2;
      const bValue = b.value ? VALUE_WEIGHT[b.value] : 2;
      return (aValue || 2) - (bValue || 2);
    }

    case 'created':
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

    case 'updated':
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();

    case 'title':
      return a.title.toLowerCase().localeCompare(b.title.toLowerCase());

    default:
      return 0;
  }
}

/**
 * Sort an array of BacklogItems by the given config.
 * Does not mutate the original array.
 */
export function sortItems(items: BacklogItem[], config: SortConfig): BacklogItem[] {
  const sorted = [...items].sort((a, b) => {
    const comparison = compareByField(a, b, config.field);
    // Apply direction - desc reverses the comparison
    return config.direction === 'desc' ? -comparison : comparison;
  });
  return sorted;
}

/**
 * Sort labels for the UI dropdown
 */
export const SORT_FIELD_LABELS: Record<SortField, string> = {
  priority: 'Priority',
  effort: 'Effort',
  value: 'Value',
  created: 'Date Created',
  updated: 'Date Updated',
  title: 'Title',
};

/**
 * Default sort configuration
 */
export const DEFAULT_SORT_CONFIG: SortConfig = {
  field: 'priority',
  direction: 'desc', // Critical first
};

/**
 * Local storage key for persisting sort preferences
 */
const SORT_PREFS_KEY = 'bozo_backlog_sort_prefs';

/**
 * Load sort preferences from localStorage
 */
export function loadSortPrefs(): SortConfig {
  if (typeof window === 'undefined') return DEFAULT_SORT_CONFIG;

  try {
    const stored = localStorage.getItem(SORT_PREFS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate the parsed config
      if (
        parsed.field &&
        SORT_FIELD_LABELS[parsed.field as SortField] &&
        (parsed.direction === 'asc' || parsed.direction === 'desc')
      ) {
        return parsed as SortConfig;
      }
    }
  } catch (e) {
    console.warn('Failed to load sort preferences:', e);
  }
  return DEFAULT_SORT_CONFIG;
}

/**
 * Save sort preferences to localStorage
 */
export function saveSortPrefs(config: SortConfig): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(SORT_PREFS_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('Failed to save sort preferences:', e);
  }
}
