'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getGitHubSyncConfig } from '@/lib/storage/github-sync';
import type { BacklogItem, Priority, Effort, Value } from '@/types/backlog';
import type { SyncConflict } from '@/lib/storage/types';

// ============================================================================
// Types
// ============================================================================

interface SyncResult {
  success: boolean;
  summary: {
    pushed: number;
    pulled: number;
    conflicts: number;
    unchanged: number;
    errors: number;
  };
  tasks: Array<{
    taskId: string;
    issueNumber: number;
    issueUrl: string;
    operation: string;
  }>;
  pulled: Array<{
    task: BacklogItem;
    issueNumber: number;
    operation: string;
  }>;
  conflicts: SyncConflict[];
  errors: Array<{ message: string }>;
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline' | 'conflicts';

interface UseAutoSyncOptions {
  items: BacklogItem[];
  onUpdateItem: (item: BacklogItem, options?: { fromSync?: boolean }) => Promise<void>;
  onAddItem: (title: string, description?: string, priority?: Priority, effort?: Effort, value?: Value, category?: string) => Promise<void>;
  /** Auto-sync interval in milliseconds (default: 5 minutes) */
  syncInterval?: number;
  /** Whether auto-sync is enabled */
  enabled?: boolean;
  /** Callback when conflicts are detected */
  onConflicts?: (conflicts: SyncConflict[]) => void;
  /** Callback to flush pending writes before sync */
  onFlushWrites?: () => Promise<void>;
}

interface UseAutoSyncReturn {
  /** Current sync status */
  status: SyncStatus;
  /** Last sync time (ISO string) */
  lastSyncAt: string | null;
  /** Error message if any */
  error: string | null;
  /** Whether browser is online */
  isOnline: boolean;
  /** Manually trigger sync */
  sync: () => Promise<void>;
  /** Number of pending changes */
  pendingCount: number;
  /** Conflicts from last sync */
  conflicts: SyncConflict[];
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MIN_SYNC_INTERVAL = 30 * 1000; // 30 seconds minimum
const LAST_SYNC_KEY = 'ringmaster:lastSyncAt';

// Rate limiting and backoff constants
const MAX_CONSECUTIVE_ERRORS = 5;
const BACKOFF_BASE_MS = 30 * 1000; // 30 seconds
const MAX_BACKOFF_MS = 30 * 60 * 1000; // 30 minutes max

// ============================================================================
// Hook
// ============================================================================

export function useAutoSync({
  items,
  onUpdateItem,
  onAddItem,
  syncInterval = DEFAULT_SYNC_INTERVAL,
  enabled = true,
  onConflicts,
  onFlushWrites,
}: UseAutoSyncOptions): UseAutoSyncReturn {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);

  // Refs to avoid stale closures
  const itemsRef = useRef(items);
  const isSyncingRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Rate limiting state
  const consecutiveErrorsRef = useRef(0);
  const backoffUntilRef = useRef<number>(0);

