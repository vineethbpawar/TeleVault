import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserPlus, ShieldAlert, MessageCircle, Send, MoreVertical, Search, Users } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { friendService } from '../services/friendService';
import { chatService } from '../services/chatService';
import { UserProfile } from '../types/chat';
import AppHeader from '../components/AppHeader';
import AppCard from '../components/AppCard';
import UserAvatar from '../components/UserAvatar';

type Props = NativeStackScreenProps<AppStackParamList, 'Friends'>;

export const FriendsScreen: React.FC<Props> = ({ navigation }) => {
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  const loadData = async () => {
    setLoading(true);
    try {
      const friendsList = await friendService.getFriends();
      setFriends(friendsList);

      const requests = await friendService.getPendingRequests();
      setPendingCount(requests.length);
    } catch (error) {
      console.error('Load Friends Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadData();
    });
    return unsubscribe;
  }, [navigation]);

  const handleChat = async (friend: UserProfile) => {
    try {
      const conv = await chatService.getOrCreateConversation(friend.id);
      navigation.navigate('ChatRoom', {
        conversationId: conv.id,
        otherUserId: friend.id,
        otherUsername: friend.username || 'unknown',
        otherFullName: friend.full_name || undefined,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to start chat.');
    }
  };

  const handleSendSnap = (friend: UserProfile) => {
    navigation.navigate('UserSearch', {
      mode: 'snap',
      mediaUri: undefined,
      mediaType: undefined,
    });
  };

  const handleFriendOptions = (friend: UserProfile) => {
    Alert.alert(
      `Manage @${friend.username}`,
      'Choose an action below:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report User',
          onPress: () => navigation.navigate('ReportUser', {
            reportedUserId: friend.id,
            reportedUsername: friend.username || 'unknown'
          })
        },
        {
          text: 'Block User',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Block User',
              `Are you sure you want to block @${friend.username}? They won't be able to chat, send snaps, or see your stories.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Block',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await friendService.blockUser(friend.id);
                      Alert.alert('Blocked', `@${friend.username} has been blocked.`);
                      loadData();
                    } catch (err) {
                      Alert.alert('Error', 'Failed to block user.');
                    }
                  }
                }
              ]
            );
          }
        },
        {
          text: 'Remove Friend',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Remove Friend',
              `Are you sure you want to remove @${friend.username} from your friends?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await friendService.removeFriend(friend.id);
                      loadData();
                    } catch (err) {
                      Alert.alert('Error', 'Failed to remove friend.');
                    }
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };

  const renderFriendItem = ({ item }: { item: UserProfile }) => {
    return (
      <AppCard style={styles.friendCard}>
        <UserAvatar name={item.full_name || item.username} avatarUrl={item.avatar_url} size={44} />
        <View style={styles.friendInfo}>
          <Text style={styles.fullName}>{item.full_name || 'No Name'}</Text>
          <Text style={styles.username}>@{item.username}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionIcon} onPress={() => handleChat(item)}>
            <MessageCircle size={20} color="#FFFC00" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionIcon} onPress={() => handleSendSnap(item)}>
            <Send size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionIcon} onPress={() => handleFriendOptions(item)}>
            <MoreVertical size={20} color="#8e92af" />
          </TouchableOpacity>
        </View>
      </AppCard>
    );
  };

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.container}>
      <AppHeader
        title="Friends"
        showBackButton={true}
        rightAction={
          <TouchableOpacity onPress={() => navigation.navigate('UserSearch')}>
            <Search size={22} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />

      {/* Tabs / Links */}
      <View style={styles.tabLinks}>
        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.navigate('FriendRequests')}
        >
          <UserPlus size={20} color="#FFFC00" />
          <Text style={styles.linkText}>Requests</Text>
          {pendingCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.navigate('BlockedUsers')}
        >
          <ShieldAlert size={20} color="#8e92af" />
          <Text style={styles.linkText}>Blocked</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.navigate('Groups')}
        >
          <Users size={20} color="#8e92af" />
          <Text style={styles.linkText}>Groups</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          renderItem={renderFriendItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No friends yet</Text>
              <TouchableOpacity
                style={styles.searchBtn}
                onPress={() => navigation.navigate('UserSearch')}
              >
                <Text style={styles.searchBtnText}>Find Friends</Text>
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
  tabLinks: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#121214',
    backgroundColor: '#07080f',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#0f1123',
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  linkText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  badge: {
    backgroundColor: '#FF453A',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 16,
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  friendInfo: {
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIcon: {
    padding: 8,
    marginLeft: 4,
    borderRadius: 16,
    backgroundColor: '#151728',
  },
  emptyState: {
    marginTop: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#8e92af',
    fontSize: 15,
    marginBottom: 16,
  },
  searchBtn: {
    backgroundColor: '#FFFC00',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  searchBtnText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 14,
  },
});

export default FriendsScreen;
