import { Platform } from 'react-native';

export const networkService = {
  async checkRealConnection(): Promise<boolean> {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    if (!supabaseUrl) return false;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const res = await fetch(supabaseUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return res.status >= 200 && res.status < 400;
    } catch (_) {
      return false;
    }
  },

  async isOnline(): Promise<boolean> {
    const systemOnline = Platform.OS === 'web' ? navigator.onLine : true;
    if (systemOnline) return true;
    
    // System reports offline: execute hard reality ping override check
    return await this.checkRealConnection();
  }
};

export default networkService;