  // Update items ref
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Load last sync time from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(LAST_SYNC_KEY);
      if (saved) setLastSyncAt(saved);
    }
  }, []);

  // Online/offline detection
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      setStatus(prev => prev === 'offline' ? 'idle' : prev);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setStatus('offline');
    };

    // Set initial state
    setIsOnline(navigator.onLine);
    if (!navigator.onLine) setStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync function
  const sync = useCallback(async () => {
    // Don't sync if already syncing or offline
    if (isSyncingRef.current || !isOnline) return;

    // Check backoff - don't sync if we're in a backoff period
    const now = Date.now();
    if (backoffUntilRef.current > now) {
      const waitSeconds = Math.round((backoffUntilRef.current - now) / 1000);
      console.log(`[AutoSync] In backoff period, waiting ${waitSeconds}s before retry`);
      return;
    }

    // Check if we've exceeded max consecutive errors
    if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
      console.warn('[AutoSync] Max consecutive errors reached, pausing sync');
      setStatus('error');
      return;
    }

    // Get repo from localStorage config (token may be server-side)
    const config = getGitHubSyncConfig();
    if (!config?.repo) return; // Need at least the repo to know where to sync

    isSyncingRef.current = true;
    setStatus('syncing');
    setError(null);

    try {
      // Flush any pending writes before syncing
      // This ensures we sync the latest state, not stale data
      if (onFlushWrites) {
        await onFlushWrites();
      }
      // Build headers - token is optional (server may have it from env/file)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      // Only send Authorization header if we have a real token (not 'server-managed')
      if (config.token && config.token !== 'server-managed') {
        headers['Authorization'] = `Bearer ${config.token}`;
      }

      const response = await fetch('/api/github/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          repo: config.repo,
          tasks: itemsRef.current,
          direction: 'both',
        }),
      });

      const result = await response.json() as SyncResult;

      if (!response.ok) {
        throw new Error(result.errors?.[0]?.message || `Sync failed with status ${response.status}`);
      }

      // Update local tasks with GitHub issue numbers (from push)
      if (result.tasks && result.tasks.length > 0) {
        for (const syncedTask of result.tasks) {
          if (syncedTask.operation === 'created' || syncedTask.operation === 'updated') {
            const localTask = itemsRef.current.find(t => t.id === syncedTask.taskId);
            if (localTask && (!localTask.githubIssueNumber || localTask.githubIssueNumber !== syncedTask.issueNumber)) {
              await onUpdateItem({
                ...localTask,
                githubIssueNumber: syncedTask.issueNumber,
                githubIssueUrl: syncedTask.issueUrl,
                lastSyncedAt: new Date().toISOString(),
                syncStatus: 'synced',
              }, { fromSync: true });
            }
          }
        }
      }

      // Handle pulled tasks (from GitHub)
      if (result.pulled && result.pulled.length > 0) {
        for (const pulledTask of result.pulled) {
          if (pulledTask.operation === 'new') {
            await onAddItem(
              pulledTask.task.title,
              pulledTask.task.description || '',
              pulledTask.task.priority,
              pulledTask.task.effort,
              pulledTask.task.value,
              pulledTask.task.category
            );
          } else if (pulledTask.operation === 'updated' || pulledTask.operation === 'closed') {
            const localTask = itemsRef.current.find(t =>
              t.id === pulledTask.task.id ||
              t.githubIssueNumber === pulledTask.issueNumber
            );
            if (localTask) {
              await onUpdateItem({
                ...localTask,
                ...pulledTask.task,
                id: localTask.id,
                order: localTask.order,
                syncStatus: 'synced',
              }, { fromSync: true });
            }
          }
        }
      }

      // Handle conflicts
      if (result.conflicts && result.conflicts.length > 0) {
        setConflicts(result.conflicts);
        setStatus('conflicts');
        onConflicts?.(result.conflicts);
      } else {
        setConflicts([]);
        setStatus('synced');
      }

      // Reset consecutive errors on success
      consecutiveErrorsRef.current = 0;
      backoffUntilRef.current = 0;

      // Update last sync time
      const now = new Date().toISOString();
      setLastSyncAt(now);
      localStorage.setItem(LAST_SYNC_KEY, now);

      // Log results
      console.log(`[AutoSync] Complete: ${result.summary.pushed} pushed, ${result.summary.pulled} pulled, ${result.summary.conflicts} conflicts`);

    } catch (err) {
      console.error('[AutoSync] Error:', err);

      // Increment consecutive errors and set backoff
      consecutiveErrorsRef.current += 1;
      const backoffMs = Math.min(
        BACKOFF_BASE_MS * Math.pow(2, consecutiveErrorsRef.current - 1),
        MAX_BACKOFF_MS
      );
      backoffUntilRef.current = Date.now() + backoffMs;
      console.log(`[AutoSync] Error #${consecutiveErrorsRef.current}, backing off for ${backoffMs / 1000}s`);

      setError(err instanceof Error ? err.message : 'Sync failed');
      setStatus('error');
    } finally {
      isSyncingRef.current = false;
    }
  }, [isOnline, onUpdateItem, onAddItem, onConflicts, onFlushWrites]);

  // Auto-sync on interval
  useEffect(() => {
    if (!enabled || !isOnline) return;

    const effectiveInterval = Math.max(syncInterval, MIN_SYNC_INTERVAL);

    // Initial sync after mount
    const initialTimeout = setTimeout(() => {
      sync();
    }, 3000); // 3 second delay for initial sync

    // Interval sync
    intervalRef.current = setInterval(() => {
      sync();
    }, effectiveInterval);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, isOnline, syncInterval, sync]);

  // Sync on tab focus (visibility change)
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isOnline) {
        // Sync when returning to the tab, but only if it's been a while
        const lastSync = lastSyncAt ? new Date(lastSyncAt).getTime() : 0;
        const now = Date.now();
        const timeSinceLastSync = now - lastSync;

        // Only sync if more than 1 minute since last sync
        if (timeSinceLastSync > 60000) {
          sync();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, isOnline, lastSyncAt, sync]);

  // Sync when coming back online
  useEffect(() => {
    if (isOnline && status === 'offline') {
      // Small delay to ensure network is stable
      const timeout = setTimeout(() => {
        sync();
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [isOnline, status, sync]);

  // Calculate pending count (tasks with pending sync status)
  const pendingCount = items.filter(t => t.syncStatus === 'pending').length;

  return {
    status,
    lastSyncAt,
    error,
    isOnline,
    sync,
    pendingCount,
    conflicts,
  };
}
