/**
 * Claude connection slice — connect, disconnect, usage, hydrate.
 *
 * Extracted from migration-store.ts to isolate the
 * "Claude connection lifecycle" concern from migration orchestration.
 *
 * Cross-store dependencies are injected via callbacks — no dynamic imports.
 */

import { ClaudeDestination } from '@lib/destinations/claude';
import type { ClaudeUsage } from '@lib/destinations/claude';
import { logger } from '@lib/services/logger';
import type { MigrationStore } from './migration-store';

/** Callback for refreshing pushed status after Claude connection changes. */
export type RefreshPushedFn = (
  claude: ClaudeDestination,
  claude_convs?: Array<{ uuid: string; name: string }>,
) => Promise<void>;

/** Connect to Claude, fetch titles, and refresh pushed status via callback. */
export async function connectClaude(
  set: (partial: Partial<MigrationStore>) => void,
  on_connected?: RefreshPushedFn,
): Promise<void> {
  set({ claude_status: 'connecting', claude_error: '' });
  try {
    const claude = new ClaudeDestination();
    await claude.authenticate();
    const claude_convs = await claude.listConversations();
    const titles = new Set<string>();
    for (const c of claude_convs) {
      if (c.name) {
        titles.add(c.name);
        titles.add(c.name.replace(/^\[GPT\]\s*/i, ''));
      }
    }
    set({ claude, claude_status: 'connected', claude_titles: titles });
    // Pre-warm project cache so first push doesn't need a cold API lookup
    try { await claude.prewarmProjectCache(); } catch { /* non-critical */ }
    await logger.info('connect', 'Connected to Claude');
    // Refresh pushed status using already-fetched conversation list
    try {
      await on_connected?.(claude, claude_convs);
    } catch { /* best-effort refresh */ }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    set({ claude_status: 'error', claude_error: msg });
    await logger.error('connect', `Claude connection failed: ${msg}`);
  }
}

/** Disconnect from Claude and clear connection state. */
export function disconnectClaude(
  set: (partial: Partial<MigrationStore>) => void,
): void {
  set({ claude: null, claude_status: 'disconnected', claude_error: '', claude_titles: new Set(), usage: null });
}

/** Fetch usage/rate-limit information from Claude. */
export async function fetchUsage(
  get: () => MigrationStore,
  set: (partial: Partial<MigrationStore>) => void,
): Promise<void> {
  const { claude } = get();
  if (!claude) return;
  try {
    const usage = await claude.getUsage();
    set({ usage });
  } catch (err) {
    await logger.warn('usage', `Could not fetch usage: ${err instanceof Error ? err.message : err}`);
  }
}

/** Hydrate store on app mount — restore settings and auto-connect to Claude. */
export async function hydrateStore(
  set: (partial: Partial<MigrationStore>) => void,
  loadSettings: () => Promise<Partial<MigrationStore>>,
  on_connected?: RefreshPushedFn,
): Promise<void> {
  const settings = await loadSettings();
  set(settings);
  // Auto-connect to Claude silently so it's available on all pages
  try {
    const claude = new ClaudeDestination();
    await claude.authenticate();
    const titles = await claude.fetchExistingTitles();
    set({ claude, claude_status: 'connected', claude_titles: titles });

    // Pre-warm project cache so first push doesn't need a cold API lookup
    try { await claude.prewarmProjectCache(); } catch { /* non-critical */ }

    // Fetch usage stats so rate limit info is available immediately
    try { const usage = await claude.getUsage(); set({ usage }); } catch { /* non-critical */ }

    // Auto-refresh pushed status via callback
    try {
      await on_connected?.(claude);
    } catch { /* silent — non-critical */ }
  } catch { /* silent fail — user can manually connect on the Migrate page */ }
}

export type { ClaudeUsage };
