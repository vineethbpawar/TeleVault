import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { ArrowLeft, Send, Camera, Eye } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { chatService } from '../services/chatService';
import { snapService } from '../services/snapService';
import { ChatMessage } from '../types/chat';
import { supabase } from '../lib/supabase';

type Props = NativeStackScreenProps<AppStackParamList, 'ChatRoom'>;

export const ChatRoomScreen: React.FC<Props> = ({ navigation, route }) => {
  const { conversationId: initialConversationId, otherUserId, otherUsername, otherFullName } = route.params;

  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const pollingIntervalRef = useRef<any>(null);
  const isRealtimeSubscribed = useRef<boolean>(false);

  const startPolling = (convId: string) => {
    if (pollingIntervalRef.current) return;
    if (__DEV__) {
      console.log(`[ChatRoom] Starting fallback polling for conversation ${convId}`);
    }
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
              const tempIndex = merged.findIndex(
                (m) => m.id.startsWith('temp-') && m.message_text === msg.message_text
              );
              if (tempIndex !== -1) {
                merged[tempIndex] = msg;
              } else {
                merged.push(msg);
              }
            }
          });
          return merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        });
      } catch (pollErr) {
        console.error('[ChatRoom] Fallback polling fetch error:', pollErr);
      }
    }, 5000);
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      if (__DEV__) {
        console.log('[ChatRoom] Stopping fallback polling');
      }
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id);
      }
    });
  }, []);

  useEffect(() => {
    let activeId = conversationId;
    let subscription: any = null;
    let subscriptionTimeout: any = null;

    const initChat = async () => {
      if (!activeId) {
        try {
          const conv = await chatService.getOrCreateConversation(otherUserId);
          activeId = conv.id;
          setConversationId(conv.id);
        } catch (error) {
          console.error('Failed to initialize conversation:', error);
          setLoading(false);
          return;
        }
      }

      try {
        const data = await chatService.getMessages(activeId);
        setMessages(data);
        await chatService.markMessagesRead(activeId);
      } catch (error) {
        console.error('Fetch Messages Error:', error);
      } finally {
        setLoading(false);
      }

      subscription = chatService.subscribeToMessages(
        activeId,
        (newMsg) => {
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === newMsg.id);
            if (exists) {
              return prev.map((m) => (m.id === newMsg.id ? newMsg : m));
            }
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
        },
        (status) => {
          if (__DEV__) {
            console.log(`[ChatRoom] Subscription status: ${status}`);
          }
          if (status === 'SUBSCRIBED') {
            isRealtimeSubscribed.current = true;
            stopPolling();
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            isRealtimeSubscribed.current = false;
            if (activeId) startPolling(activeId);
          }
        }
      );
    };

    initChat();

    subscriptionTimeout = setTimeout(() => {
      if (!isRealtimeSubscribed.current && activeId) {
        if (__DEV__) {
          console.log('[ChatRoom] Subscription timeout reached, starting fallback polling');
        }
        startPolling(activeId);
      }
    }, 3000);

    return () => {
      if (subscriptionTimeout) {
        clearTimeout(subscriptionTimeout);
      }
      if (subscription) {
        if (__DEV__) {
          console.log('[ChatRoom] Cleaning up subscription channel');
        }
        supabase.removeChannel(subscription);
      }
      stopPolling();
    };
  }, [conversationId, currentUserId, otherUserId]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !conversationId || !currentUserId) return;

    setInputText('');
    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: currentUserId,
      receiver_id: otherUserId,
      message_type: 'text',
      message_text: text,
      status: 'sent',
      created_at: new Date().toISOString(),
    };

    // Add optimistic message instantly to UI
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const realMsg = await chatService.sendMessage(conversationId, otherUserId, text);
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === realMsg.id);
        if (exists) {
          return prev.filter((m) => m.id !== tempId);
        }
        return prev.map((m) => (m.id === tempId ? realMsg : m));
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send message.');
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  };

  const handleSnapPress = () => {
    // Open camera screen, passing params to send directly to this user after capture
    navigation.navigate('Main', {
      screen: 'CameraTab',
      params: {
        sendToUserId: otherUserId,
        sendToUsername: otherUsername,
        conversationId: conversationId,
      },
    } as any);
  };

  const handleOpenSnap = (snap: any) => {
    if (!snap) return;

    // Direct snap opening behavior:
    // If it's sent to current user, we check view_once, etc.
    const isReceiver = snap.receiver_id === currentUserId;

    if (isReceiver && snap.is_viewed) {
      Alert.alert('Opened', 'This view-once snap has already been viewed.');
      return;
    }

    // Resolve URL and Navigate to Viewer
    setLoading(true);
    snapService.resolveTelegramUrl(snap.telegram_file_id)
      .then((mediaUrl) => {
        setLoading(false);
        navigation.navigate('SnapViewer', {
          snapId: snap.id,
          mediaUrl,
          mediaType: snap.media_type,
          caption: snap.caption || undefined,
          senderUsername: otherUsername,
          isStory: false,
        });
      })
      .catch((err) => {
        setLoading(false);
        Alert.alert('Error', err.message || 'Failed to resolve snap from Telegram.');
      });
  };

  const formatMessageTime = (timeStr: string): string => {
    try {
      const d = new Date(timeStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  };

  const renderMessageItem = ({ item }: { item: ChatMessage }) => {
    const isMe = item.sender_id === currentUserId;

    if (item.message_type === 'snap') {
      const snap = item.snap;
      const isViewed = snap?.is_viewed || item.status === 'read';
      const snapTypeLabel = snap?.media_type === 'video' ? 'Video Snap' : 'Photo Snap';

      return (
        <View style={[styles.messageRow, isMe ? styles.myRow : styles.otherRow]}>
          <View style={[styles.bubble, isMe ? styles.myBubble : styles.otherBubble, styles.snapBubble]}>
            <TouchableOpacity 
              style={styles.snapContent} 
              onPress={() => handleOpenSnap(snap)}
              activeOpacity={0.8}
            >
              <Camera size={24} color={isMe ? '#000000' : '#FFFC00'} />
              <View style={styles.snapInfo}>
                <Text style={[styles.snapText, isMe ? styles.myText : styles.otherText]}>
                  {snapTypeLabel}
                </Text>
                <Text style={styles.snapSubtext}>
                  {isViewed ? 'Opened' : 'Tap to view'}
                </Text>
              </View>
              {!isViewed && !isMe && <View style={styles.unreadDot} />}
            </TouchableOpacity>
            <Text style={[styles.timeText, isMe ? styles.myTime : styles.otherTime]}>
              {formatMessageTime(item.created_at)}
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.messageRow, isMe ? styles.myRow : styles.otherRow]}>
        <View style={[styles.bubble, isMe ? styles.myBubble : styles.otherBubble]}>
          <Text style={[styles.messageText, isMe ? styles.myText : styles.otherText]}>
            {item.message_text}
          </Text>
          <Text style={[styles.timeText, isMe ? styles.myTime : styles.otherTime]}>
            {formatMessageTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerName} numberOfLines={1}>
            {otherFullName || `@${otherUsername}`}
          </Text>
          <Text style={styles.headerUsername}>@{otherUsername}</Text>
        </View>
        <TouchableOpacity style={styles.headerCameraBtn} onPress={handleSnapPress}>
          <Camera size={22} color="#FFFC00" />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      {loading && messages.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessageItem}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No messages yet.</Text>
              <Text style={styles.emptySubtext}>
                Telegram Bot API is used as backup log storage. Supabase is used for in-app chat retrieval/realtime.
              </Text>
            </View>
          }
        />
      )}

      {/* Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.cameraBtn} onPress={handleSnapPress}>
            <Camera size={24} color="#FFFC00" />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Send a chat message..."
            placeholderTextColor="#8E8E93"
            value={inputText}
            onChangeText={setInputText}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            <Send size={20} color={inputText.trim() ? '#000000' : '#8E8E93'} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 1,
    borderColor: '#1E1E1E',
  },
  backBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#1E1E1E',
    marginRight: 12,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  headerUsername: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 1,
  },
  headerCameraBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#1E1E1E',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageList: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 12,
    width: '100%',
  },
  myRow: {
    justifyContent: 'flex-end',
  },
  otherRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    position: 'relative',
  },
  myBubble: {
    backgroundColor: '#FFFC00',
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#1E1E1E',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  snapBubble: {
    minWidth: 160,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  myText: {
    color: '#000000',
  },
  otherText: {
    color: '#FFFFFF',
  },
  timeText: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  myTime: {
    color: 'rgba(0, 0, 0, 0.5)',
  },
  otherTime: {
    color: '#8E8E93',
  },
  snapContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  snapInfo: {
    marginLeft: 10,
    flex: 1,
  },
  snapText: {
    fontSize: 14,
    fontWeight: '600',
  },
  snapSubtext: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFC00',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: '#1E1E1E',
    backgroundColor: '#000000',
  },
  cameraBtn: {
    padding: 10,
    borderRadius: 22,
    backgroundColor: '#1E1E1E',
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    backgroundColor: '#1E1E1E',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  sendBtn: {
    padding: 10,
    borderRadius: 22,
    backgroundColor: '#FFFC00',
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#1E1E1E',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    paddingHorizontal: 32,
  },
  emptyText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#8E8E93',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default ChatRoomScreen;
