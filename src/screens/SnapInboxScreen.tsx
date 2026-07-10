import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { ArrowLeft, Camera, Image, Video, Eye, EyeOff } from 'lucide-react-native';
import { snapService } from '../services/snapService';
import { Snap } from '../types/snap';
import { supabase } from '../lib/supabase';

type Props = NativeStackScreenProps<AppStackParamList, 'SnapInbox'>;

export const SnapInboxScreen: React.FC<Props> = ({ navigation }) => {
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isFocused = useIsFocused();

  const preloadSnapsUrls = (snapsList: Snap[]) => {
    // Resolve first 10 received snaps in background to make loading instant when opened
    snapsList.slice(0, 10).forEach(snap => {
      if (snap.telegram_file_id && !snap.is_viewed) {
        snapService.resolveTelegramUrl(snap.telegram_file_id).catch(() => {});
      }
    });
  };

  const fetchSnaps = async () => {
    try {
      const data = await snapService.getReceivedSnaps();
      setSnaps(data);
      preloadSnapsUrls(data);
    } catch (error) {
      console.error('Fetch Received Snaps Error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchSnaps();
    }
  }, [isFocused]);

  useEffect(() => {
    let channel: any = null;

    const setupSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel('snap_inbox_realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'snaps',
          },
          (payload) => {
            const snap = (payload.new || payload.old) as Snap;
            if (snap && (snap.receiver_id === user.id || snap.sender_id === user.id)) {
              fetchSnaps();
            }
          }
        )
        .subscribe();
    };

    setupSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchSnaps();
  };

  const handleOpenSnap = async (snap: Snap) => {
    if (snap.is_viewed) {
      Alert.alert('Opened', 'This view-once snap has already been viewed.');
      return;
    }

    setLoading(true);
    try {
      if (!snap.telegram_file_id) {
        throw new Error('Telegram file ID is missing.');
      }
      
      const mediaUrl = await snapService.resolveTelegramUrl(snap.telegram_file_id);
      setLoading(false);
      
      navigation.navigate('SnapViewer', {
        snapId: snap.id,
        mediaUrl,
        mediaType: snap.media_type,
        caption: snap.caption || undefined,
        senderUsername: snap.sender_profile?.username || 'unknown',
        isStory: false,
        telegramFileId: snap.telegram_file_id,
      });
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Error', err.message || 'Failed to open snap.');
    }
  };

  const formatTime = (timeStrStr: string): string => {
    try {
      const date = new Date(timeStrStr);
      const now = new Date();
      if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch (_) {
      return '';
    }
  };

  const renderSnapItem = ({ item }: { item: Snap }) => {
    const sender = item.sender_profile;
    const isViewed = item.is_viewed;
    const isVideo = item.media_type === 'video';

    return (
      <View style={[styles.card, isViewed && styles.cardViewed]}>
        <TouchableOpacity 
          style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
          onPress={() => {
            if (sender) {
              navigation.navigate('UserProfile', { userId: item.sender_id, username: sender.username || 'unknown' });
            }
          }}
          activeOpacity={0.7}
        >
          <View style={[styles.statusIndicator, isViewed ? styles.indicatorViewed : styles.indicatorNew]}>
            {isVideo ? (
              <Video size={18} color={isViewed ? '#8E8E93' : '#000000'} />
            ) : (
              <Image size={18} color={isViewed ? '#8E8E93' : '#000000'} />
            )}
          </View>

          <View style={styles.info}>
            <Text style={[styles.senderName, isViewed && styles.textViewed]}>
              {sender?.full_name || `@${sender?.username || 'unknown'}`}
            </Text>
            <View style={styles.subRow}>
              <Text style={styles.subtext}>
                {isVideo ? 'Video Snap' : 'Photo Snap'} • {formatTime(item.created_at)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.rightAction}
          onPress={() => handleOpenSnap(item)}
          disabled={isViewed}
        >
          {isViewed ? (
            <View style={styles.openedBadge}>
              <Eye size={14} color="#8E8E93" />
              <Text style={styles.openedText}>Opened</Text>
            </View>
          ) : (
            <View style={styles.newBadge}>
              <EyeOff size={14} color="#FFFC00" />
              <Text style={styles.newText}>Tap to View</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Snap Inbox</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading && snaps.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : (
        <FlatList
          data={snaps}
          keyExtractor={(item) => item.id}
          renderItem={renderSnapItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FFFC00" />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Camera size={64} color="#8E8E93" style={styles.emptyIcon} />
              <Text style={styles.emptyTitle}>Your Snap Inbox is empty</Text>
              <Text style={styles.emptyDesc}>
                Direct snaps sent to you will appear here. Snaps are view-once and hide in-app after you open them.
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
  cardViewed: {
    opacity: 0.65,
    borderColor: '#1A1A1C',
  },
  statusIndicator: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  indicatorNew: {
    backgroundColor: '#FFFC00',
  },
  indicatorViewed: {
    backgroundColor: '#2C2C2E',
  },
  info: {
    flex: 1,
  },
  senderName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  textViewed: {
    color: '#8E8E93',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  subtext: {
    color: '#8E8E93',
    fontSize: 12,
  },
  rightAction: {
    alignItems: 'flex-end',
  },
  newBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 252, 0, 0.1)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  newText: {
    color: '#FFFC00',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  openedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  openedText: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
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
  },
});

export default SnapInboxScreen;
