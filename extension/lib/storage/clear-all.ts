/**
 * Cross-cutting clear — drops entire database + chrome storage + cookies.
 */

import { resetConnection, DB_NAME } from './connection';

export async function clearAll(): Promise<void> {
  resetConnection();

  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  // Clear chrome.storage.local (includes chatgpt_access_token)
  await chrome.storage.local.clear();

  // Clear Claude session cookie
  try {
    await chrome.cookies.remove({ url: 'https://claude.ai', name: 'sessionKey' });
  } catch { /* may not have cookies permission in test env */ }
}
