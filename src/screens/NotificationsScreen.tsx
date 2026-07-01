import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Bell, MessageSquare, Camera, UserCheck, Eye, UploadCloud, CheckCheck } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { notificationService } from '../services/notificationService';
import { AppNotification } from '../types/notifications';
import AppHeader from '../components/AppHeader';
import AppCard from '../components/AppCard';
import UserAvatar from '../components/UserAvatar';

type Props = NativeStackScreenProps<AppStackParamList, 'Notifications'>;

export const NotificationsScreen: React.FC<Props> = ({ navigation }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const list = await notificationService.getNotifications();
      setNotifications(list);
      // Mark read
      await notificationService.markAllAsRead();
    } catch (error) {
      console.error('Load Notifications Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const renderIcon = (type: AppNotification['type']) => {
    const size = 18;
    switch (type) {
      case 'message':
        return <MessageSquare size={size} color="#FFFC00" />;
      case 'snap':
        return <Camera size={size} color="#FFFC00" />;
      case 'friend_request':
        return <UserCheck size={size} color="#00E676" />;
      case 'story_view':
        return <Eye size={size} color="#29B6F6" />;
      case 'upload_complete':
        return <UploadCloud size={size} color="#AB47BC" />;
      default:
        return <Bell size={size} color="#FFFFFF" />;
    }
  };

  const renderItem = ({ item }: { item: AppNotification }) => {
    return (
      <AppCard style={[styles.card, !item.is_read && styles.unreadCard]}>
        <View style={styles.iconWrapper}>
          {item.sender ? (
            <UserAvatar name={item.sender.full_name || item.sender.username} avatarUrl={item.sender.avatar_url} size={36} />
          ) : (
            <View style={styles.defaultIconContainer}>{renderIcon(item.type)}</View>
          )}
        </View>

        <View style={styles.textContainer}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{item.title}</Text>
            {!item.is_read && <View style={styles.unreadDot} />}
          </View>
          <Text style={styles.body}>{item.body}</Text>
          <Text style={styles.time}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
      </AppCard>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader
        title="Notifications"
        showBackButton={true}
        rightAction={
          notifications.length > 0 ? (
            <TouchableOpacity onPress={loadNotifications} style={styles.refreshBtn}>
              <CheckCheck size={20} color="#FFFC00" />
            </TouchableOpacity>
          ) : undefined
        }
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Bell size={48} color="#1f2444" style={styles.emptyIcon} />
              <Text style={styles.emptyText}>No notifications yet</Text>
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
    alignItems: 'flex-start',
    padding: 12,
    borderColor: '#151728',
  },
  unreadCard: {
    borderColor: '#FFFC00',
    backgroundColor: '#151829',
  },
  iconWrapper: {
    marginRight: 12,
    marginTop: 2,
  },
  defaultIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1f2444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFC00',
  },
  body: {
    color: '#8e92af',
    fontSize: 13,
    marginTop: 3,
    lineHeight: 18,
  },
  time: {
    color: '#4f526c',
    fontSize: 11,
    marginTop: 6,
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
  },
  refreshBtn: {
    padding: 8,
  },
});

export default NotificationsScreen;
