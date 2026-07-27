import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceMedia } from './deviceTypes';
import { uploadQueueService } from '../../services/uploadQueueService';
import { supabase } from '../../lib/supabase';
import { getWebBlob, setWebBlob, deleteWebBlob } from '../../services/webBlobStore';

const LOCAL_WEB_ASSETS_KEY = '@televault_local_web_assets_v2';

class DeviceMediaService {
  private memoryCache: Map<string, DeviceMedia> = new Map();

  async requestPermissions(): Promise<'granted' | 'denied' | 'limited'> {
    if (Platform.OS === 'web') return 'granted';
    try {
      const MediaLibrary = require('expo-media-library');
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') return 'granted';
      if (status === 'limited') return 'limited';
      return 'denied';
    } catch (e) {
      return 'denied';
    }
  }

  async getPermissionsStatus(): Promise<'granted' | 'denied' | 'limited'> {
    if (Platform.OS === 'web') return 'granted';
    try {
      const MediaLibrary = require('expo-media-library');
      const { status } = await MediaLibrary.getPermissionsAsync();
      if (status === 'granted') return 'granted';
      if (status === 'limited') return 'limited';
      return 'denied';
    } catch (e) {
      return 'denied';
    }
  }

  async getAlbums(): Promise<string[]> {
    if (Platform.OS === 'web') {
      const assets = await this.getWebAssets();
      const albums = new Set<string>();
      assets.forEach(a => { if (a.album) albums.add(a.album); });
      return ['All', ...Array.from(albums)];
    }
    try {
      const MediaLibrary = require('expo-media-library');
      const nativeAlbums = await MediaLibrary.getAlbumsAsync();
      return ['All', ...nativeAlbums.map((a: any) => a.title)];
    } catch (e) {
      return ['All'];
    }
  }

