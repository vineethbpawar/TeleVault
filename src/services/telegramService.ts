import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';

const BOT_TOKEN_KEY = 'telegram_bot_token';
const CHANNEL_ID_KEY = 'telegram_channel_id';

export interface TelegramConfig {
  botToken: string | null;
  channelId: string | null;
}

export interface TelegramUploadResult {
  telegramMessageId: string;
  telegramFileId: string;
  telegramFileUniqueId: string;
}

export const telegramService = {
  async saveTelegramConfig(botToken: string, channelId: string): Promise<void> {
    await SecureStore.setItemAsync(BOT_TOKEN_KEY, botToken.trim());
    await SecureStore.setItemAsync(CHANNEL_ID_KEY, channelId.trim());
  },

  async getTelegramConfig(): Promise<TelegramConfig> {
    const botToken = await SecureStore.getItemAsync(BOT_TOKEN_KEY);
    const channelId = await SecureStore.getItemAsync(CHANNEL_ID_KEY);
    return { botToken, channelId };
  },

  async testTelegramConnection(botToken: string, channelId: string): Promise<boolean> {
    try {
      const trimmedToken = botToken.trim();
      const trimmedChannel = channelId.trim();

      const url = `https://api.telegram.org/bot${trimmedToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: trimmedChannel,
          text: 'TeleVault connected successfully.',
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.description || 'Failed to send message to Telegram.');
      }
      return true;
    } catch (error: any) {
      console.error('Telegram Connection Test Error:', error);
      throw new Error(error.message || 'Telegram test connection failed.');
    }
  },

  async uploadToTelegram(
    localUri: string,
    fileType: 'image' | 'video' | 'document',
    fileName: string,
    mimeType?: string
  ): Promise<TelegramUploadResult> {
    const { botToken, channelId } = await this.getTelegramConfig();

    if (!botToken || !channelId) {
      throw new Error('Telegram configuration is missing. Please set your Bot Token and Channel ID in Settings.');
    }

    // Check file size using FileSystem.getInfoAsync
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (!fileInfo.exists) {
      throw new Error('File does not exist locally.');
    }

    const fileSizeInMB = fileInfo.size / (1024 * 1024);
    if (fileSizeInMB > 50) {
      throw new Error('File exceeds 50 MB limit.');
    }

    let endpoint = 'sendDocument';
    let fieldName = 'document';

    if (fileType === 'image') {
      endpoint = 'sendPhoto';
      fieldName = 'photo';
    } else if (fileType === 'video') {
      endpoint = 'sendVideo';
      fieldName = 'video';
    }

    try {
      const url = `https://api.telegram.org/bot${botToken}/${endpoint}`;
      
      const uploadResult = await FileSystem.uploadAsync(url, localUri, {
        fieldName: fieldName,
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        parameters: {
          chat_id: channelId,
          caption: fileName,
        },
      });

      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        let errorMsg = `HTTP Error ${uploadResult.status}`;
        try {
          const bodyJson = JSON.parse(uploadResult.body);
          if (bodyJson.description) {
            errorMsg = bodyJson.description;
          }
        } catch (_) {}
        throw new Error(errorMsg);
      }

      const responseData = JSON.parse(uploadResult.body);
      if (!responseData.ok) {
        throw new Error(responseData.description || 'Telegram upload API returned error.');
      }

      const result = responseData.result;
      const telegramMessageId = String(result.message_id);
      let telegramFileId = '';
      let telegramFileUniqueId = '';

      if (fileType === 'image' && result.photo) {
        const photoArr = result.photo;
        // Last element is the largest size
        const largestPhoto = photoArr[photoArr.length - 1];
        telegramFileId = largestPhoto.file_id;
        telegramFileUniqueId = largestPhoto.file_unique_id;
      } else if (fileType === 'video' && result.video) {
        telegramFileId = result.video.file_id;
        telegramFileUniqueId = result.video.file_unique_id;
      } else if (result.document) {
        telegramFileId = result.document.file_id;
        telegramFileUniqueId = result.document.file_unique_id;
      } else {
        // Fallback to document if it was sent as document
        const key = Object.keys(result).find(
          (k) => result[k] && typeof result[k] === 'object' && result[k].file_id
        );
        if (key) {
          telegramFileId = result[key].file_id;
          telegramFileUniqueId = result[key].file_unique_id;
        } else {
          throw new Error('Telegram response did not return a valid file ID.');
        }
      }

      return {
        telegramMessageId,
        telegramFileId,
        telegramFileUniqueId,
      };
    } catch (error: any) {
      console.error('Telegram Upload Error:', error);
      throw new Error(error.message || 'Telegram upload failed.');
    }
  },
};

export default telegramService;
