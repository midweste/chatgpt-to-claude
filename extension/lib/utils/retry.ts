/**
 * Shared retry utility with configurable backoff and error classification.
 *
 * Consolidates 3 independent retry implementations (ChatGPT, ClaudeHttp,
 * Claude sendMessage) into a single, tested utility.
 */

import { logger } from '../services/logger';

export interface RetryOptions {
  /** Maximum number of retry attempts (total calls = max_retries + 1). */
  max_retries: number;
  /** Fixed delay array (indexed by attempt), a single constant delay, or a function returning ms. */
  delays: readonly number[] | number | ((attempt: number) => number);
  /** Optional jitter in ms added to each delay. Defaults to 0. */
  jitter_ms?: number;
  /** Source label for log messages. */
  source?: string;
  /**
   * Predicate: should this error/status trigger a retry?
   * Return false to throw immediately (e.g. 4xx client errors).
   * Defaults to always retry.
   */
  should_retry?: (error: unknown, status?: number) => boolean;
}

/**
 * Execute `fn` with automatic retries on failure.
 *
 * Between attempts, waits for the configured delay + optional jitter.
 * Logs each retry via the structured logger.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const {
    max_retries,
    delays,
    jitter_ms = 0,
    source = 'Retry',
    should_retry,
  } = options;

  for (let attempt = 0; attempt <= max_retries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      // Check if we should retry this error
      const status = extract_status(err);
      if (should_retry && !should_retry(err, status)) {
        throw err;
      }

      // Exhausted retries
      if (attempt >= max_retries) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed after ${max_retries + 1} attempts: ${message}`);
      }

      // Calculate delay
      let base_delay: number;
      if (typeof delays === 'function') {
        base_delay = delays(attempt);
      } else if (typeof delays === 'number') {
        base_delay = delays;
      } else {
        base_delay = delays[attempt] ?? delays[delays.length - 1];
      }
      const jitter = jitter_ms > 0 ? Math.random() * jitter_ms : 0;
      const total_delay = base_delay + jitter;

      const message = err instanceof Error ? err.message : String(err);
      await logger.warn(source, `Attempt ${attempt + 1} failed: ${message}. Retrying in ${Math.round(total_delay / 1000)}s...`);

      await sleep(total_delay);
    }
  }

  throw new Error('Exhausted retries');
}

/** Extract HTTP status from error objects if available. */
function extract_status(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'status' in err) {
    return (err as { status: number }).status;
  }
  return undefined;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reusable should_retry predicate: skips retry when err has `noRetry: true`.
 * Used by Claude HTTP transport and sendMessage.
 */
export function shouldRetryNoRetry(err: unknown): boolean {
  if (err && typeof err === 'object' && 'noRetry' in err && (err as { noRetry: boolean }).noRetry) return false;
  return true;
}
