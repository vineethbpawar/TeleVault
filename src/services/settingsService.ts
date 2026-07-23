import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AppSettings {
  maxVideoDuration: 15 | 30 | 60;
  defaultCameraMode: 'Photo' | 'Video' | 'LastUsed';
  lastUsedCameraMode?: 'Photo' | 'Video';
  defaultTimer: 'off' | '3s' | '5s' | '10s';
  saveOverlaysAsMetadata: boolean;
  locationLensAskPermission: boolean;
  defaultLens: string;
  faceLensesStickersMode: boolean;
  photoOptimization: boolean;
  maxPhotoWidth: number;
  jpegQuality: number;
  largeFileMode: boolean;
  backgroundUpload: boolean;
  defaultSnapViewOnce: boolean;
  saveSentSnapsToMemories: boolean;
  uploadMode: 'Stable' | 'Fast';
  cacheLimitMB: number;
}

const SETTINGS_KEY = 'televault_app_settings';

const DEFAULT_SETTINGS: AppSettings = {
  maxVideoDuration: 30,
  defaultCameraMode: 'Photo',
  defaultTimer: 'off',
  saveOverlaysAsMetadata: true,
  locationLensAskPermission: true,
  defaultLens: 'none',
  faceLensesStickersMode: true,
  photoOptimization: true,
  maxPhotoWidth: 1600,
  jpegQuality: 0.75,
  largeFileMode: false,
  backgroundUpload: true,
  defaultSnapViewOnce: true,
  saveSentSnapsToMemories: true,
  uploadMode: 'Fast',
  cacheLimitMB: 500,
};

export const settingsService = {
  async getSettings(): Promise<AppSettings> {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
      return DEFAULT_SETTINGS;
    } catch (error) {
      console.error('Failed to get settings:', error);
      return DEFAULT_SETTINGS;
    }
  },

  async updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    try {
      const current = await this.getSettings();
      const updated = { ...current, ...updates };
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      return updated;
    } catch (error) {
      console.error('Failed to update settings:', error);
      throw error;
    }
  },
};

export default settingsService;
