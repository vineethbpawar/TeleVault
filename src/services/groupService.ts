import { supabase } from '../lib/supabase';
import { Group, GroupMember, GroupMessage } from '../types/groups';
import { UserProfile } from '../types/chat';
import { friendService } from './friendService';

export const groupService = {
  /**
   * Create a new group.
   */
  async createGroup(name: string, memberIds: string[]): Promise<Group> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    // 1. Insert group row
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .insert({
        name,
        creator_id: user.id
      })
      .select()
      .single();

    if (groupError) {
      console.error('Create Group Error:', groupError);
      throw new Error(groupError.message || 'Failed to create group.');
    }

    // 2. Add creator as admin member
    const { error: creatorMemberError } = await supabase
      .from('group_members')
      .insert({
        group_id: group.id,
        user_id: user.id,
        role: 'admin'
      });

    if (creatorMemberError) {
      console.error('Add Creator to Group Members Error:', creatorMemberError);
    }

    // 3. Add other members (filtering out any blocked relations first)
    const validMemberIds: string[] = [];
    for (const memberId of memberIds) {
      const blocked = await friendService.isBlockedRelation(user.id, memberId);
      if (!blocked) {
        validMemberIds.push(memberId);
      }
    }

    if (validMemberIds.length > 0) {
      const membersToInsert = validMemberIds.map(id => ({
        group_id: group.id,
        user_id: id,
        role: 'member'
      }));

      const { error: membersError } = await supabase
        .from('group_members')
        .insert(membersToInsert);

      if (membersError) {
        console.error('Add Members to Group Error:', membersError);
      }
    }

    return group as Group;
  },

  /**
   * Get all groups the current user is part of.
   */
  async getGroups(): Promise<Group[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    // Find group ids user is member of
    const { data: memberships, error: memError } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id);

    if (memError) {
      console.error('Get Group Memberships Error:', memError);
      throw new Error(memError.message || 'Failed to fetch memberships.');
    }

    const groupIds = (memberships || []).map(m => m.group_id);
    if (groupIds.length === 0) return [];

    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .in('id', groupIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Get Groups Error:', error);
      throw new Error(error.message || 'Failed to fetch groups.');
    }

    return (data || []) as Group[];
  },

  /**
   * Get members of a specific group.
   */
  async getGroupMembers(groupId: string): Promise<GroupMember[]> {
    const { data, error } = await supabase
      .from('group_members')
      .select('*, profile:profiles(*)')
      .eq('group_id', groupId);

    if (error) {
      console.error('Get Group Members Error:', error);
      throw new Error(error.message || 'Failed to fetch group members.');
    }

    return (data || []) as GroupMember[];
  },

  /**
   * Add members to a group.
   */
  async addMembers(groupId: string, memberIds: string[]): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    const newMembers = [];
    for (const memberId of memberIds) {
      const blocked = await friendService.isBlockedRelation(user.id, memberId);
      if (!blocked) {
        newMembers.push({
          group_id: groupId,
          user_id: memberId,
          role: 'member'
        });
      }
    }

    if (newMembers.length === 0) return;

    const { error } = await supabase
      .from('group_members')
      .insert(newMembers);

    if (error) {
      console.error('Add Group Members Error:', error);
      throw new Error(error.message || 'Failed to add members to group.');
    }
  },

  /**
   * Remove a member from a group (Admin only).
   */
  async removeMember(groupId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);

    if (error) {
      console.error('Remove Group Member Error:', error);
      throw new Error(error.message || 'Failed to remove member.');
    }
  },

  /**
   * Leave a group.
   */
  async leaveGroup(groupId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Leave Group Error:', error);
      throw new Error(error.message || 'Failed to leave group.');
    }
  },

  /**
   * Get messages for a group.
   */
  async getGroupMessages(groupId: string): Promise<GroupMessage[]> {
    const { data: msgsData, error: msgsError } = await supabase
      .from('group_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });

    if (msgsError) {
      console.error('Get Group Messages Error:', msgsError);
      throw new Error(msgsError.message || 'Failed to fetch messages.');
    }

    if (!msgsData || msgsData.length === 0) return [];

    const senderIds = Array.from(new Set(msgsData.map(m => m.sender_id).filter(Boolean)));
    const snapIds = Array.from(new Set(msgsData.map(m => m.snap_id).filter(Boolean)));

    const [profilesRes, snapsRes] = await Promise.all([
      senderIds.length > 0
        ? supabase.from('profiles').select('*').in('id', senderIds)
        : Promise.resolve({ data: [] }),
      snapIds.length > 0
        ? supabase.from('snaps').select('*').in('id', snapIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profilesMap: Record<string, any> = {};
    if (profilesRes.data) {
      profilesRes.data.forEach(p => {
        profilesMap[p.id] = p;
      });
    }

    const snapsMap: Record<string, any> = {};
    if (snapsRes.data) {
      snapsRes.data.forEach(s => {
        snapsMap[s.id] = s;
      });
    }

    return msgsData.map(m => ({
      ...m,
      sender: profilesMap[m.sender_id] || null,
      snap: snapsMap[m.snap_id] || null,
    })) as GroupMessage[];
  },

  /**
   * Send a text message to a group.
   */
  async sendGroupMessage(groupId: string, text: string): Promise<GroupMessage> {
    const cleanText = text.trim();
    if (!cleanText) throw new Error('Message content cannot be empty.');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    const { data, error } = await supabase
      .from('group_messages')
      .insert({
        group_id: groupId,
        sender_id: user.id,
        message_type: 'text',
        message_text: cleanText
      })
      .select()
      .single();

    if (error) {
      console.error('Send Group Message Error:', error);
      throw new Error(error.message || 'Failed to send message.');
    }

    return data as GroupMessage;
  },

  /**
   * Send a snap to a group.
   */
  async sendGroupSnap(groupId: string, snapId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    // 1. Insert message record linking to snap
    const { error: msgError } = await supabase
      .from('group_messages')
      .insert({
        group_id: groupId,
        sender_id: user.id,
        message_type: 'snap',
        snap_id: snapId
      });

    if (msgError) {
      console.error('Send Group Snap Message Error:', msgError);
      throw new Error(msgError.message || 'Failed to link snap to group.');
    }

    // 2. Insert group snap association
    const { error: assocError } = await supabase
      .from('group_snaps')
      .insert({
        group_id: groupId,
        snap_id: snapId
      });

    if (assocError) {
      console.error('Send Group Snap Assoc Error:', assocError);
    }
  },

  /**
   * Subscribe to new group messages.
   */
  subscribeToGroupMessages(groupId: string, callback: (message: GroupMessage) => void) {
    return supabase
      .channel(`group_messages:${groupId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
        },
        async (payload) => {
          const msg = payload.new as GroupMessage;
          if (msg.group_id !== groupId) return;
          
          // Fetch sender profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', msg.sender_id)
            .single();

          msg.sender = profile || undefined;

          // Fetch snap details if needed
          if (msg.snap_id) {
            const { data: snap } = await supabase
              .from('snaps')
              .select('*')
              .eq('id', msg.snap_id)
              .single();
            msg.snap = snap || undefined;
          }

          callback(msg);
        }
      )
      .subscribe();
  }
};

export default groupService;
