import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Check, X, ArrowLeft } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { friendService } from '../services/friendService';
import { FriendRequest } from '../types/friends';
import AppHeader from '../components/AppHeader';
import AppCard from '../components/AppCard';
import UserAvatar from '../components/UserAvatar';
import AppButton from '../components/AppButton';

type Props = NativeStackScreenProps<AppStackParamList, 'FriendRequests'>;

export const FriendRequestsScreen: React.FC<Props> = ({ navigation }) => {
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');

  const loadRequests = async () => {
    setLoading(true);
    try {
      const inc = await friendService.getPendingRequests();
      const out = await friendService.getSentRequests();
      setIncoming(inc);
      setOutgoing(out);
    } catch (error) {
      console.error('Load Friend Requests Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleAccept = async (request: FriendRequest) => {
    try {
      await friendService.acceptFriendRequest(request.id, request.sender_id);
      Alert.alert('Success', `You are now friends with @${request.sender?.username || 'user'}`);
      loadRequests();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to accept request.');
    }
  };

  const handleReject = async (request: FriendRequest) => {
    try {
      await friendService.rejectFriendRequest(request.id);
      loadRequests();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to reject request.');
    }
  };

  const handleCancel = async (request: FriendRequest) => {
    try {
      await friendService.cancelFriendRequest(request.id);
      loadRequests();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to cancel request.');
    }
  };

  const renderRequestItem = ({ item }: { item: FriendRequest }) => {
    const isIncoming = activeTab === 'received';
    const profile = isIncoming ? item.sender : item.receiver;

    if (!profile) return null;

    return (
      <AppCard style={styles.card}>
        <UserAvatar name={profile.full_name || profile.username} avatarUrl={profile.avatar_url} size={40} />
        
        <View style={styles.info}>
          <Text style={styles.fullName}>{profile.full_name || 'No Name'}</Text>
          <Text style={styles.username}>@{profile.username}</Text>
        </View>

        {isIncoming ? (
          <View style={styles.actionContainer}>
            <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={() => handleAccept(item)}>
              <Check size={18} color="#000000" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => handleReject(item)}>
              <X size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancel(item)}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </AppCard>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader title="Friend Requests" showBackButton={true} />

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'received' && styles.activeTab]}
          onPress={() => setActiveTab('received')}
        >
          <Text style={[styles.tabText, activeTab === 'received' && styles.activeTabText]}>
            Received ({incoming.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'sent' && styles.activeTab]}
          onPress={() => setActiveTab('sent')}
        >
          <Text style={[styles.tabText, activeTab === 'sent' && styles.activeTabText]}>
            Sent ({outgoing.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : (
        <FlatList
          data={activeTab === 'received' ? incoming : outgoing}
          keyExtractor={(item) => item.id}
          renderItem={renderRequestItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {activeTab === 'received'
                  ? 'No incoming friend requests'
                  : 'No outgoing friend requests'}
              </Text>
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
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#07080f',
    borderBottomWidth: 1,
    borderBottomColor: '#121214',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#FFFC00',
  },
  tabText: {
    color: '#8e92af',
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#FFFC00',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  info: {
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
  actionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  acceptBtn: {
    backgroundColor: '#FFFC00',
  },
  rejectBtn: {
    backgroundColor: '#2c2c35',
  },
  cancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#1f2444',
  },
  cancelBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  empty: {
    marginTop: 60,
    alignItems: 'center',
  },
  emptyText: {
    color: '#8e92af',
    fontSize: 14,
  },
});

export default FriendRequestsScreen;
