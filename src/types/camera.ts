export type CameraTimerOption = 'off' | '3s' | '5s' | '10s';

export type CameraLensType =
  | 'none'
  | 'original'
  | 'warm'
  | 'cool'
  | 'bw'
  | 'soft'
  | 'night'
  | 'time'
  | 'date'
  | 'vault'
  | 'private'
  | 'time_date'
  | 'location'
  | 'emoji'
  | 'crown'
  | 'sunglasses'
  | 'heart_eyes'
  | 'fire'
  | 'glow'
  | 'vintage'
  | 'vignette'
  | 'beauty_light'
  | 'text'
  | 'music'
  | 'weather'
  | 'poll'
  | 'question';

export interface MediaOverlayItem {
  id: string;
  type: CameraLensType;
  text: string | null;
  emoji: string | null;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  color: string | null;
  created_at: string;
}

export type UploadStatus = 'pending' | 'uploading' | 'completed' | 'failed';

export type UploadDestination = 'memories' | 'drive' | 'private';

export interface UploadQueueItem {
  id: string;
  local_uri: string;
  file_name: string;
  file_type: 'image' | 'video' | 'document';
  mime_type: string;
  file_size: number;
  destination: UploadDestination;
  folder_id: string | null;
  is_private: boolean;
  is_drive_file: boolean;
  overlay_metadata: any | null;
  status: UploadStatus;
  progress: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  upload_mode?: 'normal' | 'chunked';
  large_file_id?: string | null;
  chunk_progress?: string;
  stage?: string;
  local_thumbnail_uri?: string | null;
}

export interface OptimizedMedia {
  uri: string;
  fileSize: number;
}
