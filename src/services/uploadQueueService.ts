import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { UploadQueueItem } from '../types/camera';
import { telegramService } from './telegramService';
import { fileService } from './fileService';
import { mediaOptimizationService } from './mediaOptimizationService';
import { settingsService } from './settingsService';
import { largeFileService, NORMAL_TELEGRAM_LIMIT_BYTES } from './largeFileService';
import { dbPromise, getWebBlob, setWebBlob, deleteWebBlob } from './webBlobStore';
import { activeControllers, activeNativeTasks, activeUploadRegistry } from './activeUploadRegistry';
import { queueStore } from './queueStore';
import { queueProcessorRegistry } from './queueProcessorRegistry';

let isRecovered = false;

export { dbPromise, getWebBlob, setWebBlob, deleteWebBlob };
export { activeControllers, activeNativeTasks };

// Register the queue processor callback in the registry so other services can trigger it
queueProcessorRegistry.registerQueueProcessor(async () => {
  await uploadQueueService.processUploadQueue();
});

export const uploadQueueService = {
  activeControllers,
  activeNativeTasks,

  registerNativeUploadTask(itemId: string, task: any) {
    activeUploadRegistry.registerNativeUploadTask(itemId, task);
  },

  unregisterNativeUploadTask(itemId: string) {
    activeUploadRegistry.unregisterNativeUploadTask(itemId);
  },

  async pauseUpload(id: string): Promise<void> {
    console.log(`[Queue] Pausing upload: ${id}`);
    activeUploadRegistry.abortUpload(id);

    const task = activeNativeTasks.get(id);
    if (task) {
      try {
        await task.cancelAsync();
      } catch (_) {}
      activeUploadRegistry.unregisterNativeUploadTask(id);
    }

    await queueStore.updateUploadQueueItem(id, {
      status: 'paused',
      stage: 'Paused',
    });
  },

  async resumeUpload(id: string): Promise<void> {
    console.log(`[Queue] Resuming upload: ${id}`);
    await queueStore.updateUploadQueueItem(id, {
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
    activeUploadRegistry.abortUpload(id);

    const task = activeNativeTasks.get(id);
    if (task) {
      try {
        await task.cancelAsync();
      } catch (_) {}
      activeUploadRegistry.unregisterNativeUploadTask(id);
    }

    await queueStore.removeUploadQueueItem(id);
  },

  // Delegate storage methods to queueStore
  async getUploadQueue(): Promise<UploadQueueItem[]> {
    return queueStore.getUploadQueue();
  },

  async saveUploadQueue(queue: UploadQueueItem[]): Promise<void> {
    return queueStore.saveUploadQueue(queue);
  },

  async addToUploadQueue(itemData: any): Promise<UploadQueueItem> {
    const newItem = await queueStore.addToUploadQueue(itemData);
    this.processUploadQueue().catch(err => {
      console.error('Asynchronous queue processing error:', err);
    });
    return newItem;
  },

  async updateUploadQueueItem(id: string, updates: Partial<UploadQueueItem>): Promise<void> {
    return queueStore.updateUploadQueueItem(id, updates);
  },

  async removeUploadQueueItem(id: string): Promise<void> {
    return queueStore.removeUploadQueueItem(id);
  },

  async clearCompletedUploads(): Promise<void> {
    return queueStore.clearCompletedUploads();
  },

  async retryFailedUpload(id: string): Promise<void> {
    await queueStore.retryFailedUpload(id);
    this.processUploadQueue().catch(err => {
      console.error('Asynchronous retry error:', err);
    });
  },

  subscribeToQueue(listener: (queue: UploadQueueItem[]) => void): () => void {
    return queueStore.subscribeToQueue(listener);
  },

  async notifyListeners(): Promise<void> {
    return queueStore.notifyListeners();
  },

  async recoverUploadQueue(): Promise<void> {
    return queueStore.recoverUploadQueue();
  },

  async processUploadQueue(): Promise<void> {
    if (!isRecovered) {
      isRecovered = true;
      await this.recoverUploadQueue();
    }

    const settings = await settingsService.getSettings();
    const maxConcurrency = settings.uploadMode === 'Fast' ? 2 : 1;

    const queue = await this.getUploadQueue();
    const activeItems = queue.filter(item => item.status === 'uploading');
    let activeCount = activeItems.length;

    if (activeCount >= maxConcurrency) {
      console.log(`Upload queue is already processing at concurrency: ${activeCount}/${maxConcurrency}`);
      return;
    }

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
      this.processQueueItem(pendingItem).finally(() => {
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
    activeUploadRegistry.registerAbortController(itemId, controller);

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
      activeUploadRegistry.unregisterAbortController(itemId);

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
      activeUploadRegistry.unregisterAbortController(itemId);
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
