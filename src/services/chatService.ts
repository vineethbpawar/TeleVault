import { supabase } from '../lib/supabase';
import { Conversation, ChatMessage, UserProfile } from '../types/chat';
import { telegramService } from './telegramService';
import { friendService } from './friendService';

const sortUserIds = (id1: string, id2: string) => {
  return id1.toLowerCase() < id2.toLowerCase()
    ? { participant_a: id1, participant_b: id2 }
    : { participant_a: id2, participant_b: id1 };
};

export const chatService = {
  /**
   * Search users by username or full name, excluding the current logged-in user.
   */
  async searchUsers(query: string): Promise<UserProfile[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', user.id)
      .or(`username.ilike.%${cleanQuery}%,full_name.ilike.%${cleanQuery}%`)
      .limit(20);

    if (error) {
      console.error('Search Users Error:', error);
      throw new Error(error.message || 'Failed to search users.');
    }

    return (data || []) as UserProfile[];
  },

  /**
   * Get or create a conversation between the current user and another user.
   */
  async getOrCreateConversation(otherUserId: string): Promise<Conversation> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    const { participant_a, participant_b } = sortUserIds(user.id, otherUserId);

    // Check block list
    const isBlocked = await friendService.isBlockedRelation(user.id, otherUserId);
    if (isBlocked) {
      throw new Error('Blocked user relationship exists.');
    }

    // Fetch the other user's profile once at the beginning
    const { data: otherProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', otherUserId)
      .maybeSingle();

    const isEveryone = otherProfile?.privacy_message_me === 'everyone';
    if (!isEveryone) {
      const isFriend = await friendService.isFriend(otherUserId);
      if (!isFriend) {
        throw new Error('Only friends can chat with this user by default.');
      }
    }

    // Try to select existing conversation
    const { data: existing, error: selectError } = await supabase
      .from('conversations')
      .select('*')
      .eq('participant_a', participant_a)
      .eq('participant_b', participant_b)
      .maybeSingle();

    if (selectError) {
      console.error('Select Conversation Error:', selectError);
    }

    if (existing) {
      return {
        ...existing,
        other_user: otherProfile || undefined,
      } as Conversation;
    }

    // Insert new conversation
    const { data: inserted, error: insertError } = await supabase
      .from('conversations')
      .insert({
        participant_a,
        participant_b,
        last_message_preview: 'No messages yet',
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert Conversation Error:', insertError);
      throw new Error(insertError.message || 'Failed to start conversation.');
    }

    return {
      ...inserted,
      other_user: otherProfile || undefined,
    } as Conversation;
  },

  /**
   * Get all conversations for the current logged-in user, with other users' profiles attached.
   */
  async getConversations(): Promise<Conversation[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
      .order('last_message_at', { ascending: false });

    if (error) {
      console.error('Get Conversations Error:', error);
      throw new Error(error.message || 'Failed to fetch conversations.');
    }

    const conversations: Conversation[] = [];

    for (const conv of (data || [])) {
      const otherUserId = conv.participant_a === user.id ? conv.participant_b : conv.participant_a;
      
      const { data: otherProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', otherUserId)
        .single();

      conversations.push({
        ...conv,
        other_user: otherProfile || undefined,
      });
    }

    return conversations;
  },

  /**
   * Get messages for a specific conversation, including snap metadata if applicable.
   */
  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*, snaps:snap_id(*)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Get Messages Error:', error);
      throw new Error(error.message || 'Failed to fetch messages.');
    }

    return (data || []) as ChatMessage[];
  },

  /**
   * Send a text message to a conversation and copy to Telegram.
   */
  async sendMessage(conversationId: string, receiverId: string, text: string): Promise<ChatMessage> {
    // 1. Validate text is not empty
    const cleanText = text.trim();
    if (!cleanText) {
      throw new Error('Message content cannot be empty.');
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    // Check block list
    const isBlocked = await friendService.isBlockedRelation(user.id, receiverId);
    if (isBlocked) {
      throw new Error('Blocked user relationship exists.');
    }

    // Check friendship based on recipient setting
    const { data: otherProfile } = await supabase
      .from('profiles')
      .select('privacy_message_me')
      .eq('id', receiverId)
      .maybeSingle();

    const isEveryone = otherProfile?.privacy_message_me === 'everyone';
    if (!isEveryone) {
      const isFriend = await friendService.isFriend(receiverId);
      if (!isFriend) {
        throw new Error('Only friends can message this user.');
      }
    }

    // 2. Insert message into Supabase chat_messages
    const { data: insertedMessage, error: messageError } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        receiver_id: receiverId,
        message_type: 'text',
        message_text: cleanText,
        status: 'sent',
      })
      .select()
      .single();

    if (messageError) {
      console.error('Insert Message Error:', messageError);
      throw new Error(messageError.message || 'Failed to send message.');
    }

    // 3. Update conversation last_message_preview and last_message_at
    const { error: convUpdateError } = await supabase
      .from('conversations')
      .update({
        last_message_preview: cleanText,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    if (convUpdateError) {
      console.error('Update Conversation Error:', convUpdateError);
    }

    // 4. Send full chat log copy to Telegram asynchronously
    // Start background process for Telegram log to not block the UI
    (async () => {
      try {
        const [senderRes, receiverRes] = await Promise.all([
          supabase.from('profiles').select('username').eq('id', user.id).single(),
          supabase.from('profiles').select('username').eq('id', receiverId).single(),
        ]);

        const senderUsername = senderRes.data?.username || 'unknown';
        const receiverUsername = receiverRes.data?.username || 'unknown';
        const localTime = new Date().toLocaleString();

        // Send to Telegram
        const telegramMessageId = await telegramService.sendChatLogToTelegram({
          conversationId,
          senderUsername,
          receiverUsername,
          messageText: cleanText,
          localTime,
        });

        // 5. Save telegram_message_id back to chat_messages if Telegram returns ID
        if (telegramMessageId) {
          await supabase
            .from('chat_messages')
            .update({ telegram_message_id: telegramMessageId })
            .eq('id', insertedMessage.id);
        }
      } catch (tgError) {
        // 6. Log warning, do not block chat
        console.warn('Telegram chat backup logging failed:', tgError);
      }
    })();

    // Telegram Bot API is used as backup log storage. Supabase is used for in-app chat retrieval/realtime because normal Bot API cannot reliably query old channel messages like a database.
    return insertedMessage as ChatMessage;
  },

  subscribeToMessages(
    conversationId: string,
    callback: (message: ChatMessage) => void,
    statusCallback?: (status: string, err?: any) => void
  ) {
    return supabase
      .channel(`chat:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          if (__DEV__) {
            console.log('[Realtime] New message inserted:', payload);
          }
          const msg = payload.new as ChatMessage;
          if (msg.snap_id) {
            const { data: snap } = await supabase
              .from('snaps')
              .select('*')
              .eq('id', msg.snap_id)
              .single();
            msg.snap = snap;
          }
          callback(msg);
        }
      )
      .subscribe((status, err) => {
        if (__DEV__) {
          console.log(`[Realtime] Subscription status for chat:${conversationId} is: ${status}`, err || '');
        }
        if (statusCallback) {
          statusCallback(status, err);
        }
      });
  },

  /**
   * Mark all messages in a conversation as read (sent to read).
   */
  async markMessagesRead(conversationId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('chat_messages')
      .update({ status: 'read' })
      .eq('conversation_id', conversationId)
      .eq('receiver_id', user.id)
      .neq('status', 'read');
  },
};

export default chatService;
