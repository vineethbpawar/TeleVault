import AsyncStorage from '@react-native-async-storage/async-storage';
import { telegramService } from './telegramService';
import * as FileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Platform } from 'react-native';
import { webDbService } from './webDbService';

async function cacheGetItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return await webDbService.getItem(key);
  }
  return await AsyncStorage.getItem(key);
}

async function cacheSetItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    return await webDbService.setItem(key, value);
  }
  return await AsyncStorage.setItem(key, value);
}

class ConcurrencyQueue {
  private activeCount = 0;
  private maxConcurrency = 2;
  private queue: (() => Promise<any>)[] = [];

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.activeCount < this.maxConcurrency) {
      this.activeCount++;
      try {
        return await task();
      } finally {
        this.activeCount--;
        this.next();
      }
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const res = await task();
          resolve(res);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  private next() {
    if (this.queue.length > 0 && this.activeCount < this.maxConcurrency) {
      const nextTask = this.queue.shift();
      if (nextTask) {
        this.activeCount++;
        nextTask().finally(() => {
          this.activeCount--;
          this.next();
        });
      }
    }
  }
}

const previewQueue = new ConcurrencyQueue();
previewQueue['maxConcurrency'] = 4; // increased from 2 for faster parallel thumbnail loading

async function cacheRemoveItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    return await webDbService.removeItem(key);
  }
  return await AsyncStorage.removeItem(key);
}

async function cacheMultiRemove(keys: string[]): Promise<void> {
  if (Platform.OS === 'web') {
    return await webDbService.multiRemove(keys);
  }
  return await AsyncStorage.multiRemove(keys);
}

async function cacheGetAllKeys(): Promise<readonly string[]> {
  if (Platform.OS === 'web') {
    return await webDbService.getAllKeys();
  }
  return await AsyncStorage.getAllKeys();
}

const CACHE_PREFIX = 'televault_preview_';
const CACHE_EXPIRY_MS = 40 * 60 * 1000; // 40 minutes expiry for Telegram getFile URLs (links expire in 1 hr)

const activeResolutions = new Map<string, Promise<any>>();
const inMemoryBlobCache = new Map<string, string>();

async function resolveWebBlobUrl(webBlobUri: string): Promise<string> {
  if (!webBlobUri.startsWith('webblob:')) return webBlobUri;
  const { getWebBlob } = require('./webBlobStore');
  const key = webBlobUri.split(':')[1];
  const blob = await getWebBlob(key);
  if (blob) {
    return URL.createObjectURL(blob);
  }
  return '';
}

function isWebValidUri(uri: any): boolean {
  if (typeof uri !== 'string') return false;
  return (
    uri.startsWith('http://') ||
    uri.startsWith('https://') ||
    uri.startsWith('blob:') ||
    uri.startsWith('data:') ||
    uri.startsWith('webblob:')
  );
}

