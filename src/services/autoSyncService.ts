import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { storageService } from './storageService';
import { uploadQueueService } from './uploadQueueService';

const AUTO_SYNC_ENABLED_KEY = 'auto_sync_enabled';
const LAST_SYNC_TIMESTAMP_KEY = 'last_sync_timestamp';

class AutoSyncService {
  async isEnabled(): Promise<boolean> {
    const val = await storageService.getItem(AUTO_SYNC_ENABLED_KEY);
    return val === 'true';
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await storageService.setItem(AUTO_SYNC_ENABLED_KEY, enabled ? 'true' : 'false');
    if (enabled) {
      // Trigger initial sync
      this.syncCameraRoll().catch(err => {
        console.warn('[AutoSyncService] Initial sync failed:', err);
      });
    }
  }

  /**
   * Scan camera roll and add any new photos/videos to the upload queue
   */
  async syncCameraRoll(): Promise<void> {
    if (Platform.OS === 'web') return;

    const enabled = await this.isEnabled();
    if (!enabled) return;

    try {
      // 1. Check/request permission
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[AutoSyncService] Media Library permission denied.');
        return;
      }

      // 2. Fetch last checked timestamp
      const lastSyncRaw = await storageService.getItem(LAST_SYNC_TIMESTAMP_KEY);
      const lastSyncTime = lastSyncRaw ? parseInt(lastSyncRaw, 10) : Date.now() - 24 * 60 * 60 * 1000; // default to past 24 hours

      // 3. Scan camera roll for new files
      const newTimestamp = Date.now();
      const assetsResult = await MediaLibrary.getAssetsAsync({
        createdAfter: lastSyncTime,
        mediaType: ['photo', 'video'],
        first: 50, // limit batch size
      });

      if (assetsResult.assets && assetsResult.assets.length > 0) {
        console.log(`[AutoSyncService] Found ${assetsResult.assets.length} new camera roll items to sync.`);
        
        for (const asset of assetsResult.assets) {
          // Fetch full asset info to resolve local URI
          const info = await MediaLibrary.getAssetInfoAsync(asset);
          if (!info || !info.localUri) continue;

          // Determine file type
          const isVideo = asset.mediaType === 'video';
          
          // Add to upload queue
          await uploadQueueService.addToUploadQueue({
            file_name: asset.filename || `sync_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`,
            local_uri: info.localUri,
            file_type: isVideo ? 'video' : 'image',
            mime_type: isVideo ? 'video/mp4' : 'image/jpeg',
            file_size: asset.duration || 0, // default size fallback
            is_private: false,
            is_drive_file: false, // auto-backups go to Memories Tab!
            destination: 'memories',
            folder_id: null,
            progress: 0,
            status: 'pending',
          });
        }
      }

      // 4. Update last sync timestamp
      await storageService.setItem(LAST_SYNC_TIMESTAMP_KEY, String(newTimestamp));
    } catch (err) {
      console.warn('[AutoSyncService] Sync failed:', err);
    }
  }
}

export const autoSyncService = new AutoSyncService();
export default autoSyncService;
