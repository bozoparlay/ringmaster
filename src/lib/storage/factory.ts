/**
 * Storage Provider Factory
 *
 * Creates and manages storage providers based on the selected storage mode.
 * This is the primary entry point for obtaining a TaskStorageProvider instance.
 */

import type { StorageMode, StorageOptions, TaskStorageProvider, StorageProviderFactory } from './types';
import { LocalStorageTaskStore } from './local-storage';
import { FileBacklogTaskStore } from './file-backlog';

/**
 * Default storage mode - localStorage for local-first experience
 */
export const DEFAULT_STORAGE_MODE: StorageMode = 'local';

/**
 * Storage mode preference key in localStorage
 */
const STORAGE_MODE_KEY = 'ringmaster:storageMode';

/**
 * Factory implementation for creating storage providers
 */
class StorageFactory implements StorageProviderFactory {
  private providers: Map<string, TaskStorageProvider> = new Map();

  /**
   * Create or get a cached storage provider for the specified mode
   * @param mode - Storage mode
   * @param options - Provider options (path for file mode)
   */
  create(mode: StorageMode, options?: StorageOptions): TaskStorageProvider {
    // For file mode, include path in cache key since different paths need different providers
    const cacheKey = mode === 'file'
      ? `file:${options?.backlogFilePath || 'default'}`
      : mode;

    // Check cache first
    const cached = this.providers.get(cacheKey);
    if (cached && cached.isInitialized()) {
      return cached;
    }

    // Create new provider based on mode
    let provider: TaskStorageProvider;

    switch (mode) {
      case 'local':
        provider = new LocalStorageTaskStore();
        break;

      case 'file':
        provider = new FileBacklogTaskStore();
        break;

      case 'github':
        // GitHub mode isn't implemented yet - fall back to local
        console.warn('[StorageFactory] GitHub mode not yet implemented, falling back to local');
        provider = new LocalStorageTaskStore();
        break;

      default:
        throw new Error(`Unknown storage mode: ${mode}`);
    }

    // Cache the provider
    this.providers.set(cacheKey, provider);
    return provider;
  }

  /**
   * Clear all cached providers (useful for testing or mode switching)
   */
  clearCache(): void {
    this.providers.clear();
  }
}

/**
 * Singleton factory instance
 */
export const storageFactory = new StorageFactory();

/**
 * Get the user's preferred storage mode from localStorage
 */
export function getStorageMode(): StorageMode {
  if (typeof window === 'undefined') {
    return DEFAULT_STORAGE_MODE;
  }

  const stored = localStorage.getItem(STORAGE_MODE_KEY);
  if (stored && isValidStorageMode(stored)) {
    return stored as StorageMode;
  }

  return DEFAULT_STORAGE_MODE;
}

/**
 * Set the user's preferred storage mode
 */
export function setStorageMode(mode: StorageMode): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(STORAGE_MODE_KEY, mode);
}

/**
 * Check if a string is a valid storage mode
 */
function isValidStorageMode(value: string): value is StorageMode {
  return ['file', 'local', 'github'].includes(value);
}

/**
 * Create and initialize a storage provider for the current mode
 *
 * This is a convenience function that:
 * 1. Gets the user's preferred storage mode
 * 2. Creates the appropriate provider
 * 3. Initializes it with the repo identifier
 *
 * @param repoIdentifier - Unique identifier for the repo (remote URL or path)
 * @param options - Optional storage configuration
 */
export async function createStorageProvider(
  repoIdentifier: string,
  options?: StorageOptions
): Promise<TaskStorageProvider> {
  const mode = options?.githubToken && options?.githubRepo ? 'github' : getStorageMode();
  const provider = storageFactory.create(mode, options);

  if (!provider.isInitialized()) {
    await provider.initialize(repoIdentifier);
  }

  return provider;
}

/**
 * Get available storage modes with their descriptions
 */
export function getAvailableStorageModes(): Array<{
  mode: StorageMode;
  label: string;
  description: string;
  available: boolean;
}> {
  return [
    {
      mode: 'local',
      label: 'Local Storage',
      description: 'Tasks stored in browser localStorage. Fast, offline-capable, no git conflicts.',
      available: true,
    },
    {
      mode: 'file',
      label: 'BACKLOG.md File',
      description: 'Tasks stored in BACKLOG.md file. Version controlled but may cause merge conflicts.',
      available: true,
    },
    {
      mode: 'github',
      label: 'GitHub Issues',
      description: 'Sync tasks with GitHub Issues. Collaborate with team members.',
      available: true, // Now available with setup
    },
  ];
}
