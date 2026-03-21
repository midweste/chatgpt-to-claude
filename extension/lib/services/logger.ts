/**
 * Simple logger that persists entries to the dedicated IndexedDB logs store.
 * Provides a viewable log history for debugging migration issues.
 */

import { appendLog, getAllLogs, clearLogs } from '../storage';
import type { LogEntry } from '../storage';

export type { LogEntry };

/**
 * Append a log entry to persistent storage.
 */
async function append(level: LogEntry['level'], source: string, message: string): Promise<void> {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
  };

  try {
    await appendLog(entry);
  } catch {
    // Fallback: just log to console if storage fails
    console.log(`[${source}] ${message}`);
  }
}

export const logger = {
  debug: (source: string, message: string) => append('debug', source, message),
  info: (source: string, message: string) => append('info', source, message),
  warn: (source: string, message: string) => append('warn', source, message),
  error: (source: string, message: string) => append('error', source, message),
};

/**
 * Read all stored log entries.
 */
export async function getLogs(): Promise<LogEntry[]> {
  try {
    return await getAllLogs();
  } catch {
    return [];
  }
}

/**
 * Clear all stored log entries.
 */
export { clearLogs as clear_logs };
