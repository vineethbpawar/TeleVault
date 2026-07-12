import { CameraLensType, UploadDestination } from '../types/camera';

export type { CameraLensType, UploadDestination };

export interface CameraLens {
  type: CameraLensType;
  label: string;
  icon: string;
}

export const LENSES: CameraLens[] = [
  { type: 'original', label: 'Original', icon: '🚫' },
  { type: 'warm', label: 'Warm', icon: '🔥' },
  { type: 'cool', label: 'Cool', icon: '❄️' },
  { type: 'bw', label: 'B/W', icon: '🏁' },
  { type: 'soft', label: 'Soft', icon: '🌸' },
  { type: 'night', label: 'Night', icon: '🌙' },
  { type: 'time', label: 'Time', icon: '🕒' },
  { type: 'date', label: 'Date', icon: '📅' },
  { type: 'location', label: 'Geo Location', icon: '🗺️' },
  { type: 'vintage', label: 'Retro VHS', icon: '📼' },
  { type: 'glow', label: 'Cyber Neon', icon: '🌐' },
  { type: 'beauty_light', label: 'Glam Glow', icon: '✨' },
  { type: 'weather', label: 'Stamp Combo', icon: '📍' },
  { type: 'vault', label: 'Vault', icon: '🏛️' },
  { type: 'private', label: 'Private', icon: '🔒' },
];

export interface CaptureResult {
  uri: string;
  type: 'image' | 'video';
  mime_type: string;
}
