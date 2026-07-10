import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Screen from '../components/Screen';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { ArrowLeft, UserPlus, UserCheck, MessageSquare, Camera, ShieldAlert, Ban, Info, Shield, Grid, Calendar } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { friendService } from '../services/friendService';
import { snapService } from '../services/snapService';
import { UserProfile } from '../types/chat';
import { Snap } from '../types/snap';
import AppHeader from '../components/AppHeader';

type Props = NativeStackScreenProps<AppStackParamList, 'UserProfile'>;

export const UserProfileScreen: React.FC<Props> = ({ navigation, route }) => {
  const { userId: targetId, username: targetUsername } = route.params;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [friendshipStatus, setFriendshipStatus] = useState<'none' | 'pending_sent' | 'pending_received' | 'friends'>('none');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Stats
  const [stats, setStats] = useState({ snaps: 0, stories: 0, friends: 0 });
  const [stories, setStories] = useState<Snap[]>([]);
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          Alert.alert('Error', 'Not logged in.');
          navigation.goBack();
          return;
        }
        setCurrentUserId(user.id);

        // Check if blocked
        const blocked = await friendService.isBlockedRelation(user.id, targetId);
        setIsBlocked(blocked);
        if (blocked) {
          setLoading(false);
          return;
        }

        // Fetch Profile
        const { data: prof, error: profErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', targetId)
          .maybeSingle();

        if (profErr || !prof) {
          throw new Error('Profile not found.');
        }
        setProfile(prof as UserProfile);

        // Friendship status
        const status = await friendService.getFriendshipStatus(targetId);
        setFriendshipStatus(status);

        // Fetch counts
        const [snapsRes, storiesRes, friendsRes] = await Promise.all([
          supabase
            .from('snaps')
            .select('*', { count: 'exact', head: true })
            .or(`and(sender_id.eq.${user.id},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${user.id})`),
          supabase
            .from('snaps')
            .select('*')
            .eq('sender_id', targetId)
            .eq('snap_type', 'story')
            .gt('expires_at', new Date().toISOString()),
          supabase
            .from('friendships')
            .select('*', { count: 'exact', head: true })
            .or(`user_a.eq.${targetId},user_b.eq.${targetId}`),
        ]);

        setStats({
          snaps: snapsRes.count || 0,
          stories: (storiesRes.data || []).length,
          friends: friendsRes.count || 0,
        });

        // Respect privacy for stories
        const privacy = prof.privacy_view_stories || 'friends';
        const isUserFriend = status === 'friends';
        if (privacy === 'everyone' || (privacy === 'friends' && isUserFriend) || targetId === user.id) {
          setStories(storiesRes.data || []);
        }

      } catch (err: any) {
        Alert.alert('Error', err.message || 'Failed to load user profile.');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [targetId]);

  const handleFriendshipAction = async () => {
    if (!profile) return;
    try {
      if (friendshipStatus === 'none') {
        await friendService.sendFriendRequest(targetId);
        setFriendshipStatus('pending_sent');
        Alert.alert('Request Sent', `Friend request sent to @${profile.username}.`);
      } else if (friendshipStatus === 'pending_sent') {
        // Cancel request
        const { data: req } = await supabase
          .from('friend_requests')
          .select('id')
          .eq('sender_id', currentUserId)
          .eq('receiver_id', targetId)
          .eq('status', 'pending')
          .maybeSingle();

        if (req) {
          await friendService.cancelFriendRequest(req.id);
          setFriendshipStatus('none');
          Alert.alert('Cancelled', 'Friend request cancelled.');
        }
      } else if (friendshipStatus === 'pending_received') {
        // Accept request
        const { data: req } = await supabase
          .from('friend_requests')
          .select('id')
          .eq('sender_id', targetId)
          .eq('receiver_id', currentUserId)
          .eq('status', 'pending')
          .maybeSingle();

        if (req) {
          await friendService.acceptFriendRequest(req.id, targetId);
          setFriendshipStatus('friends');
          setStats(prev => ({ ...prev, friends: prev.friends + 1 }));
          Alert.alert('Accepted', `You are now friends with @${profile.username}!`);
        }
      } else if (friendshipStatus === 'friends') {
        // Remove friend
        Alert.alert(
          'Remove Friend',
          `Are you sure you want to remove @${profile.username} from your friends?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: async () => {
                await friendService.removeFriend(targetId);
                setFriendshipStatus('none');
                setStats(prev => ({ ...prev, friends: Math.max(0, prev.friends - 1) }));
              }
            }
          ]
        );
      }
    } catch (err: any) {
      Alert.alert('Action Failed', err.message || 'Operation failed.');
    }
  };

  const handleMessage = async () => {
    if (!profile) return;
    navigation.navigate('ChatRoom', {
      otherUserId: targetId,
      otherUsername: profile.username || 'unknown',
      otherFullName: profile.full_name || undefined,
    });
  };

  const handleSendSnap = () => {
    if (!profile) return;
    navigation.navigate('Main', {
      screen: 'CameraTab',
      params: {
        sendToUserId: targetId,
        sendToUsername: profile.username || 'unknown',
      },
    } as any);
  };

  const handleBlock = () => {
    Alert.alert(
      'Block User',
      `Are you sure you want to block @${targetUsername}? They will not be able to send you messages or view your profile.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await friendService.blockUser(targetId);
              setIsBlocked(true);
              Alert.alert('Blocked', `Blocked @${targetUsername}.`);
              navigation.goBack();
            } catch (err: any) {
              Alert.alert('Block failed', err.message);
            }
          }
        }
      ]
    );
  };

  const handleReport = () => {
    navigation.navigate('ReportUser', {
      reportedUserId: targetId,
      reportedUsername: targetUsername,
    });
  };

  const handleOpenStory = async (story: Snap) => {
    try {
      if (!story.telegram_file_id) {
        Alert.alert('Error', 'Story media is not available.');
        return;
      }
      setLoading(true);
      const url = await snapService.resolveTelegramUrl(story.telegram_file_id);
      setLoading(false);
      navigation.navigate('SnapViewer', {
        snapId: story.id,
        mediaUrl: url,
        mediaType: story.media_type,
        caption: story.caption || undefined,
        senderUsername: targetUsername,
        isStory: true,
        telegramFileId: story.telegram_file_id,
      });
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Error', err.message || 'Failed to load story.');
    }
  };

  if (loading) {
    return (
      <Screen>
        <AppHeader title="Profile" showBackButton={true} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      </Screen>
    );
  }

  if (isBlocked) {
    return (
      <Screen>
        <AppHeader title="Profile" showBackButton={true} />
        <View style={styles.center}>
          <Ban size={64} color="#8E8E93" style={{ marginBottom: 16 }} />
          <Text style={styles.blockedText}>You have blocked this user or are blocked.</Text>
        </View>
      </Screen>
    );
  }

  const nameLetter = (profile?.full_name || profile?.username || 'U').substring(0, 1).toUpperCase();

  return (
    <Screen>
      <AppHeader 
        title={profile?.full_name || `@${profile?.username}`} 
        showBackButton={true} 
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Profile Card */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{nameLetter}</Text>
          </View>
          <Text style={styles.fullName}>{profile?.full_name || 'TeleVault User'}</Text>
          <Text style={styles.username}>@{profile?.username}</Text>
          {profile?.bio ? <Text style={styles.bio}>"{profile.bio}"</Text> : null}
        </View>

        {/* Action Buttons Row */}
        <View style={styles.actionRow}>
          <TouchableOpacity 
            style={[
              styles.actionBtn, 
              friendshipStatus === 'friends' && styles.actionBtnFriends,
              friendshipStatus.startsWith('pending') && styles.actionBtnPending
            ]} 
            onPress={handleFriendshipAction}
          >
            {friendshipStatus === 'friends' ? (
              <>
                <UserCheck size={18} color="#000000" style={{ marginRight: 6 }} />
                <Text style={[styles.actionBtnText, { color: '#000000' }]}>Friends</Text>
              </>
            ) : friendshipStatus === 'pending_sent' ? (
              <>
                <UserPlus size={18} color="#FFFC00" style={{ marginRight: 6 }} />
                <Text style={styles.actionBtnText}>Requested</Text>
              </>
            ) : friendshipStatus === 'pending_received' ? (
              <>
                <UserPlus size={18} color="#000000" style={{ marginRight: 6 }} />
                <Text style={[styles.actionBtnText, { color: '#000000' }]}>Accept</Text>
              </>
            ) : (
              <>
                <UserPlus size={18} color="#FFFC00" style={{ marginRight: 6 }} />
                <Text style={styles.actionBtnText}>Add Friend</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDark]} onPress={handleMessage}>
            <MessageSquare size={18} color="#FFFC00" style={{ marginRight: 6 }} />
            <Text style={styles.actionBtnText}>Message</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDark]} onPress={handleSendSnap}>
            <Camera size={18} color="#FFFC00" style={{ marginRight: 6 }} />
            <Text style={styles.actionBtnText}>Send Snap</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{stats.snaps}</Text>
            <Text style={styles.statLbl}>Snaps</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{stats.stories}</Text>
            <Text style={styles.statLbl}>Stories</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{stats.friends}</Text>
            <Text style={styles.statLbl}>Friends</Text>
          </View>
        </View>

        {/* Stories Section */}
        {stories.length > 0 && (
          <View style={styles.storiesSection}>
            <Text style={styles.sectionTitle}>ACTIVE STORIES</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storiesScroll}>
              {stories.map((story) => (
                <TouchableOpacity 
                  key={story.id} 
                  style={styles.storyCard}
                  onPress={() => handleOpenStory(story)}
                >
                  <View style={styles.storyBorder}>
                    <Grid size={24} color="#FFFC00" />
                  </View>
                  <Text style={styles.storyTime}>
                    {new Date(story.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Security / Safety Block */}
        <View style={styles.safetySection}>
          <Text style={styles.sectionTitle}>SAFETY & PRIVACY</Text>
          
          <TouchableOpacity style={styles.safetyRow} onPress={handleBlock}>
            <Ban size={20} color="#FF453A" style={{ marginRight: 12 }} />
            <View>
              <Text style={styles.safetyTitle}>Block @{targetUsername}</Text>
              <Text style={styles.safetyDesc}>Prevent them from searching or messaging you.</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.safetyRow} onPress={handleReport}>
            <ShieldAlert size={20} color="#FF9500" style={{ marginRight: 12 }} />
            <View>
              <Text style={styles.safetyTitle}>Report Abuse</Text>
              <Text style={styles.safetyDesc}>Notify TeleVault admins about inappropriate behavior.</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    paddingHorizontal: 32,
  },
  blockedText: {
    color: '#8E8E93',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
  scroll: {
    paddingBottom: 40,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 32,
    borderBottomWidth: 0,
    backgroundColor: '#000000',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#FFFC00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  avatarText: {
    color: '#000000',
    fontSize: 40,
    fontWeight: '800',
  },
  fullName: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  username: {
    color: '#8E8E93',
    fontSize: 14,
    marginTop: 2,
    fontWeight: '500',
  },
  bio: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 10,
    paddingHorizontal: 32,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: '#1E1E1E',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#FFFC00',
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  actionBtnFriends: {
    backgroundColor: '#FFFC00',
    borderColor: '#FFFC00',
  },
  actionBtnPending: {
    borderColor: '#2C2C2E',
    backgroundColor: '#1E1E1E',
  },
  actionBtnDark: {
    borderColor: '#2C2C2E',
    backgroundColor: '#1E1E1E',
  },
  actionBtnText: {
    color: '#FFFC00',
    fontSize: 12,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderColor: '#1E1E1E',
    backgroundColor: '#0F1015',
  },
  statBox: {
    alignItems: 'center',
  },
  statVal: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  statLbl: {
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  storiesSection: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: '#1E1E1E',
  },
  sectionTitle: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginBottom: 12,
    letterSpacing: 1,
  },
  storiesScroll: {
    paddingHorizontal: 16,
  },
  storyCard: {
    alignItems: 'center',
    marginRight: 14,
  },
  storyBorder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#FFFC00',
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyTime: {
    color: '#8E8E93',
    fontSize: 9,
    marginTop: 4,
    fontWeight: '600',
  },
  safetySection: {
    paddingVertical: 16,
  },
  safetyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  safetyTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  safetyDesc: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
});

export default UserProfileScreen;
