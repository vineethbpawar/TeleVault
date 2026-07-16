import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { uploadStore } from './uploadStore';
import { UploadQueueItem, UploadStatus } from '../types/camera';
import { telegramService } from '../services/telegramService';
import { fileService } from '../services/fileService';
import { mediaOptimizationService } from '../services/mediaOptimizationService';
import { settingsService } from '../services/settingsService';
import { largeFileService, NORMAL_TELEGRAM_LIMIT_BYTES } from '../services/largeFileService';
import { getWebBlob, deleteWebBlob } from '../services/webBlobStore';
import { activeControllers, activeNativeTasks, activeUploadRegistry } from '../services/activeUploadRegistry';
import { queueProcessorRegistry } from '../services/queueProcessorRegistry';
import { networkService } from '../services/networkService';
import { supabase } from '../lib/supabase';

let isRecovered = false;
let isProcessingQueue = false;

// Register the modular queue processor in the global registry
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
    console.log(`[QueueService] Pausing upload item: ${id}`);
    activeUploadRegistry.abortUpload(id);

    const task = activeNativeTasks.get(id);
    if (task) {
      try {
        await task.cancelAsync();
      } catch (_) {}
      activeUploadRegistry.unregisterNativeUploadTask(id);
    }

    await uploadStore.updateUploadQueueItem(id, {
      status: 'paused',
      stage: 'Paused',
    });
  },

  async resumeUpload(id: string): Promise<void> {
    console.log(`[QueueService] Resuming upload item: ${id}`);
    await uploadStore.updateUploadQueueItem(id, {
      status: 'pending',
      stage: 'Queued',
      progress: 0,
      retry_count: 0,
    });
    this.processUploadQueue().catch(err => {
      console.error('[QueueService] Trigger queue on resume failed:', err);
    });
  },

  async cancelUpload(id: string): Promise<void> {
    console.log(`[QueueService] Cancelling upload item: ${id}`);
    activeUploadRegistry.abortUpload(id);

    const task = activeNativeTasks.get(id);
    if (task) {
      try {
        await task.cancelAsync();
      } catch (_) {}
      activeUploadRegistry.unregisterNativeUploadTask(id);
    }

    await uploadStore.removeUploadQueueItem(id);
  },

  // State delegation to central upload store
  async getUploadQueue(): Promise<UploadQueueItem[]> {
    return uploadStore.getUploadQueue();
  },

  async saveUploadQueue(queue: UploadQueueItem[]): Promise<void> {
    return uploadStore.saveUploadQueue(queue);
  },

  async addToUploadQueue(itemData: any): Promise<UploadQueueItem> {
    const newItem = await uploadStore.addToUploadQueue(itemData);
    this.processUploadQueue().catch(err => {
      console.error('[QueueService] Async processor kickoff failed:', err);
    });
    return newItem;
  },

  async updateUploadQueueItem(id: string, updates: Partial<UploadQueueItem>): Promise<void> {
    return uploadStore.updateUploadQueueItem(id, updates);
  },

  async removeUploadQueueItem(id: string): Promise<void> {
    return uploadStore.removeUploadQueueItem(id);
  },

  async clearCompletedUploads(): Promise<void> {
    return uploadStore.clearCompletedUploads();
  },

  async retryFailedUpload(id: string): Promise<void> {
    await uploadStore.retryFailedUpload(id);
    this.processUploadQueue().catch(err => {
      console.error('[QueueService] Async retry kickoff failed:', err);
    });
  },

  subscribeToQueue(listener: (queue: UploadQueueItem[]) => void): () => void {
    return uploadStore.subscribeToQueue(listener);
  },

  async notifyListeners(): Promise<void> {
    return uploadStore.notifyListeners();
  },

  async recoverUploadQueue(): Promise<void> {
    return uploadStore.recoverUploadQueue();
  },

  async getUploadLogs(): Promise<UploadQueueItem[]> {
    return uploadStore.getUploadLogs();
  },

  async clearUploadLogs(): Promise<void> {
    return uploadStore.clearUploadLogs();
  },

  // Main Upload Queue Dispatcher Loop
  async processUploadQueue(): Promise<void> {
    if (isProcessingQueue) {
      console.log('[QueueService] Queue processor is already running. Exiting.');
      return;
    }

    isProcessingQueue = true;
    try {
      if (!isRecovered) {
        isRecovered = true;
        await this.recoverUploadQueue();
      }

      // Connectivity verification check
      const online = await networkService.isOnline();
      if (!online) {
        console.log('[QueueService] Network is offline. Postponing upload queue processing.');
        return;
      }

      // Check if user is authenticated in Supabase before starting processing
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.user) {
        console.log('[QueueService] User session not restored yet. Postponing upload queue processing.');
        return;
      }

      const settings = await settingsService.getSettings();
      const maxConcurrency = settings.uploadMode === 'Fast' ? 2 : 1;

      const queue = await this.getUploadQueue();
      const activeItems = queue.filter(item => item.status === 'uploading' || item.status === ('processing' as any));
      let activeCount = activeItems.length;

      if (activeCount >= maxConcurrency) {
        console.log(`[QueueService] Concurrency limit active: ${activeCount}/${maxConcurrency}`);
        return;
      }

      const pendingItems = queue.filter(item => item.status === 'pending');
      if (pendingItems.length === 0) {
        console.log('[QueueService] No pending items in queue.');
        return;
      }

      for (const pendingItem of pendingItems) {
        if (activeCount >= maxConcurrency) {
          break;
        }

        // Concurrency protection: do not parallelize chunked large file uploads
        if (pendingItem.upload_mode === 'chunked' && activeCount > 0) {
          continue;
        }

        // Physical file check for native platforms to prevent stalls on cleared cache items
        if (Platform.OS !== 'web') {
          try {
            const fileCheck = await FileSystem.getInfoAsync(pendingItem.local_uri);
            if (!fileCheck.exists) {
              console.warn(`[QueueService] Physical file does not exist for: ${pendingItem.file_name}. Flagging as unrecoverable.`);
              await this.updateUploadQueueItem(pendingItem.id, {
                status: 'failed',
                stage: 'File Not Found (Unrecoverable)',
                error_message: 'The cached local media file is missing on this device.',
              });
              continue;
            }
          } catch (fileError) {
            console.error('[QueueService] File validation check failed:', fileError);
          }
        }

        activeCount++;
        
        // Isolated Try-Catch Transaction Loop
        try {
          await this.processQueueItem(pendingItem);
        } catch (itemError: any) {
          console.error(`[QueueService] Isolated upload transaction failed for item: ${pendingItem.file_name}`, itemError);
          await this.updateUploadQueueItem(pendingItem.id, {
            status: 'failed',
            stage: 'Failed',
            error_message: itemError.message || String(itemError),
          });
        } finally {
          activeCount--;
        }
      }
    } finally {
      isProcessingQueue = false;
    }
  },

  // Process a single queue item step-by-step
  async processQueueItem(pendingItem: UploadQueueItem): Promise<void> {
    const itemId = pendingItem.id;
    console.log(`[QueueService] Processing queue item: ${pendingItem.file_name}`);

    // Safeguard check: If the file is already uploaded in Supabase, skip duplicate Telegram upload
    // Self-healing check: If the file record no longer exists in Supabase (deleted by user), remove from queue!
    if (pendingItem.db_file_id) {
      try {
        const { data: dbFile, error: dbError } = await supabase
          .from('files')
          .select('telegram_file_id')
          .eq('id', pendingItem.db_file_id)
          .maybeSingle();

        if (!dbFile || dbError) {
          console.log(`[QueueService] File ${pendingItem.file_name} no longer exists in database (deleted). Removing from queue.`);
          await this.removeUploadQueueItem(itemId);
          return;
        }

        if (dbFile.telegram_file_id) {
          console.log(`[QueueService] File ${pendingItem.file_name} is already uploaded in Supabase. Skipping duplicate Telegram upload.`);
          await this.updateUploadQueueItem(itemId, {
            status: 'completed',
            stage: 'Completed',
            progress: 100,
          });
          return;
        }
      } catch (err) {
        console.warn('[QueueService] Pre-upload database check failed:', err);
      }
    }

    let tempEncryptedUri: string | null = null;
    const controller = new AbortController();
    activeUploadRegistry.registerAbortController(itemId, controller);

    try {
      // 1. Queue initialization
      await this.updateUploadQueueItem(itemId, { status: 'uploading', stage: 'Preparing', progress: 5 });

      const settings = await settingsService.getSettings();
      let finalUri = pendingItem.local_uri;
      let finalSize = pendingItem.file_size;

      // 2. Optimization stage
      if (pendingItem.file_type === 'image' && settings.photoOptimization) {
        await this.updateUploadQueueItem(itemId, {
          status: 'processing' as UploadStatus,
          stage: 'Optimizing photo...',
          progress: 10
        });
        const maxWidth = settings.maxPhotoWidth || 1600;
        const quality = settings.jpegQuality || 0.75;
        const optimized = await mediaOptimizationService.optimizeImageForUpload(pendingItem.local_uri, maxWidth, quality);
        finalUri = optimized.uri;
        finalSize = optimized.fileSize;
        await this.updateUploadQueueItem(itemId, { stage: 'Optimizing photo...', progress: 25 });
      } else {
        await this.updateUploadQueueItem(itemId, { progress: 25 });
      }

      // Determine size from web blobs or local filesystem
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
            console.warn('[QueueService] Failed to calculate size on Web:', err);
          }
        }
      } else {
        const fileInfo = await FileSystem.getInfoAsync(finalUri);
        if (fileInfo.exists) {
          finalSize = fileInfo.size;
        }
      }

      // 3. Client-side Zero-Knowledge E2EE Encryption
      if (pendingItem.is_private) {
        await this.updateUploadQueueItem(itemId, {
          status: 'processing' as UploadStatus,
          stage: 'Encrypting...',
          progress: 30
        });
        const { encryptionService } = require('../services/encryptionService');
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

      // 4. Large Chunked Upload Delegation
      if (finalSize > NORMAL_TELEGRAM_LIMIT_BYTES || pendingItem.upload_mode === 'chunked') {
        let largeFileId = pendingItem.large_file_id;
        const { CHUNK_SIZE_BYTES } = require('../services/largeFileService');

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

        await this.updateUploadQueueItem(itemId, { status: 'uploading' });

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
        console.log(`[QueueService] Successfully completed chunked upload: ${pendingItem.file_name}`);
        return;
      }

      // Verify file limit threshold for single Telegram Bot API uploads (50 MB limit)
      const maxTelegramLimit = 50 * 1024 * 1024;
      if (finalSize > maxTelegramLimit) {
        throw new Error('File exceeds the 50 MB Telegram Bot upload limit.');
      }

      // 5. Normal Telegram Media Upload stage
      await this.updateUploadQueueItem(itemId, { status: 'uploading', stage: 'Uploading...', progress: 40 });

      const telegramResult = await telegramService.uploadToTelegram(
        finalUri,
        pendingItem.file_type,
        pendingItem.file_name,
        pendingItem.mime_type,
        async (percent) => {
          const mappedProgress = Math.round(40 + (percent / 100) * 45);
          await this.updateUploadQueueItem(itemId, { progress: mappedProgress, stage: 'Uploading...' });
        },
        controller.signal,
        itemId
      );

      await this.updateUploadQueueItem(itemId, { stage: 'Uploading...', progress: 85 });

      // 6. Supabase DB metadata synchronization
      await this.updateUploadQueueItem(itemId, {
        status: 'processing' as UploadStatus,
        stage: 'Saving metadata...',
        progress: 90
      });

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

      await this.updateUploadQueueItem(itemId, { status: 'completed', stage: 'Completed (Single File)', progress: 100 });
      
      if (Platform.OS === 'web') {
        await deleteWebBlob(itemId);
        await deleteWebBlob(`thumb_${itemId}`);
      }
      console.log(`[QueueService] Successfully completed upload: ${pendingItem.file_name}`);
    } catch (err: any) {
      console.error(`[QueueService] Item processing error on ${pendingItem.file_name}:`, err);
      
      let errorText = err.message || 'An unknown error occurred';
      if (controller.signal.aborted) {
        errorText = 'Upload cancelled by user';
      }

      await this.updateUploadQueueItem(itemId, {
        status: 'failed',
        stage: 'Failed',
        error_message: errorText,
      });
      throw err;
    } finally {
      activeUploadRegistry.unregisterAbortController(itemId);
      
      // Cleanup temporary native encrypted files
      if (tempEncryptedUri) {
        try {
          await FileSystem.deleteAsync(tempEncryptedUri, { idempotent: true });
        } catch (_) {}
      }
    }
  }
};
export default uploadQueueService;
