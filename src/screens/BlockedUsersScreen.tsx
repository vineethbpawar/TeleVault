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
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { friendService } from '../services/friendService';
import { UserProfile } from '../types/chat';
import AppHeader from '../components/AppHeader';
import AppCard from '../components/AppCard';
import UserAvatar from '../components/UserAvatar';

type Props = NativeStackScreenProps<AppStackParamList, 'BlockedUsers'>;

export const BlockedUsersScreen: React.FC<Props> = ({ navigation }) => {
  const [blocked, setBlocked] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBlocked = async () => {
    setLoading(true);
    try {
      const list = await friendService.getBlockedUsers();
      setBlocked(list);
    } catch (error) {
      console.error('Load Blocked Users Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBlocked();
  }, []);

  const handleUnblock = (user: UserProfile) => {
    Alert.alert(
      'Unblock User',
      `Are you sure you want to unblock @${user.username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            try {
              await friendService.unblockUser(user.id);
              Alert.alert('Success', `@${user.username} has been unblocked.`);
              loadBlocked();
            } catch (err) {
              Alert.alert('Error', 'Failed to unblock user.');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: UserProfile }) => {
    return (
      <AppCard style={styles.card}>
        <UserAvatar name={item.full_name || item.username} avatarUrl={item.avatar_url} size={40} />
        
        <View style={styles.info}>
          <Text style={styles.fullName}>{item.full_name || 'No Name'}</Text>
          <Text style={styles.username}>@{item.username}</Text>
        </View>

        <TouchableOpacity style={styles.unblockBtn} onPress={() => handleUnblock(item)}>
          <Text style={styles.unblockBtnText}>Unblock</Text>
        </TouchableOpacity>
      </AppCard>
    );
  };

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.container}>
      <AppHeader title="Blocked Users" showBackButton={true} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : (
        <FlatList
          data={blocked}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No blocked users</Text>
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
  unblockBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#2c2c35',
  },
  unblockBtnText: {
    color: '#FFFC00',
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

export default BlockedUsersScreen;
