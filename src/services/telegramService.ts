import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';

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

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase
          .from('telegram_configs')
          .upsert({
            user_id: user.id,
            bot_token: botToken.trim(),
            channel_id: channelId.trim(),
            is_verified: true,
            last_verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

        if (error) {
          console.error('Failed to back up Telegram config to Supabase:', error);
        }
      }
    } catch (err) {
      console.error('Failed to save Telegram config to Supabase:', err);
    }
  },

  async getTelegramConfig(): Promise<TelegramConfig> {
    let botToken = await SecureStore.getItemAsync(BOT_TOKEN_KEY);
    let channelId = await SecureStore.getItemAsync(CHANNEL_ID_KEY);

    if (!botToken || !channelId) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from('telegram_configs')
            .select('bot_token, channel_id')
            .eq('user_id', user.id)
            .maybeSingle();

          if (data && !error) {
            botToken = data.bot_token;
            channelId = data.channel_id;
            if (botToken) await SecureStore.setItemAsync(BOT_TOKEN_KEY, botToken);
            if (channelId) await SecureStore.setItemAsync(CHANNEL_ID_KEY, channelId);
          }
        }
      } catch (err) {
        console.error('Failed to restore Telegram config from Supabase:', err);
      }
    }

    return { botToken, channelId };
  },

  async deleteTelegramConfig(): Promise<void> {
    await SecureStore.deleteItemAsync(BOT_TOKEN_KEY);
    await SecureStore.deleteItemAsync(CHANNEL_ID_KEY);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase
          .from('telegram_configs')
          .delete()
          .eq('user_id', user.id);
        if (error) {
          console.error('Failed to delete Telegram config from Supabase:', error);
        }
      }
    } catch (err) {
      console.error('Failed to delete Telegram config from Supabase:', err);
    }
  },

  async syncTelegramConfig(): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data, error } = await supabase
        .from('telegram_configs')
        .select('bot_token, channel_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        if (data.bot_token) await SecureStore.setItemAsync(BOT_TOKEN_KEY, data.bot_token);
        if (data.channel_id) await SecureStore.setItemAsync(CHANNEL_ID_KEY, data.channel_id);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Explicit Telegram config sync failed:', err);
      return false;
    }
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

  async sendChatLogToTelegram(data: {
    conversationId: string;
    senderUsername: string;
    receiverUsername: string;
    messageText: string;
    localTime: string;
  }): Promise<string | null> {
    const { botToken, channelId } = await this.getTelegramConfig();
    if (!botToken || !channelId) {
      console.warn('Telegram chat backup is not configured.');
      return null;
    }

    const message = `💬 TeleVault Chat Log\n\nConversation: ${data.conversationId}\nFrom: @${data.senderUsername}\nTo: @${data.receiverUsername}\nTime: ${data.localTime}\n\nMessage:\n${data.messageText}`;

    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: channelId,
          text: message,
        }),
      });

      const resJson = await response.json();
      if (response.ok && resJson.ok) {
        return String(resJson.result.message_id);
      } else {
        console.warn('Telegram sendMessage returned error:', resJson.description);
        return null;
      }
    } catch (error) {
      console.warn('Failed to send chat log to Telegram:', error);
      return null;
    }
  },

  async sendSnapToTelegram(data: {
    localUri: string;
    mediaType: 'image' | 'video';
    snapType: 'direct' | 'story';
    senderUsername: string;
    receiverUsername: string;
    caption?: string | null;
    localTime: string;
  }): Promise<{ telegramMessageId: string; telegramFileId: string } | null> {
    const { botToken, channelId } = await this.getTelegramConfig();
    if (!botToken || !channelId) {
      console.warn('Telegram snap backup is not configured.');
      return null;
    }

    const formattedCaption = `📸 TeleVault Snap\n\nType: ${
      data.snapType === 'story' ? 'Story' : 'Direct Snap'
    }\nFrom: @${data.senderUsername}\nTo: ${
      data.snapType === 'story' ? 'Story' : '@' + data.receiverUsername
    }\nTime: ${data.localTime}${
      data.caption ? `\nCaption: ${data.caption}` : ''
    }`;

    try {
      let endpoint = 'sendPhoto';
      let fieldName = 'photo';

      if (data.mediaType === 'video') {
        endpoint = 'sendVideo';
        fieldName = 'video';
      }

      const url = `https://api.telegram.org/bot${botToken}/${endpoint}`;
      
      const uploadResult = await FileSystem.uploadAsync(url, data.localUri, {
        fieldName: fieldName,
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        parameters: {
          chat_id: channelId,
          caption: formattedCaption,
        },
      });

      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(`HTTP Error ${uploadResult.status}`);
      }

      const responseData = JSON.parse(uploadResult.body);
      if (!responseData.ok) {
        throw new Error(responseData.description || 'Telegram upload API returned error.');
      }

      const result = responseData.result;
      const telegramMessageId = String(result.message_id);
      let telegramFileId = '';

      if (data.mediaType === 'image' && result.photo) {
        const photoArr = result.photo;
        const largestPhoto = photoArr[photoArr.length - 1];
        telegramFileId = largestPhoto.file_id;
      } else if (data.mediaType === 'video' && result.video) {
        telegramFileId = result.video.file_id;
      } else {
        const key = Object.keys(result).find(
          (k) => result[k] && typeof result[k] === 'object' && result[k].file_id
        );
        if (key) {
          telegramFileId = result[key].file_id;
        } else {
          throw new Error('Telegram response did not return a valid file ID.');
        }
      }

      return {
        telegramMessageId,
        telegramFileId,
      };
    } catch (error) {
      console.warn('Failed to send snap to Telegram:', error);
      return null;
    }
  },

  async sendFileChunkToTelegram(
    chunkUri: string,
    caption: string
  ): Promise<{ telegramMessageId: string; telegramFileId: string }> {
    const { botToken, channelId } = await this.getTelegramConfig();

    if (!botToken || !channelId) {
      throw new Error('Telegram configuration is missing. Please set your Bot Token and Channel ID in Settings.');
    }

    const fileInfo = await FileSystem.getInfoAsync(chunkUri);
    if (!fileInfo.exists) {
      throw new Error('Chunk file does not exist locally.');
    }

    const url = `https://api.telegram.org/bot${botToken}/sendDocument`;

    try {
      const uploadResult = await FileSystem.uploadAsync(url, chunkUri, {
        fieldName: 'document',
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        parameters: {
          chat_id: channelId,
          caption: caption,
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
        throw new Error(responseData.description || 'Telegram chunk upload API returned error.');
      }

      const result = responseData.result;
      const telegramMessageId = String(result.message_id);
      let telegramFileId = '';

      if (result.document) {
        telegramFileId = result.document.file_id;
      } else {
        const key = Object.keys(result).find(
          (k) => result[k] && typeof result[k] === 'object' && result[k].file_id
        );
        if (key) {
          telegramFileId = result[key].file_id;
        } else {
          throw new Error('Telegram response did not return a valid file ID for chunk.');
        }
      }

      return {
        telegramMessageId,
        telegramFileId,
      };
    } catch (error: any) {
      console.error('Telegram Chunk Upload Error:', error);
      throw new Error(error.message || 'Telegram chunk upload failed.');
    }
  },

  async getTelegramFileInfo(fileId: string): Promise<any> {
    const { botToken } = await this.getTelegramConfig();
    if (!botToken) {
      throw new Error('Telegram bot token is not configured.');
    }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const data = await res.json();
    if (res.ok && data.ok) {
      return data.result;
    } else {
      throw new Error(data.description || 'Failed to locate file info on Telegram.');
    }
  },

  async getTelegramFileDownloadUrl(fileId: string): Promise<string> {
    const { botToken } = await this.getTelegramConfig();
    if (!botToken) {
      throw new Error('Telegram bot token is not configured.');
    }

    const fileInfo = await this.getTelegramFileInfo(fileId);
    return `https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`;
  },

  async downloadTelegramFileToCache(fileId: string, fileName: string): Promise<string> {
    const downloadUrl = await this.getTelegramFileDownloadUrl(fileId);
    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const localUri = `${FileSystem.cacheDirectory}${Date.now()}_${safeName}`;

    const downloadResult = await FileSystem.downloadAsync(downloadUrl, localUri);
    if (downloadResult.status < 200 || downloadResult.status >= 300) {
      throw new Error(`Failed to download file: status ${downloadResult.status}`);
    }

    return downloadResult.uri;
  },

  configReady: null as boolean | null,
  listeners: [] as (() => void)[],

  subscribeConfigReady(listener: () => void) {
    this.listeners.push(listener);
    if (this.configReady !== null) {
      listener();
    }
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  },

  notifyListeners() {
    this.listeners.forEach(l => {
      try {
        l();
      } catch (err) {
        console.error('Error in config listener:', err);
      }
    });
  },

  async initConfig(): Promise<void> {
    try {
      const config = await this.getTelegramConfig();
      if (config.botToken && config.channelId) {
        this.configReady = true;
      } else {
        this.configReady = false;
      }
    } catch (err) {
      console.error('Failed to init config:', err);
      this.configReady = false;
    }
    this.notifyListeners();
  },
};

supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    telegramService.initConfig();
  } else {
    telegramService.configReady = false;
    telegramService.notifyListeners();
  }
});

export default telegramService;
