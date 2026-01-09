/**
 * Resilience utilities for handling timeouts, retries, and circuit breakers.
 * Prevents hung processes and cascading failures in API routes.
 */

import { exec, ExecOptions } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

// Wrapper to ensure string output (not Buffer)
async function execAsync(
  command: string,
  options?: ExecOptions & { signal?: AbortSignal }
): Promise<{ stdout: string; stderr: string }> {
  const result = await execPromise(command, { ...options, encoding: 'utf8' });
  return {
    stdout: String(result.stdout),
    stderr: String(result.stderr),
  };
}

// ============================================================================
// Timeout Utilities
// ============================================================================

export class TimeoutError extends Error {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Wraps a promise with a timeout. If the promise doesn't resolve within
 * the specified time, it rejects with a TimeoutError.
 *
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds (default: 10000)
 * @param operationName - Name for error messages (default: 'Operation')
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 10000,
  operationName: string = 'Operation'
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`${operationName} timed out after ${timeoutMs}ms`, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Wraps a promise with a timeout, returning a fallback value instead of throwing.
 * Useful when you want graceful degradation.
 *
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param fallback - Value to return on timeout
 * @param operationName - Name for logging
 */
export async function withTimeoutFallback<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
  operationName: string = 'Operation'
): Promise<T> {
  try {
    return await withTimeout(promise, timeoutMs, operationName);
  } catch (error) {
    if (error instanceof TimeoutError) {
      console.warn(`[resilience] ${operationName} timed out, using fallback`);
      return fallback;
    }
    throw error;
  }
}

// ============================================================================
// Exec with Timeout
// ============================================================================

interface ExecWithTimeoutOptions extends ExecOptions {
  timeout?: number; // Already supported by exec, but we add AbortController support
}

/**
 * Execute a shell command with a timeout. Uses AbortController for clean cancellation.
 *
 * @param command - Shell command to execute
 * @param options - Exec options including cwd
 * @param timeoutMs - Timeout in milliseconds (default: 10000)
 */
export async function execWithTimeout(
  command: string,
  options: ExecWithTimeoutOptions = {},
  timeoutMs: number = 10000
): Promise<{ stdout: string; stderr: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await execAsync(command, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError(`Command timed out after ${timeoutMs}ms: ${command.slice(0, 50)}...`, timeoutMs);
    }
    throw error;
  }
}

// ============================================================================
// Circuit Breaker
// ============================================================================

interface CircuitBreakerOptions {
  failureThreshold: number;  // Number of failures before opening circuit
  resetTimeMs: number;       // Time to wait before trying again
  name: string;              // Name for logging
}

interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

const circuitStates = new Map<string, CircuitState>();

/**
 * Simple circuit breaker implementation.
 * After `failureThreshold` failures, the circuit opens and rejects immediately
 * for `resetTimeMs` milliseconds before allowing another attempt.
 */
export class CircuitBreaker {
  private state: CircuitState;
  private options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;

    // Get or create state (persists across instances with same name)
    if (!circuitStates.has(options.name)) {
      circuitStates.set(options.name, {
        failures: 0,
        lastFailure: 0,
        isOpen: false,
      });
    }
    this.state = circuitStates.get(options.name)!;
  }

  /**
   * Execute a function through the circuit breaker.
   * If the circuit is open, immediately rejects.
   * If the function fails, increments failure count.
   * If successful, resets failure count.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should reset
    if (this.state.isOpen) {
      const timeSinceLastFailure = Date.now() - this.state.lastFailure;
      if (timeSinceLastFailure >= this.options.resetTimeMs) {
        console.log(`[circuit-breaker] ${this.options.name}: Half-open, allowing test request`);
        this.state.isOpen = false;
        this.state.failures = 0;
      } else {
        const waitTime = Math.ceil((this.options.resetTimeMs - timeSinceLastFailure) / 1000);
        throw new CircuitOpenError(
          `Circuit breaker ${this.options.name} is open. Retry in ${waitTime}s`,
          this.options.name
        );
      }
    }

    try {
      const result = await fn();
      // Success - reset failures
      this.state.failures = 0;
      return result;
    } catch (error) {
      this.state.failures++;
      this.state.lastFailure = Date.now();

      if (this.state.failures >= this.options.failureThreshold) {
        this.state.isOpen = true;
        console.error(
          `[circuit-breaker] ${this.options.name}: Circuit OPEN after ${this.state.failures} failures`
        );
      }

      throw error;
    }
  }

  /**
   * Get the current state of the circuit breaker.
   */
  getState(): { isOpen: boolean; failures: number; name: string } {
    return {
      isOpen: this.state.isOpen,
      failures: this.state.failures,
      name: this.options.name,
    };
  }

  /**
   * Manually reset the circuit breaker.
   */
  reset(): void {
    this.state.failures = 0;
    this.state.isOpen = false;
    this.state.lastFailure = 0;
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string, public readonly circuitName: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

// ============================================================================
// Pre-configured Circuit Breakers
// ============================================================================

// Bedrock API circuit breaker - opens after 3 failures, resets after 30s
export const bedrockCircuitBreaker = new CircuitBreaker({
  name: 'bedrock-api',
  failureThreshold: 3,
  resetTimeMs: 30000,
});

// Git operations circuit breaker - opens after 5 failures, resets after 60s
export const gitCircuitBreaker = new CircuitBreaker({
  name: 'git-operations',
  failureThreshold: 5,
  resetTimeMs: 60000,
});

// ============================================================================
// Retry Utility
// ============================================================================

interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier?: number;
  operationName?: string;
}

/**
 * Retry a function with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxAttempts, delayMs, backoffMultiplier = 2, operationName = 'Operation' } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) {
        console.error(`[retry] ${operationName}: Failed after ${maxAttempts} attempts`);
        throw lastError;
      }

      const waitTime = delayMs * Math.pow(backoffMultiplier, attempt - 1);
      console.warn(`[retry] ${operationName}: Attempt ${attempt} failed, retrying in ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw lastError;
}

// ============================================================================
// Health Check Utility
// ============================================================================

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  uptime: number;
  circuits: {
    name: string;
    isOpen: boolean;
    failures: number;
  }[];
}

const startTime = Date.now();

/**
 * Get the current health status of the application.
 */
export function getHealthStatus(): HealthStatus {
  const circuits = [bedrockCircuitBreaker, gitCircuitBreaker].map(cb => cb.getState());
  const openCircuits = circuits.filter(c => c.isOpen).length;

  let status: HealthStatus['status'] = 'healthy';
  if (openCircuits > 0) {
    status = openCircuits === circuits.length ? 'unhealthy' : 'degraded';
  }

  return {
    status,
    timestamp: Date.now(),
    uptime: Date.now() - startTime,
    circuits,
  };
}
