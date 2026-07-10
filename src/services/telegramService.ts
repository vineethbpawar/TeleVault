import { storageService } from './storageService';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { Platform } from 'react-native';

const fileInfoRequests = new Map<string, Promise<any>>();

export async function fetchWithRetry(url: string, options: RequestInit = {}, maxRetries = 3): Promise<Response> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        attempt++;
        let waitSec = 3;
        try {
          const data = await response.clone().json();
          if (data.parameters && data.parameters.retry_after) {
            waitSec = data.parameters.retry_after;
          }
        } catch (_) {}
        console.warn(`[Telegram API] 429 Rate Limit. Waiting ${waitSec}s before retry (attempt ${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
        continue;
      }
      
      if (response.status >= 500 && response.status <= 504) {
        attempt++;
        if (attempt >= maxRetries) {
          return response;
        }
        const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`[Telegram API] Status ${response.status}. Retrying in ${Math.round(backoffMs)}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      
      return response;
    } catch (err: any) {
      attempt++;
      if (attempt >= maxRetries) {
        throw err;
      }
      const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      console.warn(`[Telegram API] Network Error: ${err.message}. Retrying in ${Math.round(backoffMs)}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
  throw new Error('Maximum retries exceeded');
}

async function uploadFileHelper(
  url: string,
  localUri: string,
  fieldName: string,
  parameters: Record<string, string>,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
  itemId?: string
): Promise<{ status: number; body: string }> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        resolve({
          status: xhr.status,
          body: xhr.responseText,
        });
      };

      xhr.onerror = () => {
        reject(new Error('Network upload error'));
      };

      const formData = new FormData();
      
      const sendFormData = (blob: Blob) => {
        const fileName = parameters.caption || 'file';
        formData.append(fieldName, blob, fileName);
        Object.keys(parameters).forEach((key) => {
          formData.append(key, parameters[key]);
        });
        xhr.send(formData);
      };

      if (localUri.startsWith('webblob:')) {
        const { getWebBlob } = require('./uploadQueueService');
        const key = localUri.split(':')[1];
        getWebBlob(key)
          .then((blob: Blob | null) => {
            if (!blob) {
              reject(new Error('IndexedDB blob not found for upload.'));
              return;
            }
            sendFormData(blob);
          })
          .catch(reject);
      } else if (localUri.startsWith('data:')) {
        const arr = localUri.split(',');
        const mime = arr[0].match(/:(.*?);/)![1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        sendFormData(blob);
      } else {
        fetch(localUri)
          .then(res => res.blob())
          .then(blob => {
            sendFormData(blob);
          })
          .catch(reject);
      }
    });
  } else {
    const { uploadQueueService } = require('./uploadQueueService');
    const task = FileSystem.createUploadTask(
      url,
      localUri,
      {
        fieldName: fieldName,
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        parameters: parameters,
      },
      (data) => {
        if (onProgress && data.totalBytesExpectedToSend > 0) {
          const percent = Math.round((data.totalBytesSent / data.totalBytesExpectedToSend) * 100);
          onProgress(percent);
        }
      }
    );

    if (itemId) {
      uploadQueueService.registerNativeUploadTask(itemId, task);
    }

    try {
      if (signal) {
        signal.addEventListener('abort', async () => {
          try {
            await task.cancelAsync();
          } catch (_) {}
        });
      }

      const result = await task.uploadAsync();
      if (itemId) {
        uploadQueueService.unregisterNativeUploadTask(itemId);
      }

      if (!result) {
        throw new Error('Upload task returned empty response.');
      }

      return {
        status: result.status,
        body: result.body,
      };
    } catch (err) {
      if (itemId) {
        uploadQueueService.unregisterNativeUploadTask(itemId);
      }
      throw err;
    }
  }
}

const BOT_TOKEN_KEY = 'telegram_bot_token';
const CHANNEL_ID_KEY = 'telegram_channel_id';

export interface TelegramConfig {
  botToken: string | null;
  channelId: string | null;
}

export interface TelegramChannelConfig {
  id: string;
  name: string;
  status: 'healthy' | 'unhealthy';
  filesUploaded: number;
  bytesUploaded: number;
  lastUsedAt: string | null;
}

export interface TelegramUploadResult {
  telegramMessageId: string;
  telegramFileId: string;
  telegramFileUniqueId: string;
}

export const telegramService = {
  getTelegramApiUrl(endpoint: string, botToken: string): string {
    const rawUrl = `https://api.telegram.org/bot${botToken}/${endpoint}`;
    if (Platform.OS === 'web') {
      return `https://corsproxy.io/?${rawUrl}`;
    }
    return rawUrl;
  },

  async saveTelegramConfig(botToken: string, channelId: string): Promise<void> {
    await storageService.setItem(BOT_TOKEN_KEY, botToken.trim());
    await storageService.setItem(CHANNEL_ID_KEY, channelId.trim());

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
    let botToken = await storageService.getItem(BOT_TOKEN_KEY);
    let channelId = await storageService.getItem(CHANNEL_ID_KEY);

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
            if (botToken) await storageService.setItem(BOT_TOKEN_KEY, botToken);
            if (channelId) await storageService.setItem(CHANNEL_ID_KEY, channelId);
          }
        }
      } catch (err) {
        console.error('Failed to restore Telegram config from Supabase:', err);
      }
    }

    return { botToken, channelId };
  },

  async deleteTelegramConfig(): Promise<void> {
    await storageService.removeItem(BOT_TOKEN_KEY);
    await storageService.removeItem(CHANNEL_ID_KEY);

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
        if (data.bot_token) await storageService.setItem(BOT_TOKEN_KEY, data.bot_token);
        if (data.channel_id) await storageService.setItem(CHANNEL_ID_KEY, data.channel_id);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Explicit Telegram config sync failed:', err);
      return false;
    }
  },

  async getChannelsList(): Promise<TelegramChannelConfig[]> {
    try {
      const stored = await storageService.getItem('telegram_channels_list');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (_) {}
    
    const primary = await storageService.getItem(CHANNEL_ID_KEY);
    if (primary) {
      return [{
        id: primary,
        name: 'Primary Channel',
        status: 'healthy',
        filesUploaded: 0,
        bytesUploaded: 0,
        lastUsedAt: new Date().toISOString(),
      }];
    }
    return [];
  },

  async saveChannelsList(list: TelegramChannelConfig[]): Promise<void> {
    await storageService.setItem('telegram_channels_list', JSON.stringify(list));
  },

  async monitorChannelsHealth(): Promise<TelegramChannelConfig[]> {
    const list = await this.getChannelsList();
    const botToken = await storageService.getItem(BOT_TOKEN_KEY);
    if (!botToken || list.length === 0) return list;

    const checkedList = await Promise.all(list.map(async (chan) => {
      try {
        const url = this.getTelegramApiUrl(`getChat?chat_id=${chan.id}`, botToken);
        const res = await fetchWithRetry(url);
        const data = await res.json();
        return {
          ...chan,
          status: (data.ok ? 'healthy' as const : 'unhealthy' as const),
          name: data.ok && data.result ? (data.result.title || chan.name) : chan.name,
        };
      } catch (_) {
        return {
          ...chan,
          status: 'unhealthy' as const,
        };
      }
    }));

    await this.saveChannelsList(checkedList);
    return checkedList;
  },

  async selectTargetChannel(fileSize: number): Promise<string> {
    const list = await this.getChannelsList();
    const healthy = list.filter(c => c.status === 'healthy');
    if (healthy.length === 0) {
      const primary = await storageService.getItem(CHANNEL_ID_KEY);
      if (!primary) {
        throw new Error('No Telegram channels configured.');
      }
      return primary;
    }

    healthy.sort((a, b) => a.bytesUploaded - b.bytesUploaded);
    const chosen = healthy[0];

    const updatedList = list.map(c => {
      if (c.id === chosen.id) {
        return {
          ...c,
          filesUploaded: c.filesUploaded + 1,
          bytesUploaded: c.bytesUploaded + fileSize,
          lastUsedAt: new Date().toISOString(),
        };
      }
      return c;
    });
    await this.saveChannelsList(updatedList);

    return chosen.id;
  },

  async markChannelStatus(channelId: string, status: 'healthy' | 'unhealthy'): Promise<void> {
    try {
      const list = await this.getChannelsList();
      const updated = list.map(c => c.id === channelId ? { ...c, status } : c);
      await this.saveChannelsList(updated);
    } catch (_) {}
  },

  async testTelegramConnection(botToken: string, channelId: string): Promise<boolean> {
    try {
      const trimmedToken = botToken.trim();
      const trimmedChannel = channelId.trim();

      const url = this.getTelegramApiUrl('sendMessage', trimmedToken);
      const response = await fetchWithRetry(url, {
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
    mimeType?: string,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
    itemId?: string
  ): Promise<TelegramUploadResult> {
    const { botToken, channelId } = await this.getTelegramConfig();

    if (!botToken) {
      throw new Error('Telegram configuration is missing. Please set your Bot Token in Settings.');
    }

    let fileSizeInMB = 0;
    if (Platform.OS === 'web') {
      try {
        if (localUri.startsWith('webblob:')) {
          const { getWebBlob } = require('./uploadQueueService');
          const key = localUri.split(':')[1];
          const blob = await getWebBlob(key);
          fileSizeInMB = (blob?.size || 0) / (1024 * 1024);
        } else if (localUri.startsWith('data:')) {
          const arr = localUri.split(',');
          const bstr = atob(arr[1]);
          fileSizeInMB = bstr.length / (1024 * 1024);
        } else {
          const res = await fetch(localUri);
          const blob = await res.blob();
          fileSizeInMB = blob.size / (1024 * 1024);
        }
      } catch (err) {
        console.warn('Web file size check failed:', err);
      }
    } else {
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (!fileInfo.exists) {
        throw new Error('File does not exist locally.');
      }
      fileSizeInMB = fileInfo.size / (1024 * 1024);
    }

    if (fileSizeInMB > 50) {
      throw new Error('File exceeds 50 MB limit.');
    }

    const fileSizeInBytes = Math.round(fileSizeInMB * 1024 * 1024);
    const targetChannelId = await this.selectTargetChannel(fileSizeInBytes).catch(() => channelId);

    if (!targetChannelId) {
      throw new Error('Telegram channel ID is missing.');
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

    let finalChannelId = targetChannelId;
    let uploadResult;
    try {
      const url = this.getTelegramApiUrl(endpoint, botToken);
      
      uploadResult = await uploadFileHelper(
        url,
        localUri,
        fieldName,
        {
          chat_id: finalChannelId,
          caption: fileName,
        },
        onProgress,
        signal,
        itemId
      );
    } catch (uploadError: any) {
      console.warn(`[Failover] Upload to channel ${finalChannelId} failed. Trying failover...`, uploadError);
      await this.markChannelStatus(finalChannelId, 'unhealthy');
      
      const fallback = await this.selectTargetChannel(fileSizeInBytes).catch(() => null);
      if (fallback && fallback !== finalChannelId) {
        finalChannelId = fallback;
        const url = this.getTelegramApiUrl(endpoint, botToken);
        uploadResult = await uploadFileHelper(
          url,
          localUri,
          fieldName,
          {
            chat_id: finalChannelId,
            caption: fileName,
          },
          onProgress,
          signal,
          itemId
        );
      } else {
        throw uploadError;
      }
    }

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
      const url = this.getTelegramApiUrl('sendMessage', botToken);
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: channelId,
          text: message,
        }),
      });

      const resData = await response.json();
      if (response.ok && resData.ok) {
        return String(resData.result.message_id);
      }
      return null;
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

      const url = this.getTelegramApiUrl(endpoint, botToken);
      
      const uploadResult = await uploadFileHelper(url, data.localUri, fieldName, {
        chat_id: channelId,
        caption: formattedCaption,
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
    caption: string,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
    itemId?: string
  ): Promise<{ telegramMessageId: string; telegramFileId: string }> {
    const { botToken, channelId } = await this.getTelegramConfig();

    if (!botToken) {
      throw new Error('Telegram configuration is missing. Please set your Bot Token in Settings.');
    }

    let chunkSize = 45 * 1024 * 1024;
    if (Platform.OS !== 'web') {
      try {
        const fileInfo = await FileSystem.getInfoAsync(chunkUri);
        if (fileInfo.exists) {
          chunkSize = fileInfo.size;
        }
      } catch (_) {}
    }

    const targetChannelId = await this.selectTargetChannel(chunkSize).catch(() => channelId);
    if (!targetChannelId) {
      throw new Error('Telegram channel ID is missing.');
    }

    if (Platform.OS !== 'web') {
      const fileInfo = await FileSystem.getInfoAsync(chunkUri);
      if (!fileInfo.exists) {
        throw new Error('Chunk file does not exist locally.');
      }
    }

    const url = this.getTelegramApiUrl('sendDocument', botToken);

    let finalChannelId = targetChannelId;
    let uploadResult;
    try {
      uploadResult = await uploadFileHelper(
        url,
        chunkUri,
        'document',
        {
          chat_id: finalChannelId,
          caption: caption,
        },
        onProgress,
        signal,
        itemId
      );
    } catch (uploadError: any) {
      console.warn(`[Failover] Chunk upload to channel ${finalChannelId} failed. Trying failover...`, uploadError);
      await this.markChannelStatus(finalChannelId, 'unhealthy');

      const fallback = await this.selectTargetChannel(chunkSize).catch(() => null);
      if (fallback && fallback !== finalChannelId) {
        finalChannelId = fallback;
        uploadResult = await uploadFileHelper(
          url,
          chunkUri,
          'document',
          {
            chat_id: finalChannelId,
            caption: caption,
          },
          onProgress,
          signal,
          itemId
        );
      } else {
        throw uploadError;
      }
    }

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
  },

  async getTelegramFileInfo(fileId: string, signal?: AbortSignal): Promise<any> {
    if (fileInfoRequests.has(fileId)) {
      return fileInfoRequests.get(fileId)!;
    }

    const promise = (async () => {
      const { botToken } = await this.getTelegramConfig();
      if (!botToken) {
        throw new Error('Telegram bot token is not configured.');
      }

      const url = this.getTelegramApiUrl(`getFile?file_id=${encodeURIComponent(fileId)}`, botToken);
      const res = await fetchWithRetry(url, { signal });
      const data = await res.json();
      if (res.ok && data.ok) {
        return data.result;
      } else {
        throw new Error(data.description || 'Failed to locate file info on Telegram.');
      }
    })();

    fileInfoRequests.set(fileId, promise);
    try {
      return await promise;
    } finally {
      fileInfoRequests.delete(fileId);
    }
  },

  async getTelegramFileDownloadUrl(fileId: string, signal?: AbortSignal): Promise<string> {
    const { botToken } = await this.getTelegramConfig();
    if (!botToken) {
      throw new Error('Telegram bot token is not configured.');
    }

    const fileInfo = await this.getTelegramFileInfo(fileId, signal);
    const url = `https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`;
    if (Platform.OS === 'web') {
      return `https://corsproxy.io/?${url}`;
    }
    return url;
  },

  async downloadTelegramFileToCache(fileId: string, fileName: string): Promise<string> {
    const downloadUrl = await this.getTelegramFileDownloadUrl(fileId);
    if (Platform.OS === 'web') {
      return downloadUrl;
    }
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
