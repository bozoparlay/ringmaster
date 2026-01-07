'use client';

import { useState, useEffect, useCallback } from 'react';
import type { BacklogItem, Priority, Status } from '@/types/backlog';
import { v4 as uuidv4 } from 'uuid';

interface UseBacklogOptions {
  path?: string;
}

interface UseBacklogReturn {
  items: BacklogItem[];
  loading: boolean;
  error: string | null;
  filePath: string | null;
  fileExists: boolean;
  addItem: (title: string, description?: string) => Promise<void>;
  updateItem: (item: BacklogItem) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  moveItem: (id: string, newStatus: Status) => Promise<void>;
  reorderItems: (items: BacklogItem[]) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useBacklog(options: UseBacklogOptions = {}): UseBacklogReturn {
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileExists, setFileExists] = useState(false);

  const buildUrl = useCallback((endpoint: string) => {
    const url = new URL(endpoint, window.location.origin);
    if (options.path) {
      url.searchParams.set('path', options.path);
    }
    return url.toString();
  }, [options.path]);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(buildUrl('/api/backlog'));
      if (!response.ok) throw new Error('Failed to fetch backlog');
      const data = await response.json();
      setItems(data.items);
      setFilePath(data.path);
      setFileExists(data.exists);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const saveItems = useCallback(async (newItems: BacklogItem[]) => {
    try {
      const response = await fetch(buildUrl('/api/backlog'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: newItems }),
      });
      if (!response.ok) throw new Error('Failed to save backlog');
      setItems(newItems);
      setFileExists(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }
  }, [buildUrl]);

  const addItem = useCallback(async (title: string, description: string = '') => {
    const now = new Date().toISOString();
    const newItem: BacklogItem = {
      id: uuidv4(),
      title,
      description,
      priority: 'medium',
      status: 'backlog',
      tags: [],
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

  return {
    items,
    loading,
    error,
    filePath,
    fileExists,
    addItem,
    updateItem,
    deleteItem,
    moveItem,
    reorderItems,
    refresh: fetchItems,
  };
}
