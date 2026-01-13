'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { BacklogItem, Priority, Status, Effort, Value } from '@/types/backlog';
import {
  loadCachedBacklog,
  saveCachedBacklog,
  type AuxiliarySignals,
} from '@/lib/local-storage-cache';
import {
  createStorageProvider,
  getStorageMode,
  type TaskStorageProvider,
  type StorageMode,
} from '@/lib/storage';

const DEBOUNCE_MS = 2000; // 2 second debounce for file writes

const DEFAULT_SIGNALS: AuxiliarySignals = {
  prStatus: {},
};

interface UseBacklogOptions {
  path?: string;
}

interface UseBacklogReturn {
  items: BacklogItem[];
  loading: boolean;
  error: string | null;
  filePath: string | null;
  fileExists: boolean;
  signals: AuxiliarySignals;
  storageMode: StorageMode;
  addItem: (title: string, description?: string, priority?: Priority, effort?: Effort, value?: Value, category?: string) => Promise<void>;
  updateItem: (item: BacklogItem, options?: { fromSync?: boolean }) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  moveItem: (id: string, newStatus: Status) => Promise<void>;
  reorderItems: (items: BacklogItem[]) => Promise<void>;
  updatePRStatus: (taskId: string, status: AuxiliarySignals['prStatus'][string]) => void;
  refresh: () => Promise<void>;
  exportToMarkdown: () => Promise<string>;
}

