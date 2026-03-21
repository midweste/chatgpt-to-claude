/**
 * Tracking persistence — unified selection, status, and errors.
 */

import { runTx } from './connection';
import type { TrackingType, TrackingStatus, TrackingRecord } from './types';

export function getTracking(id: string): Promise<TrackingRecord | undefined> {
  return runTx('tracking', 'readonly', (tx) =>
    tx.objectStore('tracking').get(id),
  );
}

export function getAllTracking(): Promise<TrackingRecord[]> {
  return runTx('tracking', 'readonly', (tx) =>
    tx.objectStore('tracking').getAll(),
  );
}

export function getTrackingByType(type: TrackingType): Promise<TrackingRecord[]> {
  return runTx('tracking', 'readonly', (tx) =>
    tx.objectStore('tracking').index('type').getAll(type),
  );
}

export function putTracking(record: TrackingRecord): Promise<void> {
  return runTx('tracking', 'readwrite', (tx) => {
    tx.objectStore('tracking').put(record);
  });
}

export function patchTracking(
  id: string,
  fields: Partial<TrackingRecord>,
): Promise<void> {
  return runTx('tracking', 'readwrite', (tx) => {
    const store = tx.objectStore('tracking');
    const req = store.get(id);
    req.onsuccess = () => {
      if (req.result) {
        store.put({ ...req.result, ...fields });
      }
    };
  });
}

/** Upsert a single selection record within an active transaction. */
function upsertSelection(store: IDBObjectStore, id: string, selected: boolean, type: TrackingType): void {
  const req = store.get(id);
  req.onsuccess = () => {
    if (req.result) {
      store.put({ ...req.result, is_selected: selected });
    } else {
      store.put({ id, type, is_selected: selected, status: 'extracted' as TrackingStatus });
    }
  };
}

export function toggleSelection(id: string, selected: boolean, type: TrackingType = 'conversation'): Promise<void> {
  return runTx('tracking', 'readwrite', (tx) => {
    upsertSelection(tx.objectStore('tracking'), id, selected, type);
  });
}

export function toggleAllSelection(ids: string[], selected: boolean, type: TrackingType = 'conversation'): Promise<void> {
  return runTx('tracking', 'readwrite', (tx) => {
    const store = tx.objectStore('tracking');
    for (const id of ids) {
      upsertSelection(store, id, selected, type);
    }
  });
}

/** Ensure tracking records exist for a batch of items (idempotent). */
export function ensureTracking(
  items: Array<{ id: string; type: TrackingType }>,
): Promise<void> {
  return runTx('tracking', 'readwrite', (tx) => {
    const store = tx.objectStore('tracking');
    for (const item of items) {
      const req = store.get(item.id);
      req.onsuccess = () => {
        if (!req.result) {
          store.put({
            id: item.id,
            type: item.type,
            is_selected: false,
            status: 'pending' as TrackingStatus,
          });
        }
      };
    }
  });
}

/** Reset pushed items back to 'extracted' so they can be re-pushed. */
export async function resetPushed(type?: TrackingType): Promise<number> {
  const all = type ? await getTrackingByType(type) : await getAllTracking();
  const pushed = all.filter((t) => t.status === 'done');
  if (pushed.length === 0) return 0;

  await runTx('tracking', 'readwrite', (tx) => {
    const store = tx.objectStore('tracking');
    for (const record of pushed) {
      store.put({ ...record, status: 'extracted' as TrackingStatus, claude_id: undefined, pushed_at: undefined });
    }
  });
  return pushed.length;
}

export function clearTracking(): Promise<void> {
  return runTx('tracking', 'readwrite', (tx) => {
    tx.objectStore('tracking').clear();
  });
}

/** Delete tracking records by IDs (for orphan cleanup). */
export function deleteTrackingByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return Promise.resolve();
  return runTx('tracking', 'readwrite', (tx) => {
    const store = tx.objectStore('tracking');
    for (const id of ids) {
      store.delete(id);
    }
  });
}
