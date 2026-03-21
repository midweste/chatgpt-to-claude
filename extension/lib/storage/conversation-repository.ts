/**
 * Conversation persistence — raw ChatGPT API responses.
 */

import { runTx } from './connection';
import type { ChatGPTRawConversation } from '../interfaces/chatgpt-api-types';

export function putConversation(conv: ChatGPTRawConversation): Promise<void> {
  return runTx('conversations', 'readwrite', (tx) => {
    tx.objectStore('conversations').put(conv);
  });
}

export function putConversations(convs: ChatGPTRawConversation[]): Promise<void> {
  return runTx('conversations', 'readwrite', (tx) => {
    const store = tx.objectStore('conversations');
    for (const conv of convs) {
      store.put(conv);
    }
  });
}

export function getConversation(id: string): Promise<ChatGPTRawConversation | undefined> {
  return runTx('conversations', 'readonly', (tx) =>
    tx.objectStore('conversations').get(id),
  );
}

export function getAllConversations(): Promise<ChatGPTRawConversation[]> {
  return runTx('conversations', 'readonly', (tx) =>
    tx.objectStore('conversations').getAll(),
  );
}

export function getConversationCount(): Promise<number> {
  return runTx('conversations', 'readonly', (tx) =>
    tx.objectStore('conversations').count(),
  );
}

export function clearConversations(): Promise<void> {
  return runTx(['conversations', 'tracking'], 'readwrite', (tx) => {
    tx.objectStore('conversations').clear();
    const cursor_req = tx.objectStore('tracking').index('type').openCursor('conversation');
    cursor_req.onsuccess = () => {
      const cursor = cursor_req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  });
}

/** Delete specific conversations by ID (for reconciling deleted items). */
export function deleteConversationsByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return Promise.resolve();
  return runTx('conversations', 'readwrite', (tx) => {
    const store = tx.objectStore('conversations');
    for (const id of ids) {
      store.delete(id);
    }
  });
}
