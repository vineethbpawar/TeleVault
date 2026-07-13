import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import { Send, Search, X, Sparkles, DownloadCloud, HardDrive, Lock, Users, ArrowLeft } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { friendService } from '../services/friendService';
import { snapService } from '../services/snapService';
import { groupService } from '../services/groupService';
import { uploadQueueService } from '../services/uploadQueueService';
import { telegramService } from '../services/telegramService';
import { supabase } from '../lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { UserProfile } from '../types/chat';
import { Group } from '../types/groups';
import UserAvatar from '../components/UserAvatar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showToast } from '../components/ToastBanner';

import * as Sharing from 'expo-sharing';

type Props = NativeStackScreenProps<AppStackParamList, 'SendTo'>;

export const SendToScreen: React.FC<Props> = ({ navigation, route }) => {
  const { mediaUri, mediaType, metadata } = route.params;
  const insets = useSafeAreaInsets();
  
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [progressText, setProgressText] = useState('');

  // Selections
  const [selectedStory, setSelectedStory] = useState(false);
  const [selectedMemories, setSelectedMemories] = useState(false);
  const [selectedDrive, setSelectedDrive] = useState(false);
  const [selectedPrivateDrive, setSelectedPrivateDrive] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // Add a safety timeout so the UI never hangs on slow network/auth queries
    const timeoutId = setTimeout(() => {
      setLoading(false);
    }, 1500);

    try {
      const [friendsList, groupsList] = await Promise.all([
        friendService.getFriends().catch(err => {
          console.warn('Failed to fetch friends for SendTo:', err);
          return [];
        }),
        groupService.getGroups().catch(err => {
          console.warn('Failed to fetch groups for SendTo:', err);
          return [];
        }),
      ]);
      clearTimeout(timeoutId);
      setFriends(friendsList);
      setGroups(groupsList);
    } catch (error) {
      console.error('Failed to fetch send targets', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToGallery = async () => {
    try {
      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = mediaUri;
        link.download = mediaType === 'video' ? `televault_${Date.now()}.mp4` : `televault_${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Download started!');
      } else {
        const MediaLibrary = require('expo-media-library');
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          await MediaLibrary.saveToLibraryAsync(mediaUri);
          Alert.alert('Saved!', 'Media saved to your device gallery successfully.');
        } else {
          Alert.alert('Permission Denied', 'Permission is required to save media to your device.');
        }
      }
    } catch (err: any) {
      console.error('Failed to save to gallery:', err);
      Alert.alert('Save Failed', err.message || 'Could not save media.');
    }
  };

  const handleShareToOtherApps = async () => {
    try {
      if (Platform.OS === 'web') {
        if (navigator.share) {
          await navigator.share({
            title: 'TeleVault Media',
            text: 'Check out this media from TeleVault!',
            url: mediaUri,
          });
        } else {
          Alert.alert('Share Unsupported', 'Your browser does not support the web sharing API.');
        }
      } else {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(mediaUri);
        } else {
          Alert.alert('Share Unavailable', 'Sharing is not available on this device.');
        }
      }
    } catch (err: any) {
      console.error('Failed to share:', err);
      // Share cancelled is normal and shouldn't throw error alert if user just dismissed it
      if (err.message && !err.message.includes('dismissed') && !err.message.includes('cancel')) {
        Alert.alert('Share Failed', err.message || 'Could not share media.');
      }
    }
  };

  const handleQueueUploadDest = async (destination: 'memories' | 'drive' | 'private_drive') => {
    let fileSize = 0;
    try {
      if (Platform.OS === 'web') {
        if (mediaUri.startsWith('blob:')) {
          const res = await fetch(mediaUri);
          const blob = await res.blob();
          fileSize = blob.size;
        } else if (mediaUri.startsWith('data:')) {
          const base64Str = mediaUri.split(',')[1];
          fileSize = atob(base64Str).length;
        }
      } else {
        const info = await FileSystem.getInfoAsync(mediaUri);
        if (info.exists) {
          fileSize = info.size;
        }
      }
    } catch (err) {
      console.warn('Failed to fetch file size for queue', err);
    }

    const timestamp = Date.now();
    const extension = mediaType === 'video' ? 'mp4' : 'jpg';
    const fileName = `TV_${destination.toUpperCase()}_${timestamp}.${extension}`;
    const mimeType = mediaType === 'video' ? 'video/mp4' : 'image/jpeg';

    await uploadQueueService.addToUploadQueue({
      local_uri: mediaUri,
      file_name: fileName,
      file_type: mediaType === 'video' ? 'video' : 'image',
      mime_type: mimeType,
      file_size: fileSize,
      destination: destination === 'private_drive' ? 'private' : destination,
      folder_id: null,
      is_private: destination === 'private_drive',
      is_drive_file: destination !== 'memories',
      overlay_metadata: metadata || [],
    });
  };

  const toggleUserSelect = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleGroupSelect = (groupId: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const selectedCount =
    (selectedStory ? 1 : 0) +
    (selectedMemories ? 1 : 0) +
    (selectedDrive ? 1 : 0) +
    (selectedPrivateDrive ? 1 : 0) +
    selectedUserIds.size +
    selectedGroupIds.size;

  const handleSend = async () => {
    if (selectedCount === 0) return;
    setSending(true);
    setProgressText('Preparing secure files...');
    try {
      // 1. Upload/Queue to Memories
      if (selectedMemories) {
        setProgressText('Uploading to Memories...');
        await handleQueueUploadDest('memories');
      }

      // 2. Upload/Queue to Drive
      if (selectedDrive) {
        setProgressText('Uploading to Drive...');
        await handleQueueUploadDest('drive');
      }

      // 3. Upload/Queue to Private Drive
      if (selectedPrivateDrive) {
        setProgressText('Uploading to Private Drive...');
        await handleQueueUploadDest('private_drive');
      }

      // 4. Add to Story
      if (selectedStory) {
        setProgressText('Sharing to Story...');
        await snapService.addToStory(
          mediaUri,
          mediaType === 'video' ? 'video' : 'image',
          null,
          metadata
        );
      }

      // 5. Send to friends
      if (selectedUserIds.size > 0) {
        setProgressText(`Sending snaps to ${selectedUserIds.size} friends...`);
        const userPromises = Array.from(selectedUserIds).map((userId) =>
          snapService.sendDirectSnap(
            userId,
            mediaUri,
            mediaType === 'video' ? 'video' : 'image',
            null,
            metadata
          )
        );
        await Promise.all(userPromises);
      }

      // 6. Send to groups
      if (selectedGroupIds.size > 0) {
        setProgressText(`Sending snaps to ${selectedGroupIds.size} groups...`);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const senderProfile = await supabase.from('profiles').select('username').eq('id', user.id).single();
          const senderUsername = senderProfile.data?.username || 'unknown';

          const tgUpload = await telegramService.sendSnapToTelegram({
            localUri: mediaUri,
            mediaType: mediaType === 'video' ? 'video' : 'image',
            snapType: 'direct',
            senderUsername,
            receiverUsername: 'Group',
            caption: null,
            localTime: new Date().toLocaleString(),
          });

          if (tgUpload) {
            const { data: groupSnap } = await supabase
              .from('snaps')
              .insert({
                sender_id: user.id,
                receiver_id: null,
                conversation_id: null,
                snap_type: 'direct',
                media_type: mediaType === 'video' ? 'video' : 'image',
                telegram_file_id: tgUpload.telegramFileId,
                telegram_message_id: tgUpload.telegramMessageId,
                caption: null,
                overlay_metadata: metadata || [],
                view_once: false,
                is_viewed: false,
              })
              .select()
              .single();

            if (groupSnap) {
              const groupPromises = Array.from(selectedGroupIds).map((groupId) =>
                groupService.sendGroupSnap(groupId, groupSnap.id)
              );
              await Promise.all(groupPromises);
            }
          }
        }
      }

      showToast('Successfully sent in background!');
      navigation.navigate('Main', { screen: 'CameraTab' } as any);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'An error occurred during sending.');
    } finally {
      setSending(false);
      setProgressText('');
    }
  };

  // Search filter logic
  const filteredFriends = friends.filter((f) => {
    const term = searchQuery.toLowerCase();
    return (
      (f.username || '').toLowerCase().includes(term) ||
      (f.full_name || '').toLowerCase().includes(term)
    );
  });

  const filteredGroups = groups.filter((g) =>
    (g.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top > 0 ? insets.top : 12 }]}>
      {/* App Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Send To</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchBarContainer}>
        <Search size={18} color="#8e92af" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search friends, groups..."
          placeholderTextColor="#8e92af"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <X size={18} color="#8e92af" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* QUICK UPLOADS SECTION */}
          {searchQuery.length === 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionHeader}>QUICK UPLOADS</Text>
              
              {/* My Story */}
              <TouchableOpacity
                style={[styles.sectionRow, selectedStory && styles.sectionRowSelected]}
                onPress={() => setSelectedStory(!selectedStory)}
              >
                <View style={styles.rowIconContainer}>
                  <Sparkles size={20} color="#FFFC00" />
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName}>My Story</Text>
                  <Text style={styles.rowDesc}>Share with friends for 24 hours</Text>
                </View>
                <View style={[styles.checkbox, selectedStory && styles.checkboxSelected]}>
                  {selectedStory && <Text style={styles.checkMark}>✓</Text>}
                </View>
              </TouchableOpacity>

              {/* Save to Memories */}
              <TouchableOpacity
                style={[styles.sectionRow, selectedMemories && styles.sectionRowSelected]}
                onPress={() => setSelectedMemories(!selectedMemories)}
              >
                <View style={styles.rowIconContainer}>
                  <DownloadCloud size={20} color="#FFFC00" />
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName}>Save to Memories</Text>
                  <Text style={styles.rowDesc}>Save securely to cloud Memories</Text>
                </View>
                <View style={[styles.checkbox, selectedMemories && styles.checkboxSelected]}>
                  {selectedMemories && <Text style={styles.checkMark}>✓</Text>}
                </View>
              </TouchableOpacity>

              {/* Save to Drive */}
              <TouchableOpacity
                style={[styles.sectionRow, selectedDrive && styles.sectionRowSelected]}
                onPress={() => setSelectedDrive(!selectedDrive)}
              >
                <View style={styles.rowIconContainer}>
                  <HardDrive size={20} color="#FFFC00" />
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName}>Upload to Drive</Text>
                  <Text style={styles.rowDesc}>Upload to your TeleVault Drive</Text>
                </View>
                <View style={[styles.checkbox, selectedDrive && styles.checkboxSelected]}>
                  {selectedDrive && <Text style={styles.checkMark}>✓</Text>}
                </View>
              </TouchableOpacity>

              {/* Save to Private Drive */}
              <TouchableOpacity
                style={[styles.sectionRow, selectedPrivateDrive && styles.sectionRowSelected]}
                onPress={() => setSelectedPrivateDrive(!selectedPrivateDrive)}
              >
                <View style={styles.rowIconContainer}>
                  <Lock size={20} color="#FFFC00" />
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName}>Private Drive</Text>
                  <Text style={styles.rowDesc}>Zero-knowledge encrypted folder</Text>
                </View>
                <View style={[styles.checkbox, selectedPrivateDrive && styles.checkboxSelected]}>
                  {selectedPrivateDrive && <Text style={styles.checkMark}>✓</Text>}
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* EXPORT & SHARE SECTION */}
          {searchQuery.length === 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionHeader}>EXPORT & SHARE</Text>
              
              {/* Save to Device Gallery */}
              <TouchableOpacity
                style={styles.sectionRow}
                onPress={handleSaveToGallery}
                activeOpacity={0.7}
              >
                <View style={[styles.rowIconContainer, { backgroundColor: 'rgba(52, 199, 89, 0.1)' }]}>
                  <DownloadCloud size={20} color="#34C759" />
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName}>Save to Device Gallery</Text>
                  <Text style={styles.rowDesc}>Save local copy to mobile gallery/camera roll</Text>
                </View>
              </TouchableOpacity>

              {/* Share to Other Apps */}
              <TouchableOpacity
                style={styles.sectionRow}
                onPress={handleShareToOtherApps}
                activeOpacity={0.7}
              >
                <View style={[styles.rowIconContainer, { backgroundColor: 'rgba(0, 122, 255, 0.1)' }]}>
                  <Send size={20} color="#007AFF" />
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName}>Share to Other Apps</Text>
                  <Text style={styles.rowDesc}>Send via WhatsApp, Telegram, or system share sheet</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* GROUPS SECTION */}
          {(filteredGroups.length > 0 || searchQuery.length === 0) && (
            <View style={styles.section}>
              <Text style={styles.sectionHeader}>GROUPS</Text>
              {filteredGroups.length === 0 ? (
                <Text style={styles.emptyText}>No groups found.</Text>
              ) : (
                filteredGroups.map((group) => {
                  const isSelected = selectedGroupIds.has(group.id);
                  return (
                    <TouchableOpacity
                      key={group.id}
                      style={[styles.sectionRow, isSelected && styles.sectionRowSelected]}
                      onPress={() => toggleGroupSelect(group.id)}
                    >
                      <View style={styles.rowIconContainer}>
                        <Users size={20} color="#FFFFFF" />
                      </View>
                      <View style={styles.rowInfo}>
                        <Text style={styles.rowName}>{group.name}</Text>
                        <Text style={styles.rowDesc}>Group chat snap delivery</Text>
                      </View>
                      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                        {isSelected && <Text style={styles.checkMark}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          {/* FRIENDS SECTION */}
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>FRIENDS</Text>
            {filteredFriends.length === 0 ? (
              <Text style={styles.emptyText}>
                {searchQuery.length > 0
                  ? 'No matching friends found.'
                  : 'No friends yet. Search users to add friends.'}
              </Text>
            ) : (
              filteredFriends.map((friend) => {
                const isSelected = selectedUserIds.has(friend.id);
                return (
                  <TouchableOpacity
                    key={friend.id}
                    style={[styles.sectionRow, isSelected && styles.sectionRowSelected]}
                    onPress={() => toggleUserSelect(friend.id)}
                  >
                    <UserAvatar name={friend.full_name || friend.username} avatarUrl={friend.avatar_url} size={40} />
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowName}>{friend.full_name || friend.username}</Text>
                      <Text style={styles.rowDesc}>@{friend.username}</Text>
                    </View>
                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <Text style={styles.checkMark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>
      )}

      {/* Bottom Sticky Action Bar */}
      {selectedCount > 0 && (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {sending ? (
            <View style={styles.sendingContainer}>
              <ActivityIndicator size="small" color="#FFFC00" style={{ marginRight: 10 }} />
              <Text style={styles.sendingText}>{progressText}</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
              <Text style={styles.sendBtnText}>Send to {selectedCount}</Text>
              <Send size={18} color="#000000" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#151728',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151728',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    height: 46,
    borderWidth: 1,
    borderColor: '#242745',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 120,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    color: '#8e92af',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f1123',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  sectionRowSelected: {
    borderColor: '#FFFC00',
    backgroundColor: 'rgba(255, 252, 0, 0.04)',
  },
  rowIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 252, 0, 0.1)',
  },
  rowInfo: {
    flex: 1,
    marginLeft: 12,
  },
  rowName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  rowDesc: {
    color: '#8e92af',
    fontSize: 12,
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3a3f68',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    borderColor: '#FFFC00',
    backgroundColor: '#FFFC00',
  },
  checkMark: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '900',
  },
  emptyText: {
    color: '#8e92af',
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 10,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: '#0f1123',
    borderTopWidth: 1,
    borderTopColor: '#1f2444',
  },
  sendBtn: {
    backgroundColor: '#FFFC00',
    borderRadius: 24,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  sendBtnText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '800',
  },
  sendingContainer: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendingText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default SendToScreen;
