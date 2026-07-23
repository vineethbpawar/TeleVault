import * as Sharing from 'expo-sharing';
import { telegramService } from './telegramService';
import { Alert, Platform } from 'react-native';

function showWebLoadingOverlay() {
  const existing = document.getElementById('televault-web-share-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'televault-web-share-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(9, 10, 20, 0.85);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 2147483647;
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #FFFFFF;
  `;

  const container = document.createElement('div');
  container.style.cssText = `
    width: 90%;
    max-width: 320px;
    background: #121324;
    border: 1px solid rgba(255, 252, 0, 0.15);
    border-radius: 24px;
    padding: 28px;
    text-align: center;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  `;

  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width: 40px;
    height: 40px;
    border: 4px solid rgba(255, 252, 0, 0.1);
    border-top: 4px solid #FFFC00;
    border-radius: 50%;
    margin: 0 auto 20px auto;
    animation: televault-spin 1s linear infinite;
  `;

  const text = document.createElement('p');
  text.innerText = 'Downloading & Decrypting...';
  text.style.cssText = `
    margin: 0;
    font-size: 15px;
    font-weight: 500;
    color: #FFFFFF;
  `;

  container.appendChild(spinner);
  container.appendChild(text);
  overlay.appendChild(container);
  document.body.appendChild(overlay);

  const styleSheet = document.createElement('style');
  styleSheet.innerText = `
    @keyframes televault-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(styleSheet);
}

function showWebErrorOverlay(errorMsg: string) {
  const overlay = document.getElementById('televault-web-share-overlay');
  if (!overlay) return;

  overlay.innerHTML = '';

  const container = document.createElement('div');
  container.style.cssText = `
    width: 90%;
    max-width: 340px;
    background: #121324;
    border: 1px solid rgba(255, 59, 48, 0.2);
    border-radius: 24px;
    padding: 28px;
    text-align: center;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  `;

  const title = document.createElement('h3');
  title.innerText = 'Export Failed';
  title.style.cssText = `
    margin: 0 0 8px 0;
    font-size: 18px;
    font-weight: 700;
    color: #FF3B30;
  `;

  const text = document.createElement('p');
  text.innerText = errorMsg;
  text.style.cssText = `
    margin: 0 0 20px 0;
    font-size: 14px;
    color: #8E8E93;
    word-break: break-all;
  `;

  const closeBtn = document.createElement('button');
  closeBtn.innerText = 'Dismiss';
  closeBtn.style.cssText = `
    width: 100%;
    background: #FF3B30;
    color: #FFFFFF;
    border: none;
    padding: 12px;
    border-radius: 12px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
  `;
  closeBtn.onclick = () => overlay.remove();

  container.appendChild(title);
  container.appendChild(text);
  container.appendChild(closeBtn);
  overlay.appendChild(container);
}

function showWebShareOverlay(
  fileName: string,
  blobUrl: string,
  fileObj: File,
  isPrivate: boolean
) {
  const existing = document.getElementById('televault-web-share-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'televault-web-share-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(9, 10, 20, 0.85);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 2147483647;
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #FFFFFF;
    animation: televault-fadeIn 0.25s ease;
  `;

  const container = document.createElement('div');
  container.style.cssText = `
    width: 90%;
    max-width: 400px;
    background: #121324;
    border: 1px solid rgba(255, 252, 0, 0.15);
    border-radius: 24px;
    padding: 28px;
    text-align: center;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    animation: televault-slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  const title = document.createElement('h3');
  title.innerText = isPrivate ? 'Decrypted File Ready' : 'File Export Ready';
  title.style.cssText = `
    margin: 0 0 8px 0;
    font-size: 20px;
    font-weight: 700;
    color: #FFFC00;
  `;
  container.appendChild(title);

  const nameText = document.createElement('p');
  nameText.innerText = fileName;
  nameText.style.cssText = `
    margin: 0 0 24px 0;
    font-size: 14px;
    color: #8E8E93;
    word-break: break-all;
  `;
  container.appendChild(nameText);

  const isStandalone = 
    (window.navigator as any).standalone || 
    window.matchMedia('(display-mode: standalone)').matches;

  if (isStandalone) {
    const warningCard = document.createElement('div');
    warningCard.style.cssText = `
      background: rgba(255, 59, 48, 0.12);
      border: 1px solid rgba(255, 59, 48, 0.25);
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 20px;
      font-size: 13px;
      color: #FF453A;
      line-height: 1.4;
      text-align: left;
    `;
    warningCard.innerHTML = `
      ⚠️ <b>App Limitation:</b> Mobile operating systems block file downloads and video sharing inside installed Home Screen apps (PWAs).
      <br/><br/>
      To download or share this file, please open TeleVault in your mobile <b>Safari</b> or <b>Chrome browser app</b> instead, where downloads are fully supported!
    `;
    container.appendChild(warningCard);
  }

  // 0. Render Image/Video preview if applicable
  const ext = fileName.split('.').pop()?.toLowerCase();
  const isImg = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext || '');
  const isVid = ['mp4', 'mov', 'webm'].includes(ext || '');

  if (isImg) {
    const previewEl = document.createElement('img');
    previewEl.src = blobUrl;
    previewEl.style.cssText = `
      display: block;
      width: 100%;
      max-height: 200px;
      object-fit: contain;
      border-radius: 12px;
      margin-bottom: 12px;
      background: #000000;
    `;
    container.appendChild(previewEl);
  } else if (isVid) {
    const previewEl = document.createElement('video');
    previewEl.src = blobUrl;
    previewEl.controls = true;
    previewEl.playsInline = true;
    previewEl.style.cssText = `
      display: block;
      width: 100%;
      max-height: 200px;
      border-radius: 12px;
      margin-bottom: 12px;
      background: #000000;
    `;
    container.appendChild(previewEl);
  }

  // 0.5. Add helper hint text
  const hintText = document.createElement('p');
  hintText.innerHTML = isImg || isVid 
    ? '💡 <b>Hint:</b> You can also long-press / tap-hold the image or video above to save or share it directly!' 
    : '💡 <b>Hint:</b> Use the download and share options below.';
  hintText.style.cssText = `
    margin: 0 0 20px 0;
    font-size: 12px;
    color: #FFFC00;
    line-height: 1.4;
    text-align: center;
  `;
  container.appendChild(hintText);

  // 1. Download Link Button (synchronous standard href download)
  const downloadBtn = document.createElement('a');
  downloadBtn.href = blobUrl;
  downloadBtn.download = fileName;
  downloadBtn.innerText = 'Download to Device';
  downloadBtn.style.cssText = `
    display: block;
    width: 100%;
    box-sizing: border-box;
    background: #FFFC00;
    color: #000000;
    text-decoration: none;
    padding: 14px;
    border-radius: 12px;
    font-weight: 600;
    font-size: 15px;
    margin-bottom: 12px;
    text-align: center;
    cursor: pointer;
  `;
  container.appendChild(downloadBtn);

  // 2. Share Button (synchronous user-triggered navigator.share)
  const shareBtn = document.createElement('button');
  shareBtn.innerText = 'Share to Apps / WhatsApp';
  shareBtn.style.cssText = `
    display: block;
    width: 100%;
    background: rgba(255, 255, 255, 0.08);
    color: #FFFFFF;
    border: 1px solid rgba(255, 255, 255, 0.10);
    padding: 14px;
    border-radius: 12px;
    font-weight: 600;
    font-size: 15px;
    margin-bottom: 20px;
    cursor: pointer;
  `;
  shareBtn.onclick = async () => {
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [fileObj] })) {
      try {
        await navigator.share({
          files: [fileObj],
          title: fileName,
        });
      } catch (err) {
        console.warn('Native share failed or closed:', err);
      }
    } else {
      alert('Native sharing is not supported by your browser/PWA environment for this file.');
    }
  };
  container.appendChild(shareBtn);

  // 3. Cancel Button
  const closeBtn = document.createElement('button');
  closeBtn.innerText = 'Close';
  closeBtn.style.cssText = `
    background: transparent;
    border: none;
    color: #8E8E93;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  `;
  closeBtn.onclick = () => {
    overlay.remove();
    window.URL.revokeObjectURL(blobUrl);
  };
  container.appendChild(closeBtn);

  overlay.appendChild(container);
  document.body.appendChild(overlay);

  const styleSheet = document.createElement('style');
  styleSheet.innerText = `
    @keyframes televault-fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes televault-slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(styleSheet);
}

export const fileOpenService = {
  /**
   * Universal document opener/sharer.
   * Downloads the file from Telegram if necessary, decrypts if private, then opens the native Share dialog (or system viewer).
   */
  async openDocument(file: { 
    id?: string;
    telegram_file_id: string | null; 
    file_name: string; 
    is_private?: boolean | null; 
    mime_type?: string | null;
    local_thumbnail_uri?: string | null;
    overlay_metadata?: any;
    is_chunked?: boolean | null;
    large_file_id?: string | null;
  }): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        showWebLoadingOverlay();
        try {
          const { getWebBlob } = require('./webBlobStore');
          let localBlob: Blob | null = null;
          
          if (file.id) {
            localBlob = await getWebBlob(file.id);
          }
          if (!localBlob && file.local_thumbnail_uri && file.local_thumbnail_uri.startsWith('webblob:')) {
            const key = file.local_thumbnail_uri.split(':')[1];
            const cleanKey = key.replace(/^thumb_/, '');
            localBlob = await getWebBlob(cleanKey);
          }
          if (!localBlob && file.overlay_metadata?.local_uri && file.overlay_metadata.local_uri.startsWith('webblob:')) {
            const key = file.overlay_metadata.local_uri.split(':')[1];
            localBlob = await getWebBlob(key);
          }
          if (!localBlob && file.id) {
            localBlob = await getWebBlob('preview_' + file.id);
          }

          let cleanUrl = '';
          if (localBlob) {
            if (file.is_private) {
              const tempUrl = URL.createObjectURL(localBlob);
              const { encryptionService } = require('./encryptionService');
              cleanUrl = await encryptionService.decryptFile(tempUrl, file.file_name, file.mime_type, file.is_private);
            } else {
              cleanUrl = URL.createObjectURL(localBlob);
            }
          } else {
            if (file.is_chunked && file.large_file_id) {
              const { largeFileDownloadService } = require('./largeFileDownloadService');
              const rebuildResult = await largeFileDownloadService.downloadAndRebuildLargeFile(
                file.large_file_id,
                file.is_private,
                file.mime_type
              );
              if (rebuildResult.success && rebuildResult.localUri) {
                cleanUrl = rebuildResult.localUri;
              } else {
                throw new Error(rebuildResult.message || 'Failed to rebuild chunked file.');
              }
            } else {
              if (!file.telegram_file_id) {
                throw new Error('This file cannot be downloaded (No Telegram file ID and not found in local cache).');
              }
              if (!file.is_private) {
                cleanUrl = await telegramService.getTelegramFileDownloadUrl(file.telegram_file_id);
              } else {
                const cachedUri = await telegramService.downloadTelegramFileToCache(file.telegram_file_id, file.file_name);
                const { encryptionService } = require('./encryptionService');
                cleanUrl = await encryptionService.decryptFile(cachedUri, file.file_name, file.mime_type, file.is_private);
              }
            }
          }

          const response = await fetch(cleanUrl);
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

          showWebShareOverlay(file.file_name, blobUrl, fileObj, !!file.is_private);
        } catch (err: any) {
          console.error('PWA Share Overlay Error:', err);
          showWebErrorOverlay(err.message || 'Failed to download or decrypt file.');
        }
        return;
      }

      let cachedUri = '';
      if ((file as any).is_chunked && (file as any).large_file_id) {
        const { largeFileDownloadService } = require('./largeFileDownloadService');
        const rebuildResult = await largeFileDownloadService.downloadAndRebuildLargeFile(
          (file as any).large_file_id,
          file.is_private,
          file.mime_type
        );
        if (rebuildResult.success && rebuildResult.localUri) {
          cachedUri = rebuildResult.localUri;
        } else {
          throw new Error(rebuildResult.message || 'Failed to rebuild chunked file.');
        }
      } else {
        if (!file.telegram_file_id) {
          throw new Error('This file cannot be downloaded (No Telegram file ID).');
        }
        cachedUri = await telegramService.downloadTelegramFileToCache(file.telegram_file_id, file.file_name);
        
        // Decrypt if E2EE private
        if (file.is_private) {
          const { encryptionService } = require('./encryptionService');
          cachedUri = await encryptionService.decryptFile(cachedUri, file.file_name, file.mime_type, file.is_private);
        }
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
  async downloadToCache(file: { 
    id?: string;
    telegram_file_id: string | null; 
    file_name: string; 
    is_private?: boolean | null; 
    mime_type?: string | null;
    is_chunked?: boolean | null;
    large_file_id?: string | null;
  }): Promise<string> {
    if (file.is_chunked && file.large_file_id) {
      const { largeFileDownloadService } = require('./largeFileDownloadService');
      const rebuildResult = await largeFileDownloadService.downloadAndRebuildLargeFile(
        file.large_file_id,
        file.is_private,
        file.mime_type
      );
      if (rebuildResult.success && rebuildResult.localUri) {
        return rebuildResult.localUri;
      } else {
        throw new Error(rebuildResult.message || 'Failed to rebuild chunked file.');
      }
    }
    if (!file.telegram_file_id) {
      throw new Error('Telegram file ID is missing.');
    }
    let cachedUri = await telegramService.downloadTelegramFileToCache(file.telegram_file_id, file.file_name);
    
    if (file.is_private) {
      const { encryptionService } = require('./encryptionService');
      cachedUri = await encryptionService.decryptFile(cachedUri, file.file_name, file.mime_type, file.is_private);
    }
    
    return cachedUri;
  }
};

export default fileOpenService;
