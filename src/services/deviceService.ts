import { Platform } from 'react-native';
import { storageService } from './storageService';
import { supabase } from '../lib/supabase';

const DEVICE_ID_KEY = 'televault_device_id_persistent';

export interface DeviceMetadata {
  deviceId: string;
  deviceName: string;
  platform: string;
  browser: string;
}

export interface TrustedDeviceRecord {
  id: string;
  user_id: string;
  device_id: string;
  device_name: string;
  platform: string;
  browser: string;
  trusted: boolean;
  last_login_at: string;
  created_at: string;
}

export const deviceService = {
  /**
   * Retrieves or creates a persistent unique device ID for this client instance.
   */
  async getOrCreateDeviceId(): Promise<string> {
    try {
      let id = await storageService.getItem(DEVICE_ID_KEY);
      if (!id) {
        id = 'dev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
        await storageService.setItem(DEVICE_ID_KEY, id);
      }
      return id;
    } catch (err) {
      console.warn('[deviceService] Fallback device ID generated:', err);
      return 'dev_fallback_' + Date.now();
    }
  },

  /**
   * Detects platform, browser/OS name, and device model.
   */
  async getDeviceMetadata(): Promise<DeviceMetadata> {
    const deviceId = await this.getOrCreateDeviceId();
    let platform = 'Web';
    let browser = 'Browser';
    let deviceName = 'Web Client';

    if (Platform.OS === 'web') {
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      if (/iPhone|iPad|iPod/.test(userAgent)) {
        deviceName = 'iPhone';
        platform = 'iOS';
      } else if (/Android/.test(userAgent)) {
        deviceName = 'Android Phone';
        platform = 'Android';
      } else if (/Macintosh/.test(userAgent)) {
        deviceName = 'MacBook Pro';
        platform = 'Mac';
      } else if (/Windows/.test(userAgent)) {
        deviceName = 'Windows PC';
        platform = 'Windows';
      } else if (/Linux/.test(userAgent)) {
        deviceName = 'Linux Workstation';
        platform = 'Linux';
      }

      if (/Chrome/.test(userAgent) && !/Edg/.test(userAgent)) browser = 'Chrome';
      else if (/Safari/.test(userAgent) && !/Chrome/.test(userAgent)) browser = 'Safari';
      else if (/Firefox/.test(userAgent)) browser = 'Firefox';
      else if (/Edg/.test(userAgent)) browser = 'Edge';
    } else if (Platform.OS === 'ios') {
      platform = 'iOS';
      deviceName = 'iPhone';
      browser = 'Native App';
    } else if (Platform.OS === 'android') {
      platform = 'Android';
      deviceName = 'Android Device';
      browser = 'Native App';
    }

    return {
      deviceId,
      deviceName,
      platform,
      browser,
    };
  },

  /**
   * Checks if the device is marked as trusted in Supabase DB for the given user.
   */
  async isDeviceTrusted(userId: string, deviceId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('trusted_devices')
        .select('id, trusted')
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .single();

      if (error || !data) return false;
      return data.trusted === true;
    } catch (err) {
      console.warn('[deviceService] Trust check failed, defaulting to unverified:', err);
      return false;
    }
  },

  /**
   * Marks a device as trusted upon successful verification or initial setup.
   */
  async markDeviceTrusted(userId: string, meta: DeviceMetadata): Promise<void> {
    try {
      const { error } = await supabase
        .from('trusted_devices')
        .upsert(
          {
            user_id: userId,
            device_id: meta.deviceId,
            device_name: meta.deviceName,
            platform: meta.platform,
            browser: meta.browser,
            trusted: true,
            last_login_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,device_id' }
        );

      if (error) throw error;
    } catch (err) {
      console.error('[deviceService] Failed to mark device trusted in DB:', err);
    }
  },

  /**
   * Fetches all trusted devices for a user.
   */
  async getTrustedDevices(userId: string): Promise<TrustedDeviceRecord[]> {
    try {
      const { data, error } = await supabase
        .from('trusted_devices')
        .select('*')
        .eq('user_id', userId)
        .order('last_login_at', { ascending: false });

      if (error) throw error;
      return (data || []) as TrustedDeviceRecord[];
    } catch (err) {
      console.error('[deviceService] Failed fetching trusted devices:', err);
      return [];
    }
  },

  /**
   * Removes a single trusted device record.
   */
  async removeTrustedDevice(recordId: string): Promise<void> {
    const { error } = await supabase
      .from('trusted_devices')
      .delete()
      .eq('id', recordId);

    if (error) throw error;
  },

  /**
   * Removes all trusted devices for a user except the current active device.
   */
  async removeAllOtherDevices(userId: string, currentDeviceId: string): Promise<void> {
    const { error } = await supabase
      .from('trusted_devices')
      .delete()
      .eq('user_id', userId)
      .neq('device_id', currentDeviceId);

    if (error) throw error;
  },
};
