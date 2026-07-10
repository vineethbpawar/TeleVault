import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KNOWN_KEYS = [
  'app_pin',
  'lock_drive_enabled',
  'lock_private_drive_enabled',
  'biometrics_enabled',
  'chat_lock_enabled',
  'telegram_bot_token',
  'telegram_channel_id'
];

export const storageService = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        if (key === 'televault_cached_memories' || key.startsWith('televault_cached_')) {
          const { webDbService } = require('./webDbService');
          return await webDbService.getItem(key);
        }
        return localStorage.getItem(key);
      } catch (err) {
        console.error(`localStorage.getItem error for key ${key}:`, err);
        return null;
      }
    } else {
      return await SecureStore.getItemAsync(key);
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        if (key === 'televault_cached_memories' || key.startsWith('televault_cached_')) {
          const { webDbService } = require('./webDbService');
          await webDbService.setItem(key, value);
          return;
        }
        localStorage.setItem(key, value);
      } catch (err) {
        console.error(`localStorage.setItem error for key ${key}:`, err);
      }
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        if (key === 'televault_cached_memories' || key.startsWith('televault_cached_')) {
          const { webDbService } = require('./webDbService');
          await webDbService.removeItem(key);
          return;
        }
        localStorage.removeItem(key);
      } catch (err) {
        console.error(`localStorage.removeItem error for key ${key}:`, err);
      }
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  },

  async clear(): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        localStorage.clear();
        const { webDbService } = require('./webDbService');
        const keys = await webDbService.getAllKeys();
        await webDbService.multiRemove(keys);
      } catch (err) {
        console.error('localStorage.clear error:', err);
      }
    } else {
      for (const key of KNOWN_KEYS) {
        try {
          await SecureStore.deleteItemAsync(key);
        } catch (err) {
          console.error(`Failed to delete key ${key} from SecureStore during clear:`, err);
        }
      }
    }
  }
};

export default storageService;
