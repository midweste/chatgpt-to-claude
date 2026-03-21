/**
 * Settings persistence — key-value store for user preferences.
 */

import { runTx } from './connection';

export function getSetting<T>(key: string, fallback: T): Promise<T> {
  return runTx<{ key: string; value: T } | undefined>('settings', 'readonly', (tx) =>
    tx.objectStore('settings').get(key),
  ).then((result) => result?.value ?? fallback);
}

export function setSetting(key: string, value: unknown): Promise<void> {
  return runTx('settings', 'readwrite', (tx) => {
    tx.objectStore('settings').put({ key, value });
  });
}

export function removeSetting(key: string): Promise<void> {
  return runTx('settings', 'readwrite', (tx) => {
    tx.objectStore('settings').delete(key);
  });
}

export function clearSettings(): Promise<void> {
  return runTx('settings', 'readwrite', (tx) => {
    tx.objectStore('settings').clear();
  });
}
