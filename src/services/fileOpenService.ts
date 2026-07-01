import * as Sharing from 'expo-sharing';
import { telegramService } from './telegramService';
import { Alert } from 'react-native';

export const fileOpenService = {
  /**
   * Universal document opener/sharer.
   * Downloads the file from Telegram if necessary, then opens the native Share dialog (or system viewer).
   */
  async openDocument(file: { telegram_file_id: string | null; file_name: string }): Promise<void> {
    if (!file.telegram_file_id) {
      throw new Error('This file cannot be downloaded (No Telegram file ID).');
    }

    try {
      const isSharingAvailable = await Sharing.isAvailableAsync();
      if (!isSharingAvailable) {
        throw new Error('System sharing is not available on this device.');
      }

      // Download file to cache
      const cachedUri = await telegramService.downloadTelegramFileToCache(file.telegram_file_id, file.file_name);
      
      // Open in system viewer/sharing sheet
      await Sharing.shareAsync(cachedUri, {
        mimeType: undefined, // Let the OS determine the mime type from file extension
        dialogTitle: `Open ${file.file_name}`,
      });
    } catch (err: any) {
      console.error('Failed to open document:', err);
      Alert.alert('Error', err.message || 'No app found to open this document.');
    }
  },

  /**
   * Helper to download the file directly to device cache without opening sharing sheet.
   */
  async downloadToCache(file: { telegram_file_id: string | null; file_name: string }): Promise<string> {
    if (!file.telegram_file_id) {
      throw new Error('Telegram file ID is missing.');
    }
    return await telegramService.downloadTelegramFileToCache(file.telegram_file_id, file.file_name);
  }
};

export default fileOpenService;
