import { CameraLensType, UploadDestination } from '../types/camera';

export type { CameraLensType, UploadDestination };

export interface CameraLens {
  type: CameraLensType;
  label: string;
  icon: string;
}

export const LENSES: CameraLens[] = [
  { type: 'original', label: 'Original', icon: '🚫' },
  { type: 'time', label: 'Time', icon: '🕒' },
  { type: 'date', label: 'Date', icon: '📅' },
  { type: 'time_date', label: 'Time & Date', icon: '⏰' },
  { type: 'location', label: 'Location', icon: '📍' },
  { type: 'date_location', label: 'Date & Location', icon: '🗺️' },
];

export interface CaptureResult {
  uri: string;
  type: 'image' | 'video';
  mime_type: string;
}
