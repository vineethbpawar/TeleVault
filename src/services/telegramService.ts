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
): Promise<{ fileId: string; messageId: string; fileUniqueId: string }> {
  try {
    const ext = fieldName === 'video' ? 'mp4' : fieldName === 'photo' ? 'jpg' : 'bin';
    let fileName = parameters.caption || `upload_${Date.now()}`;
    fileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    if (!fileName.toLowerCase().endsWith(`.${ext}`)) {
      fileName = `${fileName}.${ext}`;
    }

    // Extract target Telegram bot API token and endpoint directly from the url to construct the direct Telegram API gateway URL
    let botToken = '';
    let endpoint = '';

    const decodedUrl = decodeURIComponent(url);
    const botMatch = decodedUrl.match(/\/bot([^/]+)\/([^?&/]+)/);
    if (botMatch) {
      botToken = botMatch[1];
      endpoint = botMatch[2];
    } else {
      const urlParts = url.split('/bot');
      const botTokenPart = urlParts[1] || '';
      botToken = botTokenPart.split('/')[0] || '';
      endpoint = botTokenPart.split('/')[1] || '';
    }

    let telegramDirectUrl = `https://api.telegram.org/bot${botToken}/${endpoint}`;
    if (Platform.OS === 'web') {
      // For file upload endpoints (sendVideo, sendPhoto, sendDocument) POST directly to
      // api.telegram.org to bypass Vercel's 4.5 MB body-size limit and 10 s function
      // timeout that cause uploads to hang at 58%.  Telegram returns
      // Access-Control-Allow-Origin: * on its Bot API, so direct browser POSTs work.
      // Only non-upload GET/metadata calls use the Vercel proxy for CORS safety.
      const isUploadEndpoint = ['sendVideo', 'sendPhoto', 'sendDocument', 'sendAnimation', 'sendAudio', 'sendVoice'].includes(endpoint);
      if (!isUploadEndpoint) {
        telegramDirectUrl = `https://tele-vault-seven.vercel.app/api/telegram-proxy?url=${encodeURIComponent(telegramDirectUrl)}`;
      }
      // Upload endpoints POST directly — no proxy needed.
    }
    let tgResult: any;

    // Dynamically calculate telegramFieldKey based on destination endpoint
    let telegramFieldKey = 'document';
    if (endpoint === 'sendPhoto') {
      telegramFieldKey = 'photo';
    } else if (endpoint === 'sendVideo') {
      telegramFieldKey = 'video';
    }

    if (Platform.OS !== 'web') {
      const cleanUri = localUri.startsWith('file://') ? localUri : `file://${localUri}`;
      console.log(`[Native Android Upload] Direct binary streaming for ${fileName} via FileSystem.uploadAsync to ${telegramDirectUrl}`);

      if (onProgress) {
        onProgress(30);
      }

      const uploadParams: Record<string, string> = {
        chat_id: parameters.chat_id,
      };
      if (parameters.caption) {
        uploadParams.caption = parameters.caption;
      }

      const mimeType = telegramFieldKey === 'video'
        ? 'video/mp4'
        : telegramFieldKey === 'photo'
          ? 'image/jpeg'
          : 'application/octet-stream';

      const uploadResult = await FileSystem.uploadAsync(telegramDirectUrl, cleanUri, {
        fieldName: telegramFieldKey,
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        parameters: uploadParams,
        mimeType: mimeType,
        headers: {
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
        },
      });

      if (onProgress) {
        onProgress(100);
      }

      try {
        tgResult = JSON.parse(uploadResult.body);
      } catch (_) {}

      if (uploadResult.status < 200 || uploadResult.status >= 300 || !tgResult) {
        const errorMsg = tgResult?.description || `Telegram upload failed with status ${uploadResult.status}`;
        throw new Error(errorMsg);
      }
    } else {
      let blob: Blob;
      if (localUri.startsWith('webblob:')) {
        const { getWebBlob } = require('./webBlobStore');
        const key = localUri.split(':')[1];
        const resBlob = await getWebBlob(key);
        if (!resBlob) {
          throw new Error('IndexedDB blob not found for upload.');
        }
        blob = resBlob;
      } else if (localUri.startsWith('data:')) {
        const arr = localUri.split(',');
        const mime = arr[0].match(/:(.*?);/)![1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        blob = new Blob([u8arr], { type: mime });
      } else {
        const res = await fetch(localUri);
        blob = await res.blob();
      }

      const formData = new FormData();
      formData.append('chat_id', parameters.chat_id);
      if (parameters.caption) {
        formData.append('caption', parameters.caption);
      }
      formData.append(telegramFieldKey, blob, fileName);

      if (onProgress) {
        onProgress(40);
      }

      const controller = new AbortController();
      if (signal) {
        signal.addEventListener('abort', () => {
          controller.abort();
        });
      }

      const response = await fetch(telegramDirectUrl, {
        method: 'POST',
        headers: {
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
        },
        body: formData,
        signal: controller.signal,
      });

      if (onProgress) {
        onProgress(100);
      }

      const responseText = await response.text();
      try {
        tgResult = JSON.parse(responseText);
      } catch (_) {}

      if (response.status < 200 || response.status >= 300 || !tgResult) {
        const errorMsg = tgResult?.description || `Telegram direct upload failed with status ${response.status}`;
        throw new Error(errorMsg);
      }
    }

    if (!tgResult || tgResult.ok !== true) {
      const errorMsg = tgResult?.description || 'Telegram upload API returned error.';
      throw new Error(errorMsg);
    }

    // Extract file_id and message_id from the Telegram JSON response
    let targetFileId = '';
    let targetFileUniqueId = '';
    const resultObj = tgResult.result;
    const messageId = String(resultObj?.message_id || '');

    if (resultObj) {
      if (resultObj.photo && Array.isArray(resultObj.photo) && resultObj.photo.length > 0) {
        const photoObj = resultObj.photo[resultObj.photo.length - 1];
        targetFileId = photoObj.file_id;
        targetFileUniqueId = photoObj.file_unique_id || '';
      } else if (resultObj.video && typeof resultObj.video === 'object') {
        targetFileId = resultObj.video.file_id;
        targetFileUniqueId = resultObj.video.file_unique_id || '';
      } else if (resultObj.document && typeof resultObj.document === 'object') {
        targetFileId = resultObj.document.file_id;
        targetFileUniqueId = resultObj.document.file_unique_id || '';
      } else {
        const key = Object.keys(resultObj).find(
          (k) => resultObj[k] && typeof resultObj[k] === 'object' && resultObj[k].file_id
        );
        if (key) {
          targetFileId = resultObj[key].file_id;
          targetFileUniqueId = resultObj[key].file_unique_id || '';
        }
      }
    }

    if (!targetFileId) {
      throw new Error('Telegram response did not return a valid file ID.');
    }

    return {
      fileId: targetFileId,
      messageId,
      fileUniqueId: targetFileUniqueId,
    };
  } catch (error: any) {
    console.error('Direct Telegram upload pipeline error:', error);
    throw error;
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
    const url = `https://api.telegram.org/bot${botToken}/${endpoint}`;
    if (Platform.OS === 'web') {
      return `https://tele-vault-seven.vercel.app/api/telegram-proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  },

  async saveTelegramConfig(botToken: string, channelId: string): Promise<void> {
    await storageService.setItem(BOT_TOKEN_KEY, botToken.trim());
    await storageService.setItem(CHANNEL_ID_KEY, channelId.trim());
    await storageService.removeItem('telegram_channels_list');

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
            botToken = botToken || data.bot_token;
            channelId = channelId || data.channel_id;
            if (botToken) await storageService.setItem(BOT_TOKEN_KEY, botToken);
            if (channelId) await storageService.setItem(CHANNEL_ID_KEY, channelId);
          }
        }
      } catch (err) {
        console.error('Failed to restore Telegram config from Supabase:', err);
      }
    }

    if (!botToken) {
      botToken = process.env.EXPO_PUBLIC_TELEGRAM_BOT_TOKEN || null;
    }
    if (!channelId) {
      channelId = process.env.EXPO_PUBLIC_TELEGRAM_CHANNEL_ID || null;
    }

    return { botToken, channelId };
  },

  async deleteTelegramConfig(): Promise<void> {
    await storageService.removeItem(BOT_TOKEN_KEY);
    await storageService.removeItem(CHANNEL_ID_KEY);
    await storageService.removeItem('telegram_channels_list');

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

    let uploadUri = localUri;
    let tempCopiedFile: string | null = null;

    if (Platform.OS !== 'web') {
      const ext = fileType === 'video' ? 'mp4' : fileType === 'image' ? 'jpg' : 'bin';
      if (!localUri.toLowerCase().endsWith(`.${ext}`)) {
        try {
          const tempPath = `${FileSystem.cacheDirectory}upload_temp_${Date.now()}.${ext}`;
          await FileSystem.copyAsync({ from: localUri, to: tempPath });
          uploadUri = tempPath;
          tempCopiedFile = tempPath;
          console.log(`[Upload] Copied file to temp path with proper extension: ${tempPath}`);
        } catch (err) {
          console.warn('[Upload] Failed to copy file to temp path:', err);
        }
      }
    }

    try {
      let fileSizeInMB = 0;
      if (Platform.OS === 'web') {
        try {
          if (uploadUri.startsWith('webblob:')) {
            const { getWebBlob } = require('./webBlobStore');
            const key = uploadUri.split(':')[1];
            const blob = await getWebBlob(key);
            fileSizeInMB = (blob?.size || 0) / (1024 * 1024);
          } else if (uploadUri.startsWith('data:')) {
            const arr = uploadUri.split(',');
            const bstr = atob(arr[1]);
            fileSizeInMB = bstr.length / (1024 * 1024);
          } else {
            const res = await fetch(uploadUri);
            const blob = await res.blob();
            fileSizeInMB = blob.size / (1024 * 1024);
          }
        } catch (err) {
          console.warn('Web file size check failed:', err);
        }
      } else {
        const fileInfo = await FileSystem.getInfoAsync(uploadUri);
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
      let uploadRes: { fileId: string; messageId: string; fileUniqueId: string };
      try {
        const url = this.getTelegramApiUrl(endpoint, botToken);
        
        uploadRes = await uploadFileHelper(
          url,
          uploadUri,
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
          uploadRes = await uploadFileHelper(
            url,
            uploadUri,
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

      return {
        telegramMessageId: uploadRes.messageId,
        telegramFileId: uploadRes.fileId,
        telegramFileUniqueId: uploadRes.fileUniqueId,
      };
    } finally {
      if (tempCopiedFile) {
        FileSystem.deleteAsync(tempCopiedFile, { idempotent: true }).catch((err) => {
          console.warn('[Upload] Failed to delete temp upload file:', err);
        });
      }
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
      
      const uploadRes = await uploadFileHelper(url, data.localUri, fieldName, {
        chat_id: channelId,
        caption: formattedCaption,
      });

      return {
        telegramMessageId: uploadRes.messageId,
        telegramFileId: uploadRes.fileId,
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
    let uploadRes: { fileId: string; messageId: string; fileUniqueId: string };
    try {
      uploadRes = await uploadFileHelper(
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
        uploadRes = await uploadFileHelper(
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

    return {
      telegramMessageId: uploadRes.messageId,
      telegramFileId: uploadRes.fileId,
    };
  },

  async getTelegramFileInfo(fileId: string, signal?: AbortSignal, senderId?: string): Promise<{ fileInfo: any; workingToken: string }> {
    const cacheKey = `${fileId}:${senderId || ''}`;
    if (fileInfoRequests.has(cacheKey)) {
      return fileInfoRequests.get(cacheKey)!;
    }

    const promise = (async () => {
      const tokensToTry: string[] = [];

      // 1. Current user's configured bot token
      const { botToken: userToken } = await this.getTelegramConfig();
      if (userToken) tokensToTry.push(userToken);

      // 2. System default bot token
      const systemToken = process.env.EXPO_PUBLIC_TELEGRAM_BOT_TOKEN;
      if (systemToken && !tokensToTry.includes(systemToken)) {
        tokensToTry.push(systemToken);
      }

      // 3. Sender's bot token from Supabase if senderId is provided
      if (senderId) {
        try {
          const { data } = await supabase
            .from('telegram_configs')
            .select('bot_token')
            .eq('user_id', senderId)
            .maybeSingle();
          if (data?.bot_token && !tokensToTry.includes(data.bot_token)) {
            tokensToTry.push(data.bot_token);
          }
        } catch (err) {
          console.warn('[Telegram API] Failed to fetch sender bot token:', err);
        }
      }

      if (tokensToTry.length === 0) {
        throw new Error('Telegram bot token is not configured.');
      }

      let lastError: Error | null = null;

      for (const token of tokensToTry) {
        try {
          const url = this.getTelegramApiUrl(`getFile?file_id=${encodeURIComponent(fileId)}`, token);
          const res = await fetchWithRetry(url, { signal }, 2);
          const data = await res.json();
          if (res.ok && data.ok && data.result) {
            return { fileInfo: data.result, workingToken: token };
          }
          if (data?.description) {
            lastError = new Error(data.description);
          }
        } catch (err: any) {
          lastError = err;
        }
      }

      throw lastError || new Error('Failed to locate file info on Telegram across configured tokens.');
    })();

    fileInfoRequests.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      fileInfoRequests.delete(cacheKey);
    }
  },

  async getTelegramFileDownloadUrl(fileId: string, signal?: AbortSignal, senderId?: string): Promise<string> {
    const { fileInfo, workingToken } = await this.getTelegramFileInfo(fileId, signal, senderId);
    const url = `https://api.telegram.org/file/bot${workingToken}/${fileInfo.file_path}`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.location) {
        const hostname = window.location.hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
          return `https://tele-vault-seven.vercel.app/api/telegram-proxy?url=${encodeURIComponent(url)}`;
        }
      }
      return `https://tele-vault-seven.vercel.app/api/telegram-proxy?url=${encodeURIComponent(url)}`;
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

  async deleteTelegramMessage(messageId: number): Promise<boolean> {
    try {
      const { botToken, channelId } = await this.getTelegramConfig();
      if (!botToken || !channelId) return false;
      
      const url = this.getTelegramApiUrl('deleteMessage', botToken);
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: channelId,
          message_id: messageId,
        }),
      });
      const data = await response.json();
      return !!data.ok;
    } catch (e) {
      console.warn('Failed to delete Telegram message:', e);
      return false;
    }
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
