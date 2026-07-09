import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, AppStackParamList } from '../types/navigation';
import { MessageSquarePlus, MessageCircle, ArrowLeft } from 'lucide-react-native';
import { chatService } from '../services/chatService';
import { Conversation } from '../types/chat';
import { supabase } from '../lib/supabase';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, any>,
  NativeStackScreenProps<AppStackParamList>
>;

export const ChatListScreen: React.FC<Props> = ({ navigation }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isFocused = useIsFocused();

  const fetchConversations = async () => {
    try {
      const data = await chatService.getConversations();
      setConversations(data);
    } catch (error) {
      console.error('Fetch Conversations Error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchConversations();
    }
  }, [isFocused]);

  useEffect(() => {
    let convChannel: any = null;
    let msgChannel: any = null;

    const setupSubscriptions = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Listen for conversation updates (e.g. last message timestamp / preview)
      convChannel = supabase
        .channel('conversations_realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversations',
          },
          (payload) => {
            if (__DEV__) {
              console.log('[Realtime] Conversations event:', payload);
            }
            const newConv = (payload.new || payload.old) as Conversation;
            if (newConv && (newConv.participant_a === user.id || newConv.participant_b === user.id)) {
              fetchConversations();
            }
          }
        )
        .subscribe();

      // 2. Listen for message updates (to update unread badges in real-time)
      msgChannel = supabase
        .channel('messages_realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'chat_messages',
          },
          (payload) => {
            if (__DEV__) {
              console.log('[Realtime] Chat messages event:', payload);
            }
            const msg = (payload.new || payload.old) as any;
            if (msg && (msg.sender_id === user.id || msg.receiver_id === user.id)) {
              fetchConversations();
            }
          }
        )
        .subscribe();
    };

    setupSubscriptions();

    return () => {
      if (convChannel) {
        supabase.removeChannel(convChannel);
      }
      if (msgChannel) {
        supabase.removeChannel(msgChannel);
      }
    };
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchConversations();
  };

  const handleNavigateToChat = (conv: Conversation) => {
    if (!conv.other_user) return;
    navigation.navigate('ChatRoom', {
      conversationId: conv.id,
      otherUserId: conv.other_user.id,
      otherUsername: conv.other_user.username || 'unknown',
      otherFullName: conv.other_user.full_name || undefined,
    });
  };

  const formatTime = (timeStr?: string | null): string => {
    if (!timeStr) return '';
    try {
      const date = new Date(timeStr);
      const now = new Date();
      if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch (_) {
      return '';
    }
  };

  const renderConversationItem = ({ item }: { item: Conversation }) => {
    const otherUser = item.other_user;
    if (!otherUser) return null;

    return (
      <TouchableOpacity style={styles.card} onPress={() => handleNavigateToChat(item)}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(otherUser.full_name || otherUser.username || '?').substring(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={styles.content}>
          <View style={styles.row}>
            <Text style={styles.name} numberOfLines={1}>
              {otherUser.full_name || `@${otherUser.username}`}
            </Text>
            <Text style={styles.time}>{formatTime(item.last_message_at)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.preview} numberOfLines={1}>
              {item.last_message_preview || 'No messages yet'}
            </Text>
            {/* Real-time unread badge indicator */}
            {item.unread_count !== undefined && item.unread_count > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadCountText}>{item.unread_count}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chats</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('UserSearch')}>
          <MessageSquarePlus size={22} color="#FFFC00" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversationItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FFFC00" />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MessageCircle size={64} color="#8E8E93" style={styles.emptyIcon} />
              <Text style={styles.emptyTitle}>No chats yet</Text>
              <Text style={styles.emptyDesc}>Search users to start a secure chat log copy on Telegram.</Text>
              <TouchableOpacity
                style={styles.findUserBtn}
                onPress={() => navigation.navigate('UserSearch')}
              >
                <Text style={styles.findUserText}>Find User</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
  },
  backBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#1E1E1E',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  addBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#1E1E1E',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFC00',
    fontSize: 20,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    maxWidth: '75%',
  },
  time: {
    color: '#8E8E93',
    fontSize: 12,
  },
  preview: {
    color: '#8E8E93',
    fontSize: 13,
    maxWidth: '85%',
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadCountText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyState: {
    marginTop: 80,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyDesc: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  findUserBtn: {
    backgroundColor: '#FFFC00',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
  },
  findUserText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 14,
  },
});

export default ChatListScreen;
