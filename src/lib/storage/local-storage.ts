/**
 * LocalStorage-based Task Storage Provider
 *
 * Stores tasks directly in browser localStorage as the primary source of truth.
 * This eliminates git merge conflicts by keeping task state out of version control.
 */

import { v4 as uuidv4 } from 'uuid';
import type { BacklogItem } from '@/types/backlog';
import type { TaskStorageProvider, StorageMode } from './types';
import { serializeBacklogMd } from '../backlog-parser';

/**
 * Simple string hash function (djb2)
 * Used to create unique storage keys per repository
 */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  // Convert to positive hex string
  return (hash >>> 0).toString(16);
}

/**
 * LocalStorage-based implementation of TaskStorageProvider
 *
 * Storage keys:
 * - ringmaster:tasks:{repoHash} - Task data
 * - ringmaster:meta:{repoHash} - Metadata (last modified, etc.)
 */
export class LocalStorageTaskStore implements TaskStorageProvider {
  readonly mode: StorageMode = 'local';

  private repoHash: string = '';
  private storageKey: string = '';
  private metaKey: string = '';
  private initialized: boolean = false;

  /**
   * Initialize the store for a specific repository
   */
  async initialize(repoIdentifier: string): Promise<void> {
    this.repoHash = hashString(repoIdentifier);
    this.storageKey = `ringmaster:tasks:${this.repoHash}`;
    this.metaKey = `ringmaster:meta:${this.repoHash}`;
    this.initialized = true;
  }

  /**
   * Check if the store is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get all tasks from localStorage
   */
  async getAll(): Promise<BacklogItem[]> {
    this.ensureInitialized();

    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const data = localStorage.getItem(this.storageKey);
      if (!data) {
        return [];
      }

      const items = JSON.parse(data) as BacklogItem[];

      // Validate structure
      if (!Array.isArray(items)) {
        console.warn('[LocalStorageTaskStore] Invalid data structure, returning empty');
        return [];
      }

      return items;
    } catch (error) {
      console.error('[LocalStorageTaskStore] Failed to parse stored data:', error);
      return [];
    }
  }

  /**
   * Get a single task by ID
   */
  async getById(id: string): Promise<BacklogItem | null> {
    const items = await this.getAll();
    return items.find(item => item.id === id) || null;
  }

  /**
   * Create a new task
   */
  async create(
    item: Omit<BacklogItem, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<BacklogItem> {
    this.ensureInitialized();

    const now = new Date().toISOString();
    const newItem: BacklogItem = {
      ...item,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };

    const items = await this.getAll();
    items.push(newItem);
    await this.saveAll(items);

    return newItem;
  }

  /**
   * Update an existing task
   */
  async update(id: string, updates: Partial<BacklogItem>): Promise<BacklogItem> {
    this.ensureInitialized();

    const items = await this.getAll();
    const index = items.findIndex(item => item.id === id);

    if (index === -1) {
      throw new Error(`Task not found: ${id}`);
    }

    const updatedItem: BacklogItem = {
      ...items[index],
      ...updates,
      id, // Ensure ID can't be changed
      updatedAt: new Date().toISOString(),
    };

    items[index] = updatedItem;
    await this.saveAll(items);

    return updatedItem;
  }

  /**
   * Delete a task
   */
  async delete(id: string): Promise<void> {
    this.ensureInitialized();

    const items = await this.getAll();
    const filtered = items.filter(item => item.id !== id);

    if (filtered.length === items.length) {
      throw new Error(`Task not found: ${id}`);
    }

    await this.saveAll(filtered);
  }

  /**
   * Replace all tasks (for migrations and bulk updates)
   */
  async replaceAll(items: BacklogItem[]): Promise<void> {
    this.ensureInitialized();
    await this.saveAll(items);
  }

  /**
   * Export all tasks to markdown format
   */
  async exportToMarkdown(): Promise<string> {
    const items = await this.getAll();
    return serializeBacklogMd(items);
  }

  // === Private Methods ===

  /**
   * Ensure the store is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('LocalStorageTaskStore not initialized. Call initialize() first.');
    }
  }

  /**
   * Save all items to localStorage
   */
  private async saveAll(items: BacklogItem[]): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const data = JSON.stringify(items);
      localStorage.setItem(this.storageKey, data);

      // Update metadata
      const meta = {
        lastModified: new Date().toISOString(),
        itemCount: items.length,
      };
      localStorage.setItem(this.metaKey, JSON.stringify(meta));
    } catch (error) {
      // Handle quota exceeded
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.error('[LocalStorageTaskStore] Storage quota exceeded');
        throw new Error('Storage quota exceeded. Please export and clean up old tasks.');
      }
      throw error;
    }
  }
}

/**
 * Get the storage key for a repository (useful for debugging/migration)
 */
export function getStorageKey(repoIdentifier: string): string {
  const hash = hashString(repoIdentifier);
  return `ringmaster:tasks:${hash}`;
}

/**
 * Check if localStorage has data for a repository
 */
export function hasLocalStorageData(repoIdentifier: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const key = getStorageKey(repoIdentifier);
  return localStorage.getItem(key) !== null;
}

/**
 * Clear all localStorage data for a repository
 */
export function clearLocalStorageData(repoIdentifier: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const hash = hashString(repoIdentifier);
  localStorage.removeItem(`ringmaster:tasks:${hash}`);
  localStorage.removeItem(`ringmaster:meta:${hash}`);
}
