import { supabase } from '../lib/supabase';
import { FriendRequest, Friendship, UserBlock, UserReport } from '../types/friends';
import { UserProfile } from '../types/chat';

const sortUserIds = (id1: string, id2: string) => {
  return id1.toLowerCase() < id2.toLowerCase()
    ? { user_a: id1, user_b: id2 }
    : { user_a: id2, user_b: id1 };
};

export const friendService = {
  /**
   * Send a friend request to another user.
   */
  async sendFriendRequest(receiverId: string): Promise<FriendRequest> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    // 1. Check if blocked
    const blocked = await this.isBlockedRelation(user.id, receiverId);
    if (blocked) {
      throw new Error('Cannot send friend request: Blocked user relationship exists.');
    }

    // 2. Insert request
    const { data, error } = await supabase
      .from('friend_requests')
      .insert({
        sender_id: user.id,
        receiver_id: receiverId,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('Send Friend Request Error:', error);
      throw new Error(error.message || 'Failed to send friend request.');
    }

    return data as FriendRequest;
  },

  /**
   * Accept an incoming friend request.
   */
  async acceptFriendRequest(requestId: string, senderId: string): Promise<Friendship> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    // 1. Create friendship (upsert to handle if already created or existing)
    const { user_a, user_b } = sortUserIds(user.id, senderId);
    
    const { data, error } = await supabase
      .from('friendships')
      .upsert({ user_a, user_b }, { onConflict: 'user_a,user_b' })
      .select()
      .single();

    if (error) {
      console.error('Create Friendship Error:', error);
      throw new Error(error.message || 'Failed to establish friendship.');
    }

    // 2. Delete the pending request after friendship is created
    await supabase
      .from('friend_requests')
      .delete()
      .eq('id', requestId);

    return data as Friendship;
  },

  /**
   * Reject a friend request.
   */
  async rejectFriendRequest(requestId: string): Promise<void> {
    const { error } = await supabase
      .from('friend_requests')
      .delete()
      .eq('id', requestId);

    if (error) {
      console.error('Reject Friend Request Error:', error);
      throw new Error(error.message || 'Failed to reject request.');
    }
  },

  /**
   * Cancel a sent friend request.
   */
  async cancelFriendRequest(requestId: string): Promise<void> {
    const { error } = await supabase
      .from('friend_requests')
      .delete()
      .eq('id', requestId);

    if (error) {
      console.error('Cancel Friend Request Error:', error);
      throw new Error(error.message || 'Failed to cancel request.');
    }
  },

  /**
   * Remove an existing friend.
   */
  async removeFriend(friendId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    const { user_a, user_b } = sortUserIds(user.id, friendId);

    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('user_a', user_a)
      .eq('user_b', user_b);

    if (error) {
      console.error('Remove Friend Error:', error);
      throw new Error(error.message || 'Failed to remove friend.');
    }
  },

  /**
   * Get list of friends with profiles.
   */
  async getFriends(): Promise<UserProfile[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    const { data, error } = await supabase
      .from('friendships')
      .select('*')
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);

    if (error) {
      console.error('Get Friends Error:', error);
      throw new Error(error.message || 'Failed to fetch friends list.');
    }

    const friendIds = (data || []).map(f => f.user_a === user.id ? f.user_b : f.user_a);
    if (friendIds.length === 0) return [];

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .in('id', friendIds);

    if (profileError) {
      console.error('Get Friends Profiles Error:', profileError);
      throw new Error(profileError.message || 'Failed to fetch profiles.');
    }

    return (profiles || []) as UserProfile[];
  },

  /**
   * Get pending incoming friend requests.
   */
  async getPendingRequests(): Promise<FriendRequest[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    // Try joined query first
    const { data, error } = await supabase
      .from('friend_requests')
      .select('*, sender:profiles!friend_requests_sender_id_fkey(*)')
      .eq('receiver_id', user.id)
      .eq('status', 'pending');

    if (!error && data && data.length > 0 && data[0].sender) {
      return data as FriendRequest[];
    }

    // Two-step fallback if join relationship hint fails or returns null profile
    const { data: rawRequests, error: rawError } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('receiver_id', user.id)
      .eq('status', 'pending');

    if (rawError) {
      console.error('Get Pending Requests Error:', rawError);
      throw new Error(rawError.message || 'Failed to fetch requests.');
    }

    if (!rawRequests || rawRequests.length === 0) return [];

    const senderIds = Array.from(new Set(rawRequests.map(r => r.sender_id)));
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', senderIds);

    const profileMap = new Map((profiles || []).map(p => [p.id, p]));

    return rawRequests.map(r => ({
      ...r,
      sender: profileMap.get(r.sender_id) as any,
    })) as FriendRequest[];
  },

  /**
   * Get sent friend requests.
   */
  async getSentRequests(): Promise<FriendRequest[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    // Try joined query first
    const { data, error } = await supabase
      .from('friend_requests')
      .select('*, receiver:profiles!friend_requests_receiver_id_fkey(*)')
      .eq('sender_id', user.id)
      .eq('status', 'pending');

    if (!error && data && data.length > 0 && data[0].receiver) {
      return data as FriendRequest[];
    }

    // Two-step fallback
    const { data: rawRequests, error: rawError } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('sender_id', user.id)
      .eq('status', 'pending');

    if (rawError) {
      console.error('Get Sent Requests Error:', rawError);
      throw new Error(rawError.message || 'Failed to fetch sent requests.');
    }

    if (!rawRequests || rawRequests.length === 0) return [];

    const receiverIds = Array.from(new Set(rawRequests.map(r => r.receiver_id)));
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', receiverIds);

    const profileMap = new Map((profiles || []).map(p => [p.id, p]));

    return rawRequests.map(r => ({
      ...r,
      receiver: profileMap.get(r.receiver_id) as any,
    })) as FriendRequest[];
  },

  /**
   * Block a user.
   */
  async blockUser(blockedId: string): Promise<UserBlock> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    // 1. Insert Block
    const { data, error } = await supabase
      .from('user_blocks')
      .insert({
        blocker_id: user.id,
        blocked_id: blockedId
      })
      .select()
      .single();

    if (error) {
      console.error('Block User Error:', error);
      throw new Error(error.message || 'Failed to block user.');
    }

    // 2. Automatically delete friendship and friend requests
    const { user_a, user_b } = sortUserIds(user.id, blockedId);
    await supabase.from('friendships').delete().eq('user_a', user_a).eq('user_b', user_b);
    await supabase.from('friend_requests').delete().or(`and(sender_id.eq.${user.id},receiver_id.eq.${blockedId}),and(sender_id.eq.${blockedId},receiver_id.eq.${user.id})`);

    return data as UserBlock;
  },

  /**
   * Unblock a user.
   */
  async unblockUser(blockedId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    const { error } = await supabase
      .from('user_blocks')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', blockedId);

    if (error) {
      console.error('Unblock User Error:', error);
      throw new Error(error.message || 'Failed to unblock user.');
    }
  },

  /**
   * Get list of blocked users.
   */
  async getBlockedUsers(): Promise<UserProfile[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    const { data, error } = await supabase
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', user.id);

    if (error) {
      console.error('Get Blocked Users Error:', error);
      throw new Error(error.message || 'Failed to fetch blocked users.');
    }

    const blockedIds = (data || []).map(b => b.blocked_id);
    if (blockedIds.length === 0) return [];

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .in('id', blockedIds);

    if (profileError) {
      console.error('Get Blocked Profiles Error:', profileError);
      throw new Error(profileError.message || 'Failed to fetch profiles.');
    }

    return (profiles || []) as UserProfile[];
  },

  /**
   * Report a user.
   */
  async reportUser(reportedId: string, reason: string, details?: string): Promise<UserReport> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    const { data, error } = await supabase
      .from('user_reports')
      .insert({
        reporter_id: user.id,
        reported_id: reportedId,
        reason,
        details,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('Report User Error:', error);
      throw new Error(error.message || 'Failed to file report.');
    }

    return data as UserReport;
  },

  /**
   * Helper to check friendship status.
   */
  async isFriend(friendId: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { user_a, user_b } = sortUserIds(user.id, friendId);

    const { data, error } = await supabase
      .from('friendships')
      .select('id')
      .eq('user_a', user_a)
      .eq('user_b', user_b)
      .maybeSingle();

    if (error) return false;
    return !!data;
  },

  /**
   * Helper to check block status between two users (either way).
   */
  async isBlockedRelation(userId: string, targetId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('user_blocks')
      .select('id')
      .or(`and(blocker_id.eq.${userId},blocked_id.eq.${targetId}),and(blocker_id.eq.${targetId},blocked_id.eq.${userId})`)
      .limit(1);

    if (error) return false;
    return (data || []).length > 0;
  },

  /**
   * Check friendship status of the current user with another user,
   * returning 'none', 'pending_sent', 'pending_received', or 'friends'.
   */
  async getFriendshipStatus(targetId: string): Promise<'none' | 'pending_sent' | 'pending_received' | 'friends'> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'none';

    // 1. Check friendship
    const friends = await this.isFriend(targetId);
    if (friends) return 'friends';

    // 2. Check friend request
    const { data: req, error } = await supabase
      .from('friend_requests')
      .select('*')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${user.id})`)
      .maybeSingle();

    if (error || !req) return 'none';

    if (req.sender_id === user.id) {
      return 'pending_sent';
    } else {
      return 'pending_received';
    }
  }
};

export default friendService;
