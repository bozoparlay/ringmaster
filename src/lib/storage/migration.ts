/**
 * Migration Utilities for Task Storage
 *
 * Provides functions to migrate tasks between storage modes:
 * - BACKLOG.md file → localStorage
 * - localStorage → BACKLOG.md file
 * - Export to markdown for backup
 */

import type { BacklogItem } from '@/types/backlog';
import type { StorageMode, TaskStorageProvider } from './types';
import { LocalStorageTaskStore, hasLocalStorageData, clearLocalStorageData } from './local-storage';
import { FileBacklogTaskStore, hasBacklogFile } from './file-backlog';
import { setStorageMode } from './factory';
import { serializeBacklogMd } from '../backlog-parser';

/**
 * Migration result with details about what was migrated
 */
export interface MigrationResult {
  success: boolean;
  itemCount: number;
  fromMode: StorageMode;
  toMode: StorageMode;
  error?: string;
}

/**
 * Check what data exists in each storage location
 */
export interface StorageStatus {
  hasLocalStorage: boolean;
  hasBacklogFile: boolean;
  localStorageItemCount: number;
  backlogFileItemCount: number;
}

/**
 * Get the current status of both storage locations
 */
export async function getStorageStatus(repoIdentifier: string): Promise<StorageStatus> {
  let localStorageItemCount = 0;
  let backlogFileItemCount = 0;

  // Check localStorage
  const hasLocal = hasLocalStorageData(repoIdentifier);
  if (hasLocal) {
    try {
      const localStore = new LocalStorageTaskStore();
      await localStore.initialize(repoIdentifier);
      const items = await localStore.getAll();
      localStorageItemCount = items.length;
    } catch (e) {
      console.warn('[migration] Error reading localStorage:', e);
    }
  }

  // Check BACKLOG.md
  const hasFile = await hasBacklogFile();
  if (hasFile) {
    try {
      const fileStore = new FileBacklogTaskStore();
      await fileStore.initialize(repoIdentifier);
      const items = await fileStore.getAll();
      backlogFileItemCount = items.length;
    } catch (e) {
      console.warn('[migration] Error reading BACKLOG.md:', e);
    }
  }

  return {
    hasLocalStorage: hasLocal && localStorageItemCount > 0,
    hasBacklogFile: hasFile && backlogFileItemCount > 0,
    localStorageItemCount,
    backlogFileItemCount,
  };
}

/**
 * Migrate tasks from BACKLOG.md file to localStorage
 *
 * This is the recommended migration for existing users:
 * 1. Reads all tasks from BACKLOG.md via API
 * 2. Stores them in localStorage
 * 3. Updates the storage mode preference
 *
 * Does NOT delete the BACKLOG.md file - user can do that manually
 */
