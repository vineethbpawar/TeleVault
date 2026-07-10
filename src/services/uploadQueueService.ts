import AsyncStorage from '@react-native-async-storage/async-storage';
import { UploadQueueItem, UploadStatus } from '../types/camera';
import { telegramService } from './telegramService';
import { fileService } from './fileService';
import { mediaOptimizationService } from './mediaOptimizationService';
import { settingsService } from './settingsService';
import { largeFileService, NORMAL_TELEGRAM_LIMIT_BYTES } from './largeFileService';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const QUEUE_STORAGE_KEY = 'televault_upload_queue';
let isProcessing = false;
let isRecovered = false;
const activeControllers = new Map<string, AbortController>();
const activeNativeTasks = new Map<string, any>();

type QueueListener = (queue: UploadQueueItem[]) => void;
let listeners: QueueListener[] = [];

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

export const uploadQueueService = {
  activeNativeTasks,
  activeControllers,

  registerNativeUploadTask(itemId: string, task: any) {
    activeNativeTasks.set(itemId, task);
  },

  unregisterNativeUploadTask(itemId: string) {
    activeNativeTasks.delete(itemId);
  },

  async pauseUpload(id: string): Promise<void> {
    console.log(`[Queue] Pausing upload: ${id}`);
    const controller = activeControllers.get(id);
    if (controller) {
      controller.abort();
      activeControllers.delete(id);
    }

    const task = activeNativeTasks.get(id);
    if (task) {
      try {
        await task.cancelAsync();
      } catch (_) {}
      activeNativeTasks.delete(id);
    }

    await this.updateUploadQueueItem(id, {
      status: 'paused',
      stage: 'Paused',
    });
  },

  async resumeUpload(id: string): Promise<void> {
    console.log(`[Queue] Resuming upload: ${id}`);
    await this.updateUploadQueueItem(id, {
      status: 'pending',
      stage: 'Queued',
      progress: 0,
      retry_count: 0, // Reset retry count on manual resume
    });
    this.processUploadQueue().catch(err => {
      console.error('Failed to trigger queue on resume:', err);
    });
  },

  async cancelUpload(id: string): Promise<void> {
    console.log(`[Queue] Cancelling upload: ${id}`);
    const controller = activeControllers.get(id);
    if (controller) {
      controller.abort();
      activeControllers.delete(id);
    }

    const task = activeNativeTasks.get(id);
    if (task) {
      try {
        await task.cancelAsync();
      } catch (_) {}
      activeNativeTasks.delete(id);
    }

    await this.removeUploadQueueItem(id);
  },

  async recoverUploadQueue(): Promise<void> {
    console.log('[Queue] Running upload queue recovery check...');
    try {
      const queue = await this.getUploadQueue();
      let changed = false;
      const recovered = queue.map(item => {
        if (item.status === 'uploading') {
          changed = true;
          return {
            ...item,
            status: 'pending' as const,
            stage: 'Recovered',
            progress: 0,
          };
        }
        return item;
      });

      if (changed) {
        await this.saveUploadQueue(recovered);
        await this.notifyListeners();
      }
    } catch (err) {
      console.error('Queue recovery failed:', err);
    }
  },

  subscribeToQueue(listener: QueueListener): () => void {
    listeners.push(listener);
    // Initial call
    this.getUploadQueue().then(queue => listener(queue));
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  },

  async notifyListeners(): Promise<void> {
    const queue = await this.getUploadQueue();
    listeners.forEach(listener => {
      try {
        listener(queue);
      } catch (err) {
        console.error('Error in queue listener:', err);
      }
    });
  },

  async getUploadQueue(): Promise<UploadQueueItem[]> {
    try {
      const stored = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
      return [];
    } catch (error) {
      console.error('Failed to read upload queue:', error);
      return [];
    }
  },

  async saveUploadQueue(queue: UploadQueueItem[]): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    } catch (error) {
      console.error('Failed to save upload queue:', error);
    }
  },

  async addToUploadQueue(itemData: {
    local_uri: string;
    file_name: string;
    file_type: 'image' | 'video' | 'document';
    mime_type: string;
    file_size: number;
    destination: 'memories' | 'drive' | 'private';
    folder_id: string | null;
    is_private: boolean;
    is_drive_file: boolean;
    overlay_metadata: any | null;
    local_thumbnail_uri?: string | null;
    db_file_id?: string | null;
  }): Promise<UploadQueueItem> {
    const queue = await this.getUploadQueue();
    const now = new Date().toISOString();
    
    const uploadMode = itemData.file_size > NORMAL_TELEGRAM_LIMIT_BYTES ? 'chunked' : 'normal';

    const newItem: UploadQueueItem = {
      id: Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
      local_uri: itemData.local_uri,
      file_name: itemData.file_name,
      file_type: itemData.file_type,
      mime_type: itemData.mime_type,
      file_size: itemData.file_size,
      destination: itemData.destination,
      folder_id: itemData.folder_id,
      is_private: itemData.is_private,
      is_drive_file: itemData.is_drive_file,
      overlay_metadata: itemData.overlay_metadata,
      status: 'pending',
      progress: 0,
      stage: 'Queued',
      error_message: null,
      created_at: now,
      updated_at: now,
      upload_mode: uploadMode,
      large_file_id: null,
      local_thumbnail_uri: itemData.local_thumbnail_uri || null,
      db_file_id: itemData.db_file_id || null,
    };

    queue.push(newItem);
    await this.saveUploadQueue(queue);
    await this.notifyListeners();
    
    // Start processing asynchronously
    this.processUploadQueue().catch(err => {
      console.error('Asynchronous queue processing error:', err);
    });

    return newItem;
  },

  async updateUploadQueueItem(id: string, updates: Partial<UploadQueueItem>): Promise<void> {
    const queue = await this.getUploadQueue();
    const index = queue.findIndex(item => item.id === id);
    if (index !== -1) {
      queue[index] = {
        ...queue[index],
        ...updates,
        updated_at: new Date().toISOString(),
      };
      await this.saveUploadQueue(queue);
      await this.notifyListeners();
    }
  },

  async removeUploadQueueItem(id: string): Promise<void> {
    let queue = await this.getUploadQueue();
    queue = queue.filter(item => item.id !== id);
    await this.saveUploadQueue(queue);
    await this.notifyListeners();
  },

  async clearCompletedUploads(): Promise<void> {
    let queue = await this.getUploadQueue();
    queue = queue.filter(item => item.status !== 'completed');
    await this.saveUploadQueue(queue);
    await this.notifyListeners();
  },

  async retryFailedUpload(id: string): Promise<void> {
    const queue = await this.getUploadQueue();
    const index = queue.findIndex(item => item.id === id);
    if (index !== -1 && queue[index].status === 'failed') {
      queue[index].status = 'pending';
      queue[index].progress = 0;
      queue[index].stage = 'Queued';
      queue[index].error_message = null;
      queue[index].updated_at = new Date().toISOString();
      await this.saveUploadQueue(queue);
      await this.notifyListeners();
      
      // Start processing asynchronously
      this.processUploadQueue().catch(err => {
        console.error('Asynchronous retry error:', err);
      });
    }
  },

  async processUploadQueue(): Promise<void> {
    if (!isRecovered) {
      isRecovered = true;
      await this.recoverUploadQueue();
    }

    const settings = await settingsService.getSettings();
    const maxConcurrency = settings.uploadMode === 'Fast' ? 2 : 1;

    // Check current running uploads in queue to get accurate active count
    const queue = await this.getUploadQueue();
    const activeItems = queue.filter(item => item.status === 'uploading');
    let activeCount = activeItems.length;

    if (activeCount >= maxConcurrency) {
      console.log(`Upload queue is already processing at concurrency: ${activeCount}/${maxConcurrency}`);
      return;
    }

    // Find pending items to process
    const pendingItems = queue.filter(item => item.status === 'pending');
    if (pendingItems.length === 0) {
      console.log('No pending items in upload queue.');
      return;
    }

    for (const pendingItem of pendingItems) {
      if (activeCount >= maxConcurrency) {
        break;
      }

      // Do not run chunked upload in parallel with other items
      if (pendingItem.upload_mode === 'chunked' && activeCount > 0) {
        continue;
      }

      activeCount++;
      // Start processQueueItem asynchronously
      this.processQueueItem(pendingItem).finally(() => {
        // Trigger queue processing again when an item finishes
        this.processUploadQueue().catch(err => {
          console.error('Error triggered after item finish:', err);
        });
      });
    }
  },

  async processQueueItem(pendingItem: UploadQueueItem): Promise<void> {
    const itemId = pendingItem.id;
    console.log(`Starting processing for queue item: ${pendingItem.file_name}`);
    let tempEncryptedUri: string | null = null;
    const controller = new AbortController();
    activeControllers.set(itemId, controller);

    try {
      // 1. Preparing stage
      await this.updateUploadQueueItem(itemId, { status: 'uploading', stage: 'Preparing', progress: 5 });

      const settings = await settingsService.getSettings();
      let finalUri = pendingItem.local_uri;
      let finalSize = pendingItem.file_size;

      // 2. Optimizing stage (for photos only)
      if (pendingItem.file_type === 'image' && settings.photoOptimization) {
        await this.updateUploadQueueItem(itemId, { stage: 'Optimizing photo...', progress: 10 });
        const maxWidth = settings.maxPhotoWidth || 1600;
        const quality = settings.jpegQuality || 0.75;
        const optimized = await mediaOptimizationService.optimizeImageForUpload(pendingItem.local_uri, maxWidth, quality);
        finalUri = optimized.uri;
        finalSize = optimized.fileSize;
        await this.updateUploadQueueItem(itemId, { stage: 'Optimizing photo...', progress: 25 });
      } else {
        await this.updateUploadQueueItem(itemId, { progress: 25 });
      }

      // Check the actual file size from disk for final safety
      if (Platform.OS === 'web') {
        if (finalSize <= 0) {
          try {
            if (finalUri.startsWith('webblob:')) {
              const { getWebBlob } = require('./uploadQueueService');
              const key = finalUri.split(':')[1];
              const blob = await getWebBlob(key);
              finalSize = blob?.size || 0;
            } else if (finalUri.startsWith('blob:')) {
              const res = await fetch(finalUri);
              const blob = await res.blob();
              finalSize = blob.size;
            } else if (finalUri.startsWith('data:')) {
              const base64Str = finalUri.split(',')[1];
              finalSize = atob(base64Str).length;
            }
          } catch (err) {
            console.warn('Failed to calculate size in processQueueItem:', err);
          }
        }
      } else {
        const fileInfo = await FileSystem.getInfoAsync(finalUri);
        if (fileInfo.exists) {
          finalSize = fileInfo.size;
        }
      }

      // Client-side Zero-Knowledge E2EE Encryption
      if (pendingItem.is_private) {
        await this.updateUploadQueueItem(itemId, { stage: 'Encrypting...', progress: 30 });
        const { encryptionService } = require('./encryptionService');
        const encrypted = await encryptionService.encryptFile(finalUri, pendingItem.file_name);
        finalUri = encrypted.uri;
        finalSize = encrypted.size;
        if (Platform.OS !== 'web') {
          tempEncryptedUri = encrypted.uri;
        }
      }

      if (controller.signal.aborted) {
        throw new Error('Upload aborted by user');
      }

      // If it is a chunked upload, delegate to largeFileService
      if (finalSize > NORMAL_TELEGRAM_LIMIT_BYTES || pendingItem.upload_mode === 'chunked') {
        let largeFileId = pendingItem.large_file_id;
        const { CHUNK_SIZE_BYTES } = require('./largeFileService');

        if (!largeFileId) {
          largeFileId = await largeFileService.createLargeFileRecord(
            {
              size: finalSize,
              name: pendingItem.file_name,
              mimeType: pendingItem.mime_type,
              fileType: pendingItem.file_type,
            },
            pendingItem.destination,
            pendingItem.folder_id,
            pendingItem.is_private
          );
          const totalChunks = Math.ceil(finalSize / CHUNK_SIZE_BYTES);
          await largeFileService.createChunkRecords(largeFileId, totalChunks, finalSize, pendingItem.file_name);
          await this.updateUploadQueueItem(itemId, { large_file_id: largeFileId, upload_mode: 'chunked' });
        }

        await largeFileService.resumeLargeFileUpload(
          largeFileId,
          finalUri,
          async (progress) => {
            const overallProgress = Math.round(25 + (progress.progressPercent / 100) * 65);
            await this.updateUploadQueueItem(itemId, {
              progress: overallProgress,
              stage: `Uploading part ${progress.uploadedChunks}/${progress.totalChunks}`,
              chunk_progress: `Part ${progress.uploadedChunks}/${progress.totalChunks}`,
            });
          },
          controller.signal,
          itemId
        );

        await this.updateUploadQueueItem(itemId, {
          status: 'completed',
          stage: 'Completed',
          progress: 100,
          chunk_progress: undefined,
        });
        if (Platform.OS === 'web') {
          await deleteWebBlob(itemId);
          await deleteWebBlob(`thumb_${itemId}`);
        }
        console.log(`Successfully uploaded chunked file and saved metadata for ${pendingItem.file_name}`);
        return;
      }

      // Check if file size exceeds the Telegram upload limit (50 MB)
      const limitInBytes = 50 * 1024 * 1024;
      if (finalSize > limitInBytes) {
        throw new Error('File exceeds the 50 MB Telegram Bot upload limit.');
      }

      // 3. Uploading stage (25% - 90%)
      await this.updateUploadQueueItem(itemId, { stage: 'Uploading...', progress: 40 });
      
      const telegramResult = await telegramService.uploadToTelegram(
        finalUri,
        pendingItem.file_type,
        pendingItem.file_name,
        pendingItem.mime_type,
        async (percent) => {
          const mapped = Math.round(40 + (percent / 100) * 45);
          await this.updateUploadQueueItem(itemId, { progress: mapped, stage: 'Uploading...' });
        },
        controller.signal,
        itemId
      );

      await this.updateUploadQueueItem(itemId, { stage: 'Uploading...', progress: 85 });

      // 4. Saving metadata stage (90% - 100%)
      await this.updateUploadQueueItem(itemId, { stage: 'Saving metadata...', progress: 92 });

      if (pendingItem.db_file_id) {
        await fileService.updateFileMetadata(pendingItem.db_file_id, {
          telegram_message_id: telegramResult.telegramMessageId,
          telegram_file_id: telegramResult.telegramFileId,
          telegram_file_unique_id: telegramResult.telegramFileUniqueId,
          local_thumbnail_uri: pendingItem.file_type === 'image' ? finalUri : (pendingItem.local_thumbnail_uri || null),
        });
      } else {
        await fileService.saveFileMetadata({
          folder_id: pendingItem.folder_id,
          file_name: pendingItem.file_name,
          file_type: pendingItem.file_type,
          mime_type: pendingItem.mime_type,
          file_size: finalSize,
          is_private: pendingItem.is_private,
          is_drive_file: pendingItem.is_drive_file,
          telegram_message_id: telegramResult.telegramMessageId,
          telegram_file_id: telegramResult.telegramFileId,
          telegram_file_unique_id: telegramResult.telegramFileUniqueId,
          local_thumbnail_uri: pendingItem.file_type === 'image' ? finalUri : (pendingItem.local_thumbnail_uri || null),
          overlay_metadata: pendingItem.overlay_metadata,
        });
      }

      await this.updateUploadQueueItem(itemId, { status: 'completed', stage: 'Completed', progress: 100 });
      if (Platform.OS === 'web') {
        await deleteWebBlob(itemId);
        await deleteWebBlob(`thumb_${itemId}`);
      }
      console.log(`Successfully uploaded and saved metadata for ${pendingItem.file_name}`);
    } catch (itemError: any) {
      activeControllers.delete(itemId);

      // Verify current item status before flagging it as failed
      const queue = await this.getUploadQueue();
      const currentItem = queue.find(item => item.id === itemId);

      if (currentItem && currentItem.status === 'paused') {
        console.log(`[Queue] Item ${pendingItem.file_name} was paused by user.`);
        return;
      }

      if (!currentItem) {
        console.log(`[Queue] Item ${pendingItem.file_name} was cancelled/removed by user.`);
        return;
      }

      console.error(`Failed to upload queue item ${itemId}:`, itemError);
      const maxRetries = 5;
      const currentRetry = pendingItem.retry_count || 0;

      if (currentRetry < maxRetries) {
        const nextRetry = currentRetry + 1;
        const delaySec = Math.pow(2, nextRetry) * 10; // 20s, 40s, 80s, 160s, 320s
        console.log(`[Queue] Scheduling retry ${nextRetry}/${maxRetries} in ${delaySec}s for item: ${pendingItem.file_name}`);
        
        await this.updateUploadQueueItem(itemId, {
          status: 'pending',
          retry_count: nextRetry,
          last_retry_at: new Date().toISOString(),
          stage: `Retrying in ${delaySec}s...`,
          error_message: `Attempt ${currentRetry + 1} failed: ${itemError.message || 'Unknown error'}`
        });

        // Set foreground timer to trigger queue processing
        setTimeout(() => {
          this.processUploadQueue().catch(err => {
            console.error('Asynchronous retry trigger failed:', err);
          });
        }, delaySec * 1000);
      } else {
        await this.updateUploadQueueItem(itemId, {
          status: 'failed',
          stage: 'Failed',
          progress: 0,
          error_message: `Failed after ${maxRetries} attempts: ${itemError.message || 'Unknown error'}`,
        });
      }
    } finally {
      activeControllers.delete(itemId);
      if (tempEncryptedUri && Platform.OS !== 'web') {
        try {
          await FileSystem.deleteAsync(tempEncryptedUri, { idempotent: true });
        } catch (cleanupErr) {
          console.warn('[E2EE] Temporary encrypted file cleanup failed:', cleanupErr);
        }
      }
    }
  },
};

export default uploadQueueService;
