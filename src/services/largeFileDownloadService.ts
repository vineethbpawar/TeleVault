import { supabase } from '../lib/supabase';
import { LargeFileChunk } from '../types/largeFile';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { File as EFSFile } from 'expo-file-system';
import { telegramService } from './telegramService';

const activeRebuilds = new Map<string, Promise<{ success: boolean; message: string; localUri: string | null }>>();

export const largeFileDownloadService = {
  /**
   * List all chunks for a given large file.
   */
  async listChunks(largeFileId: string): Promise<LargeFileChunk[]> {
    const { data, error } = await supabase
      .from('large_file_chunks')
      .select('*')
      .eq('large_file_id', largeFileId)
      .order('chunk_index', { ascending: true });

    if (error) {
      console.error('List chunks error:', error);
      throw new Error(error.message || 'Failed to list large file chunks.');
    }

    return (data || []) as LargeFileChunk[];
  },

  /**
   * Get the chunk count and total size for a given large file.
   */
  async getChunkInfo(largeFileId: string): Promise<{ chunkCount: number; totalSize: number; originalFileName: string }> {
    const { data: largeFile, error: fileError } = await supabase
      .from('large_files')
      .select('total_chunks, total_size, original_file_name')
      .eq('id', largeFileId)
      .single();

    if (fileError || !largeFile) {
      throw new Error('Large file record not found.');
    }

    return {
      chunkCount: largeFile.total_chunks,
      totalSize: largeFile.total_size,
      originalFileName: largeFile.original_file_name,
    };
  },

  /**
   * Download and rebuild a chunked file locally.
   */
  async downloadAndRebuildLargeFile(
    largeFileId: string,
    isPrivate?: boolean | null,
    mimeType?: string | null,
    onProgress?: (progress: number) => void
  ): Promise<{
    success: boolean;
    message: string;
    localUri: string | null;
  }> {
    if (activeRebuilds.has(largeFileId)) {
      return activeRebuilds.get(largeFileId)!;
    }

    const rebuildTask = (async () => {
      try {
      const { chunkCount, originalFileName } = await this.getChunkInfo(largeFileId);
      const chunks = await this.listChunks(largeFileId);
      
      const completedChunks = chunks.filter(c => c.status === 'completed' || !!c.telegram_file_id);
      if (completedChunks.length === 0) {
        throw new Error(`Cannot rebuild file: 0/${chunkCount || chunks.length} chunks uploaded.`);
      }

      if (Platform.OS === 'web') {
        const { getWebBlob, setWebBlob } = require('./webBlobStore');
        const cacheKey = `large_file_${largeFileId}`;

        // 1. Check IndexedDB cache for instant zero-buffering loading
        const cachedBlob = await getWebBlob(cacheKey).catch(() => null);
        if (cachedBlob) {
          const localUri = URL.createObjectURL(cachedBlob);
          if (onProgress) onProgress(100);
          return {
            success: true,
            message: 'File retrieved from local cache.',
            localUri,
          };
        }

        const chunkBlobs: Blob[] = new Array(completedChunks.length);
        let downloadedCount = 0;
        const CONCURRENCY = 8;

        const downloadSingleChunk = async (chunk: LargeFileChunk, index: number) => {
          let attempt = 0;
          let lastErr: any;
          while (attempt < 3) {
            try {
              let chunkUrl = '';
              if (!isPrivate) {
                chunkUrl = await telegramService.getTelegramFileDownloadUrl(chunk.telegram_file_id!);
              } else {
                const cachedUri = await telegramService.downloadTelegramFileToCache(chunk.telegram_file_id!, chunk.chunk_file_name);
                const { encryptionService } = require('./encryptionService');
                chunkUrl = await encryptionService.decryptFile(cachedUri, chunk.chunk_file_name, mimeType || undefined);
              }

              let proxiedUrl = chunkUrl;
              if (!chunkUrl.startsWith('/') && !chunkUrl.startsWith('blob:')) {
                proxiedUrl = `/api/telegram-proxy?url=${encodeURIComponent(chunkUrl)}`;
              }

              const res = await fetch(proxiedUrl);
              if (!res.ok) throw new Error(`HTTP ${res.status} downloading chunk ${chunk.chunk_index}`);
              const blob = await res.blob();
              if (!blob || blob.size === 0) throw new Error(`Empty blob returned for chunk ${chunk.chunk_index}`);
              
              chunkBlobs[index] = blob;
              downloadedCount++;
              if (onProgress) {
                onProgress(Math.round((downloadedCount / completedChunks.length) * 100));
              }
              return;
            } catch (err) {
              lastErr = err;
              attempt++;
              if (attempt < 3) {
                await new Promise((r) => setTimeout(r, 500 * attempt));
              }
            }
          }
          throw lastErr || new Error(`Failed to download chunk ${chunk.chunk_index} after 3 attempts`);
        };

        let currentIndex = 0;
        const worker = async () => {
          while (currentIndex < completedChunks.length) {
            const idx = currentIndex++;
            await downloadSingleChunk(completedChunks[idx], idx);
          }
        };

        const workers = [];
        const activeLimit = Math.min(CONCURRENCY, completedChunks.length);
        for (let w = 0; w < activeLimit; w++) {
          workers.push(worker());
        }

        await Promise.all(workers);

        const combinedBlob = new Blob(chunkBlobs, { type: mimeType || 'application/octet-stream' });
        
        // Save to IndexedDB so subsequent views open instantly without re-downloading
        await setWebBlob(cacheKey, combinedBlob).catch(() => {});

        const localUri = URL.createObjectURL(combinedBlob);
        
        if (onProgress) {
          onProgress(100);
        }

        return {
          success: true,
          message: 'File assembled successfully.',
          localUri,
        };
      } else {
        // Memory-safe streaming assembly using SDK 56 File API.
        // Write each chunk's base64 directly to the output file with append=true,
        // so we never hold more than one chunk in RAM at a time.
        const safeName = originalFileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const finalDestUri = `${FileSystem.cacheDirectory}rebuilt_${Date.now()}_${safeName}`;

        // Create the destination file upfront (empty)
        const destFile = new EFSFile(finalDestUri);
        destFile.create({ overwrite: true });

        for (let i = 0; i < completedChunks.length; i++) {
          const chunk = completedChunks[i];
          if (onProgress) {
            onProgress(Math.round((i / completedChunks.length) * 100));
          }

          // Download chunk to cache
          let chunkLocalPath = await telegramService.downloadTelegramFileToCache(
            chunk.telegram_file_id!,
            chunk.chunk_file_name
          );

          // Decrypt if private
          if (isPrivate) {
            const { encryptionService } = require('./encryptionService');
            const decryptedPath = await encryptionService.decryptFile(
              chunkLocalPath,
              chunk.chunk_file_name,
              mimeType || undefined
            );
            await FileSystem.deleteAsync(chunkLocalPath, { idempotent: true });
            chunkLocalPath = decryptedPath;
          }

          // Read the chunk as raw bytes (Uint8Array) — only one chunk in RAM at a time.
          // Using bytes avoids base64 padding corruption at chunk boundaries.
          const chunkFile = new EFSFile(chunkLocalPath);
          const chunkBytes = chunkFile.bytesSync();

          // Delete the temporary chunk file immediately to free disk space
          await FileSystem.deleteAsync(chunkLocalPath, { idempotent: true });

          // Append raw bytes to the destination file (no base64 boundary issues)
          destFile.write(chunkBytes, { append: i > 0 });
        }

        if (onProgress) {
          onProgress(100);
        }

        return {
          success: true,
          message: 'File assembled successfully.',
          localUri: finalDestUri,
        };
      }
    } catch (error: any) {
      console.error('Download and rebuild error:', error);
      return {
        success: false,
        message: error.message || 'Failed to download and rebuild file.',
        localUri: null,
      };
    }
    })();

    activeRebuilds.set(largeFileId, rebuildTask);
    return rebuildTask.finally(() => {
      activeRebuilds.delete(largeFileId);
    });
  }
};

export default largeFileDownloadService;
