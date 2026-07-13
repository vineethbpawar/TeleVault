import AsyncStorage from '@react-native-async-storage/async-storage';
import { UploadQueueItem } from '../types/camera';
import { NORMAL_TELEGRAM_LIMIT_BYTES } from '../services/largeFileService';

const QUEUE_STORAGE_KEY = 'televault_upload_queue';
let listeners: ((queue: UploadQueueItem[]) => void)[] = [];

export const uploadStore = {
  async getUploadQueue(): Promise<UploadQueueItem[]> {
    try {
      const stored = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
      return [];
    } catch (error) {
      console.error('[UploadStore] Failed to read queue:', error);
      return [];
    }
  },

  async saveUploadQueue(queue: UploadQueueItem[]): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    } catch (error) {
      console.error('[UploadStore] Failed to save queue:', error);
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
    }
  },

  async getItemByLargeFileId(largeFileId: string): Promise<UploadQueueItem | undefined> {
    const queue = await this.getUploadQueue();
    return queue.find(item => item.large_file_id === largeFileId);
  },

  subscribeToQueue(listener: (queue: UploadQueueItem[]) => void): () => void {
    listeners.push(listener);
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
        console.error('[UploadStore] Error in queue listener:', err);
      }
    });
  },

  async recoverUploadQueue(): Promise<void> {
    try {
      const queue = await this.getUploadQueue();
      let changed = false;
      const recovered = queue.map(item => {
        if (item.status === 'uploading' || item.status === 'failed') {
          changed = true;
          return {
            ...item,
            status: 'pending' as const,
            stage: 'Retrying',
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
      console.error('[UploadStore] Queue recovery failed:', err);
    }
  },
};
export default uploadStore;
