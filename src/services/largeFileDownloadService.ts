import { supabase } from '../lib/supabase';
import { LargeFileChunk } from '../types/largeFile';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { telegramService } from './telegramService';

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
    try {
      const { chunkCount, totalSize, originalFileName } = await this.getChunkInfo(largeFileId);
      const chunks = await this.listChunks(largeFileId);
      
      const completedChunks = chunks.filter(c => c.status === 'completed');
      if (completedChunks.length !== chunkCount) {
        throw new Error(`Cannot rebuild file: only ${completedChunks.length}/${chunkCount} chunks completed.`);
      }

      if (Platform.OS === 'web') {
        const chunkBlobs: Blob[] = [];
        for (let i = 0; i < completedChunks.length; i++) {
          const chunk = completedChunks[i];
          if (onProgress) {
            onProgress(Math.round((i / completedChunks.length) * 100));
          }
          
          let chunkUrl = '';
          if (!isPrivate) {
            chunkUrl = await telegramService.getTelegramFileDownloadUrl(chunk.telegram_file_id!);
          } else {
            const cachedUri = await telegramService.downloadTelegramFileToCache(chunk.telegram_file_id!, chunk.chunk_file_name);
            const { encryptionService } = require('./encryptionService');
            chunkUrl = await encryptionService.decryptFile(cachedUri, chunk.chunk_file_name, mimeType || undefined);
          }

          const res = await fetch(chunkUrl);
          if (!res.ok) throw new Error(`Failed to download chunk ${chunk.chunk_index}`);
          const blob = await res.blob();
          chunkBlobs.push(blob);
        }

        const combinedBlob = new Blob(chunkBlobs, { type: mimeType || 'application/octet-stream' });
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
        const safeName = originalFileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const finalDestUri = `${FileSystem.cacheDirectory}rebuilt_${Date.now()}_${safeName}`;

        const finalBuffer = new Uint8Array(totalSize);
        let currentOffset = 0;

        for (let i = 0; i < completedChunks.length; i++) {
          const chunk = completedChunks[i];
          if (onProgress) {
            onProgress(Math.round((i / completedChunks.length) * 100));
          }

          let chunkLocalPath = await telegramService.downloadTelegramFileToCache(chunk.telegram_file_id!, chunk.chunk_file_name);
          if (isPrivate) {
            const { encryptionService } = require('./encryptionService');
            const decryptedPath = await encryptionService.decryptFile(chunkLocalPath, chunk.chunk_file_name, mimeType || undefined);
            await FileSystem.deleteAsync(chunkLocalPath, { idempotent: true });
            chunkLocalPath = decryptedPath;
          }

          const base64Content = await FileSystem.readAsStringAsync(chunkLocalPath, {
            encoding: FileSystem.EncodingType.Base64,
          });

          await FileSystem.deleteAsync(chunkLocalPath, { idempotent: true });

          const binaryString = atob(base64Content);
          const len = binaryString.length;
          for (let j = 0; j < len; j++) {
            finalBuffer[currentOffset + j] = binaryString.charCodeAt(j);
          }
          currentOffset += len;
        }

        let binaryStr = '';
        const chunkTotalLen = finalBuffer.byteLength;
        const step = 65536;
        for (let j = 0; j < chunkTotalLen; j += step) {
          const subArray = finalBuffer.subarray(j, Math.min(j + step, chunkTotalLen));
          binaryStr += String.fromCharCode.apply(null, subArray as any);
        }
        
        const finalBase64 = btoa(binaryStr);

        await FileSystem.writeAsStringAsync(finalDestUri, finalBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });

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
  }
};

export default largeFileDownloadService;
