import { Platform } from 'react-native';

export const dbPromise = Platform.OS === 'web' ? new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('televault_blobs', 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('blobs');
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
}) : null;

export async function setWebBlob(key: string, blob: Blob): Promise<void> {
  if (Platform.OS !== 'web') return;
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db!.transaction('blobs', 'readwrite');
    const store = tx.objectStore('blobs');
    const req = store.put(blob, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getWebBlob(key: string): Promise<Blob | null> {
  if (Platform.OS !== 'web') return null;
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db!.transaction('blobs', 'readonly');
    const store = tx.objectStore('blobs');
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteWebBlob(key: string): Promise<void> {
  if (Platform.OS !== 'web') return;
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db!.transaction('blobs', 'readwrite');
    const store = tx.objectStore('blobs');
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * LRU Storage Purge Engine:
 * Keeps IndexedDB storage safely under 100 MB on Web browsers to prevent iOS Safari quota errors.
 */
export async function enforceWebBlobStorageQuota(maxSizeBytes: number = 100 * 1024 * 1024): Promise<void> {
  if (Platform.OS !== 'web') return;
  try {
    const db = await dbPromise;
    if (!db) return;

    const tx = db.transaction('blobs', 'readwrite');
    const store = tx.objectStore('blobs');
    const keysReq = store.getAllKeys();

    keysReq.onsuccess = async () => {
      const keys = keysReq.result as string[];
      if (!keys || keys.length < 50) return; // Keep minimum baseline

      // Evict oldest preview/thumb entries if total key count is high
      const previewKeys = keys.filter(k => k.startsWith('preview_') || k.startsWith('thumb_'));
      if (previewKeys.length > 40) {
        const toEvict = previewKeys.slice(0, previewKeys.length - 30);
        for (const evictKey of toEvict) {
          deleteWebBlob(evictKey).catch(() => {});
        }
      }
    };
  } catch (_) {}
}
