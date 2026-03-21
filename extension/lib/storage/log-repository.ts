/**
 * Log persistence — append-only log entries with auto-trimming.
 */

import { runTx } from './connection';
import type { LogEntry } from './types';

const MAX_LOG_ENTRIES = 500;
/** Only trim when count exceeds max by this margin — avoids cursor scans on every write. */
const TRIM_MARGIN = 50;

export function appendLog(entry: LogEntry): Promise<void> {
  return runTx('logs', 'readwrite', (tx) => {
    const store = tx.objectStore('logs');
    store.add(entry);

    // Trim old entries only when significantly over limit
    const count_req = store.count();
    count_req.onsuccess = () => {
      const excess = count_req.result - MAX_LOG_ENTRIES;
      if (excess >= TRIM_MARGIN) {
        const cursor = store.openCursor();
        let deleted = 0;
        cursor.onsuccess = () => {
          if (cursor.result && deleted < excess) {
            cursor.result.delete();
            deleted++;
            cursor.result.continue();
          }
        };
      }
    };
  });
}

export function getAllLogs(): Promise<LogEntry[]> {
  return runTx('logs', 'readonly', (tx) =>
    tx.objectStore('logs').getAll(),
  );
}

export function clearLogs(): Promise<void> {
  return runTx('logs', 'readwrite', (tx) => {
    tx.objectStore('logs').clear();
  });
}
