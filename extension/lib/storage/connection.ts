/**
 * IndexedDB connection singleton and transaction helper.
 *
 * All repository modules import `open` to get the shared DB instance
 * and `runTx` to avoid repeating the transaction boilerplate.
 */

export const DB_NAME = 'aimigration';
const DB_VERSION = 4;

let dbInstance: IDBDatabase | null = null;

export function open(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains('conversations')) {
        db.createObjectStore('conversations', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('memories')) {
        db.createObjectStore('memories', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('instructions')) {
        db.createObjectStore('instructions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('tracking')) {
        const store = db.createObjectStore('tracking', { keyPath: 'id' });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
      if (!db.objectStoreNames.contains('migration_state')) {
        db.createObjectStore('migration_state', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('logs')) {
        const logStore = db.createObjectStore('logs', { autoIncrement: true });
        logStore.createIndex('level', 'level', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    request.onblocked = () => {
      reject(new Error('IndexedDB upgrade blocked — please close other tabs using this extension and try again.'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(new Error(`IndexedDB open failed: ${request.error?.message}`));
    };
  });
}

/**
 * Run a callback inside an IndexedDB transaction, returning a Promise.
 *
 * Replaces the repeated `open() → new Promise → tx → resolve/reject` pattern
 * that previously appeared 20+ times in storage.ts.
 */
export function runTx<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => IDBRequest<T> | void,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeNames, mode);
        const result = fn(tx);
        tx.oncomplete = () => resolve(result ? result.result : (undefined as T));
        tx.onerror = () => reject(tx.error);
      }),
  );
}

/** Reset the DB connection (used by clearAll). */
export function resetConnection(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
