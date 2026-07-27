export interface DeviceMedia {
  assetId: string;
  uri: string;
  thumbnailUri: string | null;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  duration: number; // in seconds
  album: string;
  creationDate: number; // unix timestamp in ms
  modifiedDate: number; // unix timestamp in ms
  size: number;
  favorite: boolean;
  isVideo: boolean;
  isImage: boolean;
  isLocal: boolean;
  isCloudOnly: boolean;
  isBackedUp: boolean;
  syncStatus: 'not_backed_up' | 'queued' | 'uploading' | 'encrypted' | 'uploaded' | 'verified' | 'failed' | 'waiting_wifi';
  uploadedFromDevice?: string;
  uploadedAt?: number;
  encryptionMethod?: string;
  telegramFileId?: string;
  metadataSynced?: boolean;
  priority?: 'high' | 'medium' | 'low';
  conflictDetected?: boolean;
  cloudModifiedDate?: number;
  cloudSize?: number;
}

export type DeviceInnerTab = 'all' | 'not_backed_up' | 'backed_up' | 'uploads' | 'failed' | 'timeline';
export type DeviceFilterType = 'all' | 'image' | 'video' | 'favorites' | 'documents' | 'today' | 'this_week' | 'this_month' | 'cloud_only' | 'on_device';
export type DeviceSortType = 'newest' | 'oldest' | 'size' | 'alphabetical' | 'modified';
