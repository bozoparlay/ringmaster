import type { BacklogItem } from '@/types/backlog';

const CACHE_KEY = 'ringmaster-backlog-cache';

export interface AuxiliarySignals {
  activeTaskId: string | null;
  prStatus: Record<string, 'pending' | 'creating' | 'created' | 'failed'>;
}

export interface CachedBacklogState {
  items: BacklogItem[];
  signals: AuxiliarySignals;
  lastSync: string; // ISO timestamp of last BACKLOG.md write
  filePath?: string; // The backlog file path this cache is for
}

const DEFAULT_SIGNALS: AuxiliarySignals = {
  activeTaskId: null,
  prStatus: {},
};

/**
 * Load cached backlog state from localStorage
 * Returns null if no cache exists or cache is invalid
 */
export function loadCachedBacklog(forPath?: string): CachedBacklogState | null {
  if (typeof window === 'undefined') return null;

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const state = JSON.parse(cached) as CachedBacklogState;

    // Validate cache structure
    if (!Array.isArray(state.items)) {
      console.warn('[cache] Invalid cache structure, clearing');
      clearCache();
      return null;
    }

    // If a path is specified, only return cache if it matches
    if (forPath && state.filePath && state.filePath !== forPath) {
      console.log('[cache] Cache is for different file, ignoring');
      return null;
    }

    // Ensure signals exist (migration from older cache format)
    if (!state.signals) {
      state.signals = DEFAULT_SIGNALS;
    }

    return state;
  } catch (err) {
    console.error('[cache] Failed to parse cache:', err);
    clearCache();
    return null;
  }
}

/**
 * Save backlog state to localStorage cache
 */
export function saveCachedBacklog(state: CachedBacklogState): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch (err) {
    // Handle quota exceeded
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.warn('[cache] localStorage quota exceeded, clearing old data');
      clearCache();
      // Retry once after clearing
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(state));
      } catch {
        console.error('[cache] Still cannot save after clearing');
      }
    } else {
      console.error('[cache] Failed to save cache:', err);
    }
  }
}

/**
 * Clear the cache
 */
export function clearCache(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CACHE_KEY);
}

/**
 * Get time since last sync in milliseconds
 */
export function getCacheAge(): number {
  const cached = loadCachedBacklog();
  if (!cached?.lastSync) return Infinity;
  return Date.now() - new Date(cached.lastSync).getTime();
}

/**
 * Update just the signals portion of the cache
 */
export function updateCachedSignals(signals: Partial<AuxiliarySignals>): void {
  const cached = loadCachedBacklog();
  if (!cached) return;

  saveCachedBacklog({
    ...cached,
    signals: { ...cached.signals, ...signals },
  });
}

/**
 * Update just the items, preserving signals
 */
export function updateCachedItems(items: BacklogItem[], filePath?: string): void {
  const cached = loadCachedBacklog();
  saveCachedBacklog({
    items,
    signals: cached?.signals || DEFAULT_SIGNALS,
    lastSync: new Date().toISOString(),
    filePath,
  });
}