export async function migrateFileToLocal(
  repoIdentifier: string
): Promise<MigrationResult> {
  try {
    // Create source provider (file)
    const fileStore = new FileBacklogTaskStore();
    await fileStore.initialize(repoIdentifier);

    // Read items from file
    const items = await fileStore.getAll();

    if (items.length === 0) {
      return {
        success: true,
        itemCount: 0,
        fromMode: 'file',
        toMode: 'local',
      };
    }

    // Create destination provider (localStorage)
    const localStore = new LocalStorageTaskStore();
    await localStore.initialize(repoIdentifier);

    // Write items to localStorage
    await localStore.replaceAll(items);

    // Update storage mode preference
    setStorageMode('local');

    return {
      success: true,
      itemCount: items.length,
      fromMode: 'file',
      toMode: 'local',
    };
  } catch (error) {
    return {
      success: false,
      itemCount: 0,
      fromMode: 'file',
      toMode: 'local',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Migrate tasks from localStorage to BACKLOG.md file
 *
 * Used when user wants to switch back to file-based storage:
 * 1. Reads all tasks from localStorage
 * 2. Writes them to BACKLOG.md via API
 * 3. Updates the storage mode preference
 * 4. Optionally clears localStorage
 */
export async function migrateLocalToFile(
  repoIdentifier: string,
  clearLocalAfter: boolean = false
): Promise<MigrationResult> {
  try {
    // Create source provider (localStorage)
    const localStore = new LocalStorageTaskStore();
    await localStore.initialize(repoIdentifier);

    // Read items from localStorage
    const items = await localStore.getAll();

    if (items.length === 0) {
      return {
        success: true,
        itemCount: 0,
        fromMode: 'local',
        toMode: 'file',
      };
    }

    // Create destination provider (file)
    const fileStore = new FileBacklogTaskStore();
    await fileStore.initialize(repoIdentifier);

    // Write items to file
    await fileStore.replaceAll(items);

    // Update storage mode preference
    setStorageMode('file');

    // Optionally clear localStorage
    if (clearLocalAfter) {
      clearLocalStorageData(repoIdentifier);
    }

    return {
      success: true,
      itemCount: items.length,
      fromMode: 'local',
      toMode: 'file',
    };
  } catch (error) {
    return {
      success: false,
      itemCount: 0,
      fromMode: 'local',
      toMode: 'file',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Export tasks to markdown format (for backup or transfer)
 */
export async function exportToMarkdown(
  provider: TaskStorageProvider
): Promise<string> {
  const items = await provider.getAll();
  return serializeBacklogMd(items);
}

/**
 * Import tasks from markdown string
 *
 * This is useful for:
 * - Restoring from backup
 * - Importing from another repository
 * - Merging tasks from multiple sources
 */
export async function importFromMarkdown(
  provider: TaskStorageProvider,
  markdown: string,
  mode: 'replace' | 'merge' = 'replace'
): Promise<{ itemCount: number; duplicatesSkipped: number }> {
  // Parse the markdown
  const { parseBacklogMd } = await import('../backlog-parser');
  const newItems = parseBacklogMd(markdown);

  if (mode === 'replace') {
    await provider.replaceAll(newItems);
    return { itemCount: newItems.length, duplicatesSkipped: 0 };
  }

  // Merge mode: add items that don't exist by title
  const existingItems = await provider.getAll();
  const existingTitles = new Set(existingItems.map(item => item.title.toLowerCase()));

  const itemsToAdd: BacklogItem[] = [];
  let duplicatesSkipped = 0;

  for (const item of newItems) {
    if (existingTitles.has(item.title.toLowerCase())) {
      duplicatesSkipped++;
    } else {
      itemsToAdd.push(item);
    }
  }

  // Add new items
  for (const item of itemsToAdd) {
    await provider.create({
      title: item.title,
      description: item.description,
      priority: item.priority,
      effort: item.effort,
      value: item.value,
      status: item.status,
      tags: item.tags,
      category: item.category,
      order: item.order,
      acceptanceCriteria: item.acceptanceCriteria,
      notes: item.notes,
      branch: item.branch,
      worktreePath: item.worktreePath,
      reviewFeedback: item.reviewFeedback,
    });
  }

  return { itemCount: itemsToAdd.length, duplicatesSkipped };
}

/**
 * Merge data from both storage locations
 *
 * Useful when user has been editing in both places:
 * 1. Reads from both sources
 * 2. Combines by keeping newer versions (based on updatedAt)
 * 3. Writes to target storage
 */
export async function mergeStorageSources(
  repoIdentifier: string,
  targetMode: StorageMode
): Promise<MigrationResult & { conflicts: number }> {
  try {
    // Read from both sources
    const localStore = new LocalStorageTaskStore();
    await localStore.initialize(repoIdentifier);
    const localItems = await localStore.getAll();

    const fileStore = new FileBacklogTaskStore();
    await fileStore.initialize(repoIdentifier);
    const fileItems = await fileStore.getAll();

    // Build a map of items by title (since IDs may differ)
    const mergedMap = new Map<string, BacklogItem>();
    let conflicts = 0;

    // Add all local items
    for (const item of localItems) {
      mergedMap.set(item.title.toLowerCase(), item);
    }

    // Merge file items
    for (const item of fileItems) {
      const key = item.title.toLowerCase();
      const existing = mergedMap.get(key);

      if (existing) {
        // Conflict: keep newer version
        const existingDate = new Date(existing.updatedAt);
        const newDate = new Date(item.updatedAt);

        if (newDate > existingDate) {
          mergedMap.set(key, item);
        }
        conflicts++;
      } else {
        mergedMap.set(key, item);
      }
    }

    const mergedItems = Array.from(mergedMap.values());

    // Write to target storage
    const targetStore: TaskStorageProvider =
      targetMode === 'local' ? localStore : fileStore;

    await targetStore.replaceAll(mergedItems);

    // Update storage mode preference
    setStorageMode(targetMode);

    return {
      success: true,
      itemCount: mergedItems.length,
      fromMode: 'local', // Both actually
      toMode: targetMode,
      conflicts,
    };
  } catch (error) {
    return {
      success: false,
      itemCount: 0,
      fromMode: 'local',
      toMode: targetMode,
      conflicts: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
