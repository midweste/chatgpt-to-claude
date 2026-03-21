/**
 * Memory persistence — raw ChatGPT API responses.
 */

import { runTx } from './connection';
import type { ChatGPTRawMemory } from '../interfaces/chatgpt-api-types';

export function putMemories(memories: ChatGPTRawMemory[]): Promise<void> {
  return runTx('memories', 'readwrite', (tx) => {
    const store = tx.objectStore('memories');
    for (const mem of memories) {
      store.put(mem);
    }
  });
}

export function getAllMemories(): Promise<ChatGPTRawMemory[]> {
  return runTx('memories', 'readonly', (tx) =>
    tx.objectStore('memories').getAll(),
  );
}

export function clearMemories(): Promise<void> {
  return runTx(['memories', 'tracking'], 'readwrite', (tx) => {
    tx.objectStore('memories').clear();
    const cursor_req = tx.objectStore('tracking').index('type').openCursor('memory');
    cursor_req.onsuccess = () => {
      const cursor = cursor_req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  });
}