  async getWebAssets(): Promise<DeviceMedia[]> {
    try {
      const stored = await AsyncStorage.getItem(LOCAL_WEB_ASSETS_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to read web assets:', e);
    }
    return [];
  }

  private async saveWebAssets(assets: DeviceMedia[]): Promise<void> {
    try {
      await AsyncStorage.setItem(LOCAL_WEB_ASSETS_KEY, JSON.stringify(assets));
    } catch (e) {
      console.error('Failed to write web assets:', e);
    }
  }

  async importWebFile(blob: Blob, name: string, album: string = 'Downloads'): Promise<DeviceMedia> {
    if (Platform.OS !== 'web') throw new Error('Web-only operation.');
    
    const assetId = `web_asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await setWebBlob(assetId, blob);

    const isVideo = blob.type.startsWith('video/');
    const isImage = blob.type.startsWith('image/');

    const newAsset: DeviceMedia = {
      assetId,
      uri: URL.createObjectURL(blob),
      thumbnailUri: blob.type.startsWith('image/') ? URL.createObjectURL(blob) : null,
      filename: name,
      mimeType: blob.type,
      width: 0,
      height: 0,
      duration: 0,
      album,
      creationDate: Date.now(),
      modifiedDate: Date.now(),
      size: blob.size,
      favorite: false,
      isVideo,
      isImage,
      isLocal: true,
      isCloudOnly: false,
      isBackedUp: false,
      syncStatus: 'not_backed_up',
    };

    const assets = await this.getWebAssets();
    assets.unshift(newAsset);
    await this.saveWebAssets(assets);
    
    this.memoryCache.set(assetId, newAsset);
    return newAsset;
  }

  async deleteWebAsset(assetId: string): Promise<void> {
    if (Platform.OS !== 'web') return;
    await deleteWebBlob(assetId);
    let assets = await this.getWebAssets();
    assets = assets.filter(a => a.assetId !== assetId);
    await this.saveWebAssets(assets);
    this.memoryCache.delete(assetId);
  }

  async fetchDeviceMedia(
    album: string = 'All',
    limit: number = 60,
    afterCursor?: string
  ): Promise<{ assets: DeviceMedia[]; hasNextPage: boolean; endCursor?: string }> {
    if (Platform.OS === 'web') {
      const allAssets = await this.getWebAssets();
      let filtered = allAssets;
      if (album !== 'All') {
        filtered = allAssets.filter(a => a.album === album);
      }
      
      const startIndex = afterCursor ? parseInt(afterCursor, 10) : 0;
      const paginated = filtered.slice(startIndex, startIndex + limit);
      const hasNextPage = startIndex + limit < filtered.length;
      
      paginated.forEach(a => this.memoryCache.set(a.assetId, a));

      return {
        assets: paginated,
        hasNextPage,
        endCursor: hasNextPage ? String(startIndex + limit) : undefined,
      };
    }

    try {
      const MediaLibrary = require('expo-media-library');
      const permission = await this.getPermissionsStatus();
      if (permission === 'denied') {
        return { assets: [], hasNextPage: false };
      }

      let options: any = {
        first: limit,
        mediaType: ['photo', 'video'],
        sortBy: ['creationTime'],
      };

      if (afterCursor) {
        options.after = afterCursor;
      }

      if (album !== 'All') {
        const albums = await MediaLibrary.getAlbumsAsync();
        const foundAlbum = albums.find((a: any) => a.title === album);
        if (foundAlbum) {
          options.album = foundAlbum.id;
        }
      }

      const result = await MediaLibrary.getAssetsAsync(options);
      
      const mappedAssets: DeviceMedia[] = [];
      for (const asset of result.assets) {
        const isVideo = asset.mediaType === 'video';
        const creationDate = asset.creationTime || Date.now();
        
        const mapped: DeviceMedia = {
          assetId: asset.id,
          uri: asset.uri,
          thumbnailUri: asset.uri,
          filename: asset.filename,
          mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
          width: asset.width,
          height: asset.height,
          duration: asset.duration || 0,
          album: album === 'All' ? 'Camera' : album,
          creationDate,
          modifiedDate: asset.modificationTime || creationDate,
          size: 0,
          favorite: false,
          isVideo,
          isImage: !isVideo,
          isLocal: true,
          isCloudOnly: false,
          isBackedUp: false,
          syncStatus: 'not_backed_up',
        };

        this.memoryCache.set(asset.id, mapped);
        mappedAssets.push(mapped);
      }

      return {
        assets: mappedAssets,
        hasNextPage: result.hasNextPage,
        endCursor: result.endCursor,
      };
    } catch (e) {
      console.warn('Native getAssetsAsync failed:', e);
      return { assets: [], hasNextPage: false };
    }
  }

  // Resolves local sync status + maps account-wide cloud-only files
  async computeSyncAndCloudAssets(
    localAssets: DeviceMedia[],
    cloudFiles: any[]
  ): Promise<{ localComputed: DeviceMedia[]; cloudOnlyAssets: DeviceMedia[] }> {
    const queue = await uploadQueueService.getUploadQueue();
    
    const queueMap = new Map(queue.map(item => [item.overlay_metadata?.assetId || item.local_uri, item]));
    const cloudAssetIds = new Map<string, any>();
    const generalCloudFiles: any[] = [];

    cloudFiles.forEach(f => {
      const assetId = f.overlay_metadata?.assetId;
      if (assetId) {
        cloudAssetIds.set(assetId, f);
      } else {
        generalCloudFiles.push(f);
      }
    });

    // 1. Process local assets
    const localComputed = localAssets.map(asset => {
      let syncStatus: DeviceMedia['syncStatus'] = 'not_backed_up';
      let isBackedUp = false;
      let extraMeta: any = {};

      if (cloudAssetIds.has(asset.assetId)) {
        syncStatus = 'verified';
        isBackedUp = true;
        const cloudFile = cloudAssetIds.get(asset.assetId);
        extraMeta = {
          uploadedFromDevice: cloudFile?.overlay_metadata?.deviceName || 'This Device',
          uploadedAt: cloudFile ? new Date(cloudFile.uploaded_at || cloudFile.created_at).getTime() : undefined,
          encryptionMethod: 'AES-GCM (End-to-End Encrypted)',
          telegramFileId: cloudFile?.telegram_file_id || '',
          metadataSynced: true,
          priority: cloudFile?.overlay_metadata?.priority || 'high',
        };
      } else {
        const queuedItem = queueMap.get(asset.assetId);
        if (queuedItem) {
          if (queuedItem.status === 'completed') {
            syncStatus = 'uploaded';
            isBackedUp = true;
          } else if (queuedItem.status === 'uploading' || queuedItem.status === 'processing') {
            syncStatus = 'uploading';
          } else if (queuedItem.status === 'failed') {
            syncStatus = 'failed';
          } else {
            syncStatus = 'queued';
          }
          extraMeta.priority = queuedItem.overlay_metadata?.priority || 'high';
        }
      }

      // Conflict detection: match by filename if not explicitly backed up
      const matchingCloudByName = cloudFiles.find(f => f.file_name === asset.filename);
      if (matchingCloudByName && !isBackedUp) {
        const cloudSize = matchingCloudByName.file_size || 0;
        const diffSize = Math.abs(asset.size - cloudSize) > 10;
        if (diffSize) {
          extraMeta.conflictDetected = true;
          extraMeta.cloudSize = cloudSize;
          extraMeta.cloudModifiedDate = new Date(matchingCloudByName.uploaded_at || matchingCloudByName.created_at).getTime();
        }
      }

      return {
        ...asset,
        syncStatus,
        isBackedUp,
        isCloudOnly: false,
        ...extraMeta,
      };
    });

    // 2. Identify and construct cloud-only assets (present in Supabase but not locally on this device)
    const localAssetIds = new Set(localAssets.map(a => a.assetId));
    const cloudOnlyAssets: DeviceMedia[] = [];

    // Process files with explicit local assetId links
    cloudAssetIds.forEach((file, assetId) => {
      if (!localAssetIds.has(assetId)) {
        const isVideo = file.file_type === 'video';
        cloudOnlyAssets.push({
          assetId,
          uri: file.local_thumbnail_uri || '',
          thumbnailUri: file.local_thumbnail_uri || null,
          filename: file.file_name,
          mimeType: file.mime_type || (isVideo ? 'video/mp4' : 'image/jpeg'),
          width: 0,
          height: 0,
          duration: 0,
          album: 'Cloud Backup',
          creationDate: new Date(file.created_at || file.uploaded_at).getTime(),
          modifiedDate: new Date(file.uploaded_at).getTime(),
          size: file.file_size || 0,
          favorite: file.is_favorite || false,
          isVideo,
          isImage: !isVideo,
          isLocal: false,
          isCloudOnly: true,
          isBackedUp: true,
          syncStatus: 'verified',
          uploadedFromDevice: file.overlay_metadata?.deviceName || 'Unknown Device',
          uploadedAt: new Date(file.uploaded_at || file.created_at).getTime(),
          encryptionMethod: 'AES-GCM (End-to-End Encrypted)',
          telegramFileId: file.telegram_file_id || '',
          metadataSynced: true,
        });
      }
    });

    // Process files uploaded directly from web or app capture without local device link metadata
    generalCloudFiles.forEach(file => {
      const isVideo = file.file_type === 'video';
      cloudOnlyAssets.push({
        assetId: file.id,
        uri: file.local_thumbnail_uri || '',
        thumbnailUri: file.local_thumbnail_uri || null,
        filename: file.file_name,
        mimeType: file.mime_type || (isVideo ? 'video/mp4' : 'image/jpeg'),
        width: 0,
        height: 0,
        duration: 0,
        album: 'Cloud Backup',
        creationDate: new Date(file.created_at || file.uploaded_at).getTime(),
        modifiedDate: new Date(file.uploaded_at).getTime(),
        size: file.file_size || 0,
        favorite: file.is_favorite || false,
        isVideo,
        isImage: !isVideo,
        isLocal: false,
        isCloudOnly: true,
        isBackedUp: true,
        syncStatus: 'verified',
        uploadedFromDevice: file.overlay_metadata?.deviceName || 'Unknown Device',
        uploadedAt: new Date(file.uploaded_at || file.created_at).getTime(),
        encryptionMethod: 'AES-GCM (End-to-End Encrypted)',
        telegramFileId: file.telegram_file_id || '',
        metadataSynced: true,
      });
    });

    return { localComputed, cloudOnlyAssets };
  }

  getDeviceName(): string {
    if (Platform.OS === 'web') {
      if (navigator.userAgent.includes('Windows')) return 'Windows PC';
      if (navigator.userAgent.includes('Macintosh')) return 'MacBook';
      if (navigator.userAgent.includes('Linux')) return 'Linux PC';
      return 'Chrome Web';
    }
    return Platform.OS === 'ios' ? 'iPhone' : 'Android Phone';
  }

  async backupAsset(asset: DeviceMedia, cloudFiles: any[], priority: 'high' | 'medium' | 'low' = 'high'): Promise<void> {
    // Duplicate Detection
    const duplicate = cloudFiles.find(f => 
      f.overlay_metadata?.assetId === asset.assetId || 
      (f.file_name === asset.filename && f.file_size === asset.size)
    );

    if (duplicate) {
      throw new Error('Already Backed Up');
    }

    let finalUri = asset.uri;
    let size = asset.size;

    if (Platform.OS === 'web') {
      const blob = await getWebBlob(asset.assetId);
      if (!blob) throw new Error('Web asset binary not found.');
      finalUri = `webblob:${asset.assetId}`;
      size = blob.size;
    } else {
      try {
        const MediaLibrary = require('expo-media-library');
        const info = await MediaLibrary.getAssetInfoAsync(asset.assetId);
        if (info && info.localUri) {
          finalUri = info.localUri;
        }
        const FileSystem = require('expo-file-system');
        const fileInfo = await FileSystem.getInfoAsync(finalUri);
        if (fileInfo.exists) {
          size = fileInfo.size;
        }
      } catch (err) {
        console.warn('Resolve native size/path failed:', err);
      }
    }

    await uploadQueueService.addToUploadQueue({
      file_name: asset.filename,
      local_uri: finalUri,
      file_type: asset.isVideo ? 'video' : asset.isImage ? 'image' : 'document',
      mime_type: asset.mimeType || (asset.isVideo ? 'video/mp4' : 'image/jpeg'),
      file_size: size || 0,
      is_private: false,
      is_drive_file: false,
      destination: 'memories',
      folder_id: null,
      progress: 0,
      status: 'pending',
      overlay_metadata: { 
        assetId: asset.assetId,
        deviceName: this.getDeviceName(),
        uploadedAt: Date.now(),
        priority
      },
    });
  }

  async downloadAndRestoreAsset(asset: DeviceMedia): Promise<string> {
    const { data: file } = await supabase
      .from('files')
      .select('*')
      .or(`id.eq.${asset.assetId},overlay_metadata->>assetId.eq.${asset.assetId}`)
      .maybeSingle();

    if (!file) {
      throw new Error('Cloud file record not found in Supabase.');
    }

    const { telegramService } = require('../../services/telegramService');
    const { encryptionService } = require('../../services/encryptionService');

    if (Platform.OS === 'web') {
      let cleanUrl = '';
      if (!file.is_private) {
        cleanUrl = await telegramService.getTelegramFileDownloadUrl(file.telegram_file_id);
      } else {
        const cachedUri = await telegramService.downloadTelegramFileToCache(file.telegram_file_id, file.file_name);
        cleanUrl = await encryptionService.decryptFile(cachedUri, file.file_name, file.mime_type, file.is_private);
      }
      
      const response = await fetch(cleanUrl);
      const mediaBlob = await response.blob();
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(mediaBlob);
      link.download = file.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return 'saved';
    }

    const FileSystem = require('expo-file-system');
    const MediaLibrary = require('expo-media-library');

    let localUri = await telegramService.downloadTelegramFileToCache(file.telegram_file_id, file.file_name);
    if (file.is_private) {
      localUri = await encryptionService.decryptFile(localUri, file.file_name, file.mime_type, file.is_private);
    }

    // Save back to native Device Photo Gallery
    const assetObj = await MediaLibrary.createAssetAsync(localUri);
    try {
      await MediaLibrary.createAlbumAsync('TeleVault', assetObj, false);
    } catch (_) {}
    return localUri;
  }

  async bulkRestoreAssets(assets: DeviceMedia[]): Promise<void> {
    for (const asset of assets) {
      await this.downloadAndRestoreAsset(asset);
    }
  }
}

export const deviceMediaService = new DeviceMediaService();
export default deviceMediaService;
