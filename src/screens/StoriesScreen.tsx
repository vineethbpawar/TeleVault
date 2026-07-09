import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  ScrollView,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { ArrowLeft, Sparkles, Eye, Plus, Circle } from 'lucide-react-native';
import { snapService } from '../services/snapService';
import { Snap } from '../types/snap';
import { supabase } from '../lib/supabase';

type Props = NativeStackScreenProps<AppStackParamList, 'Stories'>;

interface StoryWithViews extends Snap {
  viewsCount?: number;
}

export const StoriesScreen: React.FC<Props> = ({ navigation }) => {
  const [activeStories, setActiveStories] = useState<Snap[]>([]);
  const [myStories, setMyStories] = useState<StoryWithViews[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isFocused = useIsFocused();

  const fetchStories = async () => {
    try {
      // 1. Fetch active stories from other users
      const active = await snapService.getActiveStories();
      setActiveStories(active);

      // 2. Fetch my stories
      const mine = await snapService.getMyStories();
      
      // 3. For each of my stories, fetch view count
      const mineWithViews: StoryWithViews[] = [];
      for (const story of mine) {
        try {
          const count = await snapService.getStoryViewCount(story.id);
          mineWithViews.push({ ...story, viewsCount: count });
        } catch (_) {
          mineWithViews.push({ ...story, viewsCount: 0 });
        }
      }
      setMyStories(mineWithViews);
    } catch (error) {
      console.error('Fetch Stories Error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchStories();
    }
  }, [isFocused]);

  useEffect(() => {
    let storiesChannel: any = null;
    let viewsChannel: any = null;

    const setupSubscriptions = async () => {
      storiesChannel = supabase
        .channel('stories_realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'snaps',
            filter: 'snap_type=eq.story',
          },
          () => {
            fetchStories();
          }
        )
        .subscribe();

      viewsChannel = supabase
        .channel('story_views_realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'story_views',
          },
          () => {
            fetchStories();
          }
        )
        .subscribe();
    };

    setupSubscriptions();

    return () => {
      if (storiesChannel) {
        supabase.removeChannel(storiesChannel);
      }
      if (viewsChannel) {
        supabase.removeChannel(viewsChannel);
      }
    };
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStories();
  };

  const handleOpenStory = async (story: Snap) => {
    setLoading(true);
    try {
      if (!story.telegram_file_id) {
        throw new Error('Telegram file ID is missing.');
      }
      
      const mediaUrl = await snapService.resolveTelegramUrl(story.telegram_file_id);
      setLoading(false);
      
      navigation.navigate('SnapViewer', {
        snapId: story.id,
        mediaUrl,
        mediaType: story.media_type,
        caption: story.caption || undefined,
        senderUsername: story.sender_profile?.username || 'me',
        isStory: true,
      });
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Error', err.message || 'Failed to open story.');
    }
  };

  const handleCreateStory = () => {
    // Navigate to camera tab to take a photo/video
    navigation.navigate('Main', { screen: 'CameraTab' } as any);
  };

  const formatTimeRemaining = (expiresAtStr?: string | null): string => {
    if (!expiresAtStr) return '';
    try {
      const diff = new Date(expiresAtStr).getTime() - Date.now();
      if (diff <= 0) return 'Expired';
      const hours = Math.ceil(diff / (1000 * 60 * 60));
      return `${hours}h left`;
    } catch (_) {
      return '';
    }
  };

  const renderStoryBubble = ({ item }: { item: Snap }) => {
    const sender = item.sender_profile;
    const isVideo = item.media_type === 'video';

    return (
      <TouchableOpacity style={styles.bubbleItem} onPress={() => handleOpenStory(item)}>
        <View style={styles.bubbleRing}>
          <View style={styles.bubbleInner}>
            <Text style={styles.bubbleLetter}>
              {(sender?.username || 'U').substring(0, 1).toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.bubbleLabel} numberOfLines={1}>
          @{sender?.username || 'unknown'}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Stories</Text>
        <TouchableOpacity style={styles.addBtn} onPress={handleCreateStory}>
          <Plus size={22} color="#FFFC00" />
        </TouchableOpacity>
      </View>

      {loading && activeStories.length === 0 && myStories.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FFFC00" />
          }
          contentContainerStyle={styles.scrollContent}
        >
          {/* Active Stories Bubbles Row */}
          {activeStories.length > 0 && (
            <View style={styles.bubblesContainer}>
              <Text style={styles.sectionTitle}>Recent Updates</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={activeStories}
                keyExtractor={(item) => item.id}
                renderItem={renderStoryBubble}
                contentContainerStyle={styles.bubblesList}
              />
            </View>
          )}

          {/* My Story Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Story</Text>
            {myStories.length === 0 ? (
              <TouchableOpacity style={styles.createStoryCard} onPress={handleCreateStory}>
                <View style={styles.plusCircle}>
                  <Plus size={24} color="#FFFC00" />
                </View>
                <View style={styles.createStoryInfo}>
                  <Text style={styles.createStoryTitle}>Add to My Story</Text>
                  <Text style={styles.createStoryDesc}>Share a private photo or video for 24 hours.</Text>
                </View>
              </TouchableOpacity>
            ) : (
              myStories.map((story) => (
                <TouchableOpacity
                  key={story.id}
                  style={styles.storyRow}
                  onPress={() => handleOpenStory(story)}
                >
                  <View style={styles.storyThumbnail}>
                    <Sparkles size={20} color="#FFFC00" />
                  </View>
                  <View style={styles.storyRowInfo}>
                    <Text style={styles.storyRowTitle}>
                      {story.media_type === 'video' ? 'Video Story' : 'Photo Story'}
                    </Text>
                    <Text style={styles.storyRowTime}>
                      {formatTimeRemaining(story.expires_at)}
                    </Text>
                  </View>
                  <View style={styles.viewsBadge}>
                    <Eye size={14} color="#FFFC00" />
                    <Text style={styles.viewsText}>{story.viewsCount || 0} views</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* Active Stories List Section */}
          <View style={[styles.section, { marginTop: 10 }]}>
            <Text style={styles.sectionTitle}>All Stories</Text>
            {activeStories.length === 0 ? (
              <View style={styles.emptyState}>
                <Sparkles size={48} color="#8E8E93" style={styles.emptyIcon} />
                <Text style={styles.emptyText}>No stories available</Text>
                <Text style={styles.emptyDesc}>Stories posted by other TeleVault users will appear here.</Text>
              </View>
            ) : (
              activeStories.map((story) => (
                <TouchableOpacity
                  key={story.id}
                  style={styles.storyRow}
                  onPress={() => handleOpenStory(story)}
                >
                  <View style={[styles.storyThumbnail, { borderColor: '#FFFC00', borderWidth: 1 }]}>
                    <Text style={styles.bubbleLetterMini}>
                      {(story.sender_profile?.username || 'U').substring(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.storyRowInfo}>
                    <Text style={styles.storyRowTitle}>
                      {story.sender_profile?.full_name || `@${story.sender_profile?.username}`}
                    </Text>
                    <Text style={styles.storyRowTime}>
                      @{story.sender_profile?.username} • {formatTimeRemaining(story.expires_at)}
                    </Text>
                  </View>
                  <Text style={styles.viewIndicator}>View</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
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
  addBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#1E1E1E',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  bubblesContainer: {
    paddingTop: 10,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderColor: '#1E1E1E',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  bubblesList: {
    paddingHorizontal: 12,
  },
  bubbleItem: {
    alignItems: 'center',
    marginHorizontal: 8,
    width: 72,
  },
  bubbleRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#FFFC00',
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  bubbleInner: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
    backgroundColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleLetter: {
    color: '#FFFC00',
    fontSize: 22,
    fontWeight: '800',
  },
  bubbleLabel: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '600',
    width: '100%',
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  createStoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  plusCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 252, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  createStoryInfo: {
    flex: 1,
  },
  createStoryTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  createStoryDesc: {
    color: '#8E8E93',
    fontSize: 12,
    lineHeight: 16,
  },
  storyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  storyThumbnail: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  bubbleLetterMini: {
    color: '#FFFC00',
    fontSize: 16,
    fontWeight: '800',
  },
  storyRowInfo: {
    flex: 1,
  },
  storyRowTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  storyRowTime: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  viewsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 252, 0, 0.1)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  viewsText: {
    color: '#FFFC00',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  viewIndicator: {
    color: '#FFFC00',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    paddingHorizontal: 20,
  },
  emptyIcon: {
    marginBottom: 12,
    opacity: 0.5,
  },
  emptyText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptyDesc: {
    color: '#8E8E93',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default StoriesScreen;
