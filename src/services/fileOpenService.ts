import * as Sharing from 'expo-sharing';
import { telegramService } from './telegramService';
import { Alert, Platform } from 'react-native';

export const fileOpenService = {
  /**
   * Universal document opener/sharer.
   * Downloads the file from Telegram if necessary, decrypts if private, then opens the native Share dialog (or system viewer).
   */
  async openDocument(file: { telegram_file_id: string | null; file_name: string; is_private?: boolean | null; mime_type?: string | null }): Promise<void> {
    if (!file.telegram_file_id) {
      throw new Error('This file cannot be downloaded (No Telegram file ID).');
    }

    try {
      // Download file to cache
      let cachedUri = await telegramService.downloadTelegramFileToCache(file.telegram_file_id, file.file_name);
      
      // Decrypt if E2EE private
      if (file.is_private) {
        const { encryptionService } = require('./encryptionService');
        cachedUri = await encryptionService.decryptFile(cachedUri, file.file_name, file.mime_type);
      }

      if (Platform.OS === 'web') {
        try {
          const response = await fetch(cachedUri);
          if (!response.ok) {
            throw new Error(`Failed to fetch media file: ${response.statusText}`);
          }
          const mediaBlob = await response.blob();
          
          let mimeType = file.mime_type;
          if (!mimeType) {
            const ext = file.file_name.split('.').pop()?.toLowerCase();
            if (ext === 'mp4' || ext === 'mov') mimeType = 'video/mp4';
            else if (ext === 'png') mimeType = 'image/png';
            else if (ext === 'gif') mimeType = 'image/gif';
            else mimeType = 'image/jpeg';
          }

          const fileObj = new File([mediaBlob], file.file_name, { type: mimeType });
          const blobUrl = window.URL.createObjectURL(fileObj);

          const downloadAnchor = document.createElement('a');
          downloadAnchor.href = blobUrl;
          downloadAnchor.download = file.file_name;
          document.body.appendChild(downloadAnchor);
          downloadAnchor.click();

          document.body.removeChild(downloadAnchor);
          window.URL.revokeObjectURL(blobUrl);
        } catch (err: any) {
          console.error('PWA Download Engine Failure:', err);
          // Fallback to direct download link on failure
          const link = document.createElement('a');
          link.href = cachedUri;
          link.download = file.file_name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
        return;
      }

      const isSharingAvailable = await Sharing.isAvailableAsync();
      if (!isSharingAvailable) {
        throw new Error('System sharing is not available on this device.');
      }
      
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
  async downloadToCache(file: { telegram_file_id: string | null; file_name: string; is_private?: boolean | null; mime_type?: string | null }): Promise<string> {
    if (!file.telegram_file_id) {
      throw new Error('Telegram file ID is missing.');
    }
    let cachedUri = await telegramService.downloadTelegramFileToCache(file.telegram_file_id, file.file_name);
    
    if (file.is_private) {
      const { encryptionService } = require('./encryptionService');
      cachedUri = await encryptionService.decryptFile(cachedUri, file.file_name, file.mime_type);
    }
    
    return cachedUri;
  }
};

export default fileOpenService;
