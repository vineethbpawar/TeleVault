import { supabase } from '../lib/supabase';
import { LargeFileChunk } from '../types/largeFile';

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
   * Placeholder for download and rebuild.
   */
  async downloadAndRebuildLargeFile(largeFileId: string): Promise<{
    success: boolean;
    message: string;
    localUri: string | null;
  }> {
    try {
      const { chunkCount, originalFileName } = await this.getChunkInfo(largeFileId);
      const chunks = await this.listChunks(largeFileId);
      
      const uploadedChunks = chunks.filter(c => c.status === 'completed').length;

      return {
        success: false,
        message: `Rebuild/download for chunked files is beta. This file consists of ${uploadedChunks}/${chunkCount} uploaded parts. True byte-level reconstruction on-device is currently in development.`,
        localUri: null,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to download and rebuild file.',
        localUri: null,
      };
    }
  }
};

export default largeFileDownloadService;
