import AsyncStorage from '@react-native-async-storage/async-storage';
import { UploadQueueItem, UploadStatus } from '../types/camera';
import { telegramService } from './telegramService';
import { fileService } from './fileService';
import { mediaOptimizationService } from './mediaOptimizationService';
import { settingsService } from './settingsService';

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
      error_message: null,
      created_at: now,
      updated_at: now,
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
    if (isProcessing) {
      console.log('Upload queue is already processing.');
      return;
    }

    isProcessing = true;
    console.log('Started processing upload queue...');

    try {
      while (true) {
        const queue = await this.getUploadQueue();
        const pendingItem = queue.find(item => item.status === 'pending');
        
        if (!pendingItem) {
          console.log('No pending items found in queue.');
          break;
        }

        const itemId = pendingItem.id;
        console.log(`Processing item ${itemId}: ${pendingItem.file_name}`);

        try {
          // 1. Staged progress: Preparing/Optimizing (0% - 20%)
          await this.updateUploadQueueItem(itemId, { status: 'uploading', progress: 5 });

          const settings = await settingsService.getSettings();
          let finalUri = pendingItem.local_uri;
          let finalSize = pendingItem.file_size;

          if (pendingItem.file_type === 'image' && settings.photoOptimization) {
            await this.updateUploadQueueItem(itemId, { progress: 10 });
            const optimized = await mediaOptimizationService.optimizeImageForUpload(pendingItem.local_uri);
            finalUri = optimized.uri;
            finalSize = optimized.fileSize;
            await this.updateUploadQueueItem(itemId, { progress: 20 });
          } else {
            await this.updateUploadQueueItem(itemId, { progress: 20 });
          }

          // Check if file size exceeds the Telegram upload limit (50 MB)
          const limitInBytes = 50 * 1024 * 1024;
          if (finalSize > limitInBytes) {
            throw new Error('File exceeds the 50 MB Telegram Bot upload limit.');
          }

          // 2. Staged progress: Uploading to Telegram (20% - 90%)
          await this.updateUploadQueueItem(itemId, { progress: 40 });
          
          const telegramResult = await telegramService.uploadToTelegram(
            finalUri,
            pendingItem.file_type,
            pendingItem.file_name,
            pendingItem.mime_type
          );

          await this.updateUploadQueueItem(itemId, { progress: 80 });

          // 3. Staged progress: Saving metadata (90% - 100%)
          await this.updateUploadQueueItem(itemId, { progress: 90 });

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

          await this.updateUploadQueueItem(itemId, { status: 'completed', progress: 100 });
          console.log(`Successfully uploaded and saved metadata for ${pendingItem.file_name}`);
        } catch (itemError: any) {
          console.error(`Failed to upload queue item ${itemId}:`, itemError);
          await this.updateUploadQueueItem(itemId, {
            status: 'failed',
            progress: 0,
            error_message: itemError.message || 'An unknown error occurred during upload.',
          });
        }
      }
    } finally {
      isProcessing = false;
      console.log('Finished processing upload queue.');
    }
  },
};

export default uploadQueueService;
