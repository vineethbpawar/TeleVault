import { UserProfile } from './chat';

export interface Group {
  id: string;
  name: string;
  creator_id: string;
  avatar_url?: string | null;
  created_at: string;
  members?: GroupMember[];
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: 'admin' | 'member';
  created_at: string;
  profile?: UserProfile;
}

export interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  message_type: 'text' | 'snap';
  message_text?: string | null;
  snap_id?: string | null;
  telegram_message_id?: string | null;
  created_at: string;
  sender?: UserProfile;
  snap?: any;
}
