export type LargeFileStatus = 'pending' | 'uploading' | 'completed' | 'failed' | 'cancelled';

export interface LargeFile {
  id: string;
  owner_id: string;
  original_file_name: string;
  mime_type: string | null;
  file_type: 'image' | 'video' | 'document';
  total_size: number;
  total_chunks: number;
  chunk_size: number;
  status: LargeFileStatus;
  destination: 'memories' | 'drive' | 'private';
  folder_id: string | null;
  is_private: boolean;
  telegram_album_key?: string | null;
  checksum?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface LargeFileChunk {
  id: string;
  large_file_id: string;
  chunk_index: number;
  chunk_file_name: string;
  chunk_size: number;
  telegram_message_id?: string | null;
  telegram_file_id?: string | null;
  status: LargeFileStatus;
  retry_count: number;
  error_message?: string | null;
  created_at: string;
  uploaded_at?: string | null;
}

export interface LargeUploadProgress {
  largeFileId: string;
  totalChunks: number;
  uploadedChunks: number;
  progressPercent: number;
  status: LargeFileStatus;
}

export interface ChunkedUploadOptions {
  destination: 'memories' | 'drive' | 'private';
  folderId?: string | null;
  isPrivate?: boolean;
  isDriveFile?: boolean;
}
