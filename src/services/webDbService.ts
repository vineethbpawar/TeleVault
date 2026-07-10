import { Platform } from 'react-native';

const DB_NAME = 'televault_large_cache';
const STORE_NAME = 'cache';

let dbPromise: Promise<IDBDatabase | null> = Promise.resolve(null);

if (Platform.OS === 'web' && typeof indexedDB !== 'undefined') {
  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        try {
          request.result.createObjectStore(STORE_NAME);
        } catch (_) {}
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        resolve(null);
      };
    } catch (_) {
      resolve(null);
    }
  });
}

export const webDbService = {
  isSupported(): boolean {
    return Platform.OS === 'web' && typeof indexedDB !== 'undefined';
  },

  async getItem(key: string): Promise<string | null> {
    const db = await dbPromise;
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  },

  async setItem(key: string, value: string): Promise<void> {
    const db = await dbPromise;
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch (_) {
        resolve();
      }
    });
  },

  async removeItem(key: string): Promise<void> {
    const db = await dbPromise;
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch (_) {
        resolve();
      }
    });
  },

  async getAllKeys(): Promise<string[]> {
    const db = await dbPromise;
    if (!db) return [];
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const req = store.getAllKeys();
        req.onsuccess = () => resolve((req.result as string[]) || []);
        req.onerror = () => resolve([]);
      } catch (_) {
        resolve([]);
      }
    });
  },

  async multiRemove(keys: string[]): Promise<void> {
    const db = await dbPromise;
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        if (keys.length === 0) {
          resolve();
          return;
        }
        let completed = 0;
        for (const key of keys) {
          const req = store.delete(key);
          req.onsuccess = req.onerror = () => {
            completed++;
            if (completed === keys.length) {
              resolve();
            }
          };
        }
      } catch (_) {
        resolve();
      }
    });
  }
};

export default webDbService;
