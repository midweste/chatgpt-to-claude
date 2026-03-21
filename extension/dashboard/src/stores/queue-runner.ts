/**
 * Queue runner — shared pause/cancel loop for push operations.
 *
 * Extracted from migration-store.ts to isolate the
 * "iterate items with pause/cancel support" concern.
 */

import type { MigrationStore, PushResultRow } from './migration-store';

/** Check if an error was caused by a 429 rate limit. */
function isRateLimitError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'isRateLimit' in err &&
    (err as { isRateLimit: boolean }).isRateLimit === true
  );
}

/**
 * Run a queue of items with pause/cancel support and per-item result tracking.
 * Used by start_migration, retry_failed, and push_queue.
 *
 * When a rate limit (429) is detected, the queue auto-pauses instead of
 * continuing to the next item and burning through retries pointlessly.
 */
export async function runQueue<T>(
  items: { item: T; result_index: number }[],
  push_fn: (item: T) => Promise<{ id: string; status: 'done' | 'error'; claude_id?: string; error?: string }>,
  on_changed: (() => void) | undefined,
  get: () => MigrationStore,
  set: (partial: Partial<MigrationStore> | ((s: MigrationStore) => Partial<MigrationStore>)) => void,
): Promise<void> {
  let push_count = 0;

  for (const { item, result_index } of items) {
    if (get().cancelled_ref) break;

    while (get().paused_ref) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (get().cancelled_ref) break;
    }
    if (get().cancelled_ref) break;

    // Mark as pushing
    set((s) => ({
      results: s.results.map((r, idx) => idx === result_index ? { ...r, status: 'pushing' as const } : r),
    }));

    try {
      const result = await push_fn(item);
      set((s) => ({
        results: s.results.map((r, idx) => idx === result_index ? result : r),
      }));

      // Auto-pause if the push returned a rate limit error
      if (result.status === 'error' && result.error?.includes('rate limit')) {
        set({ status: 'paused', paused_ref: true });
        on_changed?.();
        continue;
      }

      // Throttle usage polling — every 5 pushes, not every push
      if (++push_count % 5 === 0) {
        try { await get().fetchUsage(); } catch { /* non-fatal */ }
      }
    } catch (err) {
      const error_msg = err instanceof Error ? err.message : String(err);
      set((s) => ({
        results: s.results.map((r: PushResultRow, idx: number) =>
          idx === result_index ? { id: r.id, status: 'error' as const, error: error_msg } : r,
        ),
      }));

      // Auto-pause on rate limit instead of burning through remaining items
      if (isRateLimitError(err)) {
        set({ status: 'paused', paused_ref: true });
        on_changed?.();
        continue; // Skip on_changed below, already called
      }
    }

    on_changed?.();
  }
}

