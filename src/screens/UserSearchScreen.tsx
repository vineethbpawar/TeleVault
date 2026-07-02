import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { ArrowLeft, Search, MessageSquare, Send, Camera, UserPlus, UserCheck, ShieldAlert, MoreVertical } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { chatService } from '../services/chatService';
import { snapService } from '../services/snapService';
import { friendService } from '../services/friendService';
import { UserProfile } from '../types/chat';
import { supabase } from '../lib/supabase';
import AppHeader from '../components/AppHeader';
import AppCard from '../components/AppCard';
import UserAvatar from '../components/UserAvatar';

type Props = NativeStackScreenProps<AppStackParamList, 'UserSearch'>;

type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends';

export const UserSearchScreen: React.FC<Props> = ({ navigation, route }) => {
  const params = route.params || {};
  const isPickerMode = params.mode === 'snap';
  const mediaUri = params.mediaUri;
  const mediaType = params.mediaType;

  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Friends status mapping
  const [friendStatuses, setFriendStatuses] = useState<Record<string, FriendStatus>>({});
  const [blockedMap, setBlockedMap] = useState<Record<string, boolean>>({});

  const fetchStatuses = async (userList: UserProfile[]) => {
    const statuses: Record<string, FriendStatus> = {};
    const blocks: Record<string, boolean> = {};

    await Promise.all(
      userList.map(async (u) => {
        try {
          const status = await friendService.getFriendshipStatus(u.id);
          const { data: { user } } = await supabase.auth.getUser();
          const isBlocked = user ? await friendService.isBlockedRelation(user.id, u.id) : false;
          statuses[u.id] = status;
          blocks[u.id] = isBlocked;
        } catch (e) {
          statuses[u.id] = 'none';
          blocks[u.id] = false;
        }
      })
    );

    setFriendStatuses(statuses);
    setBlockedMap(blocks);
  };

  const handleSearch = async (text: string) => {
    setSearchQuery(text);
    if (!text.trim()) {
      setUsers([]);
      return;
    }

    setLoading(true);
    try {
      const results = await chatService.searchUsers(text);
      setUsers(results);
      await fetchStatuses(results);
    } catch (error: any) {
      console.error('Search Users Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async (targetUser: UserProfile) => {
    setActionLoadingId(targetUser.id);
    try {
      await friendService.sendFriendRequest(targetUser.id);
      Alert.alert('Request Sent', `Friend request sent to @${targetUser.username}`);
      await handleSearch(searchQuery);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send friend request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAcceptFriend = async (targetUser: UserProfile) => {
    setActionLoadingId(targetUser.id);
    try {
      // Find incoming request id
      const requests = await friendService.getPendingRequests();
      const match = requests.find((r) => r.sender_id === targetUser.id);
      if (match) {
        await friendService.acceptFriendRequest(match.id, targetUser.id);
        Alert.alert('Success', `You are now friends with @${targetUser.username}`);
        await handleSearch(searchQuery);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to accept friend request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleChat = async (otherUser: UserProfile) => {
    setActionLoadingId(otherUser.id);
    try {
      const conv = await chatService.getOrCreateConversation(otherUser.id);
      navigation.navigate('ChatRoom', {
        conversationId: conv.id,
        otherUserId: otherUser.id,
        otherUsername: otherUser.username || 'unknown',
        otherFullName: otherUser.full_name || undefined,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to start chat.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSendSnapDirect = async (otherUser: UserProfile) => {
    if (!mediaUri || !mediaType) return;
    setActionLoadingId(otherUser.id);
    try {
      await snapService.sendDirectSnap(otherUser.id, mediaUri, mediaType);
      Alert.alert('Success', `Snap sent to @${otherUser.username}!`, [
        { text: 'OK', onPress: () => navigation.navigate('Main', { screen: 'CameraTab' } as any) },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send snap.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCreateSnapAndSend = (otherUser: UserProfile) => {
    Alert.alert(
      'Send Snap',
      `Choose source to send snap to @${otherUser.username}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Camera',
          onPress: async () => {
            const status = await ImagePicker.requestCameraPermissionsAsync();
            if (!status.granted) {
              Alert.alert('Permission Denied', 'Camera access is required.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images', 'videos'],
              quality: 0.8,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
              const asset = result.assets[0];
              const type = asset.type === 'video' ? 'video' : 'image';
              setActionLoadingId(otherUser.id);
              try {
                await snapService.sendDirectSnap(otherUser.id, asset.uri, type);
                Alert.alert('Success', 'Snap sent.');
              } catch (err: any) {
                Alert.alert('Error', err.message || 'Failed to send snap.');
              } finally {
                setActionLoadingId(null);
              }
            }
          },
        },
        {
          text: 'Gallery',
          onPress: async () => {
            const status = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!status.granted) {
              Alert.alert('Permission Denied', 'Gallery access is required.');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images', 'videos'],
              quality: 0.8,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
              const asset = result.assets[0];
              const type = asset.type === 'video' ? 'video' : 'image';
              setActionLoadingId(otherUser.id);
              try {
                await snapService.sendDirectSnap(otherUser.id, asset.uri, type);
                Alert.alert('Success', 'Snap sent.');
              } catch (err: any) {
                Alert.alert('Error', err.message || 'Failed to send snap.');
              } finally {
                setActionLoadingId(null);
              }
            }
          },
        },
      ]
    );
  };

  const handleUserOptions = (targetUser: UserProfile) => {
    const isBlocked = blockedMap[targetUser.id];
    Alert.alert(
      `Options for @${targetUser.username}`,
      'Choose an action below:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report User',
          onPress: () => navigation.navigate('ReportUser', {
            reportedUserId: targetUser.id,
            reportedUsername: targetUser.username || 'unknown',
          }),
        },
        {
          text: isBlocked ? 'Unblock User' : 'Block User',
          style: 'destructive',
          onPress: async () => {
            try {
              if (isBlocked) {
                await friendService.unblockUser(targetUser.id);
                Alert.alert('Unblocked', `@${targetUser.username} has been unblocked.`);
              } else {
                await friendService.blockUser(targetUser.id);
                Alert.alert('Blocked', `@${targetUser.username} has been blocked.`);
              }
              await handleSearch(searchQuery);
            } catch (err) {
              Alert.alert('Error', 'Failed to update block state.');
            }
          },
        },
      ]
    );
  };

  const renderUserItem = ({ item }: { item: UserProfile }) => {
    const isActionLoading = actionLoadingId === item.id;
    const isBlocked = blockedMap[item.id] || false;
    const friendStatus = friendStatuses[item.id] || 'none';

    return (
      <AppCard style={styles.card}>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
          onPress={() => navigation.navigate('UserProfile', { userId: item.id, username: item.username || 'unknown' })}
          activeOpacity={0.7}
        >
          <UserAvatar name={item.full_name || item.username} avatarUrl={item.avatar_url} size={44} />
          
          <View style={styles.userInfo}>
            <Text style={styles.fullName}>{item.full_name || 'No name'}</Text>
            <Text style={styles.username}>@{item.username}</Text>
          </View>
        </TouchableOpacity>

        {isBlocked ? (
          <View style={styles.blockedBadge}>
            <ShieldAlert size={14} color="#FF453A" />
            <Text style={styles.blockedText}>Blocked</Text>
          </View>
        ) : isPickerMode ? (
          friendStatus === 'friends' ? (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleSendSnapDirect(item)}
              disabled={isActionLoading}
            >
              {isActionLoading ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <>
                  <Send size={14} color="#000" />
                  <Text style={styles.actionBtnText}>Send Snap</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.actionBtn, styles.disabledBtn]}
              onPress={() => Alert.alert('Friends Only', 'You can only send snaps to friends.')}
            >
              <Text style={styles.disabledBtnText}>Friends Only</Text>
            </TouchableOpacity>
          )
        ) : (
          <View style={styles.rowActions}>
            {friendStatus === 'none' && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.addBtn]}
                onPress={() => handleAddFriend(item)}
                disabled={isActionLoading}
              >
                {isActionLoading ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <>
                    <UserPlus size={14} color="#000000" />
                    <Text style={styles.actionBtnText}>Add Friend</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {friendStatus === 'pending_sent' && (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingText}>Requested</Text>
              </View>
            )}

            {friendStatus === 'pending_received' && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.addBtn]}
                onPress={() => handleAcceptFriend(item)}
                disabled={isActionLoading}
              >
                {isActionLoading ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <>
                    <UserCheck size={14} color="#000000" />
                    <Text style={styles.actionBtnText}>Accept</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {friendStatus === 'friends' && (
              <>
                <TouchableOpacity
                  style={[styles.actionIconBtn, styles.chatBtn]}
                  onPress={() => handleChat(item)}
                  disabled={isActionLoading}
                >
                  <MessageSquare size={16} color="#FFFFFF" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionIconBtn, styles.snapBtn]}
                  onPress={() => handleCreateSnapAndSend(item)}
                  disabled={isActionLoading}
                >
                  <Camera size={16} color="#000000" />
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.moreBtn} onPress={() => handleUserOptions(item)}>
              <MoreVertical size={20} color="#8e92af" />
            </TouchableOpacity>
          </View>
        )}
      </AppCard>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader title={isPickerMode ? 'Send Snap To...' : 'Search Users'} showBackButton={true} />

      <View style={styles.searchContainer}>
        <Search size={20} color="#8E8E93" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by username or name..."
          placeholderTextColor="#8E8E93"
          value={searchQuery}
          onChangeText={handleSearch}
          autoCapitalize="none"
          autoFocus
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUserItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            searchQuery ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No users found matching "{searchQuery}"</Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Type a username or full name above to find users</Text>
              </View>
            )
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f1123',
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
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
    padding: 12,
    marginBottom: 8,
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  fullName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  username: {
    color: '#8e92af',
    fontSize: 13,
    marginTop: 2,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFC00',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  actionBtnText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 12,
    marginLeft: 4,
  },
  disabledBtn: {
    backgroundColor: '#1c1c24',
  },
  disabledBtnText: {
    color: '#8e92af',
    fontSize: 12,
    fontWeight: '600',
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addBtn: {
    backgroundColor: '#FFFC00',
  },
  actionIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  chatBtn: {
    backgroundColor: '#1f2444',
  },
  snapBtn: {
    backgroundColor: '#FFFC00',
  },
  moreBtn: {
    padding: 6,
    marginLeft: 4,
  },
  pendingBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#151728',
    borderWidth: 1,
    borderColor: '#242745',
  },
  pendingText: {
    color: '#8e92af',
    fontSize: 12,
    fontWeight: '600',
  },
  blockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#1c1115',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3a171d',
  },
  blockedText: {
    color: '#FF453A',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyState: {
    marginTop: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#8e92af',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default UserSearchScreen;