export const previewCacheService = {
  getInMemoryPreview(fileId: string): string | null {
    if (Platform.OS === 'web') {
      return inMemoryBlobCache.get(fileId) || null;
    }
    return null;
  },

  /**
   * Pre-warm the in-memory blob cache from IndexedDB for a batch of file IDs.
   * Call this early (on app start / tab focus) so MemoryItem gets instant
   * thumbnails without waiting for resolveFilePreview to run.
   */
  async prewarmFromIndexedDB(files: { id: string; telegram_file_id?: string | null }[]): Promise<void> {
    if (Platform.OS !== 'web') return;
    const { getWebBlob } = require('./webBlobStore');
    const tasks = files.map(async (file) => {
      // Skip files already in memory cache
      const cacheKey = file.id;
      if (inMemoryBlobCache.has(cacheKey)) return;

      // Try main file blob first (set by PreviewScreen on save)
      let blob: Blob | null = await getWebBlob(cacheKey).catch(() => null);

      // Fallback: preview_ prefix used by previewCacheService.setCachedPreview
      if (!blob) {
        blob = await getWebBlob('preview_' + cacheKey).catch(() => null);
      }

      // Fallback: thumbnail stored under thumb_ prefix
      if (!blob) {
        blob = await getWebBlob('thumb_' + cacheKey).catch(() => null);
      }

      if (blob) {
        const blobUrl = URL.createObjectURL(blob);
        inMemoryBlobCache.set(cacheKey, blobUrl);
        // Also index by telegram_file_id for compatibility with getCachedPreview
        if (file.telegram_file_id) {
          inMemoryBlobCache.set(file.telegram_file_id, blobUrl);
        }
      }
    });

    // Run in parallel batches of 8
    const BATCH = 8;
    for (let i = 0; i < tasks.length; i += BATCH) {
      await Promise.allSettled(tasks.slice(i, i + BATCH));
    }
  },

  async getCachedPreview(fileId: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        if (inMemoryBlobCache.has(fileId)) {
          return inMemoryBlobCache.get(fileId)!;
        }

        const { getWebBlob } = require('./webBlobStore');
        const blob = await getWebBlob('preview_' + fileId);
        if (blob) {
          const blobUrl = URL.createObjectURL(blob);
          inMemoryBlobCache.set(fileId, blobUrl);
          return blobUrl;
        }
        // Fallback to checking string cache (for legacy webblob references)
      }

      const stored = await cacheGetItem(CACHE_PREFIX + fileId);
      if (!stored) return null;

      const { url, timestamp } = JSON.parse(stored);
      if (Date.now() - timestamp > CACHE_EXPIRY_MS) {
        // Expired
        await cacheRemoveItem(CACHE_PREFIX + fileId);
        return null;
      }

      if (Platform.OS === 'web') {
        if (url && !isWebValidUri(url)) {
          // Revoke/evict transient blob URLs or native files that don't belong on Web
          await cacheRemoveItem(CACHE_PREFIX + fileId);
          return null;
        }
        if (url && url.startsWith('webblob:')) {
          const resolved = await resolveWebBlobUrl(url);
          return resolved;
        }
      } else {
        if (url && url.startsWith('file://')) {
          try {
            const info = await FileSystem.getInfoAsync(url);
            if (!info.exists) {
              await cacheRemoveItem(CACHE_PREFIX + fileId);
              return null;
            }
          } catch (_) {
            await cacheRemoveItem(CACHE_PREFIX + fileId);
            return null;
          }
        }
      }

      // Self-healing: Evict old allorigins.win URLs from cache
      if (url && url.indexOf('allorigins.win') !== -1) {
        await cacheRemoveItem(CACHE_PREFIX + fileId);
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
      if (Platform.OS === 'web') {
        if (url && url.startsWith('blob:')) {
          inMemoryBlobCache.set(fileId, url);
          const res = await fetch(url);
          const blob = await res.blob();
          const { setWebBlob } = require('./webBlobStore');
          await setWebBlob('preview_' + fileId, blob);
        }
        return;
      }

      const entry = {
        url,
        timestamp: Date.now(),
      };
      await cacheSetItem(CACHE_PREFIX + fileId, JSON.stringify(entry));
    } catch (err) {
      console.error('Failed to set cached preview:', err);
    }
  },

  async clearPreviewCache(): Promise<void> {
    try {
      const keys = await cacheGetAllKeys();
      const previewKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
      if (previewKeys.length > 0) {
        await cacheMultiRemove(previewKeys);
      }
    } catch (err) {
      console.error('Failed to clear preview cache:', err);
    }
  },

  async getCacheStats(): Promise<{ totalSize: number; count: number }> {
    try {
      const keys = await cacheGetAllKeys();
      const previewKeys = keys.filter(key => key.startsWith(CACHE_PREFIX) || key.startsWith('televault_vid_thumb_'));
      let totalSize = 0;
      for (const key of previewKeys) {
        const val = await cacheGetItem(key);
        if (val) {
          totalSize += val.length;
        }
      }
      return { totalSize, count: previewKeys.length };
    } catch (_) {
      return { totalSize: 0, count: 0 };
    }
  },

  async clearCache(): Promise<void> {
    await this.clearPreviewCache();
    try {
      const keys = await cacheGetAllKeys();
      const thumbKeys = keys.filter(key => key.startsWith('televault_vid_thumb_'));
      if (thumbKeys.length > 0) {
        await cacheMultiRemove(thumbKeys);
      }
    } catch (_) {}
  },

  async resolvePreviewForFile(
    file: {
      id: string;
      local_uri?: string | null;
      media_url?: string | null;
      telegram_file_id?: string | null;
      overlay_metadata?: any;
    },
    forceRefresh = false,
    signal?: AbortSignal
  ): Promise<string | null> {
    let resolvedLocalUri = file.local_uri || file.overlay_metadata?.local_uri;
    if (resolvedLocalUri) {
      if (Platform.OS === 'web') {
        if (!isWebValidUri(resolvedLocalUri)) {
          resolvedLocalUri = null;
        } else if (resolvedLocalUri.startsWith('webblob:')) {
          resolvedLocalUri = await resolveWebBlobUrl(resolvedLocalUri);
        }
      } else {
        if (resolvedLocalUri.startsWith('ph://') || resolvedLocalUri.startsWith('assets-library://')) {
          // Keep it
        } else {
          try {
            const info = await FileSystem.getInfoAsync(resolvedLocalUri);
            if (!info.exists) {
              resolvedLocalUri = null;
            }
          } catch (_) {
            resolvedLocalUri = null;
          }
        }
      }
      if (resolvedLocalUri) {
        return resolvedLocalUri;
      }
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
        const url = await telegramService.getTelegramFileDownloadUrl(file.telegram_file_id, signal);
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

  async resolveFilePreviewInternal(
    file: {
      id: string;
      file_name?: string;
      file_type?: 'image' | 'video' | 'document' | 'unknown';
      media_type?: 'image' | 'video';
      mime_type?: string | null;
      local_uri?: string | null;
      local_thumbnail_uri?: string | null;
      media_url?: string | null;
      telegram_file_id?: string | null;
      is_private?: boolean | null;
      is_chunked?: boolean | null;
      large_file_id?: string | null;
      overlay_metadata?: any;
    },
    forceRefresh = false,
    signal?: AbortSignal,
    onThumbnailGenerated?: (uri: string) => void
  ): Promise<{
    type: 'image' | 'video' | 'document' | 'unknown';
    previewUri?: string;
    playableUri?: string;
    fallbackIcon: string;
    error?: string;
  }> {
    const fileType = file.file_type || file.media_type || 'unknown';
    const fallbackIcon = fileType === 'image' ? 'image' : fileType === 'video' ? 'video' : 'document';
    const fileName = file.file_name || 'file';

    // 1. Image resolution
    if (fileType === 'image') {
      let resolvedLocalUri = file.local_uri || file.local_thumbnail_uri || file.overlay_metadata?.local_uri;
      if (resolvedLocalUri) {
        if (Platform.OS === 'web') {
          if (file.telegram_file_id && typeof resolvedLocalUri === 'string' && resolvedLocalUri.startsWith('blob:')) {
            resolvedLocalUri = null;
          }
        }
      }
      if (resolvedLocalUri) {
        if (Platform.OS === 'web') {
          if (!isWebValidUri(resolvedLocalUri)) {
            // Ignore native file paths on Web
          } else {
            if (typeof resolvedLocalUri === 'string' && resolvedLocalUri.startsWith('webblob:')) {
              resolvedLocalUri = await resolveWebBlobUrl(resolvedLocalUri);
            }
            if (resolvedLocalUri) {
              return {
                type: 'image',
                previewUri: resolvedLocalUri,
                fallbackIcon,
              };
            }
          }
        } else {
          if (resolvedLocalUri.startsWith('ph://') || resolvedLocalUri.startsWith('assets-library://')) {
            return {
              type: 'image',
              previewUri: resolvedLocalUri,
              fallbackIcon,
            };
          }
          try {
            const info = await FileSystem.getInfoAsync(resolvedLocalUri);
            if (info.exists) {
              return {
                type: 'image',
                previewUri: resolvedLocalUri,
                fallbackIcon,
              };
            }
          } catch (e) {
            console.warn('Local image check failed:', e);
          }
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
          const fileInfo = await telegramService.getTelegramFileInfo(file.telegram_file_id, signal);
          const url = `https://api.telegram.org/file/bot${config.botToken}/${fileInfo.file_path}`;
          
          let previewUri = url;
          if (file.is_chunked && file.large_file_id) {
            const { largeFileDownloadService } = require('./largeFileDownloadService');
            const rebuildResult = await largeFileDownloadService.downloadAndRebuildLargeFile(
              file.large_file_id,
              file.is_private,
              file.mime_type
            );
            if (rebuildResult.success && rebuildResult.localUri) {
              previewUri = rebuildResult.localUri;
            } else {
              throw new Error(rebuildResult.message || 'Failed to rebuild chunked file.');
            }
          } else if (Platform.OS === 'web') {
            if (file.is_private) {
              const { encryptionService } = require('./encryptionService');
              const proxiedUrl = `https://tele-vault-seven.vercel.app/api/telegram-proxy?url=${encodeURIComponent(url)}`;
              previewUri = await encryptionService.decryptFile(proxiedUrl, fileName, file.mime_type);
            } else {
              const downloadUrl = await telegramService.getTelegramFileDownloadUrl(file.telegram_file_id, signal);
              const res = await fetch(downloadUrl, { signal });
              const blob = await res.blob();
              previewUri = URL.createObjectURL(blob);
            }
          } else {
            if (file.is_private) {
              const { encryptionService } = require('./encryptionService');
              const tempEncPath = `${FileSystem.cacheDirectory}temp_enc_${file.id}_${fileName}`;
              await FileSystem.downloadAsync(url, tempEncPath);
              previewUri = await encryptionService.decryptFile(tempEncPath, fileName, file.mime_type);
              await FileSystem.deleteAsync(tempEncPath, { idempotent: true });
            } else {
              const localCachePath = `${FileSystem.cacheDirectory}cache_${file.id}_${fileName}`;
              await FileSystem.downloadAsync(url, localCachePath);
              previewUri = localCachePath;
            }
          }
          await this.setCachedPreview(file.telegram_file_id, previewUri);
          return {
            type: 'image',
            previewUri: previewUri,
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
      let resolvedLocalUri = file.local_uri || file.overlay_metadata?.local_uri;
      if (resolvedLocalUri) {
        if (Platform.OS === 'web') {
          if (file.telegram_file_id && typeof resolvedLocalUri === 'string' && resolvedLocalUri.startsWith('blob:')) {
            resolvedLocalUri = null;
          }
        }
      }
      if (resolvedLocalUri) {
        if (Platform.OS === 'web') {
          if (!isWebValidUri(resolvedLocalUri)) {
            // Ignore native file paths on Web
          } else {
            if (typeof resolvedLocalUri === 'string' && resolvedLocalUri.startsWith('webblob:')) {
              resolvedLocalUri = await resolveWebBlobUrl(resolvedLocalUri);
            }
            playableUri = resolvedLocalUri;
          }
        } else {
          if (resolvedLocalUri.startsWith('ph://') || resolvedLocalUri.startsWith('assets-library://')) {
            playableUri = resolvedLocalUri;
          } else {
            try {
              const info = await FileSystem.getInfoAsync(resolvedLocalUri);
              if (info.exists) {
                playableUri = resolvedLocalUri;
              }
            } catch (e) {}
          }
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
              const fileInfo = await telegramService.getTelegramFileInfo(file.telegram_file_id, signal);
              const url = `https://api.telegram.org/file/bot${config.botToken}/${fileInfo.file_path}`;
              
              if (file.is_private) {
                const { encryptionService } = require('./encryptionService');
                if (Platform.OS === 'web') {
                  const proxiedUrl = `https://tele-vault-seven.vercel.app/api/telegram-proxy?url=${encodeURIComponent(url)}`;
                  playableUri = await encryptionService.decryptFile(proxiedUrl, fileName, file.mime_type);
                } else {
                  const tempEncPath = `${FileSystem.cacheDirectory}temp_enc_${file.id}_${fileName}`;
                  await FileSystem.downloadAsync(url, tempEncPath);
                  playableUri = await encryptionService.decryptFile(tempEncPath, fileName, file.mime_type);
                  await FileSystem.deleteAsync(tempEncPath, { idempotent: true });
                }
              } else {
                if (Platform.OS === 'web') {
                  const downloadUrl = await telegramService.getTelegramFileDownloadUrl(file.telegram_file_id, signal);
                  const res = await fetch(downloadUrl, { signal });
                  const blob = await res.blob();
                  playableUri = URL.createObjectURL(blob);
                } else {
                  const localCachePath = `${FileSystem.cacheDirectory}cache_${file.id}_${fileName}`;
                  await FileSystem.downloadAsync(url, localCachePath);
                  playableUri = localCachePath;
                }
              }
              if (playableUri) {
                await this.setCachedPreview(file.telegram_file_id, playableUri);
              }
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
          if (!isWebValidUri(file.local_thumbnail_uri)) {
            // Ignore native file paths on Web
          } else {
            let thumbUri = file.local_thumbnail_uri;
            if (thumbUri.startsWith('webblob:')) {
              thumbUri = await resolveWebBlobUrl(thumbUri);
            }
            if (thumbUri) {
              previewUri = thumbUri;
              hasLocalThumb = true;
            }
          }
        } else {
          if (file.local_thumbnail_uri.startsWith('ph://') || file.local_thumbnail_uri.startsWith('assets-library://')) {
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
      }

      if (!previewUri && file.id) {
        try {
          const cachedThumb = await cacheGetItem(`televault_vid_thumb_${file.id}`);
          if (cachedThumb) {
            if (Platform.OS === 'web') {
              if (!isWebValidUri(cachedThumb)) {
                // Ignore native paths in web cache
              } else {
                let resolvedThumb = cachedThumb;
                if (resolvedThumb.startsWith('webblob:')) {
                  resolvedThumb = await resolveWebBlobUrl(resolvedThumb);
                }
                previewUri = resolvedThumb;
                hasCachedThumb = true;
              }
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
        console.log(`[VIDEO_PREVIEW_DEV] Resolving: file_name=${fileName} file_id=${file.id} hasLocalThumb=${hasLocalThumb} hasCachedThumb=${hasCachedThumb} playableUriResolved=${!!playableUri}`);
      }

      // Generate dynamic thumbnail from video source in the background
      if (!previewUri && playableUri) {
        (async () => {
          try {
            if (__DEV__) {
              console.log(`[VIDEO_PREVIEW_DEV] Starting background thumbnail generation for: ${fileName} from: ${playableUri}`);
            }
            let generatedUri: string | undefined;
            if (Platform.OS === 'web') {
              const thumbDataUrl = await getWebVideoThumbnail(playableUri!);
              if (file.id) {
                await cacheSetItem(`televault_vid_thumb_${file.id}`, thumbDataUrl);
              }
              generatedUri = thumbDataUrl;
            } else {
              const thumb = await VideoThumbnails.getThumbnailAsync(playableUri!, { time: 500 });
              if (thumb && thumb.uri) {
                if (file.id) {
                  await cacheSetItem(`televault_vid_thumb_${file.id}`, thumb.uri);
                }
                generatedUri = thumb.uri;
                if (__DEV__) {
                  console.log(`[VIDEO_PREVIEW_DEV] Thumbnail generation SUCCESS: ${thumb.uri}`);
                }
              } else {
                if (__DEV__) {
                  console.log(`[VIDEO_PREVIEW_DEV] Thumbnail generation FAILED: Empty response`);
                }
              }
            }
            if (generatedUri && onThumbnailGenerated) {
              onThumbnailGenerated(generatedUri);
            }
          } catch (e: any) {
            if (__DEV__) {
              console.log(`[VIDEO_PREVIEW_DEV] Thumbnail generation ERROR: name=${e.name} msg=${e.message}`);
            }
            console.warn('Video thumbnail generation failed:', e);
          }
        })();
      }

      return {
        type: 'video',
        previewUri,
        playableUri,
        fallbackIcon,
      };
    }

    // 3. Document / other resolution
    let resolvedLocalUri = file.local_uri || file.local_thumbnail_uri || file.overlay_metadata?.local_uri;
    if (resolvedLocalUri) {
      if (Platform.OS === 'web') {
        if (file.telegram_file_id && typeof resolvedLocalUri === 'string' && resolvedLocalUri.startsWith('blob:')) {
          resolvedLocalUri = null;
        }
      }
    }
    if (resolvedLocalUri) {
      if (Platform.OS === 'web') {
        if (!isWebValidUri(resolvedLocalUri)) {
          // Ignore native file paths on Web
        } else {
          if (typeof resolvedLocalUri === 'string' && resolvedLocalUri.startsWith('webblob:')) {
            resolvedLocalUri = await resolveWebBlobUrl(resolvedLocalUri);
          }
          if (resolvedLocalUri) {
            return {
              type: fileType,
              previewUri: resolvedLocalUri,
              fallbackIcon,
            };
          }
        }
      } else {
        if (resolvedLocalUri.startsWith('ph://') || resolvedLocalUri.startsWith('assets-library://')) {
          return {
            type: fileType,
            previewUri: resolvedLocalUri,
            fallbackIcon,
          };
        }
        try {
          const info = await FileSystem.getInfoAsync(resolvedLocalUri);
          if (info.exists) {
            return {
              type: fileType,
              previewUri: resolvedLocalUri,
              fallbackIcon,
            };
          }
        } catch (e) {}
      }
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
          const fileInfo = await telegramService.getTelegramFileInfo(file.telegram_file_id, signal);
          const url = `https://api.telegram.org/file/bot${config.botToken}/${fileInfo.file_path}`;
          
          let previewUri = url;
          if (Platform.OS === 'web') {
            if (file.is_private) {
              const { encryptionService } = require('./encryptionService');
              const proxiedUrl = `https://tele-vault-seven.vercel.app/api/telegram-proxy?url=${encodeURIComponent(url)}`;
              previewUri = await encryptionService.decryptFile(proxiedUrl, fileName, file.mime_type);
            } else {
              const downloadUrl = await telegramService.getTelegramFileDownloadUrl(file.telegram_file_id, signal);
              const res = await fetch(downloadUrl, { signal });
              const blob = await res.blob();
              previewUri = URL.createObjectURL(blob);
            }
          } else {
            if (file.is_private) {
              const { encryptionService } = require('./encryptionService');
              const tempEncPath = `${FileSystem.cacheDirectory}temp_enc_${file.id}_${fileName}`;
              await FileSystem.downloadAsync(url, tempEncPath);
              previewUri = await encryptionService.decryptFile(tempEncPath, fileName, file.mime_type);
              await FileSystem.deleteAsync(tempEncPath, { idempotent: true });
            } else {
              const localCachePath = `${FileSystem.cacheDirectory}cache_${file.id}_${fileName}`;
              await FileSystem.downloadAsync(url, localCachePath);
              previewUri = localCachePath;
            }
          }
          await this.setCachedPreview(file.telegram_file_id, previewUri);
          return {
            type: fileType,
            previewUri: previewUri,
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
  },

  async resolveFilePreview(
    file: {
      id: string;
      file_name?: string;
      file_type?: 'image' | 'video' | 'document' | 'unknown';
      media_type?: 'image' | 'video';
      mime_type?: string | null;
      local_uri?: string | null;
      local_thumbnail_uri?: string | null;
      media_url?: string | null;
      telegram_file_id?: string | null;
      is_private?: boolean | null;
      overlay_metadata?: any;
    },
    forceRefresh = false,
    signal?: AbortSignal,
    onThumbnailGenerated?: (uri: string) => void,
    priority: 'high' | 'low' = 'high'
  ): Promise<{
    type: 'image' | 'video' | 'document' | 'unknown';
    previewUri?: string;
    playableUri?: string;
    fallbackIcon: string;
    error?: string;
  }> {
    if (priority === 'high') {
      return this.resolveFilePreviewInternal(file, forceRefresh, signal, onThumbnailGenerated);
    }
    return previewQueue.run(() =>
      this.resolveFilePreviewInternal(file, forceRefresh, signal, onThumbnailGenerated)
    );
  },

  async forceRepairPreview(fileId: string, file: any): Promise<{ previewUri?: string; playableUri?: string } | null> {
    try {
      if (!fileId) {
        const repaired = await this.resolveFilePreview(file, true);
        return {
          previewUri: repaired.previewUri,
          playableUri: repaired.playableUri,
        };
      }
      console.log(`[PreviewCache] Repairing corrupted/expired preview for file: ${fileId}`);
      await cacheRemoveItem(CACHE_PREFIX + fileId);
      if (file.id) {
        await cacheRemoveItem(`televault_vid_thumb_${file.id}`);
      }
      const repaired = await this.resolveFilePreview(file, true);
      return {
        previewUri: repaired.previewUri,
        playableUri: repaired.playableUri,
      };
    } catch (err) {
      console.error(`[PreviewCache] Failed to repair preview for file ${fileId}:`, err);
      return null;
    }
  },

  async pregenerateThumbnailsInBackground(files: any[]): Promise<void> {
    const config = await telegramService.getTelegramConfig();
    if (!config.botToken) return;

    const eligible = files.filter(f => f.telegram_file_id && (f.file_type === 'image' || f.file_type === 'video'));

    (async () => {
      for (const file of eligible) {
        try {
          const cacheKey = file.file_type === 'video' ? `televault_vid_thumb_${file.id}` : CACHE_PREFIX + file.telegram_file_id;
          const exists = await cacheGetItem(cacheKey);
          if (exists) continue;

          await this.resolveFilePreview(file, false);
          await new Promise(r => setTimeout(r, 1200));
        } catch (_) {}
      }
    })();
  },

  async evictCacheIfLimitExceeded(maxSizeBytes = 50 * 1024 * 1024): Promise<void> {
    try {
      const keys = await cacheGetAllKeys();
      const previewKeys = keys.filter(key => key.startsWith(CACHE_PREFIX) || key.startsWith('televault_vid_thumb_'));
      
      let entries: { key: string; size: number; timestamp: number }[] = [];
      let totalSize = 0;

      for (const key of previewKeys) {
        const val = await cacheGetItem(key);
        if (val) {
          let timestamp = Date.now();
          try {
            const parsed = JSON.parse(val);
            if (parsed.timestamp) timestamp = parsed.timestamp;
          } catch (_) {}
          
          totalSize += val.length;
          entries.push({ key, size: val.length, timestamp });
        }
      }

      if (totalSize <= maxSizeBytes) return;

      entries.sort((a, b) => a.timestamp - b.timestamp);

      let bytesToEvict = totalSize - maxSizeBytes;
      const keysToRemove: string[] = [];

      for (const entry of entries) {
        if (bytesToEvict <= 0) break;
        keysToRemove.push(entry.key);
        bytesToEvict -= entry.size;
      }

      if (keysToRemove.length > 0) {
        await cacheMultiRemove(keysToRemove);
      }
    } catch (_) {}
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
