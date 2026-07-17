import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Users, ChevronRight, MessageSquare } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { groupService } from '../services/groupService';
import { Group } from '../types/groups';
import AppHeader from '../components/AppHeader';
import AppCard from '../components/AppCard';
import UserAvatar from '../components/UserAvatar';

type Props = NativeStackScreenProps<AppStackParamList, 'Groups'>;

export const GroupsScreen: React.FC<Props> = ({ navigation }) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const list = await groupService.getGroups();
      setGroups(list);
    } catch (error) {
      console.error('Load Groups Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadGroups();
    });
    return unsubscribe;
  }, [navigation]);

  const handleGroupPress = (group: Group) => {
    navigation.navigate('GroupChat', {
      groupId: group.id,
      groupName: group.name,
    });
  };

  const renderGroupItem = ({ item }: { item: Group }) => {
    return (
      <AppCard style={styles.card} onPress={() => handleGroupPress(item)}>
        <UserAvatar name={item.name} avatarUrl={item.avatar_url} size={44} />
        
        <View style={styles.info}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.created}>Created {new Date(item.created_at).toLocaleDateString()}</Text>
        </View>

        <ChevronRight size={20} color="#8e92af" />
      </AppCard>
    );
  };

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.container}>
      <AppHeader
        title="Group Chats"
        showBackButton={true}
        rightAction={
          <TouchableOpacity onPress={() => navigation.navigate('CreateGroup')} style={styles.createBtn}>
            <Plus size={24} color="#FFFC00" />
          </TouchableOpacity>
        }
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={renderGroupItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Users size={48} color="#1f2444" style={styles.emptyIcon} />
              <Text style={styles.emptyText}>No groups joined yet</Text>
              <TouchableOpacity
                style={styles.createGroupBtn}
                onPress={() => navigation.navigate('CreateGroup')}
              >
                <Text style={styles.createGroupText}>Create New Group</Text>
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
  name: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  created: {
    color: '#8e92af',
    fontSize: 12,
    marginTop: 2,
  },
  createBtn: {
    padding: 8,
  },
  empty: {
    marginTop: 80,
    alignItems: 'center',
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyText: {
    color: '#8e92af',
    fontSize: 15,
    marginBottom: 20,
  },
  createGroupBtn: {
    backgroundColor: '#FFFC00',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
  },
  createGroupText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 14,
  },
});

export default GroupsScreen;
