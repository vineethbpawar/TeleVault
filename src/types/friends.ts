import { UserProfile } from './chat';

export interface FriendRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  sender?: UserProfile;
  receiver?: UserProfile;
}

export interface Friendship {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
  friend_profile?: UserProfile;
}

export interface UserBlock {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string;
  blocked_profile?: UserProfile;
}

export interface UserReport {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  details?: string | null;
  status: 'pending' | 'reviewed' | 'dismissed';
  created_at: string;
  reporter_profile?: UserProfile;
  reported_profile?: UserProfile;
}
