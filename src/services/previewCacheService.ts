import AsyncStorage from '@react-native-async-storage/async-storage';
import { telegramService } from './telegramService';
import * as FileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Platform } from 'react-native';

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
    if (file.local_uri) {
      return file.local_uri;
    }

    if (file.media_url) {
      return file.media_url;
    }

    if (file.telegram_file_id) {
      if (!forceRefresh) {
        const cached = await this.getCachedPreview(file.telegram_file_id);
        if (cached) {
          return cached;
        }
      }

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

    // 1. Image resolution
    if (fileType === 'image') {
      const localUri = file.local_uri || file.local_thumbnail_uri;
      if (localUri) {
        if (Platform.OS === 'web') {
          return {
            type: 'image',
            previewUri: localUri,
            fallbackIcon,
          };
        }
        try {
          const info = await FileSystem.getInfoAsync(localUri);
          if (info.exists) {
            return {
              type: 'image',
              previewUri: localUri,
              fallbackIcon,
            };
          }
        } catch (e) {
          console.warn('Local image check failed:', e);
        }
      }

      if (file.media_url) {
        return {
          type: 'image',
          previewUri: file.media_url,
          fallbackIcon,
        };
      }

      if (file.telegram_file_id) {
        try {
          const config = await telegramService.getTelegramConfig();
          if (!config.botToken) {
            return {
              type: 'image',
              fallbackIcon,
              error: 'Telegram config is missing.',
            };
          }
          if (!forceRefresh) {
            const cached = await this.getCachedPreview(file.telegram_file_id);
            if (cached) {
              return {
                type: 'image',
                previewUri: cached,
                fallbackIcon,
              };
            }
          }
          const fileInfo = await telegramService.getTelegramFileInfo(file.telegram_file_id);
          const url = `https://api.telegram.org/file/bot${config.botToken}/${fileInfo.file_path}`;
          await this.setCachedPreview(file.telegram_file_id, url);
          return {
            type: 'image',
            previewUri: url,
            fallbackIcon,
          };
        } catch (err: any) {
          return {
            type: 'image',
            fallbackIcon,
            error: err.message || 'Failed to fetch Telegram download link.',
          };
        }
      }
    }

    // 2. Video resolution (play source vs preview source)
    if (fileType === 'video') {
      let playableUri: string | undefined;

      // Locate video path
      if (file.local_uri) {
        if (Platform.OS === 'web') {
          playableUri = file.local_uri;
        } else {
          try {
            const info = await FileSystem.getInfoAsync(file.local_uri);
            if (info.exists) {
              playableUri = file.local_uri;
            }
          } catch (e) {}
        }
      }

      if (!playableUri && file.media_url) {
        playableUri = file.media_url;
      }

      if (!playableUri && file.telegram_file_id) {
        try {
          const config = await telegramService.getTelegramConfig();
          if (config.botToken) {
            const cached = await this.getCachedPreview(file.telegram_file_id);
            if (cached) {
              playableUri = cached;
            } else {
              const fileInfo = await telegramService.getTelegramFileInfo(file.telegram_file_id);
              const url = `https://api.telegram.org/file/bot${config.botToken}/${fileInfo.file_path}`;
              await this.setCachedPreview(file.telegram_file_id, url);
              playableUri = url;
            }
          }
        } catch (e) {
          console.warn('Failed to resolve Telegram video URL:', e);
        }
      }

      // Locate or generate thumbnail
      let previewUri: string | undefined;
      let hasLocalThumb = false;
      let hasCachedThumb = false;

      if (file.local_thumbnail_uri) {
        if (Platform.OS === 'web') {
          previewUri = file.local_thumbnail_uri;
          hasLocalThumb = true;
        } else {
          try {
            const info = await FileSystem.getInfoAsync(file.local_thumbnail_uri);
            if (info.exists) {
              previewUri = file.local_thumbnail_uri;
              hasLocalThumb = true;
            }
          } catch (e) {}
        }
      }

      if (!previewUri && file.id) {
        try {
          const cachedThumb = await AsyncStorage.getItem(`televault_vid_thumb_${file.id}`);
          if (cachedThumb) {
            if (Platform.OS === 'web') {
              previewUri = cachedThumb;
              hasCachedThumb = true;
            } else {
              const info = await FileSystem.getInfoAsync(cachedThumb);
              if (info.exists) {
                previewUri = cachedThumb;
                hasCachedThumb = true;
              }
            }
          }
        } catch (e) {}
      }

      if (__DEV__) {
        console.log(`[VIDEO_PREVIEW_DEV] Resolving: file_name=${file.file_name} file_id=${file.id} hasLocalThumb=${hasLocalThumb} hasCachedThumb=${hasCachedThumb} playableUriResolved=${!!playableUri}`);
      }

      // Generate dynamic thumbnail from video source
      if (!previewUri && playableUri) {
        try {
          if (__DEV__) {
            console.log(`[VIDEO_PREVIEW_DEV] Starting dynamic thumbnail generation for: ${file.file_name} from: ${playableUri}`);
          }
          if (Platform.OS === 'web') {
            const thumbDataUrl = await getWebVideoThumbnail(playableUri);
            previewUri = thumbDataUrl;
            if (file.id) {
              await AsyncStorage.setItem(`televault_vid_thumb_${file.id}`, thumbDataUrl);
            }
          } else {
            const thumb = await VideoThumbnails.getThumbnailAsync(playableUri, { time: 500 });
            if (thumb && thumb.uri) {
              previewUri = thumb.uri;
              if (file.id) {
                await AsyncStorage.setItem(`televault_vid_thumb_${file.id}`, thumb.uri);
              }
              if (__DEV__) {
                console.log(`[VIDEO_PREVIEW_DEV] Dynamic thumbnail generation SUCCESS: ${thumb.uri}`);
              }
            } else {
              if (__DEV__) {
                console.log(`[VIDEO_PREVIEW_DEV] Dynamic thumbnail generation FAILED: Empty response`);
              }
            }
          }
        } catch (e: any) {
          if (__DEV__) {
            console.log(`[VIDEO_PREVIEW_DEV] Dynamic thumbnail generation ERROR: name=${e.name} msg=${e.message}`);
          }
          console.warn('Dynamic video thumbnail generation failed:', e);
        }
      }

      return {
        type: 'video',
        previewUri,
        playableUri,
        fallbackIcon,
      };
    }

    // 3. Document / other resolution
    if (file.local_uri) {
      if (Platform.OS === 'web') {
        return {
          type: fileType,
          previewUri: file.local_uri,
          fallbackIcon,
        };
      }
      try {
        const info = await FileSystem.getInfoAsync(file.local_uri);
        if (info.exists) {
          return {
            type: fileType,
            previewUri: file.local_uri,
            fallbackIcon,
          };
        }
      } catch (e) {}
    }

    if (file.telegram_file_id) {
      try {
        const config = await telegramService.getTelegramConfig();
        if (config.botToken) {
          const cached = await this.getCachedPreview(file.telegram_file_id);
          if (cached) {
            return {
              type: fileType,
              previewUri: cached,
              fallbackIcon,
            };
          }
          const fileInfo = await telegramService.getTelegramFileInfo(file.telegram_file_id);
          const url = `https://api.telegram.org/file/bot${config.botToken}/${fileInfo.file_path}`;
          await this.setCachedPreview(file.telegram_file_id, url);
          return {
            type: fileType,
            previewUri: url,
            fallbackIcon,
          };
        }
      } catch (e) {}
    }

    return {
      type: fileType,
      fallbackIcon,
      error: 'Failed to resolve preview url.',
    };
  }
};

async function getWebVideoThumbnail(videoUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Document is undefined.'));
      return;
    }
    const video = document.createElement('video');
    video.src = videoUri;
    video.crossOrigin = 'anonymous';
    video.playsInline = true;
    video.muted = true;
    video.play().catch(() => {});
    video.pause();

    video.onloadeddata = () => {
      video.currentTime = 0.5;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg'));
        } else {
          reject(new Error('Failed to get 2D canvas context'));
        }
      } catch (err) {
        reject(err);
      }
    };

    video.onerror = (err) => {
      reject(err);
    };
  });
}

export default previewCacheService;
