'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { BacklogItem, Priority, Status, Effort, Value } from '@/types/backlog';
import { v4 as uuidv4 } from 'uuid';
import {
  loadCachedBacklog,
  saveCachedBacklog,
  type AuxiliarySignals,
} from '@/lib/local-storage-cache';

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
  addItem: (title: string, description?: string, priority?: Priority, effort?: Effort, value?: Value, category?: string) => Promise<void>;
  updateItem: (item: BacklogItem) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  moveItem: (id: string, newStatus: Status) => Promise<void>;
  reorderItems: (items: BacklogItem[]) => Promise<void>;
  updatePRStatus: (taskId: string, status: AuxiliarySignals['prStatus'][string]) => void;
  refresh: () => Promise<void>;
}

export function useBacklog(options: UseBacklogOptions = {}): UseBacklogReturn {
  // Initialize from cache for instant load
  const [items, setItems] = useState<BacklogItem[]>(() => {
    const cached = loadCachedBacklog(options.path);
    return cached?.items || [];
  });
  const [signals, setSignals] = useState<AuxiliarySignals>(() => {
    const cached = loadCachedBacklog(options.path);
    return cached?.signals || DEFAULT_SIGNALS;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileExists, setFileExists] = useState(false);

  // Ref for debounce timer
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to track pending items for debounced write
  const pendingItemsRef = useRef<BacklogItem[] | null>(null);

  const buildUrl = useCallback((endpoint: string) => {
    const url = new URL(endpoint, window.location.origin);
    if (options.path) {
      url.searchParams.set('path', options.path);
    }
    return url.toString();
  }, [options.path]);

  // Debounced write to BACKLOG.md
  const writeToFile = useCallback(async (itemsToWrite: BacklogItem[]) => {
    try {
      const response = await fetch(buildUrl('/api/backlog'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToWrite }),
      });
      if (!response.ok) {
        console.error('[backlog] Failed to write to file');
      } else {
        console.log('[backlog] Written to file');
      }
    } catch (err) {
      console.error('[backlog] Write error:', err);
    }
  }, [buildUrl]);

  const scheduleWrite = useCallback((newItems: BacklogItem[]) => {
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
  }, [writeToFile]);

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

  // Fetch from server and sync with cache
  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(buildUrl('/api/backlog'));
      if (!response.ok) throw new Error('Failed to fetch backlog');
      const data = await response.json();

      // Update state
      setItems(data.items);
      setFilePath(data.path);
      setFileExists(data.exists);

      // Update cache with fresh data from server
      saveCachedBacklog({
        items: data.items,
        signals,
        lastSync: new Date().toISOString(),
        filePath: data.path,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [buildUrl, signals]);

  // Initial fetch from server
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Save items to cache immediately, schedule file write
  const saveItems = useCallback(async (newItems: BacklogItem[]) => {
    // Immediate: update React state
    setItems(newItems);
    setFileExists(true);

    // Immediate: save to localStorage cache
    saveCachedBacklog({
      items: newItems,
      signals,
      lastSync: new Date().toISOString(),
      filePath: filePath || undefined,
    });

    // Debounced: write to BACKLOG.md
    scheduleWrite(newItems);
  }, [signals, filePath, scheduleWrite]);

  const addItem = useCallback(async (
    title: string,
    description: string = '',
    priority: Priority = 'medium',
    effort?: Effort,
    value?: Value,
    category?: string
  ) => {
    const now = new Date().toISOString();
    const newItem: BacklogItem = {
      id: uuidv4(),
      title,
      description,
      priority,
      effort,
      value,
      status: 'backlog',
      tags: category ? [category] : [],
      category,
      createdAt: now,
      updatedAt: now,
      order: Date.now(),
    };
    await saveItems([...items, newItem]);
  }, [items, saveItems]);

  const updateItem = useCallback(async (updatedItem: BacklogItem) => {
    const newItems = items.map(item =>
      item.id === updatedItem.id
        ? { ...updatedItem, updatedAt: new Date().toISOString() }
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

  // Signal management
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

  return {
    items,
    loading,
    error,
    filePath,
    fileExists,
    signals,
    addItem,
    updateItem,
    deleteItem,
    moveItem,
    reorderItems,
    updatePRStatus,
    refresh: fetchItems,
  };
}
