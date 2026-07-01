import { UserProfile } from './chat';

export interface AppNotification {
  id: string;
  user_id: string;
  sender_id?: string | null;
  title: string;
  body: string;
  type: 'message' | 'snap' | 'friend_request' | 'story_view' | 'upload_complete';
  data?: any;
  is_read: boolean;
  created_at: string;
  sender?: UserProfile;
}

export interface UserPushToken {
  id: string;
  user_id: string;
  token: string;
  created_at: string;
}
