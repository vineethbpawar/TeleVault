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
import { Check } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { friendService } from '../services/friendService';
import { groupService } from '../services/groupService';
import { UserProfile } from '../types/chat';
import AppHeader from '../components/AppHeader';
import AppInput from '../components/AppInput';
import AppButton from '../components/AppButton';
import UserAvatar from '../components/UserAvatar';

type Props = NativeStackScreenProps<AppStackParamList, 'CreateGroup'>;

export const CreateGroupScreen: React.FC<Props> = ({ navigation }) => {
  const [groupName, setGroupName] = useState('');
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const loadFriends = async () => {
      try {
        const list = await friendService.getFriends();
        setFriends(list);
      } catch (error) {
        console.error('Load Friends Error:', error);
      } finally {
        setLoading(false);
      }
    };
    loadFriends();
  }, []);

  const handleToggleSelect = (friendId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(friendId)) {
        return prev.filter((id) => id !== friendId);
      } else {
        return [...prev, friendId];
      }
    });
  };

  const handleCreate = async () => {
    const name = groupName.trim();
    if (!name) {
      Alert.alert('Required', 'Please enter a group name.');
      return;
    }
    if (selectedIds.length === 0) {
      Alert.alert('Required', 'Please select at least one friend.');
      return;
    }

    setCreating(true);
    try {
      const group = await groupService.createGroup(name, selectedIds);
      Alert.alert('Success', `Group "${group.name}" created!`, [
        {
          text: 'OK',
          onPress: () => {
            navigation.navigate('GroupChat', {
              groupId: group.id,
              groupName: group.name,
            });
          },
        },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create group.');
    } finally {
      setCreating(false);
    }
  };

  const renderItem = ({ item }: { item: UserProfile }) => {
    const isSelected = selectedIds.includes(item.id);
    return (
      <TouchableOpacity
        style={[styles.friendItem, isSelected && styles.friendItemSelect]}
        onPress={() => handleToggleSelect(item.id)}
      >
        <UserAvatar name={item.full_name || item.username} avatarUrl={item.avatar_url} size={40} />
        
        <View style={styles.info}>
          <Text style={styles.fullName}>{item.full_name || 'No Name'}</Text>
          <Text style={styles.username}>@{item.username}</Text>
        </View>

        <View style={[styles.checkbox, isSelected && styles.checkboxSelect]}>
          {isSelected && <Check size={14} color="#000000" />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader title="Create Group" showBackButton={true} />

      <View style={styles.formContainer}>
        <AppInput
          label="Group Name"
          placeholder="Enter group name..."
          value={groupName}
          onChangeText={setGroupName}
        />
      </View>

      <Text style={styles.sectionHeader}>SELECT MEMBERS ({selectedIds.length})</Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>You need friends to create a group.</Text>
            </View>
          }
        />
      )}

      {friends.length > 0 && (
        <View style={styles.btnContainer}>
          <AppButton
            title="Create Group"
            onPress={handleCreate}
            loading={creating}
            disabled={!groupName.trim() || selectedIds.length === 0}
          />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  formContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionHeader: {
    color: '#8e92af',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: 16,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f1123',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  friendItemSelect: {
    borderColor: '#FFFC00',
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
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#8e92af',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelect: {
    backgroundColor: '#FFFC00',
    borderColor: '#FFFC00',
  },
  btnContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#121214',
    backgroundColor: '#07080f',
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

export default CreateGroupScreen;