export function useBacklog(options: UseBacklogOptions = {}): UseBacklogReturn {
  // Initialize with empty state for SSR - load from cache in useEffect to avoid hydration mismatch
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [signals, setSignals] = useState<AuxiliarySignals>(DEFAULT_SIGNALS);
  const [loading, setLoading] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileExists, setFileExists] = useState(false);
  const [storageMode, setStorageMode] = useState<StorageMode>('local');

  // Storage provider ref - initialized once on mount
  const providerRef = useRef<TaskStorageProvider | null>(null);

  // Ref for debounce timer (only used in file mode)
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to track pending items for debounced write
  const pendingItemsRef = useRef<BacklogItem[] | null>(null);

  // Get repo identifier from path or use default
  const repoIdentifier = options.path || process.env.NEXT_PUBLIC_REPO_URL || 'default';

  // Debounced write for file mode only
  const writeToFile = useCallback(async (itemsToWrite: BacklogItem[]) => {
    if (!providerRef.current || providerRef.current.mode !== 'file') {
      return;
    }

    try {
      await providerRef.current.replaceAll(itemsToWrite);
      console.log('[backlog] Written to file');
    } catch (err) {
      console.error('[backlog] Write error:', err);
    }
  }, []);

  const scheduleWrite = useCallback((newItems: BacklogItem[]) => {
    // Only debounce for file mode
    if (storageMode !== 'file') {
      return;
    }

    // Store pending items
    pendingItemsRef.current = newItems;

    // Clear existing timer
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Schedule new write
    debounceRef.current = setTimeout(() => {
      if (pendingItemsRef.current) {
        writeToFile(pendingItemsRef.current);
        pendingItemsRef.current = null;
      }
    }, DEBOUNCE_MS);
  }, [writeToFile, storageMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Flush pending write on unmount
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        if (pendingItemsRef.current) {
          writeToFile(pendingItemsRef.current);
        }
      }
    };
  }, [writeToFile]);

  // Initialize storage provider and load data
  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        setHasMounted(true);

        // Load cached signals first (not related to storage mode)
        const cached = loadCachedBacklog(options.path);
        if (cached?.signals) {
          setSignals(cached.signals);
        }

        // Get current storage mode
        const mode = getStorageMode();
        setStorageMode(mode);

        // Create and initialize storage provider
        const provider = await createStorageProvider(repoIdentifier);
        providerRef.current = provider;

        // Load items from storage
        const loadedItems = await provider.getAll();

        if (mounted) {
          setItems(loadedItems);
          setFileExists(loadedItems.length > 0 || provider.mode === 'local');
          setFilePath(options.path || null);
          setLoading(false);

          // Update signals cache with current items
          saveCachedBacklog({
            items: loadedItems,
            signals: cached?.signals || DEFAULT_SIGNALS,
            lastSync: new Date().toISOString(),
            filePath: options.path,
          });
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, [options.path, repoIdentifier]);

  // Refresh from storage
  const refresh = useCallback(async () => {
    if (!providerRef.current) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // For file mode, invalidate cache to force re-fetch
      if (providerRef.current.mode === 'file' && 'invalidateCache' in providerRef.current) {
        (providerRef.current as { invalidateCache: () => void }).invalidateCache();
      }

      const loadedItems = await providerRef.current.getAll();
      setItems(loadedItems);

      // Update signals cache
      saveCachedBacklog({
        items: loadedItems,
        signals,
        lastSync: new Date().toISOString(),
        filePath: filePath || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [signals, filePath]);

  // Save items - uses storage provider directly or schedules write
  const saveItems = useCallback(async (newItems: BacklogItem[]) => {
    if (!providerRef.current) {
      console.error('[backlog] Storage provider not initialized');
      return;
    }

    // Immediate: update React state
    setItems(newItems);
    setFileExists(true);

    // Save to appropriate storage
    if (providerRef.current.mode === 'local') {
      // LocalStorage mode: write immediately
      await providerRef.current.replaceAll(newItems);
    } else if (providerRef.current.mode === 'file') {
      // File mode: debounce writes
      scheduleWrite(newItems);
    }

    // Always update signals cache
    saveCachedBacklog({
      items: newItems,
      signals,
      lastSync: new Date().toISOString(),
      filePath: filePath || undefined,
    });
  }, [signals, filePath, scheduleWrite]);

  const addItem = useCallback(async (
    title: string,
    description: string = '',
    priority: Priority = 'medium',
    effort?: Effort,
    value?: Value,
    category?: string
  ) => {
    if (!providerRef.current) {
      console.error('[backlog] Storage provider not initialized');
      return;
    }

    const newItem = await providerRef.current.create({
      title,
      description,
      priority,
      effort,
      value,
      status: 'backlog',
      tags: category ? [category] : [],
      category,
      order: Date.now(),
    });

    // Update local state
    const newItems = [...items, newItem];
    setItems(newItems);
    setFileExists(true);

    // File mode needs debounced write since create already wrote
    if (providerRef.current.mode === 'file') {
      scheduleWrite(newItems);
    }

    // Update signals cache
    saveCachedBacklog({
      items: newItems,
      signals,
      lastSync: new Date().toISOString(),
      filePath: filePath || undefined,
    });
  }, [items, signals, filePath, scheduleWrite]);

  const updateItem = useCallback(async (updatedItem: BacklogItem, options?: { fromSync?: boolean }) => {
    const now = new Date().toISOString();
    const newItems = items.map(item =>
      item.id === updatedItem.id
        ? {
            ...updatedItem,
            updatedAt: now,
            // Only set lastLocalModifiedAt for non-sync updates
            lastLocalModifiedAt: options?.fromSync ? item.lastLocalModifiedAt : now,
          }
        : item
    );
    await saveItems(newItems);
  }, [items, saveItems]);

  const deleteItem = useCallback(async (id: string) => {
    const newItems = items.filter(item => item.id !== id);
    await saveItems(newItems);
  }, [items, saveItems]);

  const moveItem = useCallback(async (id: string, newStatus: Status) => {
    const newItems = items.map(item =>
      item.id === id
        ? { ...item, status: newStatus, updatedAt: new Date().toISOString() }
        : item
    );
    await saveItems(newItems);
  }, [items, saveItems]);

  const reorderItems = useCallback(async (newItems: BacklogItem[]) => {
    await saveItems(newItems);
  }, [saveItems]);

  // Signal management (kept separate from storage)
  const updatePRStatus = useCallback((taskId: string, status: AuxiliarySignals['prStatus'][string]) => {
    const newSignals = {
      ...signals,
      prStatus: { ...signals.prStatus, [taskId]: status },
    };
    setSignals(newSignals);

    // Update cache with new signals
    saveCachedBacklog({
      items,
      signals: newSignals,
      lastSync: new Date().toISOString(),
      filePath: filePath || undefined,
    });
  }, [items, signals, filePath]);

  // Export to markdown
  const exportToMarkdown = useCallback(async (): Promise<string> => {
    if (!providerRef.current) {
      throw new Error('Storage provider not initialized');
    }
    return providerRef.current.exportToMarkdown();
  }, []);

  return {
    items,
    loading,
    error,
    filePath,
    fileExists,
    signals,
    storageMode,
    addItem,
    updateItem,
    deleteItem,
    moveItem,
    reorderItems,
    updatePRStatus,
    refresh,
    exportToMarkdown,
  };
}
