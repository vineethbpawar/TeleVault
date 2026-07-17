import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { telegramService } from './telegramService';
import { LargeFile, LargeFileChunk, LargeFileStatus, LargeUploadProgress, ChunkedUploadOptions } from '../types/largeFile';
import { Platform } from 'react-native';

async function deleteFileHelper(tempUri: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (tempUri.startsWith('blob:')) {
        URL.revokeObjectURL(tempUri);
      }
    } catch (_) {}
  } else {
    await FileSystem.deleteAsync(tempUri, { idempotent: true });
  }
}

export const NORMAL_TELEGRAM_LIMIT_BYTES = Platform.OS === 'web' ? 4 * 1024 * 1024 : 50 * 1024 * 1024;
export const CHUNK_SIZE_BYTES = Platform.OS === 'web' ? 4 * 1024 * 1024 : 45 * 1024 * 1024;
export const MAX_CHUNKED_FILE_BYTES = 500 * 1024 * 1024;

export const largeFileService = {
  shouldUseChunking(fileSize: number): boolean {
    return fileSize > NORMAL_TELEGRAM_LIMIT_BYTES;
  },

  validateLargeFile(file: { size: number; name?: string }): { valid: boolean; error?: string } {
    if (file.size > MAX_CHUNKED_FILE_BYTES) {
      return {
        valid: false,
        error: `This file is too large for Large File Mode MVP. Current max is 500 MB.`,
      };
    }
    return { valid: true };
  },

  async createLargeFileRecord(
    file: { size: number; name: string; mimeType: string | null; fileType: 'image' | 'video' | 'document' },
    destination: 'memories' | 'drive' | 'private',
    folderId: string | null,
    isPrivate: boolean
  ): Promise<string> {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('User session not found.');
    }

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE_BYTES);

    const { data, error } = await supabase
      .from('large_files')
      .insert({
        owner_id: user.id,
        original_file_name: file.name,
        mime_type: file.mimeType || 'application/octet-stream',
        file_type: file.fileType,
        total_size: file.size,
        total_chunks: totalChunks,
        chunk_size: CHUNK_SIZE_BYTES,
        status: 'pending',
        destination: destination,
        folder_id: folderId,
        is_private: isPrivate,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Create Large File Record Error:', error);
      throw new Error(error.message || 'Failed to create large file record.');
    }

    return data.id;
  },

  async createChunkRecords(
    largeFileId: string,
    totalChunks: number,
    totalSize: number,
    originalFileName: string
  ): Promise<void> {
    const chunksToInsert = [];
    for (let i = 0; i < totalChunks; i++) {
      const startPos = i * CHUNK_SIZE_BYTES;
      const thisChunkSize = Math.min(CHUNK_SIZE_BYTES, totalSize - startPos);
      chunksToInsert.push({
        large_file_id: largeFileId,
        chunk_index: i,
        chunk_file_name: `${originalFileName}.part${i + 1}`,
        chunk_size: thisChunkSize,
        status: 'pending',
      });
    }

    const { error } = await supabase
      .from('large_file_chunks')
      .insert(chunksToInsert);

    if (error) {
      console.error('Create Chunk Records Error:', error);
      throw new Error(error.message || 'Failed to create chunk records.');
    }
  },

  async sliceChunk(
    uri: string,
    index: number,
    totalSize: number,
    chunkSize: number
  ): Promise<string> {
    const position = index * chunkSize;
    const length = Math.min(chunkSize, totalSize - position);

    if (Platform.OS === 'web') {
      let blob: Blob | null = null;
      if (uri.startsWith('webblob:')) {
        const { getWebBlob } = require('./webBlobStore');
        const key = uri.split(':')[1];
        blob = await getWebBlob(key);
      } else if (uri.startsWith('blob:')) {
        const res = await fetch(uri);
        blob = await res.blob();
      } else if (uri.startsWith('data:')) {
        const arr = uri.split(',');
        const mime = arr[0].match(/:(.*?);/)![1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        blob = new Blob([u8arr], { type: mime });
      } else {
        const res = await fetch(uri);
        blob = await res.blob();
      }
      if (!blob) throw new Error('IndexedDB blob not found for slicing.');
      const slicedBlob = blob.slice(position, position + length);
      return URL.createObjectURL(slicedBlob);
    }

    const tempUri = `${FileSystem.cacheDirectory}chunk_${index}_${Date.now()}.tmp`;

    const base64Data = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: position,
      length: length,
    });

    await FileSystem.writeAsStringAsync(tempUri, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return tempUri;
  },

  async splitFileIntoTempChunkFiles(
    uri: string,
    totalSize: number,
    chunkSize: number
  ): Promise<string[]> {
    const totalChunks = Math.ceil(totalSize / chunkSize);
    const chunkUris: string[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const tempUri = await this.sliceChunk(uri, i, totalSize, chunkSize);
      chunkUris.push(tempUri);
    }

    return chunkUris;
  },

  async uploadChunkToTelegram(
    chunkUri: string,
    chunkInfo: {
      large_file_id: string;
      chunk_index: number;
      chunk_file_name: string;
      original_file_name: string;
      total_chunks: number;
    },
    signal?: AbortSignal,
    itemId?: string
  ): Promise<{ telegramMessageId: string; telegramFileId: string }> {
    const caption = `📦 Part ${chunkInfo.chunk_index + 1}/${chunkInfo.total_chunks}\n` +
                    `File: ${chunkInfo.original_file_name}\n` +
                    `ID: ${chunkInfo.large_file_id}`;

    return await telegramService.sendFileChunkToTelegram(chunkUri, caption, undefined, signal, itemId);
  },

  async uploadLargeFileInChunks(
    file: { uri: string; name: string; size: number; mimeType: string | null; fileType: 'image' | 'video' | 'document' },
    options: ChunkedUploadOptions,
    onProgress?: (progress: LargeUploadProgress) => void
  ): Promise<string> {
    const validation = this.validateLargeFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const largeFileId = await this.createLargeFileRecord(
      file,
      options.destination,
      options.folderId || null,
      options.isPrivate || false
    );

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE_BYTES);
    await this.createChunkRecords(largeFileId, totalChunks, file.size, file.name);

    await this.resumeLargeFileUpload(largeFileId, file.uri, onProgress);

    return largeFileId;
  },

  async resumeLargeFileUpload(
    largeFileId: string,
    localUri: string,
    onProgress?: (progress: LargeUploadProgress) => void,
    signal?: AbortSignal,
    itemId?: string
  ): Promise<void> {
    const { data: largeFile, error: fileError } = await supabase
      .from('large_files')
      .select('*')
      .eq('id', largeFileId)
      .single();

    if (fileError || !largeFile) {
      throw new Error('Large file record not found.');
    }

    await supabase
      .from('large_files')
      .update({ status: 'uploading' })
      .eq('id', largeFileId);

    const { data: chunks, error: chunksError } = await supabase
      .from('large_file_chunks')
      .select('*')
      .eq('large_file_id', largeFileId)
      .order('chunk_index', { ascending: true });

    if (chunksError || !chunks) {
      throw new Error('Chunks record not found.');
    }

    const totalChunks = largeFile.total_chunks;

    const pendingChunks = chunks.filter((c: any) => c.status !== 'completed');

    if (pendingChunks.length > 0) {
      const CONCURRENCY_LIMIT = Platform.OS === 'web' ? 3 : 2;
      let errorOccurred: Error | null = null;
      let currentIndex = 0;

      const uploadWorker = async (): Promise<void> => {
        while (currentIndex < pendingChunks.length && !errorOccurred && !signal?.aborted) {
          const chunk = pendingChunks[currentIndex++];
          if (!chunk) break;

          await supabase
            .from('large_file_chunks')
            .update({ status: 'uploading', error_message: null })
            .eq('id', chunk.id);

          let tempUri = '';
          try {
            const currentCompletedCount = chunks.filter((c: any) => c.status === 'completed').length;
            if (onProgress) {
              onProgress({
                largeFileId,
                totalChunks,
                uploadedChunks: currentCompletedCount,
                progressPercent: Math.round((currentCompletedCount / totalChunks) * 100),
                status: 'uploading',
              });
            }

            tempUri = await this.sliceChunk(localUri, chunk.chunk_index, largeFile.total_size, largeFile.chunk_size);

            if (signal?.aborted) {
              throw new Error('Upload aborted by user');
            }

            const uploadResult = await this.uploadChunkToTelegram(tempUri, {
              large_file_id: largeFileId,
              chunk_index: chunk.chunk_index,
              chunk_file_name: chunk.chunk_file_name,
              original_file_name: largeFile.original_file_name,
              total_chunks: totalChunks,
            }, signal, itemId);

            await supabase
              .from('large_file_chunks')
              .update({
                status: 'completed',
                telegram_message_id: uploadResult.telegramMessageId,
                telegram_file_id: uploadResult.telegramFileId,
                uploaded_at: new Date().toISOString(),
              })
              .eq('id', chunk.id);

            try {
              await deleteFileHelper(tempUri);
            } catch (_) {}

            chunk.status = 'completed';

            const newCompletedCount = chunks.filter((c: any) => c.status === 'completed').length;
            if (onProgress) {
              onProgress({
                largeFileId,
                totalChunks,
                uploadedChunks: newCompletedCount,
                progressPercent: Math.round((newCompletedCount / totalChunks) * 100),
                status: 'uploading',
              });
            }
          } catch (err: any) {
            console.error(`Chunk ${chunk.chunk_index} upload failed:`, err);

            await supabase
              .from('large_file_chunks')
              .update({
                status: 'failed',
                retry_count: (chunk.retry_count || 0) + 1,
                error_message: err.message || 'Chunk upload failed',
              })
              .eq('id', chunk.id);

            await supabase
              .from('large_files')
              .update({ status: 'failed' })
              .eq('id', largeFileId);

            if (tempUri) {
              try {
                await deleteFileHelper(tempUri);
              } catch (_) {}
            }

            errorOccurred = err;
            throw err;
          }
        }
      };

      const workers: Promise<void>[] = [];
      const limit = Math.min(CONCURRENCY_LIMIT, pendingChunks.length);
      for (let i = 0; i < limit; i++) {
        workers.push(uploadWorker());
      }

      await Promise.all(workers);

      if (errorOccurred) {
        throw errorOccurred;
      }
    }

    await this.finalizeLargeFile(largeFile);

    if (onProgress) {
      onProgress({
        largeFileId,
        totalChunks,
        uploadedChunks: totalChunks,
        progressPercent: 100,
        status: 'completed',
      });
    }
  },

  async retryFailedChunk(
    largeFileId: string,
    chunkIndex: number,
    localUri: string
  ): Promise<void> {
    const { data: largeFile, error: fileError } = await supabase
      .from('large_files')
      .select('*')
      .eq('id', largeFileId)
      .single();

    if (fileError || !largeFile) {
      throw new Error('Large file record not found.');
    }

    const { data: chunk, error: chunkError } = await supabase
      .from('large_file_chunks')
      .select('*')
      .eq('large_file_id', largeFileId)
      .eq('chunk_index', chunkIndex)
      .single();

    if (chunkError || !chunk) {
      throw new Error('Chunk record not found.');
    }

    await supabase
      .from('large_file_chunks')
      .update({ status: 'uploading', error_message: null })
      .eq('id', chunk.id);

    let tempUri = '';
    try {
      tempUri = await this.sliceChunk(localUri, chunkIndex, largeFile.total_size, largeFile.chunk_size);

      const uploadResult = await this.uploadChunkToTelegram(tempUri, {
        large_file_id: largeFileId,
        chunk_index: chunkIndex,
        chunk_file_name: chunk.chunk_file_name,
        original_file_name: largeFile.original_file_name,
        total_chunks: largeFile.total_chunks,
      });

      await supabase
        .from('large_file_chunks')
        .update({
          status: 'completed',
          telegram_message_id: uploadResult.telegramMessageId,
          telegram_file_id: uploadResult.telegramFileId,
          uploaded_at: new Date().toISOString(),
        })
        .eq('id', chunk.id);

      const { data: allChunks } = await supabase
        .from('large_file_chunks')
        .select('status')
        .eq('large_file_id', largeFileId);

      const allCompleted = allChunks && allChunks.every((c: any) => c.status === 'completed');
      if (allCompleted) {
        await this.finalizeLargeFile(largeFile);
      }
    } catch (err: any) {
      await supabase
        .from('large_file_chunks')
        .update({
          status: 'failed',
          retry_count: (chunk.retry_count || 0) + 1,
          error_message: err.message || 'Retry failed',
        })
        .eq('id', chunk.id);
      throw err;
    } finally {
      if (tempUri) {
        try {
          await deleteFileHelper(tempUri);
        } catch (_) {}
      }
    }
  },

  async cancelLargeFileUpload(largeFileId: string): Promise<void> {
    await supabase
      .from('large_files')
      .update({ status: 'failed' })
      .eq('id', largeFileId);

    await supabase
      .from('large_file_chunks')
      .update({ status: 'failed', error_message: 'Cancelled by user' })
      .eq('large_file_id', largeFileId)
      .neq('status', 'completed');
  },

  async getLargeFileProgress(largeFileId: string): Promise<LargeUploadProgress> {
    const { data: largeFile, error: fileError } = await supabase
      .from('large_files')
      .select('status, total_chunks')
      .eq('id', largeFileId)
      .single();

    if (fileError || !largeFile) {
      throw new Error('Large file record not found.');
    }

    const { data: chunks, error: chunksError } = await supabase
      .from('large_file_chunks')
      .select('status')
      .eq('large_file_id', largeFileId);

    if (chunksError || !chunks) {
      throw new Error('Could not retrieve chunk status.');
    }

    const uploadedChunks = chunks.filter((c: any) => c.status === 'completed').length;
    const progressPercent = Math.round((uploadedChunks / largeFile.total_chunks) * 100);

    return {
      largeFileId,
      totalChunks: largeFile.total_chunks,
      uploadedChunks,
      progressPercent,
      status: largeFile.status as LargeFileStatus,
    };
  },

  async finalizeLargeFile(largeFile: any): Promise<void> {
    const completedAt = new Date().toISOString();

    await supabase
      .from('large_files')
      .update({
        status: 'completed',
        completed_at: completedAt,
      })
      .eq('id', largeFile.id);

    const { data: firstChunk } = await supabase
      .from('large_file_chunks')
      .select('telegram_message_id, telegram_file_id')
      .eq('large_file_id', largeFile.id)
      .eq('chunk_index', 0)
      .single();

    // Check if there is an existing placeholder record in 'files' table for this large file
    const { data: existingFiles } = await supabase
      .from('files')
      .select('id')
      .eq('user_id', largeFile.owner_id)
      .eq('file_name', largeFile.original_file_name)
      .is('telegram_file_id', null)
      .order('created_at', { ascending: false });

    if (existingFiles && existingFiles.length > 0) {
      const { error: updateError } = await supabase
        .from('files')
        .update({
          is_chunked: true,
          large_file_id: largeFile.id,
          telegram_message_id: firstChunk?.telegram_message_id || null,
          telegram_file_id: firstChunk?.telegram_file_id || null,
        })
        .eq('id', existingFiles[0].id);

      if (updateError) {
        console.error('Finalize Large File update files error:', updateError);
        throw new Error(updateError.message || 'Failed to update files record.');
      }
    } else {
      const { error: insertError } = await supabase
        .from('files')
        .insert({
          user_id: largeFile.owner_id,
          folder_id: largeFile.folder_id,
          file_name: largeFile.original_file_name,
          file_type: largeFile.file_type,
          mime_type: largeFile.mime_type,
          file_size: largeFile.total_size,
          is_private: largeFile.is_private,
          is_drive_file: largeFile.destination === 'drive' || largeFile.destination === 'private',
          is_chunked: true,
          large_file_id: largeFile.id,
          telegram_message_id: firstChunk?.telegram_message_id || null,
          telegram_file_id: firstChunk?.telegram_file_id || null,
          telegram_file_unique_id: null,
          local_thumbnail_uri: null,
        });

      if (insertError) {
        console.error('Finalize Large File insert files error:', insertError);
        throw new Error(insertError.message || 'Failed to create files record.');
      }
    }
  },

  async getLargeFiles(): Promise<LargeFile[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User session not found.');

    const { data, error } = await supabase
      .from('large_files')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('getLargeFiles Error:', error);
      throw new Error(error.message || 'Failed to fetch large files.');
    }

    return (data || []) as LargeFile[];
  },

  async getLargeFileChunks(largeFileId: string): Promise<LargeFileChunk[]> {
    const { data, error } = await supabase
      .from('large_file_chunks')
      .select('*')
      .eq('large_file_id', largeFileId)
      .order('chunk_index', { ascending: true });

    if (error) {
      console.error('getLargeFileChunks Error:', error);
      throw new Error(error.message || 'Failed to fetch large file chunks.');
    }

    return (data || []) as LargeFileChunk[];
  },

  async getLargeFileStats(): Promise<{ active: number; failed: number; completed: number }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { active: 0, failed: 0, completed: 0 };

    const { data, error } = await supabase
      .from('large_files')
      .select('status')
      .eq('owner_id', user.id);

    if (error) {
      console.error('getLargeFileStats Error:', error);
      return { active: 0, failed: 0, completed: 0 };
    }

    const stats = { active: 0, failed: 0, completed: 0 };
    (data || []).forEach((file) => {
      if (file.status === 'uploading' || file.status === 'pending') {
        stats.active++;
      } else if (file.status === 'failed' || file.status === 'cancelled') {
        stats.failed++;
      } else if (file.status === 'completed') {
        stats.completed++;
      }
    });

    return stats;
  },

  async deleteLargeFileMetadata(largeFileId: string): Promise<void> {
    const { error } = await supabase
      .from('large_files')
      .delete()
      .eq('id', largeFileId);

    if (error) {
      console.error('deleteLargeFileMetadata Error:', error);
      throw new Error(error.message || 'Failed to delete large file metadata.');
    }
  },

  async resumeLargeFileUploadNoUri(largeFileId: string): Promise<void> {
    const { queueStore } = require('./queueStore');
    const { queueProcessorRegistry } = require('./queueProcessorRegistry');
    const item = await queueStore.getItemByLargeFileId(largeFileId);
    if (!item) {
      throw new Error('Original file not found in upload queue. Please re-upload the file.');
    }
    
    await supabase
      .from('large_files')
      .update({ status: 'pending' })
      .eq('id', largeFileId);

    await queueStore.updateUploadQueueItem(item.id, {
      status: 'pending',
      progress: 0,
      stage: 'Queued',
      error_message: null,
    });
    
    queueProcessorRegistry.triggerQueueProcessing().catch((err: any) => {
      console.error('Failed to process queue on resume:', err);
    });
  },

  async retryFailedChunks(largeFileId: string): Promise<void> {
    const { queueStore } = require('./queueStore');
    const { queueProcessorRegistry } = require('./queueProcessorRegistry');
    const item = await queueStore.getItemByLargeFileId(largeFileId);
    if (!item) {
      throw new Error('Original file not found in upload queue. Please re-upload the file.');
    }

    await supabase
      .from('large_file_chunks')
      .update({ status: 'pending', error_message: null })
      .eq('large_file_id', largeFileId)
      .eq('status', 'failed');

    await supabase
      .from('large_files')
      .update({ status: 'pending' })
      .eq('id', largeFileId);

    await queueStore.updateUploadQueueItem(item.id, {
      status: 'pending',
      progress: 0,
      stage: 'Queued',
      error_message: null,
    });
    
    queueProcessorRegistry.triggerQueueProcessing().catch((err: any) => {
      console.error('Failed to process queue on retry:', err);
    });
  },

  async retrySingleChunk(largeFileId: string, chunkIndex: number): Promise<void> {
    const { queueStore } = require('./queueStore');
    const { queueProcessorRegistry } = require('./queueProcessorRegistry');
    const item = await queueStore.getItemByLargeFileId(largeFileId);
    if (!item) {
      throw new Error('Original file not found in upload queue.');
    }

    await supabase
      .from('large_file_chunks')
      .update({ status: 'pending', error_message: null })
      .eq('large_file_id', largeFileId)
      .eq('chunk_index', chunkIndex);

    await supabase
      .from('large_files')
      .update({ status: 'pending' })
      .eq('id', largeFileId);

    await queueStore.updateUploadQueueItem(item.id, {
      status: 'pending',
      progress: 0,
      stage: 'Queued',
      error_message: null,
    });
    
    queueProcessorRegistry.triggerQueueProcessing().catch((err: any) => {
      console.error('Failed to process queue on single retry:', err);
    });
  }
};
