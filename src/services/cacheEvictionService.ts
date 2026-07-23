import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { settingsService } from './settingsService';

class CacheEvictionService {
  private isRunning = false;

  async evictCacheIfNecessary(): Promise<void> {
    if (Platform.OS === 'web' || this.isRunning) return;

    this.isRunning = true;
    try {
      const settings = await settingsService.getSettings();
      const limitMB = settings.cacheLimitMB || 500;
      const limitBytes = limitMB * 1024 * 1024;

      const cacheDir = FileSystem.cacheDirectory;
      if (!cacheDir) return;

      const files = await FileSystem.readDirectoryAsync(cacheDir);
      
      // 1. Gather all TeleVault cached files and their sizes/timestamps
      const cachedItems: { name: string; size: number; modificationTime: number }[] = [];
      let totalSize = 0;

      for (const fileName of files) {
        // Only evict temp preview, thumbnail, or decryption cache files
        if (
          fileName.startsWith('cache_') ||
          fileName.startsWith('temp_enc_') ||
          fileName.startsWith('tgthumb_')
        ) {
          try {
            const filePath = `${cacheDir}${fileName}`;
            const info = await FileSystem.getInfoAsync(filePath);
            if (info.exists) {
              cachedItems.push({
                name: fileName,
                size: info.size,
                modificationTime: info.modificationTime || Date.now(),
              });
              totalSize += info.size;
            }
          } catch (_) {}
        }
      }

      console.log(`[CacheEviction] Current TeleVault cache size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB / ${limitMB} MB limit.`);

      // 2. If exceeding the threshold, sort oldest first and delete until under the limit
      if (totalSize > limitBytes) {
        cachedItems.sort((a, b) => a.modificationTime - b.modificationTime);

        let bytesToEvict = totalSize - limitBytes;
        let evictedCount = 0;

        for (const item of cachedItems) {
          if (bytesToEvict <= 0) break;

          try {
            const filePath = `${cacheDir}${item.name}`;
            await FileSystem.deleteAsync(filePath, { idempotent: true });
            bytesToEvict -= item.size;
            evictedCount++;
            console.log(`[CacheEviction] Evicted cache item: ${item.name} (${(item.size / 1024).toFixed(1)} KB)`);
          } catch (err) {
            console.warn(`[CacheEviction] Failed to delete file: ${item.name}`, err);
          }
        }

        console.log(`[CacheEviction] Eviction complete. Cleaned up ${evictedCount} items.`);
      }
    } catch (error) {
      console.warn('[CacheEviction] Eviction check failed:', error);
    } finally {
      this.isRunning = false;
    }
  }
}

export const cacheEvictionService = new CacheEvictionService();
export default cacheEvictionService;
