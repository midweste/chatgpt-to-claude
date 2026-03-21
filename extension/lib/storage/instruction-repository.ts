/**
 * Instruction persistence — raw ChatGPT API responses.
 */

import { runTx } from './connection';
import type { ChatGPTRawInstructions } from '../interfaces/chatgpt-api-types';

export function putInstructions(instructions: ChatGPTRawInstructions): Promise<void> {
  return runTx('instructions', 'readwrite', (tx) => {
    tx.objectStore('instructions').put({ id: 'current', ...instructions });
  });
}

export function getInstructions(): Promise<ChatGPTRawInstructions | null> {
  return runTx<ChatGPTRawInstructions | null>('instructions', 'readonly', (tx) =>
    tx.objectStore('instructions').get('current'),
  ).then((result) => result ?? null);
}

export function clearInstructions(): Promise<void> {
  return runTx(['instructions', 'tracking'], 'readwrite', (tx) => {
    tx.objectStore('instructions').clear();
    const cursor_req = tx.objectStore('tracking').index('type').openCursor('instruction');
    cursor_req.onsuccess = () => {
      const cursor = cursor_req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  });
}
