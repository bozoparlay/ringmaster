import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions<T> {
  /** The data to save */
  data: T | null;
  /** Callback to perform the save operation */
  onSave: (data: T) => void | Promise<void>;
  /** Debounce delay in milliseconds (default: 500) */
  delay?: number;
  /** Whether auto-save is enabled (default: true) */
  enabled?: boolean;
  /** Optional validation function - return false to skip save */
  validate?: (data: T) => boolean;
}

interface UseAutoSaveReturn {
  /** Current save status */
  status: SaveStatus;
  /** Error message if save failed */
  error: string | null;
  /** Force an immediate save */
  saveNow: () => void;
  /** Whether there are unsaved changes */
  hasUnsavedChanges: boolean;
  /** Reset the saved status back to idle */
  resetStatus: () => void;
}

/**
 * Hook for auto-saving data with debouncing and status tracking.
 *
 * Features:
 * - Debounces saves to prevent excessive API calls
 * - Tracks save status (idle, saving, saved, error)
 * - Supports retry on failure
 * - Shows "Saved" status briefly before returning to idle
 */
export function useAutoSave<T>({
  data,
  onSave,
  delay = 500,
  enabled = true,
  validate,
}: UseAutoSaveOptions<T>): UseAutoSaveReturn {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Track the last saved data to detect changes
  const lastSavedDataRef = useRef<T | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const savedStatusTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (savedStatusTimerRef.current) clearTimeout(savedStatusTimerRef.current);
    };
  }, []);

  // Perform the actual save
  const performSave = useCallback(async (dataToSave: T) => {
    // Validate if validator provided
    if (validate && !validate(dataToSave)) {
      return;
    }

    setStatus('saving');
    setError(null);

    try {
      await onSave(dataToSave);
      lastSavedDataRef.current = dataToSave;
      setHasUnsavedChanges(false);
      setStatus('saved');
      retryCountRef.current = 0;

      // Clear any existing saved status timer
      if (savedStatusTimerRef.current) {
        clearTimeout(savedStatusTimerRef.current);
      }

      // Return to idle after 2 seconds
      savedStatusTimerRef.current = setTimeout(() => {
        setStatus('idle');
      }, 2000);
    } catch (err) {
      console.error('Auto-save failed:', err);

      // Retry logic
      if (retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        // Exponential backoff: 1s, 2s, 4s
        const retryDelay = Math.pow(2, retryCountRef.current - 1) * 1000;
        setTimeout(() => performSave(dataToSave), retryDelay);
      } else {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Failed to save changes');
        retryCountRef.current = 0;
      }
    }
  }, [onSave, validate]);

  // Force immediate save
  const saveNow = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (data && hasUnsavedChanges) {
      performSave(data);
    }
  }, [data, hasUnsavedChanges, performSave]);

  // Reset status
  const resetStatus = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  // Watch for data changes and trigger debounced save
  useEffect(() => {
    if (!enabled || !data) return;

    // Check if data has actually changed from last saved version
    const dataStr = JSON.stringify(data);
    const lastSavedStr = JSON.stringify(lastSavedDataRef.current);

    if (dataStr === lastSavedStr) {
      setHasUnsavedChanges(false);
      return;
    }

    setHasUnsavedChanges(true);

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer
    debounceTimerRef.current = setTimeout(() => {
      performSave(data);
    }, delay);

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [data, enabled, delay, performSave]);

  return {
    status,
    error,
    saveNow,
    hasUnsavedChanges,
    resetStatus,
  };
}
