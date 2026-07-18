import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView, RefreshControl, Image } from 'react-native';
import { Search, Plus, MessageSquare, Camera, Users, UserCheck, Star, Clock, User, Bell, ChevronRight, Check, Square, Play, Phone } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatListContainerProps, ChatConversation, ChatGroup, ChatStory, ChatRequest, ChatTabType } from './types';
import { StoryBubble } from './StoryBubble';
import { chatService } from '../services/chatService';
import { friendService } from '../services/friendService';
import { groupService } from '../services/groupService';
import { snapService } from '../services/snapService';
import { supabase } from '../lib/supabase';
import { showToast } from '../components/ToastBanner';

export const ChatListContainer: React.FC<ChatListContainerProps> = ({ navigation, isFocused }) => {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ChatTabType>('unread');
  const [searchQuery, setSearchQuery] = useState('');

  const handleTabPress = (tab: ChatTabType) => {
    if (tab === 'calls') {
      // Navigate directly to Call History screen
      navigation.navigate('CallHistory');
      return;
    }
    setActiveTab(tab);
  };

  // Data lists
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [stories, setStories] = useState<ChatStory[]>([]);
  const [requests, setRequests] = useState<ChatRequest[]>([]);

  // Statistics
  const [myProfile, setMyProfile] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const getRandomColor = (username: string) => {
    if (!username) return '#8E8E93';
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = ['#FF2D55', '#5856D6', '#007AFF', '#4CD964', '#FF9500', '#FF3B30', '#A352FC'];
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const renderStatusIcon = (item: ChatConversation) => {
    const lastMsg = (item as any).last_message;
    if (!lastMsg || !currentUserId) return null;

    const isMe = lastMsg.sender_id === currentUserId;
    const isRead = lastMsg.status === 'read';
    const isSnap = lastMsg.message_type === 'snap';
    const isVideo = isSnap && (lastMsg.snap?.media_type === 'video' || item.last_message_preview?.includes('video') || item.last_message_preview?.includes('🎥') || item.last_message_preview?.toLowerCase().includes('video'));

    // Determine color: Snap Video (Purple), Snap Photo (Red), Chat (Blue)
    let color = '#00B2FF'; // Blue default for chat
    if (isSnap) {
      color = isVideo ? '#A352FC' : '#FF3B30';
    }

    const iconSize = 13;

    if (isMe) {
      return (
        <View style={styles.statusIconInline}>
          <Play 
            size={iconSize} 
            color={color} 
            fill={isRead ? 'transparent' : color} 
          />
        </View>
      );
    } else {
      return (
        <View style={styles.statusIconInline}>
          <Square 
            size={iconSize} 
            color={color} 
            fill={isRead ? 'transparent' : color} 
          />
        </View>
      );
    }
  };

  const loadAllData = useCallback(async (showSpinner = true) => {
    if (showSpinner && conversations.length === 0) setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setCurrentUserId(user.id);

      // Load my profile details
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setMyProfile(profile);

      // Load conversations (DMs)
      const convList = await chatService.getConversations();
      setConversations(convList);

      // Load unread count
      const { count } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .neq('status', 'read');
      setUnreadCount(count || 0);

      // Load friends
      const friendList = await friendService.getFriends();
      setFriends(friendList);

      // Load groups
      const groupList = await groupService.getGroups();
      setGroups(groupList);

      // Load active stories
      const storyList = await snapService.getActiveStories();
      setStories(storyList);

      // Load pending requests
      const reqList = await friendService.getPendingRequests();
      setRequests(reqList);
    } catch (err) {
      console.error('[ChatListContainer] Failed to load data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [conversations.length]);

  // Tab focus load
  useEffect(() => {
    if (isFocused) {
      loadAllData(true);
    }
  }, [isFocused, loadAllData]);

  // Real-time Postgres subscriptions for messaging and stories
  useEffect(() => {
    if (!isFocused) return;

    const messagesChannel = supabase
      .channel('chat_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => {
        loadAllData(false);
      })
      .subscribe();

    const storiesChannel = supabase
      .channel('stories_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'snaps', filter: 'snap_type=eq.story' }, () => {
        loadAllData(false);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(storiesChannel);
    };
  }, [isFocused, loadAllData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAllData(false);
  };

  const handleOpenStory = async (story: ChatStory) => {
    setLoading(true);
    try {
      if (!story.telegram_file_id) throw new Error('Invalid Story ID');
      const mediaUrl = await snapService.resolveTelegramUrl(story.telegram_file_id);
      setLoading(false);

      navigation.navigate('SnapViewer', {
        snapId: story.id,
        mediaUrl,
        mediaType: story.media_type,
        caption: story.caption || undefined,
        senderUsername: story.sender_profile?.username || 'me',
        isStory: true,
        telegramFileId: story.telegram_file_id,
      });
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Error', err.message || 'Failed to open story.');
    }
  };

  // Navigations
  const handleOpenDM = (conv: ChatConversation) => {
    navigation.navigate('ChatRoom', {
      conversationId: conv.id,
      friendId: conv.other_user?.id,
      friendUsername: conv.other_user?.username,
    });
  };

  const handleOpenGroup = (group: ChatGroup) => {
    navigation.navigate('GroupChat', {
      groupId: group.id,
      groupName: group.name,
    });
  };

  const handleAcceptRequest = async (reqId: string, senderId: string) => {
    try {
      await friendService.acceptFriendRequest(reqId, senderId);
      showToast('Friend request accepted.');
      loadAllData(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to accept request.');
    }
  };

  // Search filtering
  const filteredConversations = conversations.filter(c => 
    c.other_user?.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredGroups = groups.filter(g => 
    g.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFriends = friends.filter(f => 
    f.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  };

  return (
    <View style={styles.container}>
      {/* Search Header row */}
      <View style={[styles.searchBarRow, { marginTop: insets.top > 0 ? insets.top + 6 : 12 }]}>
        <View style={styles.searchFieldWrapper}>
          <Search size={18} color="#8E8E93" style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search chats, stories, or friends..."
            placeholderTextColor="#8E8E93"
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
        </View>
        <TouchableOpacity style={styles.headerActionBtn} onPress={() => navigation.navigate('UserSearch')}>
          <Plus size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Horizontal Snapchat Stories Tray */}
      {stories.length > 0 && (
        <View style={styles.storiesTrayWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storiesTrayContent}>
            {/* Create Story card */}
            <TouchableOpacity style={styles.createStoryBubble} onPress={() => navigation.navigate('Main', { screen: 'CameraTab' } as any)}>
              <View style={styles.createStoryRing}>
                <View style={styles.createStoryAvatar}>
                  <Plus size={18} color="#000000" />
                </View>
              </View>
              <Text style={styles.createStoryText}>Add Story</Text>
            </TouchableOpacity>

            {/* Friend Stories list */}
            {stories.map((story) => (
              <StoryBubble
                key={story.id}
                story={story}
                onPress={() => handleOpenStory(story)}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Navigation tabs row */}
      <View style={styles.tabContainer}>
        {(['unread', 'groups', 'calls', 'friends', 'requests'] as const).map((tab) => {
          const isActive = activeTab === tab;
          let label = '';
          let count = 0;
          if (tab === 'unread') {
            label = 'CHATS';
            count = unreadCount;
          } else if (tab === 'groups') {
            label = 'GROUPS';
          } else if (tab === 'calls') {
            label = 'CALLS';
          } else if (tab === 'friends') {
            label = 'FRIENDS';
          } else if (tab === 'requests') {
            label = 'REQUESTS';
            count = requests.length;
          }

          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              onPress={() => handleTabPress(tab)}
            >
              {tab === 'calls' ? (
                <Phone size={13} color={isActive ? '#000000' : '#8E8E93'} />
              ) : null}
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {label}{count > 0 ? ` (${count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content Feed lists */}
      {loading ? (
        <View style={[styles.container, styles.center]}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : (
        <FlatList
          data={
            activeTab === 'unread' 
              ? filteredConversations 
              : activeTab === 'groups'
                ? filteredGroups
                : activeTab === 'calls'
                  ? []
                  : activeTab === 'friends'
                    ? filteredFriends
                    : requests
          }
          keyExtractor={(item: any) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#FFFC00']}
              tintColor="#FFFC00"
            />
          }
          contentContainerStyle={styles.listContent}
          renderItem={({ item }: { item: any }) => {
            // 1. Direct Messages tab
            if (activeTab === 'unread') {
              const hasUnread = item.unread_count > 0;
              const avatarBg = getRandomColor(item.other_user?.username || '');
              return (
                <TouchableOpacity style={styles.feedRow} onPress={() => handleOpenDM(item)}>
                  <View style={styles.rowLeft}>
                    <View style={[styles.avatarWrapper, { backgroundColor: avatarBg }]}>
                      <Text style={styles.avatarLetter}>
                        {(item.other_user?.username || '?').substring(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.detailsWrapper}>
                      <Text style={styles.titleText}>{item.other_user?.username}</Text>
                      <View style={styles.statusRow}>
                        {renderStatusIcon(item)}
                        <Text style={[styles.subtitleText, hasUnread && styles.subtitleTextUnread]} numberOfLines={1}>
                          {item.last_message_preview || 'Tap to chat'}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.rowRight}>
                    {item.last_message_at && (
                      <Text style={styles.timeText}>{formatTime(item.last_message_at)}</Text>
                    )}
                    {hasUnread && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>{item.unread_count}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            }

            // 2. Groups tab
            if (activeTab === 'groups') {
              return (
                <TouchableOpacity style={styles.feedRow} onPress={() => handleOpenGroup(item)}>
                  <View style={styles.rowLeft}>
                    <View style={[styles.avatarWrapper, { backgroundColor: '#102A45' }]}>
                      <Users size={20} color="#3897F1" />
                    </View>
                    <View style={styles.detailsWrapper}>
                      <Text style={styles.titleText}>{item.name}</Text>
                      <Text style={styles.subtitleText} numberOfLines={1}>
                        {item.description || 'Group Chat'}
                      </Text>
                    </View>
                  </View>
                  <ChevronRight size={18} color="#2C2C2E" />
                </TouchableOpacity>
              );
            }

            // 3. Friends List tab
            if (activeTab === 'friends') {
              return (
                <View style={styles.feedRow}>
                  <View style={styles.rowLeft}>
                    <View style={styles.avatarWrapper}>
                      <User size={20} color="#8E8E93" />
                    </View>
                    <View style={styles.detailsWrapper}>
                      <Text style={styles.titleText}>{item.username}</Text>
                      <Text style={styles.subtitleText}>{item.full_name || 'TeleVault User'}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.chatActionBtn}
                    onPress={() => navigation.navigate('ChatRoom', { friendId: item.id, friendUsername: item.username })}
                  >
                    <MessageSquare size={16} color="#000000" />
                  </TouchableOpacity>
                </View>
              );
            }

            // 4. Friend Requests tab
            return (
              <View style={styles.feedRow}>
                <View style={styles.rowLeft}>
                  <View style={styles.avatarWrapper}>
                    <User size={20} color="#8E8E93" />
                  </View>
                  <View style={styles.detailsWrapper}>
                    <Text style={styles.titleText}>{item.sender_profile.username}</Text>
                    <Text style={styles.subtitleText}>Wants to be friends</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.acceptRequestBtn} onPress={() => handleAcceptRequest(item.id, item.sender_id)}>
                  <Check size={16} color="#000000" />
                </TouchableOpacity>
              </View>
            );
          }}
          ListEmptyComponent={
            activeTab === 'groups' ? (
              <View style={styles.emptyState}>
                <Users size={52} color="#2C2C2E" />
                <Text style={styles.emptyStateTitle}>No Groups Yet</Text>
                <Text style={styles.emptyStateDesc}>Tap the + button below to create your first group chat</Text>
                <TouchableOpacity style={styles.emptyStateCta} onPress={() => navigation.navigate('CreateGroup')}>
                  <Plus size={16} color="#000000" style={{ marginRight: 6 }} />
                  <Text style={styles.emptyStateCtaText}>Create Group</Text>
                </TouchableOpacity>
              </View>
            ) : activeTab === 'unread' ? (
              <View style={styles.emptyState}>
                <MessageSquare size={52} color="#2C2C2E" />
                <Text style={styles.emptyStateTitle}>No Chats Yet</Text>
                <Text style={styles.emptyStateDesc}>Search for users to start a conversation</Text>
              </View>
            ) : null
          }
        />
      )}

      {/* Create Group FAB — visible only on groups tab */}
      {activeTab === 'groups' && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('CreateGroup')}
          activeOpacity={0.85}
        >
          <Plus size={22} color="#000000" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchFieldWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  headerActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  storiesTrayWrapper: {
    height: 104,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1C1C1E',
    backgroundColor: '#000000',
  },
  storiesTrayContent: {
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  createStoryBubble: {
    alignItems: 'center',
    marginHorizontal: 8,
    width: 72,
  },
  createStoryRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  createStoryAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FFFC00',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  createStoryText: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 6,
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 10,
    justifyContent: 'space-between',
  },
  tabItem: {
    flex: 1,
    marginHorizontal: 3,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemActive: {
    backgroundColor: '#FFFC00',
  },
  tabText: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '800',
  },
  tabTextActive: {
    color: '#000000',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1C1C1E',
    height: 72,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  detailsWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitleText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
  },
  subtitleTextUnread: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  rowRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  timeText: {
    color: '#8E8E93',
    fontSize: 12,
    marginBottom: 6,
  },
  unreadBadge: {
    backgroundColor: '#FFFC00',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#000000',
    fontSize: 10,
    fontWeight: '800',
  },
  chatActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptRequestBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#34C759',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusIconInline: {
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#FFFC00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  tabPhoneIcon: {
    marginRight: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyStateTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  emptyStateDesc: {
    color: '#8E8E93',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  emptyStateCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFC00',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginTop: 8,
  },
  emptyStateCtaText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 14,
  },
});
export default ChatListContainer;
