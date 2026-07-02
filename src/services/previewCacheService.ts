import AsyncStorage from '@react-native-async-storage/async-storage';
import { telegramService } from './telegramService';
import * as FileSystem from 'expo-file-system/legacy';

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
  },

  async resolveFilePreview(
    file: {
      id: string;
      file_name: string;
      file_type: 'image' | 'video' | 'document' | 'unknown';
      mime_type?: string | null;
      local_uri?: string | null;
      local_thumbnail_uri?: string | null;
      media_url?: string | null;
      telegram_file_id?: string | null;
    },
    forceRefresh = false
  ): Promise<{
    type: 'image' | 'video' | 'document' | 'unknown';
    previewUri?: string;
    playableUri?: string;
    fallbackIcon: string;
    error?: string;
  }> {
    const fileType = file.file_type || 'unknown';
    const fallbackIcon = fileType === 'image' ? 'image' : fileType === 'video' ? 'video' : 'document';

    // 1. If local_uri exists and exists locally, use it
    const localUri = file.local_uri || file.local_thumbnail_uri;
    if (localUri) {
      try {
        const info = await FileSystem.getInfoAsync(localUri);
        if (info.exists) {
          return {
            type: fileType,
            previewUri: localUri,
            playableUri: fileType === 'video' ? localUri : undefined,
            fallbackIcon,
          };
        }
      } catch (e) {
        console.warn('Local uri existence check failed:', e);
      }
    }

    // 2. If media_url exists, use it
    if (file.media_url) {
      return {
        type: fileType,
        previewUri: file.media_url,
        playableUri: fileType === 'video' ? file.media_url : undefined,
        fallbackIcon,
      };
    }

    // 3. If telegram_file_id exists
    if (file.telegram_file_id) {
      if (__DEV__) {
        console.log(`file_name: ${file.file_name}`);
        console.log(`telegram_file_id exists: yes`);
      }
      try {
        const config = await telegramService.getTelegramConfig();
        if (!config.botToken) {
          if (__DEV__) {
            console.log(`getFile success/failure: failure (no bot token)`);
            console.log(`file_path: none`);
            console.log(`final URL exists: no`);
          }
          return {
            type: fileType,
            fallbackIcon,
            error: 'Telegram config is missing (bot token not set).',
          };
        }

        if (!forceRefresh) {
          const cached = await this.getCachedPreview(file.telegram_file_id);
          if (cached) {
            if (__DEV__) {
              console.log(`getFile success/failure: cached`);
              console.log(`file_path: cached`);
              console.log(`final URL exists: yes`);
            }
            return {
              type: fileType,
              previewUri: cached,
              playableUri: fileType === 'video' ? cached : undefined,
              fallbackIcon,
            };
          }
        }

        // If missing, expired, or forced, fetch from Telegram getFile API
        const fileInfo = await telegramService.getTelegramFileInfo(file.telegram_file_id);
        const filePath = fileInfo.file_path;
        const url = `https://api.telegram.org/file/bot${config.botToken}/${filePath}`;
        
        if (__DEV__) {
          console.log(`getFile success/failure: success`);
          console.log(`file_path: ${filePath}`);
          console.log(`final URL exists: yes`);
        }

        if (url) {
          await this.setCachedPreview(file.telegram_file_id, url);
          return {
            type: fileType,
            previewUri: url,
            playableUri: fileType === 'video' ? url : undefined,
            fallbackIcon,
          };
        }
      } catch (err: any) {
        if (__DEV__) {
          console.log(`getFile success/failure: failure`);
          console.log(`file_path: none`);
          console.log(`final URL exists: no`);
          console.error(`Failed to resolve Telegram URL for file ${file.id}:`, err);
        }
        return {
          type: fileType,
          fallbackIcon,
          error: err.message || 'Failed to fetch Telegram download link.',
        };
      }
    } else {
      if (__DEV__) {
        console.log(`file_name: ${file.file_name}`);
        console.log(`telegram_file_id exists: no`);
      }
    }

    // 4. Fallback when nothing works
    return {
      type: fileType,
      fallbackIcon,
      error: !file.telegram_file_id ? 'Telegram file ID is missing.' : 'Failed to resolve preview url.',
    };
  }
};

export default previewCacheService;
