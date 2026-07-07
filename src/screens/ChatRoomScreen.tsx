import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  TouchableOpacity,
  Clipboard,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { chatService } from '../services/chatService';
import { snapService } from '../services/snapService';
import { ChatMessage } from '../types/chat';
import { supabase } from '../lib/supabase';

// Reusable Components
import ChatBubble from '../components/ChatBubble';
import SnapBubble from '../components/SnapBubble';
import MessageComposer from '../components/MessageComposer';
import ConversationHeader from '../components/ConversationHeader';
import TypingIndicator from '../components/TypingIndicator';
import ReactionBar from '../components/ReactionBar';
import MediaViewer from '../components/MediaViewer';

type Props = NativeStackScreenProps<AppStackParamList, 'ChatRoom'>;

export const ChatRoomScreen: React.FC<Props> = ({ navigation, route }) => {
  const { conversationId: initialConversationId, otherUserId, otherUsername, otherFullName } = route.params;

  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Realtime & Presence
  const [isOtherOnline, setIsOtherOnline] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [reactionsMap, setReactionsMap] = useState<Record<string, string[]>>({});
  const activeChannelRef = useRef<any>(null);

  // UI state
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [longPressedMessage, setLongPressedMessage] = useState<ChatMessage | null>(null);
  const [mediaViewerVisible, setMediaViewerVisible] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const pollingIntervalRef = useRef<any>(null);
  const offlineQueue = useRef<ChatMessage[]>([]);

  // Keyboard height/visibility tracking for list scrolling and safe layout insets
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setKeyboardVisible(true);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
      }
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Fetch current user id
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id);
      }
    });
  }, []);

  // Offline queue resend poller (runs every 8 seconds)
  useEffect(() => {
    const timer = setInterval(async () => {
      if (offlineQueue.current.length === 0 || !conversationId) return;
      const toRetry = [...offlineQueue.current];
      offlineQueue.current = [];

      for (const msg of toRetry) {
        try {
          const realMsg = await chatService.sendMessage(
            msg.conversation_id,
            msg.receiver_id,
            msg.message_text || ''
          );
          setMessages((prev) =>
            prev.map((m) => (m.id === msg.id ? { ...realMsg, status: 'sent' } : m))
          );
        } catch (err) {
          offlineQueue.current.push(msg); // Add back to queue
        }
      }
    }, 8000);

    return () => clearInterval(timer);
  }, [conversationId]);

  // Polling fallback if supabase realtime connection fails
  const startPolling = (convId: string) => {
    if (pollingIntervalRef.current) return;
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const latestMessages = await chatService.getMessages(convId);
        setMessages((prev) => {
          const merged = [...prev];
          latestMessages.forEach((msg) => {
            const idx = merged.findIndex((m) => m.id === msg.id);
            if (idx !== -1) {
              merged[idx] = msg;
            } else {
              const tempIdx = merged.findIndex(
                (m) => m.id.startsWith('temp-') && m.message_text === msg.message_text
              );
              if (tempIdx !== -1) {
                merged[tempIdx] = msg;
              } else {
                merged.push(msg);
              }
            }
          });
          return merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        });
      } catch (err) {
        console.warn('Polling error:', err);
      }
    }, 6000);
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // Main chat initialization & Realtime Subscription
  useEffect(() => {
    let activeId = conversationId;
    let channel: any = null;

    const initChat = async () => {
      if (!activeId) {
        try {
          const conv = await chatService.getOrCreateConversation(otherUserId);
          activeId = conv.id;
          setConversationId(conv.id);
        } catch (error) {
          console.error('Conversation creation failed:', error);
          setLoading(false);
          return;
        }
      }

      try {
        const data = await chatService.getMessages(activeId);
        setMessages(data);
        await chatService.markMessagesRead(activeId);
      } catch (error) {
        console.error('Fetch messages failed:', error);
      } finally {
        setLoading(false);
      }

      // Setup Supabase Realtime channel for messages, typing indicator and reactions
      channel = supabase.channel(`chat:${activeId}`, {
        config: {
          broadcast: { self: false },
          presence: { key: currentUserId || 'unknown' },
        },
      });

      activeChannelRef.current = channel;

      // 1. Listen for new inserts in Supabase database
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${activeId}`,
        },
        async (payload: any) => {
          const newMsg = payload.new as ChatMessage;
          if (newMsg.snap_id) {
            const { data: snap } = await supabase
              .from('snaps')
              .select('*')
              .eq('id', newMsg.snap_id)
              .single();
            newMsg.snap = snap;
          }

          setMessages((prev) => {
            const exists = prev.some((m) => m.id === newMsg.id);
            if (exists) return prev;

            // Merge optimistic local message if they have the same text
            if (newMsg.sender_id === currentUserId) {
              const tempIndex = prev.findIndex(
                (m) => m.id.startsWith('temp-') && m.message_text === newMsg.message_text
              );
              if (tempIndex !== -1) {
                const updated = [...prev];
                updated[tempIndex] = newMsg;
                return updated;
              }
            }
            return [...prev, newMsg];
          });

          if (currentUserId && newMsg.receiver_id === currentUserId) {
            chatService.markMessagesRead(activeId!);
          }
        }
      );

      // 2. Listen to status updates (read receipts)
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${activeId}`,
        },
        (payload: any) => {
          const updatedMsg = payload.new as ChatMessage;
          setMessages((prev) =>
            prev.map((m) => (m.id === updatedMsg.id ? { ...m, status: updatedMsg.status } : m))
          );
        }
      );

      // 3. Listen to typing broadcast
      channel.on('broadcast', { event: 'typing' }, ({ payload }: any) => {
        if (payload.userId === otherUserId) {
          setIsOtherTyping(payload.isTyping);
        }
      });

      // 4. Listen to reactions broadcast
      channel.on('broadcast', { event: 'reaction' }, ({ payload }: any) => {
        setReactionsMap((prev) => {
          const { messageId, emoji } = payload;
          const current = prev[messageId] || [];
          if (!current.includes(emoji)) {
            return { ...prev, [messageId]: [...current, emoji] };
          }
          return prev;
        });
      });

      // 5. Track online state via Presence
      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const isOnline = Object.keys(state).some((key) => key === otherUserId);
          setIsOtherOnline(isOnline);
        })
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            stopPolling();
            channel.track({ online: true });
          } else {
            startPolling(activeId!);
          }
        });
    };

    initChat();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
      stopPolling();
    };
  }, [conversationId, currentUserId, otherUserId]);

  // Send message flow with optimistic UI
  const handleSend = async (text: string) => {
    if (!conversationId || !currentUserId) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: currentUserId,
      receiver_id: otherUserId,
      message_type: 'text',
      message_text: text,
      status: 'sending',
      created_at: new Date().toISOString(),
    };

    // Include reply reference in optimistic local state
    if (replyToMessage) {
      (optimisticMsg as any).reply_to = replyToMessage;
      setReplyToMessage(null);
    }

    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const realMsg = await chatService.sendMessage(conversationId, otherUserId, text);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...realMsg, status: 'sent' } : m))
      );
    } catch (err: any) {
      // Mark as failed and append to offline queue
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' as any } : m))
      );
      offlineQueue.current.push(optimisticMsg);
    }
  };

  const broadcastTyping = (isTyping: boolean) => {
    if (activeChannelRef.current) {
      activeChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUserId, isTyping },
      });
    }
  };

  const handleOpenSnap = async (snap: any) => {
    if (!snap) return;
    const isReceiver = snap.receiver_id === currentUserId;

    if (isReceiver && snap.is_viewed) {
      Alert.alert('Opened', 'This view-once snap has already been viewed.');
      return;
    }

    setLoading(true);
    try {
      const mediaUrl = await snapService.resolveTelegramUrl(snap.telegram_file_id);
      setLoading(false);

      // Navigate to SnapViewer
      navigation.navigate('SnapViewer', {
        snapId: snap.id,
        mediaUrl,
        mediaType: snap.media_type,
        caption: snap.caption || undefined,
        senderUsername: otherUsername,
        isStory: false,
      });

      // Locally mark snap opened
      setMessages((prev) =>
        prev.map((m) => {
          if (m.snap_id === snap.id) {
            return {
              ...m,
              status: 'read',
              snap: { ...m.snap, is_viewed: true },
            };
          }
          return m;
        })
      );
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Error', err.message || 'Failed to resolve snap.');
    }
  };

  const handleReact = (message: ChatMessage, emoji: string) => {
    setReactionsMap((prev) => {
      const current = prev[message.id] || [];
      if (!current.includes(emoji)) {
        return { ...prev, [message.id]: [...current, emoji] };
      }
      return prev;
    });

    if (activeChannelRef.current) {
      activeChannelRef.current.send({
        type: 'broadcast',
        event: 'reaction',
        payload: { messageId: message.id, emoji },
      });
    }

    setLongPressedMessage(null);
  };

  const handleCopyMessage = (msgText: string) => {
    Clipboard.setString(msgText);
    setLongPressedMessage(null);
  };

  const handleDeleteMessage = async (msg: ChatMessage) => {
    try {
      await supabase.from('chat_messages').delete().eq('id', msg.id);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } catch (err) {
      Alert.alert('Error', 'Failed to delete message.');
    }
    setLongPressedMessage(null);
  };

  // Pre-process messages to insert date headers and calculate grouping
  const getProcessedMessagesList = () => {
    const list: any[] = [];
    let lastDateStr = '';

    messages.forEach((msg, idx) => {
      const msgDate = new Date(msg.created_at);
      const dateStr = msgDate.toDateString();

      // Date Group Header
      if (dateStr !== lastDateStr) {
        let label = dateStr;
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();
        if (dateStr === today) {
          label = 'Today';
        } else if (dateStr === yesterday) {
          label = 'Yesterday';
        } else {
          label = msgDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        }
        list.push({ id: `date-${dateStr}`, type: 'date-header', label });
        lastDateStr = dateStr;
      }

      // Grouping: hide avatar if next message is within 2 minutes by the same sender
      const nextMsg = messages[idx + 1];
      const isSameSender = nextMsg && nextMsg.sender_id === msg.sender_id;
      const timeDiff = nextMsg ? new Date(nextMsg.created_at).getTime() - msgDate.getTime() : Infinity;
      const isGrouped = isSameSender && timeDiff < 2 * 60 * 1000;

      list.push({
        ...msg,
        type: 'message',
        showAvatar: !isGrouped,
        reactions: reactionsMap[msg.id] || [],
      });
    });

    return list;
  };

  const renderItem = ({ item }: { item: any }) => {
    if (item.type === 'date-header') {
      return (
        <View style={styles.dateHeaderContainer}>
          <View style={styles.dateHeaderLine} />
          <Text style={styles.dateHeaderText}>{item.label}</Text>
          <View style={styles.dateHeaderLine} />
        </View>
      );
    }

    const isMe = item.sender_id === currentUserId;

    if (item.message_type === 'snap') {
      return (
        <SnapBubble
          snap={item.snap || { id: item.snap_id, media_type: 'image', is_viewed: item.status === 'read' }}
          isMe={isMe}
          onOpen={() => handleOpenSnap(item.snap)}
          senderName={otherUsername}
        />
      );
    }

    return (
      <ChatBubble
        message={item}
        isMe={isMe}
        showAvatar={item.showAvatar}
        senderName={otherUsername}
        onSwipeToReply={(msg) => setReplyToMessage(msg)}
        onLongPress={(msg) => setLongPressedMessage(msg)}
        replyToMessage={(item as any).reply_to}
      />
    );
  };

  const handleSnapPress = () => {
    navigation.navigate('Main', {
      screen: 'CameraTab',
      params: {
        sendToUserId: otherUserId,
        sendToUsername: otherUsername,
        conversationId: conversationId,
      },
    } as any);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ConversationHeader
        otherFullName={otherFullName || null}
        otherUsername={otherUsername}
        isOnline={isOtherOnline}
        onBack={() => navigation.goBack()}
        onProfilePress={() =>
          navigation.navigate('UserProfile', { userId: otherUserId, username: otherUsername })
        }
        onSnapPress={handleSnapPress}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={{ flex: 1 }}>
          {loading && messages.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#FFFC00" />
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={getProcessedMessagesList()}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
              onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyTitle}>Secure Vault Connection</Text>
                  <Text style={styles.emptySubtitle}>
                    Chat backups are logged privately to your personal Telegram Bot Log.
                  </Text>
                </View>
              }
            />
          )}

          {isOtherTyping && <TypingIndicator />}
        </View>

        <View style={{ backgroundColor: '#0A0A0A', paddingBottom: keyboardVisible ? 0 : insets.bottom }}>
          <MessageComposer
            onSend={handleSend}
            onCameraPress={handleSnapPress}
            onGalleryPress={handleSnapPress}
            onTyping={broadcastTyping}
            replyToMessage={replyToMessage}
            onClearReply={() => setReplyToMessage(null)}
          />
        </View>
      </KeyboardAvoidingView>

      {/* Message Reaction & Options Overlay Modal */}
      <Modal
        visible={longPressedMessage !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setLongPressedMessage(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setLongPressedMessage(null)}
        >
          <View style={styles.modalContent}>
            {longPressedMessage && (
              <>
                <ReactionBar onReact={(emoji) => handleReact(longPressedMessage, emoji)} />

                <View style={styles.optionsList}>
                  <TouchableOpacity
                    style={styles.optionBtn}
                    onPress={() => {
                      setReplyToMessage(longPressedMessage);
                      setLongPressedMessage(null);
                    }}
                  >
                    <Text style={styles.optionText}>Reply</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.optionBtn}
                    onPress={() => handleCopyMessage(longPressedMessage.message_text || '')}
                  >
                    <Text style={styles.optionText}>Copy Text</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.optionBtn, styles.deleteOptionBtn]}
                    onPress={() => handleDeleteMessage(longPressedMessage)}
                  >
                    <Text style={styles.deleteOptionText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <MediaViewer
        visible={mediaViewerVisible}
        mediaUrl={mediaUrl}
        mediaType={mediaType}
        onClose={() => setMediaViewerVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 20,
  },
  dateHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 14,
  },
  dateHeaderLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: '#1E1E1E',
    marginHorizontal: 16,
  },
  dateHeaderText: {
    color: '#8E8E93',
    fontSize: 10.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#8E8E93',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    backgroundColor: '#0F0F0F',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1E1E1E',
    padding: 16,
  },
  optionsList: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1E1E1E',
    paddingTop: 8,
  },
  optionBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  optionText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '600',
  },
  deleteOptionBtn: {
    borderTopWidth: 1,
    borderTopColor: '#1E1E1E',
    marginTop: 4,
    paddingTop: 14,
  },
  deleteOptionText: {
    color: '#FF3B30',
    fontSize: 14.5,
    fontWeight: '700',
  },
});

export default ChatRoomScreen;
