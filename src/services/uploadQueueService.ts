import AsyncStorage from '@react-native-async-storage/async-storage';
import { UploadQueueItem, UploadStatus } from '../types/camera';
import { telegramService } from './telegramService';
import { fileService } from './fileService';
import { mediaOptimizationService } from './mediaOptimizationService';
import { settingsService } from './settingsService';
import { largeFileService, NORMAL_TELEGRAM_LIMIT_BYTES } from './largeFileService';

const QUEUE_STORAGE_KEY = 'televault_upload_queue';
let isProcessing = false;

type QueueListener = (queue: UploadQueueItem[]) => void;
let listeners: QueueListener[] = [];

export const uploadQueueService = {
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

      // If it is a chunked upload, delegate to largeFileService
      if (pendingItem.upload_mode === 'chunked') {
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
          await this.updateUploadQueueItem(itemId, { large_file_id: largeFileId });
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
          }
        );

        await this.updateUploadQueueItem(itemId, {
          status: 'completed',
          stage: 'Completed',
          progress: 100,
          chunk_progress: undefined,
        });
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
        pendingItem.mime_type
      );

      await this.updateUploadQueueItem(itemId, { stage: 'Uploading...', progress: 85 });

      // 4. Saving metadata stage (90% - 100%)
      await this.updateUploadQueueItem(itemId, { stage: 'Saving metadata...', progress: 92 });

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
        local_thumbnail_uri: pendingItem.file_type === 'image' ? finalUri : null,
        overlay_metadata: pendingItem.overlay_metadata,
      });

      await this.updateUploadQueueItem(itemId, { status: 'completed', stage: 'Completed', progress: 100 });
      console.log(`Successfully uploaded and saved metadata for ${pendingItem.file_name}`);
    } catch (itemError: any) {
      console.error(`Failed to upload queue item ${itemId}:`, itemError);
      await this.updateUploadQueueItem(itemId, {
        status: 'failed',
        stage: 'Failed',
        progress: 0,
        error_message: itemError.message || 'An unknown error occurred during upload.',
      });
    }
  },
};

export default uploadQueueService;
