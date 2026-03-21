/**
 * Migration state persistence — single-record progress tracker.
 */

import { runTx } from './connection';
import type { MigrationState } from './types';

export function getMigrationState(): Promise<MigrationState | null> {
  return runTx<MigrationState | null>('migration_state', 'readonly', (tx) =>
    tx.objectStore('migration_state').get('current'),
  ).then((result) => result ?? null);
}

export async function updateMigrationState(
  updates: Partial<MigrationState>,
): Promise<void> {
  const current = await getMigrationState();
  const state: MigrationState = {
    id: 'current',
    source: 'chatgpt',
    status: 'idle',
    total_conversations: 0,
    extracted_count: 0,
    last_offset: 0,
    ...current,
    ...updates,
  };

  return runTx('migration_state', 'readwrite', (tx) => {
    tx.objectStore('migration_state').put(state);
  });
}

export function clearMigrationState(): Promise<void> {
  return runTx('migration_state', 'readwrite', (tx) => {
    tx.objectStore('migration_state').clear();
  });
}
