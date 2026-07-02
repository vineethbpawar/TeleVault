import AsyncStorage from '@react-native-async-storage/async-storage';
import { telegramService } from './telegramService';

const CACHE_PREFIX = 'televault_preview_';
const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour expiry for Telegram getFile URLs

export const previewCacheService = {
  async getCachedPreview(fileId: string): Promise<string | null> {
    try {
      const stored = await AsyncStorage.getItem(CACHE_PREFIX + fileId);
      if (!stored) return null;

      const { url, timestamp } = JSON.parse(stored);
      if (Date.now() - timestamp > CACHE_EXPIRY_MS) {
        // Expired
        await AsyncStorage.removeItem(CACHE_PREFIX + fileId);
        return null;
      }
      return url;
    } catch (err) {
      console.error('Failed to get cached preview:', err);
      return null;
    }
  },

  async setCachedPreview(fileId: string, url: string): Promise<void> {
    try {
      const entry = {
        url,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(CACHE_PREFIX + fileId, JSON.stringify(entry));
    } catch (err) {
      console.error('Failed to set cached preview:', err);
    }
  },

  async clearPreviewCache(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const previewKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
      if (previewKeys.length > 0) {
        await AsyncStorage.multiRemove(previewKeys);
      }
    } catch (err) {
      console.error('Failed to clear preview cache:', err);
    }
  },

  async resolvePreviewForFile(
    file: {
      id: string;
      local_uri?: string | null;
      media_url?: string | null;
      telegram_file_id?: string | null;
    },
    forceRefresh = false
  ): Promise<string | null> {
    // 1. If file has local_uri, use it
    if (file.local_uri) {
      return file.local_uri;
    }

    // 2. Else if it has media_url, use it
    if (file.media_url) {
      return file.media_url;
    }

    // 3. Else if it has telegram_file_id, try cache first (unless forceRefresh is true)
    if (file.telegram_file_id) {
      if (!forceRefresh) {
        const cached = await this.getCachedPreview(file.telegram_file_id);
        if (cached) {
          return cached;
        }
      }

      // If missing, expired, or forced, fetch from Telegram getFile API
      try {
        const url = await telegramService.getTelegramFileDownloadUrl(file.telegram_file_id);
        if (url) {
          await this.setCachedPreview(file.telegram_file_id, url);
          return url;
        }
      } catch (err) {
        console.error(`Failed to resolve Telegram URL for file ${file.id}:`, err);
      }
    }

    return null;
  }
};

export default previewCacheService;
