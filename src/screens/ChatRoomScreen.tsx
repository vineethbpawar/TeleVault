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
  AppState,
  AppStateStatus,
  Image,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { chatService } from '../services/chatService';
import { snapService } from '../services/snapService';
import { ChatMessage } from '../types/chat';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fileService } from '../services/fileService';
import { previewCacheService } from '../services/previewCacheService';
import { showToast } from '../components/ToastBanner';
import { telegramService } from '../services/telegramService';

// Reusable Components
import ChatBubble from '../components/ChatBubble';
import SnapBubble from '../components/SnapBubble';
import MessageComposer from '../components/MessageComposer';
import ConversationHeader from '../components/ConversationHeader';
import TypingIndicator from '../components/TypingIndicator';
import ReactionBar from '../components/ReactionBar';
import MediaViewer from '../components/MediaViewer';

const { width } = Dimensions.get('window');

type Props = NativeStackScreenProps<AppStackParamList, 'ChatRoom'>;

export const ChatRoomScreen: React.FC<Props> = ({ navigation, route }) => {
  const {
    conversationId: initialConversationId,
    otherUserId: paramOtherUserId,
    otherUsername: paramOtherUsername,
    otherFullName: paramOtherFullName,
    friendId,
    friendUsername,
  } = route.params || {};

  const otherUserId = (paramOtherUserId || friendId || '') as string;
  const otherUsername = (paramOtherUsername || friendUsername || 'User') as string;
  const otherFullName = (paramOtherFullName || null) as string | null;

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
  const reconnectTimeoutRef = useRef<any>(null);
  const appStateRef = useRef(AppState.currentState);
  const otherTypingTimeoutRef = useRef<any>(null);

  // UI state
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [longPressedMessage, setLongPressedMessage] = useState<ChatMessage | null>(null);
  const [mediaViewerVisible, setMediaViewerVisible] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);

  const flatListRef = useRef<FlatList>(null);
  
  // Media Picker states for sending saved snaps from Memories
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [memoriesList, setMemoriesList] = useState<any[]>([]);
  const [mediaPickerLoading, setMediaPickerLoading] = useState(false);
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

  const OFFLINE_QUEUE_KEY = (convId: string) => `@televault:offline_queue:${convId}`;

  const loadOfflineQueue = async (convId: string) => {
    try {
      const dataStr = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY(convId));
      if (dataStr) {
        const queue: ChatMessage[] = JSON.parse(dataStr);
        offlineQueue.current = queue;
        
        // Append these offline messages to the local state if they are not already there
        setMessages((prev) => {
          const merged = [...prev];
          queue.forEach((msg) => {
            const exists = merged.some((m) => m.id === msg.id);
            if (!exists) {
              merged.push(msg);
            }
          });
          return merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        });
      }
    } catch (err) {
      console.warn('Failed to load offline queue:', err);
    }
  };

  const saveOfflineQueue = async (convId: string, queue: ChatMessage[]) => {
    try {
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY(convId), JSON.stringify(queue));
    } catch (err) {
      console.warn('Failed to save offline queue:', err);
    }
  };

  // Offline queue resend poller (runs every 8 seconds)
  useEffect(() => {
    const timer = setInterval(async () => {
      if (offlineQueue.current.length === 0 || !conversationId) return;
      const toRetry = [...offlineQueue.current];

      for (const msg of toRetry) {
        try {
          const realMsg = await chatService.sendMessage(
            msg.conversation_id,
            msg.receiver_id,
            msg.message_text || ''
          );
          
          // Remove from local and persistent queue
          offlineQueue.current = offlineQueue.current.filter((m) => m.id !== msg.id);
          await saveOfflineQueue(conversationId, offlineQueue.current);

          setMessages((prev) =>
            prev.map((m) => (m.id === msg.id ? { ...realMsg, status: 'sent' } : m))
          );
        } catch (err) {
          console.warn('Retry sending failed:', err);
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
                (m) =>
                  m.id.startsWith('temp-') &&
                  m.message_text === msg.message_text &&
                  Math.abs(new Date(m.created_at).getTime() - new Date(msg.created_at).getTime()) < 30000
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

  const syncMissedMessages = async (convId: string) => {
    try {
      let lastTimestamp = new Date(0).toISOString();
      setMessages((prev) => {
        const realMsgs = prev.filter((m) => !m.id.startsWith('temp-'));
        if (realMsgs.length > 0) {
          lastTimestamp = realMsgs[realMsgs.length - 1].created_at;
        }
        return prev;
      });

      console.log(`[Realtime] Syncing missed messages since ${lastTimestamp}`);
      const { data: msgsData, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', convId)
        .gt('created_at', lastTimestamp)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Failed to sync missed messages:', error);
        return;
      }

      if (msgsData && msgsData.length > 0) {
        console.log(`[Realtime] Found ${msgsData.length} missed messages. Merging...`);
        
        const snapIds = msgsData.map((m: any) => m.snap_id).filter(Boolean);
        const snapsMap: Record<string, any> = {};
        if (snapIds.length > 0) {
          const { data: snapsData } = await supabase
            .from('snaps')
            .select('*')
            .in('id', snapIds);
          if (snapsData) {
            snapsData.forEach((s) => {
              snapsMap[s.id] = s;
            });
          }
        }

        const data = msgsData.map((m: any) => ({
          ...m,
          snap: snapsMap[m.snap_id] || null,
        }));

        setMessages((prev) => {
          const merged = [...prev];
          data.forEach((msg: ChatMessage) => {
            const idx = merged.findIndex((m) => m.id === msg.id);
            if (idx !== -1) {
              merged[idx] = msg;
            } else {
              const tempIdx = merged.findIndex(
                (m) =>
                  m.id.startsWith('temp-') &&
                  m.message_text === msg.message_text &&
                  Math.abs(new Date(m.created_at).getTime() - new Date(msg.created_at).getTime()) < 30000
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
      }
    } catch (err) {
      console.error('[Realtime] Error during catchup sync:', err);
    }
  };

  const subscribeToChat = (convId: string) => {
    if (!convId) return;

    if (activeChannelRef.current) {
      supabase.removeChannel(activeChannelRef.current);
      activeChannelRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    console.log(`[Realtime] Subscribing to chat:${convId}`);

    const channel = supabase.channel(`chat:${convId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: currentUserId || 'unknown' },
      },
    });

    activeChannelRef.current = channel;

    // 1. Listen to new messages
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `conversation_id=eq.${convId}`,
      },
      async (payload: any) => {
        const newMsg = payload.new as ChatMessage;
        if (newMsg.conversation_id !== convId) return;

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
              (m) =>
                m.id.startsWith('temp-') &&
                m.message_text === newMsg.message_text &&
                Math.abs(new Date(m.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 30000
            );
            if (tempIndex !== -1) {
              const updated = [...prev];
              updated[tempIndex] = newMsg;
              return updated;
            }
          }
          const updated = [...prev, newMsg];
          return updated.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        });

        if (currentUserId && newMsg.receiver_id === currentUserId) {
          chatService.markMessagesRead(convId);
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
        filter: `conversation_id=eq.${convId}`,
      },
      (payload: any) => {
        const updatedMsg = payload.new as ChatMessage;
        if (updatedMsg.conversation_id !== convId) return;

        setMessages((prev) =>
          prev.map((m) => (m.id === updatedMsg.id ? { ...m, status: updatedMsg.status } : m))
        );
      }
    );

    // 2.5. Listen to snap viewed status updates
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'snaps',
        filter: `conversation_id=eq.${convId}`,
      },
      (payload: any) => {
        const updatedSnap = payload.new as any;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.snap_id === updatedSnap.id) {
              return { ...m, snap: updatedSnap };
            }
            return m;
          })
        );
      }
    );

    // 3. Listen to typing broadcast
    channel.on('broadcast', { event: 'typing' }, ({ payload }: any) => {
      if (payload.userId === otherUserId) {
        setIsOtherTyping(payload.isTyping);
        
        // Reset typing indicator timeout
        if (otherTypingTimeoutRef.current) {
          clearTimeout(otherTypingTimeoutRef.current);
        }

        if (payload.isTyping) {
          otherTypingTimeoutRef.current = setTimeout(() => {
            setIsOtherTyping(false);
          }, 4000);
        }
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
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const isOnline = Object.keys(state).some((key) => key === otherUserId);
      setIsOtherOnline(isOnline);
    });

    channel.subscribe((status: string, err?: any) => {
      console.log(`[Realtime] Subscription status for chat:${convId} is: ${status}`, err || '');
      if (status === 'SUBSCRIBED') {
        stopPolling();
        channel.track({ online: true });
        
        // Sync any messages we missed while offline or reconnecting
        syncMissedMessages(convId);
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        startPolling(convId);
        
        // Schedule a reconnect attempt
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            subscribeToChat(convId);
          }, 5000);
        }
      }
    });
  };

  // Main chat initialization & Realtime Subscription
  useEffect(() => {
    let active = true;
    let activeId = conversationId;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('[AppState] App returned to foreground, reconnecting chat subscription...');
        if (activeId && active) {
          subscribeToChat(activeId);
        }
      }
      appStateRef.current = nextAppState;
    };

    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    const initChat = async () => {
      try {
        // 1. Get user session first
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !active) return;
        
        setCurrentUserId(user.id);

        // 2. Resolve conversation ID if not present
        if (!activeId) {
          console.log('[DEBUG_CHAT] No active conversation ID, fetching/creating for otherUserId:', otherUserId);
          const conv = await chatService.getOrCreateConversation(otherUserId);
          if (!active) return;
          activeId = conv.id;
          console.log('[DEBUG_CHAT] Resolved conversation ID:', activeId);
          setConversationId(conv.id);
        }

        // 3. Fetch messages
        console.log('[DEBUG_CHAT] Fetching messages from database for conversation:', activeId);
        const data = await chatService.getMessages(activeId);
        if (!active) return;
        console.log('[DEBUG_CHAT] Fetched messages count:', data.length);
        setMessages(data);
        
        // 4. Load offline queue and mark as read
        await loadOfflineQueue(activeId);
        if (!active) return;
        await chatService.markMessagesRead(activeId);

        // 5. Subscribe to realtime Postgres updates
        console.log('[DEBUG_CHAT] Subscribing to realtime channel for conversation:', activeId);
        subscribeToChat(activeId);
      } catch (error) {
        console.error('[DEBUG_CHAT] Chat room initialization failed:', error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    initChat();

    return () => {
      active = false;
      appStateSub.remove();
      stopPolling();
      if (activeChannelRef.current) {
        supabase.removeChannel(activeChannelRef.current);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (otherTypingTimeoutRef.current) {
        clearTimeout(otherTypingTimeoutRef.current);
      }
      stopPolling();
    };
  }, [conversationId, otherUserId]);

  const loadMemoriesForPicker = async () => {
    setMediaPickerLoading(true);
    setShowMediaPicker(true);
    try {
      const list = await fileService.fetchMemories();
      setMemoriesList(list);
    } catch (err) {
      console.error('Failed to load memories for picker:', err);
    } finally {
      setMediaPickerLoading(false);
    }
  };

  const handlePickMedia = async (file: any) => {
    try {
      setLoading(true);
      
      // 1. Resolve preview path
      const res = await previewCacheService.resolveFilePreview(file);
      const uri = res.playableUri || res.previewUri || file.local_thumbnail_uri;
      if (!uri) throw new Error('Could not resolve media path.');

      // 2. Send snap directly
      await snapService.sendDirectSnap(
        otherUserId,
        uri,
        file.file_type === 'video' ? 'video' : 'image',
        null,
        file.overlay_metadata || [],
        conversationId || null
      );

      showToast('Snap sent successfully!');
      setShowMediaPicker(false);
      
      // 3. Reload messages list
      if (conversationId) {
        const updated = await chatService.getMessages(conversationId);
        setMessages(updated);
      }
    } catch (err: any) {
      console.error('[PICK_SEND] Failed to send memory snap:', err);
      Alert.alert('Send Failed', err.message || 'Failed to send snap.');
    } finally {
      setLoading(false);
    }
  };

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
      const failedMsg = { ...optimisticMsg, id: tempId, status: 'failed' as any };
      offlineQueue.current.push(failedMsg);
      await saveOfflineQueue(conversationId, offlineQueue.current);
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
    const isSavedInChat = snap.view_once === false;

    if (isReceiver && snap.is_viewed && !isSavedInChat) {
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
        telegramFileId: snap.telegram_file_id,
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
      // 1. If message type is snap, delete snap metadata and Telegram backup
      if (msg.message_type === 'snap' && msg.snap_id) {
        let snap = msg.snap;
        if (!snap) {
          const { data } = await supabase
            .from('snaps')
            .select('*')
            .eq('id', msg.snap_id)
            .single();
          snap = data;
        }

        if (snap) {
          if (snap.telegram_message_id) {
            telegramService.deleteTelegramMessage(Number(snap.telegram_message_id)).catch((err: any) => {
              console.warn('Failed to delete snap from Telegram:', err);
            });
          }
          await supabase.from('snaps').delete().eq('id', msg.snap_id);
        }
      }

      // 2. Delete the chat message from Supabase
      await supabase.from('chat_messages').delete().eq('id', msg.id);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } catch (err) {
      Alert.alert('Error', 'Failed to delete message.');
    }
    setLongPressedMessage(null);
  };

  const handleToggleSaveSnap = async (msg: ChatMessage) => {
    setLongPressedMessage(null);
    if (!msg.snap_id || !msg.snap) return;

    const currentSaveState = msg.snap.view_once === false; // true if currently saved
    const newViewOnce = currentSaveState; // if saved (view_once=false), toggle to view_once=true (unsave)

    try {
      const { data: updatedSnap, error } = await supabase
        .from('snaps')
        .update({ view_once: newViewOnce })
        .eq('id', msg.snap_id)
        .select()
        .single();

      if (error) throw error;

      showToast(newViewOnce ? 'Snap unsaved from chat.' : 'Snap saved in chat.');

      setMessages((prev) =>
        prev.map((m) => {
          if (m.snap_id === msg.snap_id) {
            return {
              ...m,
              snap: updatedSnap,
            };
          }
          return m;
        })
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update snap save state.');
    }
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
          onLongPress={() => setLongPressedMessage(item)}
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
    navigation.navigate('ChatCamera', {
      sendToUserId: otherUserId,
      sendToUsername: otherUsername,
      conversationId: conversationId || null,
    });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#000000' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.container, { paddingTop: insets.top > 0 ? insets.top : 12 }]}>
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

        <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#0A0A0A' }}>
          <MessageComposer
            onSend={handleSend}
            onCameraPress={handleSnapPress}
            onGalleryPress={loadMemoriesForPicker}
            onTyping={broadcastTyping}
            replyToMessage={replyToMessage}
            onClearReply={() => setReplyToMessage(null)}
          />
        </SafeAreaView>
      </View>

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

                  {longPressedMessage.message_type === 'snap' ? (
                    <TouchableOpacity
                      style={styles.optionBtn}
                      onPress={() => handleToggleSaveSnap(longPressedMessage)}
                    >
                      <Text style={styles.optionText}>
                        {longPressedMessage.snap?.view_once === false
                          ? 'Unsave from Chat'
                          : 'Save in Chat'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.optionBtn}
                      onPress={() => handleCopyMessage(longPressedMessage.message_text || '')}
                    >
                      <Text style={styles.optionText}>Copy Text</Text>
                    </TouchableOpacity>
                  )}

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

      {/* Memories Media Picker Modal */}
      <Modal
        visible={showMediaPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowMediaPicker(false)}
      >
        <SafeAreaView style={styles.pickerModalContainer}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Send Snap from Memories</Text>
            <TouchableOpacity onPress={() => setShowMediaPicker(false)} style={styles.pickerCloseBtn}>
              <Text style={{ color: '#FFFC00', fontWeight: '800', fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {mediaPickerLoading ? (
            <View style={styles.pickerCenter}>
              <ActivityIndicator size="large" color="#FFFC00" />
            </View>
          ) : memoriesList.length === 0 ? (
            <View style={styles.pickerCenter}>
              <Text style={{ color: '#8E8E93', fontSize: 14 }}>No snaps saved in Memories yet.</Text>
            </View>
          ) : (
            <FlatList
              data={memoriesList}
              numColumns={3}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 4 }}
              renderItem={({ item }) => {
                const isVideo = item.file_type === 'video';
                return (
                  <TouchableOpacity
                    style={styles.pickerMediaCell}
                    onPress={() => {
                      Alert.alert(
                        'Send Snap',
                        `Send this snap to @${otherUsername}?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Send', onPress: () => handlePickMedia(item) }
                        ]
                      );
                    }}
                  >
                    <Image
                      source={{ uri: item.local_thumbnail_uri || item.local_uri || '' }}
                      style={styles.pickerMediaThumb}
                    />
                    {isVideo && (
                      <View style={styles.pickerPlayBadge}>
                        <Text style={{ fontSize: 10, color: '#FFFFFF' }}>▶</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </SafeAreaView>
      </Modal>
    </KeyboardAvoidingView>
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
  pickerModalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  pickerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  pickerCloseBtn: {
    padding: 6,
  },
  pickerCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerMediaCell: {
    width: (width - 16) / 3,
    height: 150,
    margin: 2,
    position: 'relative',
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    overflow: 'hidden',
  },
  pickerMediaThumb: {
    width: '100%',
    height: '100%',
  },
  pickerPlayBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ChatRoomScreen;
