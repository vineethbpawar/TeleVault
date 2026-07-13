export interface UserProfile {
  id: string;
  email?: string;
  full_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  role?: string;
  privacy_message_me?: string;
  privacy_send_snaps?: string;
  privacy_view_stories?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Conversation {
  id: string;
  participant_a: string;
  participant_b: string;
  telegram_thread_key?: string | null;
  last_message_preview?: string | null;
  last_message_at?: string | null;
  created_at: string;
  updated_at: string;
  other_user?: UserProfile;
  unread_count?: number;
}

export type ChatMessageStatus = 'sending' | 'failed' | 'sent' | 'delivered' | 'read';

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  message_type: 'text' | 'snap';
  message_text?: string | null;
  telegram_message_id?: string | null;
  snap_id?: string | null;
  status: ChatMessageStatus;
  created_at: string;
  snap?: any;
  deleted_at?: string | null;
  is_saved_by_users?: string[];
}
