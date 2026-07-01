export type SnapType = 'direct' | 'story';
export type SnapMediaType = 'image' | 'video';

export interface Snap {
  id: string;
  sender_id: string;
  receiver_id?: string | null;
  conversation_id?: string | null;
  snap_type: SnapType;
  media_type: SnapMediaType;
  media_url?: string | null;
  telegram_file_id?: string | null;
  telegram_message_id?: string | null;
  caption?: string | null;
  overlay_metadata?: any;
  view_once?: boolean;
  is_viewed?: boolean;
  viewed_at?: string | null;
  expires_at?: string | null;
  created_at: string;
  sender_profile?: {
    username?: string | null;
    full_name?: string | null;
  };
}

export interface StoryView {
  id: string;
  story_id: string;
  viewer_id: string;
  viewed_at: string;
}
