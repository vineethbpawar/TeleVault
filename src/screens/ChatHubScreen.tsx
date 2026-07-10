import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import Screen from '../components/Screen';
import { CompositeScreenProps, useIsFocused } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, AppStackParamList } from '../types/navigation';
import { 
  Search, 
  Bell, 
  UserPlus, 
  MoreVertical, 
  MessageSquare, 
  Camera, 
  Users, 
  Compass, 
  Grid, 
  Plus, 
  UserCheck, 
  UserX,
  CheckCircle,
  Clock,
} from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { chatService } from '../services/chatService';
import { friendService } from '../services/friendService';
import { groupService } from '../services/groupService';
import { snapService } from '../services/snapService';
import { Conversation, UserProfile } from '../types/chat';
import { Group } from '../types/groups';
import { Snap } from '../types/snap';
import { FriendRequest } from '../types/friends';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'ChatTab'>,
  NativeStackScreenProps<AppStackParamList>
>;

type TabType = 'unread' | 'friends' | 'near_me' | 'stories' | 'groups' | 'requests';

export const ChatHubScreen: React.FC<Props> = ({ navigation }) => {
  const isFocused = useIsFocused();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('unread');
  const [myProfile, setMyProfile] = useState<UserProfile | null>(null);

  // Data lists
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [stories, setStories] = useState<Snap[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);

  // Badges
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // FAB Modal
  const [fabVisible, setFabVisible] = useState(false);

  const loadData = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load current user profile for avatar
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setMyProfile(profile as UserProfile);

      // Load conversations
      const convList = await chatService.getConversations();
      setConversations(convList);

      // Calculate unread count
      const { count: unreadMsgs } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .neq('status', 'read');
      setUnreadCount(unreadMsgs || 0);

      // Load friends
      const friendList = await friendService.getFriends();
      setFriends(friendList);

      // Load groups
      const groupList = await groupService.getGroups();
      setGroups(groupList);

      // Load active stories
      const storyList = await snapService.getActiveStories();
      setStories(storyList);

      // Load requests
      const reqList = await friendService.getPendingRequests();
      setRequests(reqList);
      setPendingRequestsCount(reqList.length);

    } catch (err: any) {
      console.error('ChatHub fetch data failed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let convsChannel: any = null;
    let msgsChannel: any = null;
    let requestsChannel: any = null;
    let snapsChannel: any = null;

    const setupSubscriptions = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Listen to conversation updates
      convsChannel = supabase
        .channel('chathub_conversations_realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversations',
          },
          () => {
            loadData(false);
          }
        )
        .subscribe();

      // 2. Listen to message inserts (incoming chats/snaps)
      msgsChannel = supabase
        .channel('chathub_messages_realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
          },
          (payload: any) => {
            const msg = payload.new as any;
            if (msg.receiver_id === user.id || msg.sender_id === user.id) {
              loadData(false);
            }
          }
        )
        .subscribe();

      // 3. Listen to friend request changes
      requestsChannel = supabase
        .channel('chathub_requests_realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'friend_requests',
          },
          (payload: any) => {
            const req = (payload.new || payload.old) as any;
            if (req && (req.receiver_id === user.id || req.sender_id === user.id)) {
              loadData(false);
            }
          }
        )
        .subscribe();

      // 4. Listen to snaps (stories / direct snaps status)
      snapsChannel = supabase
        .channel('chathub_snaps_realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'snaps',
          },
          () => {
            loadData(false);
          }
        )
        .subscribe();
    };

    if (isFocused) {
      loadData(true);
      setupSubscriptions();
      
      // Fallback Polling every 30 seconds while screen is open
      const interval = setInterval(() => {
        loadData(false);
      }, 30000);

      return () => {
        clearInterval(interval);
        if (convsChannel) supabase.removeChannel(convsChannel);
        if (msgsChannel) supabase.removeChannel(msgsChannel);
        if (requestsChannel) supabase.removeChannel(requestsChannel);
        if (snapsChannel) supabase.removeChannel(snapsChannel);
      };
    }
  }, [isFocused]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(false);
  }, []);

  const handleAcceptRequest = async (requestId: string, senderId: string) => {
    try {
      await friendService.acceptFriendRequest(requestId, senderId);
      Alert.alert('Request Accepted', 'You are now friends!');
      loadData(false);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      await friendService.rejectFriendRequest(requestId);
      Alert.alert('Rejected', 'Friend request declined.');
      loadData(false);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const renderConversationItem = ({ item }: { item: Conversation }) => {
    const otherUser = item.other_user;
    if (!otherUser) return null;

    const isSnap = item.last_message_preview === '📸 Sent a snap';
    const isUnread = !!item.last_message_preview && item.last_message_preview !== 'Opened' && item.last_message_preview !== 'No messages yet' && item.last_message_preview.startsWith('📸');

    const formattedTime = () => {
      try {
        if (!item.last_message_at) return '';
        const date = new Date(item.last_message_at);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return '';
      }
    };

    const initials = (otherUser.full_name || otherUser.username || 'U').substring(0, 1).toUpperCase();

    return (
      <TouchableOpacity
        style={styles.chatRow}
        onPress={() => navigation.navigate('ChatRoom', {
          conversationId: item.id,
          otherUserId: otherUser.id,
          otherUsername: otherUser.username || 'unknown',
          otherFullName: otherUser.full_name || undefined,
        })}
      >
        <TouchableOpacity
          style={styles.rowAvatar}
          onPress={() => navigation.navigate('UserProfile', { userId: otherUser.id, username: otherUser.username || 'unknown' })}
        >
          <Text style={styles.rowAvatarText}>{initials}</Text>
        </TouchableOpacity>

        <View style={styles.rowContent}>
          <Text style={styles.rowName}>{otherUser.full_name || `@${otherUser.username}`}</Text>
          <Text style={[styles.rowPreview, isUnread && styles.unreadText]} numberOfLines={1}>
            {item.last_message_preview}
          </Text>
        </View>

        <View style={styles.rowRight}>
          <Text style={styles.rowTime}>{formattedTime()}</Text>
          {isSnap ? (
            <Camera size={16} color={isUnread ? '#FFFC00' : '#8E8E93'} style={{ marginTop: 4 }} />
          ) : (
            <MessageSquare size={16} color="#8E8E93" style={{ marginTop: 4 }} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderFriendItem = ({ item }: { item: UserProfile }) => {
    const initials = (item.full_name || item.username || 'U').substring(0, 1).toUpperCase();

    return (
      <View style={styles.chatRow}>
        <TouchableOpacity
          style={styles.rowAvatar}
          onPress={() => navigation.navigate('UserProfile', { userId: item.id, username: item.username || 'unknown' })}
        >
          <Text style={styles.rowAvatarText}>{initials}</Text>
        </TouchableOpacity>

        <View style={styles.rowContent}>
          <Text style={styles.rowName}>{item.full_name || `@${item.username}`}</Text>
          <Text style={styles.rowSubtext}>@{item.username}</Text>
        </View>

        <View style={styles.rowActionBtns}>
          <TouchableOpacity 
            style={styles.iconBtn} 
            onPress={() => navigation.navigate('ChatRoom', {
              otherUserId: item.id,
              otherUsername: item.username || 'unknown',
              otherFullName: item.full_name || undefined,
            })}
          >
            <MessageSquare size={18} color="#FFFC00" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.iconBtn} 
            onPress={() => navigation.navigate('Main', {
              screen: 'CameraTab',
              params: { sendToUserId: item.id, sendToUsername: item.username || 'unknown' }
            } as any)}
          >
            <Camera size={18} color="#FFFC00" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderGroupItem = ({ item }: { item: Group }) => {
    const initials = item.name.substring(0, 1).toUpperCase();

    return (
      <TouchableOpacity
        style={styles.chatRow}
        onPress={() => navigation.navigate('GroupChat', { groupId: item.id, groupName: item.name })}
      >
        <View style={[styles.rowAvatar, styles.groupAvatar]}>
          <Text style={styles.rowAvatarText}>{initials}</Text>
        </View>

        <View style={styles.rowContent}>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.rowSubtext}>Group Chat</Text>
        </View>

        <View style={styles.rowRight}>
          <Users size={16} color="#8E8E93" />
        </View>
      </TouchableOpacity>
    );
  };

  const renderRequestItem = ({ item }: { item: FriendRequest }) => {
    const sender = item.sender;
    if (!sender) return null;

    const initials = (sender.full_name || sender.username || 'U').substring(0, 1).toUpperCase();

    return (
      <View style={styles.chatRow}>
        <TouchableOpacity
          style={styles.rowAvatar}
          onPress={() => navigation.navigate('UserProfile', { userId: sender.id, username: sender.username || 'unknown' })}
        >
          <Text style={styles.rowAvatarText}>{initials}</Text>
        </TouchableOpacity>

        <View style={styles.rowContent}>
          <Text style={styles.rowName}>{sender.full_name || `@${sender.username}`}</Text>
          <Text style={styles.rowSubtext}>Requested to add you</Text>
        </View>

        <View style={styles.requestActions}>
          <TouchableOpacity 
            style={[styles.requestBtn, styles.acceptBtn]} 
            onPress={() => handleAcceptRequest(item.id, sender.id)}
          >
            <UserCheck size={14} color="#000000" />
            <Text style={styles.acceptBtnText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.requestBtn, styles.rejectBtn]} 
            onPress={() => handleRejectRequest(item.id)}
          >
            <UserX size={14} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderStoryItem = ({ item }: { item: Snap }) => {
    const sender = item.sender_profile;
    const initials = (sender?.username || 'U').substring(0, 1).toUpperCase();

    const handleOpenStory = async () => {
      try {
        if (!item.telegram_file_id) {
          Alert.alert('Error', 'Story media is not available.');
          return;
        }
        setLoading(true);
        const url = await snapService.resolveTelegramUrl(item.telegram_file_id);
        setLoading(false);
        navigation.navigate('SnapViewer', {
          snapId: item.id,
          mediaUrl: url,
          mediaType: item.media_type,
          caption: item.caption || undefined,
          senderUsername: sender?.username || 'unknown',
          isStory: true,
          telegramFileId: item.telegram_file_id,
        });
      } catch (err: any) {
        setLoading(false);
        Alert.alert('Error', err.message || 'Failed to load story.');
      }
    };

    return (
      <TouchableOpacity style={styles.chatRow} onPress={handleOpenStory}>
        <View style={[styles.rowAvatar, styles.storyAvatarBorder]}>
          <Text style={styles.rowAvatarText}>{initials}</Text>
        </View>

        <View style={styles.rowContent}>
          <Text style={styles.rowName}>@{sender?.username || 'unknown'}</Text>
          <Text style={styles.rowSubtext}>Active Story • {item.media_type.toUpperCase()}</Text>
        </View>

        <View style={styles.rowRight}>
          <Grid size={16} color="#FFFC00" />
        </View>
      </TouchableOpacity>
    );
  };

  const getFilteredData = () => {
    if (activeTab === 'unread') {
      return conversations.filter(c => c.last_message_preview && c.last_message_preview !== 'Opened' && c.last_message_preview !== 'No messages yet' && c.last_message_preview.startsWith('📸'));
    }
    return [];
  };

  const getActiveList = () => {
    if (activeTab === 'unread') {
      const data = getFilteredData();
      if (data.length === 0) {
        return (
          <ScrollView
            contentContainerStyle={styles.emptyContainer}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFC00" />}
          >
            <Text style={styles.emptyText}>No unread snaps</Text>
          </ScrollView>
        );
      }
      return (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderConversationItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFC00" />}
        />
      );
    }

    if (activeTab === 'friends') {
      if (friends.length === 0) {
        return (
          <ScrollView
            contentContainerStyle={styles.emptyContainer}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFC00" />}
          >
            <Text style={styles.emptyText}>No friends yet.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('UserSearch')}>
              <Text style={styles.emptyBtnText}>Search Users</Text>
            </TouchableOpacity>
          </ScrollView>
        );
      }
      return (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          renderItem={renderFriendItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFC00" />}
        />
      );
    }

    if (activeTab === 'near_me') {
      return (
        <View style={styles.emptyContainer}>
          <Compass size={48} color="#8E8E93" style={{ marginBottom: 12 }} />
          <Text style={styles.emptyText}>Near Me is coming later</Text>
        </View>
      );
    }

    if (activeTab === 'stories') {
      if (stories.length === 0) {
        return (
          <ScrollView
            contentContainerStyle={styles.emptyContainer}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFC00" />}
          >
            <Text style={styles.emptyText}>No active stories</Text>
          </ScrollView>
        );
      }
      return (
        <FlatList
          data={stories}
          keyExtractor={(item) => item.id}
          renderItem={renderStoryItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFC00" />}
        />
      );
    }

    if (activeTab === 'groups') {
      if (groups.length === 0) {
        return (
          <ScrollView
            contentContainerStyle={styles.emptyContainer}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFC00" />}
          >
            <Text style={styles.emptyText}>No group chats yet</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('CreateGroup')}>
              <Text style={styles.emptyBtnText}>Create Group</Text>
            </TouchableOpacity>
          </ScrollView>
        );
      }
      return (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={renderGroupItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFC00" />}
        />
      );
    }

    if (activeTab === 'requests') {
      if (requests.length === 0) {
        return (
          <ScrollView
            contentContainerStyle={styles.emptyContainer}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFC00" />}
          >
            <Text style={styles.emptyText}>No pending requests</Text>
          </ScrollView>
        );
      }
      return (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={renderRequestItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFC00" />}
        />
      );
    }

    return null;
  };

  const myInitials = (myProfile?.full_name || myProfile?.username || 'U').substring(0, 1).toUpperCase();

  return (
    <Screen edges={['top']}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerAvatar}
          onPress={() => navigation.navigate('MyProfile')}
        >
          <Text style={styles.headerAvatarText}>{myInitials}</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Chat</Text>

        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.navigate('UserSearch')}>
            <Search size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.navigate('Notifications')}>
            <Bell size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.navigate('UserSearch')}>
            <UserPlus size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs Chips Row */}
      <View style={styles.tabsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContainer}>
          {(['unread', 'friends', 'near_me', 'stories', 'groups', 'requests'] as const).map((tab) => {
            const label = tab === 'unread' ? 'Unread' : tab === 'friends' ? 'Friends' : tab === 'near_me' ? 'Near Me' : tab === 'stories' ? 'Stories' : tab === 'groups' ? 'Groups' : 'Requests';
            
            const badgeCount = () => {
              if (tab === 'unread' && unreadCount > 0) return unreadCount;
              if (tab === 'requests' && pendingRequestsCount > 0) return pendingRequestsCount;
              return 0;
            };

            const count = badgeCount();

            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tabChip, activeTab === tab && styles.activeTabChip]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabChipText, activeTab === tab && styles.activeTabChipText]}>
                  {label}
                </Text>
                {count > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Content List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {getActiveList()}
        </View>
      )}

      {/* Floating Action Button (FAB) */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setFabVisible(true)}
      >
        <Plus size={28} color="#000000" />
      </TouchableOpacity>

      {/* Quick Menu Bottom Modal */}
      <Modal
        visible={fabVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setFabVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setFabVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalHeader}>Quick Actions</Text>
            
            <TouchableOpacity 
              style={styles.modalRow} 
              onPress={() => {
                setFabVisible(false);
                navigation.navigate('UserSearch');
              }}
            >
              <MessageSquare size={20} color="#FFFC00" style={{ marginRight: 14 }} />
              <Text style={styles.modalRowText}>New Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalRow} 
              onPress={() => {
                setFabVisible(false);
                navigation.navigate('Main', { screen: 'CameraTab' } as any);
              }}
            >
              <Camera size={20} color="#FFFC00" style={{ marginRight: 14 }} />
              <Text style={styles.modalRowText}>Send Snap</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalRow} 
              onPress={() => {
                setFabVisible(false);
                navigation.navigate('UserSearch');
              }}
            >
              <UserPlus size={20} color="#FFFC00" style={{ marginRight: 14 }} />
              <Text style={styles.modalRowText}>Add Friend</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalRow} 
              onPress={() => {
                setFabVisible(false);
                navigation.navigate('CreateGroup');
              }}
            >
              <Users size={20} color="#FFFC00" style={{ marginRight: 14 }} />
              <Text style={styles.modalRowText}>Create Group</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 60,
    borderBottomWidth: 0,
    backgroundColor: '#000000',
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '800',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBtn: {
    marginLeft: 14,
    padding: 4,
  },
  tabsWrapper: {
    height: 54,
    borderBottomWidth: 0,
    backgroundColor: '#000000',
    paddingBottom: 6,
  },
  tabsContainer: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    marginRight: 8,
    borderWidth: 0,
  },
  activeTabChip: {
    backgroundColor: '#FFFC00',
  },
  tabChipText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
  },
  activeTabChipText: {
    color: '#000000',
  },
  tabBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#121212',
    backgroundColor: '#000000',
  },
  rowAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  rowAvatarText: {
    color: '#FFFC00',
    fontSize: 18,
    fontWeight: '800',
  },
  groupAvatar: {
    backgroundColor: '#0F1E10',
    borderColor: '#30D158',
  },
  storyAvatarBorder: {
    borderWidth: 2,
    borderColor: '#FFFC00',
  },
  rowContent: {
    flex: 1,
  },
  rowName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  rowPreview: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 4,
  },
  unreadText: {
    color: '#FFFC00',
    fontWeight: '700',
  },
  rowSubtext: {
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  rowTime: {
    color: '#8E8E93',
    fontSize: 10,
  },
  rowActionBtns: {
    flexDirection: 'row',
  },
  iconBtn: {
    backgroundColor: '#1E1E1E',
    padding: 8,
    borderRadius: 10,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  requestActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  requestBtn: {
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    paddingHorizontal: 10,
  },
  acceptBtn: {
    backgroundColor: '#FFFC00',
    flexDirection: 'row',
  },
  acceptBtnText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  rejectBtn: {
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyBtn: {
    backgroundColor: '#FFFC00',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 12,
  },
  emptyBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    borderTopWidth: 1,
    borderColor: '#2C2C2E',
  },
  modalHeader: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#2C2C2E',
  },
  modalRowText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ChatHubScreen;
