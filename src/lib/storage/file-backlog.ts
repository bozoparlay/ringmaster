/**
 * File-based Task Storage Provider (BACKLOG.md)
 *
 * This provider wraps the existing API endpoints that read/write to BACKLOG.md.
 * It maintains backwards compatibility with the original file-based approach
 * while conforming to the TaskStorageProvider interface.
 *
 * Note: This is a client-side class that calls server API endpoints.
 * Direct file operations happen on the server via the /api/backlog routes.
 */

import { v4 as uuidv4 } from 'uuid';
import type { BacklogItem } from '@/types/backlog';
import type { TaskStorageProvider, StorageMode } from './types';
import { serializeBacklogMd } from '../backlog-parser';

/**
 * Response shape from GET /api/backlog
 */
interface BacklogGetResponse {
  items: BacklogItem[];
  path: string;
  exists: boolean;
}

/**
 * File-based implementation of TaskStorageProvider
 *
 * This wraps the existing /api/backlog endpoints to provide
 * BACKLOG.md file persistence through the unified storage interface.
 */
export class FileBacklogTaskStore implements TaskStorageProvider {
  readonly mode: StorageMode = 'file';

  private backlogPath: string = '';
  private initialized: boolean = false;

  /**
   * Local cache of items to reduce API calls
   * Gets invalidated on any write operation
   */
  private cachedItems: BacklogItem[] | null = null;

  /**
   * Initialize the store with a custom backlog path
   * @param repoIdentifier - Path to BACKLOG.md or repo root
   */
  async initialize(repoIdentifier: string): Promise<void> {
    // The repoIdentifier could be:
    // 1. A path to BACKLOG.md directly
    // 2. A repo path (we'd append /BACKLOG.md)
    // For simplicity, we pass it through to the API which handles resolution
    this.backlogPath = repoIdentifier;
    this.initialized = true;
  }

  /**
   * Check if the store is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get all tasks from BACKLOG.md via API
   */
  async getAll(): Promise<BacklogItem[]> {
    this.ensureInitialized();

    // Return cached items if available
    if (this.cachedItems !== null) {
      return this.cachedItems;
    }

    try {
      const url = this.backlogPath
        ? `/api/backlog?path=${encodeURIComponent(this.backlogPath)}`
        : '/api/backlog';

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch backlog: ${response.statusText}`);
      }

      const data: BacklogGetResponse = await response.json();
      this.cachedItems = data.items;
      return data.items;
    } catch (error) {
      console.error('[FileBacklogTaskStore] Failed to get items:', error);
      throw error;
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

    // Get all items, add new one, save all
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

    try {
      const url = this.backlogPath
        ? `/api/backlog?id=${encodeURIComponent(id)}&path=${encodeURIComponent(this.backlogPath)}`
        : `/api/backlog?id=${encodeURIComponent(id)}`;

      const response = await fetch(url, { method: 'DELETE' });

      if (!response.ok) {
        throw new Error(`Failed to delete task: ${response.statusText}`);
      }

      // Invalidate cache
      this.cachedItems = null;
    } catch (error) {
      console.error('[FileBacklogTaskStore] Failed to delete:', error);
      throw error;
    }
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

  /**
   * Invalidate the local cache
   * Call this if you know external changes have been made
   */
  invalidateCache(): void {
    this.cachedItems = null;
  }

  // === Private Methods ===

  /**
   * Ensure the store is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('FileBacklogTaskStore not initialized. Call initialize() first.');
    }
  }

  /**
   * Save all items via POST to /api/backlog
   */
  private async saveAll(items: BacklogItem[]): Promise<void> {
    try {
      const url = this.backlogPath
        ? `/api/backlog?path=${encodeURIComponent(this.backlogPath)}`
        : '/api/backlog';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save backlog: ${response.statusText}`);
      }

      // Update cache with saved items
      this.cachedItems = items;
    } catch (error) {
      console.error('[FileBacklogTaskStore] Failed to save:', error);
      // Invalidate cache on error
      this.cachedItems = null;
      throw error;
    }
  }
}

/**
 * Check if BACKLOG.md exists at the given path
 */
export async function hasBacklogFile(path?: string): Promise<boolean> {
  try {
    const url = path
      ? `/api/backlog?path=${encodeURIComponent(path)}`
      : '/api/backlog';

    const response = await fetch(url);

    if (!response.ok) {
      return false;
    }

    const data: BacklogGetResponse = await response.json();
    return data.exists;
  } catch {
    return false;
  }
}
