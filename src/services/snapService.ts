import { supabase } from '../lib/supabase';
import { Snap, StoryView } from '../types/snap';
import { chatService } from './chatService';
import { telegramService } from './telegramService';
import { friendService } from './friendService';

export const snapService = {
  /**
   * Send a direct snap to a specific user.
   * Uploads the media to Telegram and stores metadata + chat messages in Supabase.
   */
  async sendDirectSnap(
    receiverId: string,
    mediaUri: string,
    mediaType: 'image' | 'video',
    caption: string | null = null,
    overlayMetadata: any = [],
    conversationId: string | null = null
  ): Promise<Snap> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in.');

    // Check block list
    const isBlocked = await friendService.isBlockedRelation(user.id, receiverId);
    if (isBlocked) {
      throw new Error('Blocked user relationship exists.');
    }

    // Check friendship based on recipient setting
    const { data: recipientProfile } = await supabase
      .from('profiles')
      .select('privacy_send_snaps')
      .eq('id', receiverId)
      .maybeSingle();

    const isEveryone = recipientProfile?.privacy_send_snaps === 'everyone';
    if (!isEveryone) {
      const isFriend = await friendService.isFriend(receiverId);
      if (!isFriend) {
        throw new Error('Only friends can send snaps to this user.');
      }
    }

    // Fetch usernames for Telegram logging metadata
    const [senderProfile, receiverProfile] = await Promise.all([
      supabase.from('profiles').select('username').eq('id', user.id).single(),
      supabase.from('profiles').select('username').eq('id', receiverId).single(),
    ]);

    const senderUsername = senderProfile.data?.username || 'unknown';
    const receiverUsername = receiverProfile.data?.username || 'unknown';

    // 1. Upload media to Telegram
    const tgUpload = await telegramService.sendSnapToTelegram({
      localUri: mediaUri,
      mediaType,
      snapType: 'direct',
      senderUsername,
      receiverUsername,
      caption,
      localTime: new Date().toLocaleString(),
    });

    if (!tgUpload) {
      throw new Error('Failed to upload snap to Telegram.');
    }

    // Get or create conversation if not provided
    let finalConvId = conversationId;
    if (!finalConvId) {
      const conv = await chatService.getOrCreateConversation(receiverId);
      finalConvId = conv.id;
    }

    // 2. Save snap metadata to Supabase snaps table
    const { data: snap, error: snapError } = await supabase
      .from('snaps')
      .insert({
        sender_id: user.id,
        receiver_id: receiverId,
        conversation_id: finalConvId,
        snap_type: 'direct',
        media_type: mediaType,
        telegram_file_id: tgUpload.telegramFileId,
        telegram_message_id: tgUpload.telegramMessageId,
        caption,
        overlay_metadata: overlayMetadata || [],
        view_once: true,
        is_viewed: false,
      })
      .select()
      .single();

    if (snapError) {
      console.error('Save Snap Metadata Error:', snapError);
      throw new Error(snapError.message || 'Failed to save snap metadata.');
    }

    // 3. If conversation exists, insert chat message
    const { error: msgError } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: finalConvId,
        sender_id: user.id,
        receiver_id: receiverId,
        message_type: 'snap',
        message_text: '📸 Sent a snap',
        snap_id: snap.id,
        status: 'sent',
      });

    if (msgError) {
      console.error('Insert Snap Chat Message Error:', msgError);
    }

    // Update conversation last message details
    await supabase
      .from('conversations')
      .update({
        last_message_preview: '📸 Sent a snap',
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', finalConvId);

    return snap as Snap;
  },

  /**
   * Add media to the user's Story.
   * Uploads to Telegram and inserts story snap with a 24h expiry into Supabase.
   */
  async addToStory(
    mediaUri: string,
    mediaType: 'image' | 'video',
    caption: string | null = null,
    overlayMetadata: any = []
  ): Promise<Snap> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in.');

    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single();

    const senderUsername = senderProfile?.username || 'unknown';

    // 1. Upload media to Telegram
    const tgUpload = await telegramService.sendSnapToTelegram({
      localUri: mediaUri,
      mediaType,
      snapType: 'story',
      senderUsername,
      receiverUsername: 'Story',
      caption,
      localTime: new Date().toLocaleString(),
    });

    if (!tgUpload) {
      throw new Error('Failed to upload story to Telegram.');
    }

    // 2. Insert snap row with expires_at = now() + 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: snap, error: snapError } = await supabase
      .from('snaps')
      .insert({
        sender_id: user.id,
        receiver_id: null,
        conversation_id: null,
        snap_type: 'story',
        media_type: mediaType,
        telegram_file_id: tgUpload.telegramFileId,
        telegram_message_id: tgUpload.telegramMessageId,
        caption,
        overlay_metadata: overlayMetadata || [],
        view_once: false,
        is_viewed: false,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (snapError) {
      console.error('Save Story Metadata Error:', snapError);
      throw new Error(snapError.message || 'Failed to add to story.');
    }

    return snap as Snap;
  },

  /**
   * Get direct snaps received by the current user.
   */
  async getReceivedSnaps(): Promise<Snap[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in.');

    const { data, error } = await supabase
      .from('snaps')
      .select('*, sender_profile:profiles!snaps_sender_id_fkey(username, full_name)')
      .eq('receiver_id', user.id)
      .eq('snap_type', 'direct')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Get Received Snaps Error:', error);
      throw new Error(error.message || 'Failed to fetch received snaps.');
    }

    return (data || []) as Snap[];
  },

  /**
   * Get direct snaps sent by the current user.
   */
  async getSentSnaps(): Promise<Snap[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in.');

    const { data, error } = await supabase
      .from('snaps')
      .select('*, receiver_profile:profiles!snaps_receiver_id_fkey(username, full_name)')
      .eq('sender_id', user.id)
      .eq('snap_type', 'direct')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Get Sent Snaps Error:', error);
      throw new Error(error.message || 'Failed to fetch sent snaps.');
    }

    return (data || []) as Snap[];
  },

  /**
   * Get all active stories (from all users) that have not expired.
   */
  async getActiveStories(): Promise<Snap[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('snaps')
      .select('*, sender_profile:profiles!snaps_sender_id_fkey(username, full_name, privacy_view_stories)')
      .eq('snap_type', 'story')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Get Active Stories Error:', error);
      throw new Error(error.message || 'Failed to fetch active stories.');
    }

    const filteredStories: Snap[] = [];
    for (const snap of (data || [])) {
      if (snap.sender_id === user.id) {
        filteredStories.push(snap);
        continue;
      }

      // Check blocks
      const isBlocked = await friendService.isBlockedRelation(user.id, snap.sender_id);
      if (isBlocked) continue;

      // Check story privacy
      const privacy = snap.sender_profile?.privacy_view_stories || 'friends';
      if (privacy === 'friends') {
        const isFriend = await friendService.isFriend(snap.sender_id);
        if (!isFriend) continue;
      }

      filteredStories.push(snap);
    }

    return filteredStories;
  },

  /**
   * Get story snaps posted by the current user (includes expired ones).
   */
  async getMyStories(): Promise<Snap[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in.');

    const { data, error } = await supabase
      .from('snaps')
      .select('*')
      .eq('sender_id', user.id)
      .eq('snap_type', 'story')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Get My Stories Error:', error);
      throw new Error(error.message || 'Failed to fetch my stories.');
    }

    return (data || []) as Snap[];
  },

  /**
   * Mark a direct snap as viewed.
   */
  async markSnapViewed(snapId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in.');

    const nowStr = new Date().toISOString();

    const { error } = await supabase
      .from('snaps')
      .update({
        is_viewed: true,
        viewed_at: nowStr,
      })
      .eq('id', snapId)
      .eq('receiver_id', user.id);

    if (error) {
      console.error('Mark Snap Viewed Error:', error);
      throw new Error(error.message || 'Failed to mark snap as viewed.');
    }

    // Also update any message status linked to this snap to read
    const { error: msgError } = await supabase
      .from('chat_messages')
      .update({ status: 'read' })
      .eq('snap_id', snapId);

    if (msgError) {
      console.error('Update associated snap message error:', msgError);
    }
  },

  /**
   * Log a view for a story.
   */
  async markStoryViewed(storyId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in.');

    // We use upsert to avoid unique constraint violations if viewed again
    const { error } = await supabase
      .from('story_views')
      .upsert({
        story_id: storyId,
        viewer_id: user.id,
        viewed_at: new Date().toISOString(),
      }, { onConflict: 'story_id,viewer_id' });

    if (error) {
      console.error('Mark Story Viewed Error:', error);
      throw new Error(error.message || 'Failed to log story view.');
    }
  },

  /**
   * Get the view count for a specific story.
   */
  async getStoryViewCount(storyId: string): Promise<number> {
    const { count, error } = await supabase
      .from('story_views')
      .select('*', { count: 'exact', head: true })
      .eq('story_id', storyId);

    if (error) {
      console.error('Get Story View Count Error:', error);
      throw new Error(error.message || 'Failed to fetch story views.');
    }

    return count || 0;
  },

  /**
   * Get download URL from Telegram file ID.
   */
  async resolveTelegramUrl(telegramFileId: string): Promise<string> {
    const config = await telegramService.getTelegramConfig();
    if (!config.botToken) {
      throw new Error('Telegram bot token is not configured.');
    }

    const res = await fetch(`https://api.telegram.org/bot${config.botToken}/getFile?file_id=${telegramFileId}`);
    const data = await res.json();

    if (res.ok && data.ok) {
      const filePath = data.result.file_path;
      return `https://api.telegram.org/file/bot${config.botToken}/${filePath}`;
    } else {
      throw new Error(data.description || 'Failed to locate file on Telegram.');
    }
  },
};

export default snapService;
