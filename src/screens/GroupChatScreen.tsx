import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Send, Camera, MoreVertical, Plus, LogOut, Users, Shield, Edit3, UserPlus, Check, X, ShieldCheck } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { groupService } from '../services/groupService';
import { friendService } from '../services/friendService';
import { snapService } from '../services/snapService';
import { GroupMessage, GroupMember, Group } from '../types/groups';
import { UserProfile } from '../types/chat';
import { supabase } from '../lib/supabase';
import AppHeader from '../components/AppHeader';
import UserAvatar from '../components/UserAvatar';

type Props = NativeStackScreenProps<AppStackParamList, 'GroupChat'>;

export const GroupChatScreen: React.FC<Props> = ({ navigation, route }) => {
  const { groupId, groupName } = route.params;
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [groupDetails, setGroupDetails] = useState<Group | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<UserProfile | null>(null);
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newGroupName, setNewGroupName] = useState(groupName);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setKeyboardVisible(true);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id);
      }
    });
  }, []);

  const loadData = async () => {
    try {
      const msgs = await groupService.getGroupMessages(groupId);
      setMessages(msgs);

      const mems = await groupService.getGroupMembers(groupId);
      setMembers(mems);

      const details = await groupService.getGroupDetails(groupId);
      if (details) {
        setGroupDetails(details);
        setNewGroupName(details.name);
        if (details.creator_id) {
          const { data: creator } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', details.creator_id)
            .single();
          if (creator) setCreatorProfile(creator as UserProfile);
        }
      }
    } catch (error) {
      console.error('Load Group Chat Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to group messages
    const subscription = groupService.subscribeToGroupMessages(groupId, (newMsg) => {
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === newMsg.id);
        if (exists) return prev;
        return [...prev, newMsg];
      });
    });

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [groupId]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text) return;

    setInputText('');
    setSending(true);

    try {
      await groupService.sendGroupMessage(groupId, text);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleSnapPress = () => {
    navigation.navigate('Main', {
      screen: 'CameraTab',
      params: {
        sendToGroupId: groupId,
        sendToGroupName: groupDetails?.name || groupName,
      },
    } as any);
  };

  const handleOpenSnap = (snap: any) => {
    if (!snap) return;

    setLoading(true);
    snapService.resolveTelegramUrl(snap.telegram_file_id, snap.sender_id)
      .then((mediaUrl) => {
        setLoading(false);
        navigation.navigate('SnapViewer', {
          snapId: snap.id,
          mediaUrl,
          mediaType: snap.media_type,
          caption: snap.caption || undefined,
          senderUsername: snap.sender_username || 'group',
          isStory: false,
          telegramFileId: snap.telegram_file_id,
          senderId: snap.sender_id,
        });
      })
      .catch((err) => {
        setLoading(false);
        Alert.alert('Error', err.message || 'Failed to resolve snap from Telegram.');
      });
  };

  const handleAddMember = async () => {
    try {
      const friends = await friendService.getFriends();
      const currentMemberIds = members.map((m) => m.user_id);
      const addableFriends = friends.filter((f) => !currentMemberIds.includes(f.id));

      if (addableFriends.length === 0) {
        Alert.alert('No friends to add', 'All your friends are already in this group or you have no friends yet.');
        return;
      }

      Alert.alert(
        'Add Member',
        'Choose a friend to add:',
        [
          { text: 'Cancel', style: 'cancel' },
          ...addableFriends.map((f) => ({
            text: `@${f.username}`,
            onPress: async () => {
              try {
                await groupService.addMembers(groupId, [f.id]);
                Alert.alert('Success', `@${f.username} added to the group.`);
                loadData();
              } catch (err: any) {
                Alert.alert('Error', err.message || 'Failed to add member.');
              }
            },
          })),
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to retrieve friends list.');
    }
  };

  const handleLeaveGroup = () => {
    Alert.alert(
      'Leave Group',
      `Are you sure you want to leave "${groupDetails?.name || groupName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await groupService.leaveGroup(groupId);
              navigation.goBack();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to leave group.');
            }
          },
        },
      ]
    );
  };

  const handleToggleAdmin = (member: GroupMember) => {
    const isTargetAdmin = member.role === 'admin';
    const newRole = isTargetAdmin ? 'member' : 'admin';
    Alert.alert(
      'Change Admin Role',
      `Make @${member.profile?.username} a ${newRole}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await groupService.updateMemberRole(groupId, member.user_id, newRole);
              loadData();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to update role.');
            }
          },
        },
      ]
    );
  };

  const handleRemoveMember = (member: GroupMember) => {
    Alert.alert(
      'Remove Member',
      `Remove @${member.profile?.username} from group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await groupService.removeMember(groupId, member.user_id);
              loadData();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to remove member.');
            }
          },
        },
      ]
    );
  };

  const handleSaveGroupName = async () => {
    if (!newGroupName.trim()) return;
    try {
      await groupService.updateGroupName(groupId, newGroupName.trim());
      setEditingName(false);
      loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update group name.');
    }
  };

  const currentUserRole = members.find((m) => m.user_id === currentUserId)?.role;
  const isCurrentUserAdmin = currentUserRole === 'admin';

  const formatMessageTime = (timeStr: string): string => {
    try {
      const d = new Date(timeStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  };

  const renderMessageItem = ({ item }: { item: GroupMessage }) => {
    const isMe = item.sender_id === currentUserId;
    const senderName = item.sender?.full_name || item.sender?.username || 'unknown';

    if (item.message_type === 'snap') {
      const snap = item.snap;
      const snapTypeLabel = snap?.media_type === 'video' ? 'Video Snap' : 'Photo Snap';

      return (
        <View style={[styles.messageRow, isMe ? styles.myRow : styles.otherRow]}>
          {!isMe && (
            <UserAvatar name={senderName} avatarUrl={item.sender?.avatar_url} size={28} style={styles.chatAvatar} />
          )}
          <View style={[styles.bubble, isMe ? styles.myBubble : styles.otherBubble, styles.snapBubble]}>
            {!isMe && <Text style={styles.senderLabel}>{senderName}</Text>}
            <TouchableOpacity 
              style={styles.snapContent} 
              onPress={() => handleOpenSnap(snap)}
              activeOpacity={0.8}
            >
              <Camera size={24} color={isMe ? '#000000' : '#FFFC00'} />
              <View style={styles.snapInfo}>
                <Text style={[styles.snapText, isMe ? styles.myText : styles.otherText]}>
                  {snapTypeLabel}
                </Text>
                <Text style={styles.snapSubtext}>Tap to view</Text>
              </View>
            </TouchableOpacity>
            <Text style={[styles.timeText, isMe ? styles.myTime : styles.otherTime]}>
              {formatMessageTime(item.created_at)}
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.messageRow, isMe ? styles.myRow : styles.otherRow]}>
        {!isMe && (
          <UserAvatar name={senderName} avatarUrl={item.sender?.avatar_url} size={28} style={styles.chatAvatar} />
        )}
        <View style={[styles.bubble, isMe ? styles.myBubble : styles.otherBubble]}>
          {!isMe && <Text style={styles.senderLabel}>{senderName}</Text>}
          <Text style={[styles.messageText, isMe ? styles.myText : styles.otherText]}>
            {item.message_text}
          </Text>
          <Text style={[styles.timeText, isMe ? styles.myTime : styles.otherTime]}>
            {formatMessageTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#000000' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: '#000000' }}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <ArrowLeft size={24} color="#FFFFFF" />
            </TouchableOpacity>
            
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerName} numberOfLines={1}>
                {groupName}
              </Text>
              <Text style={styles.headerSubtitle}>{members.length} members</Text>
            </View>

            <View style={styles.headerRight}>
              <TouchableOpacity style={styles.headerCameraBtn} onPress={handleSnapPress}>
                <Camera size={22} color="#FFFC00" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerOptionsBtn} onPress={() => setInfoModalVisible(true)}>
                <MoreVertical size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>

        {/* Messages */}
        {loading && messages.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FFFC00" />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessageItem}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Users size={36} color="#1f2444" style={{ marginBottom: 12 }} />
                <Text style={styles.emptyText}>No messages in this group yet.</Text>
              </View>
            }
          />
        )}

        <View style={[
          { backgroundColor: '#0F0F12' },
          Platform.OS === 'web'
            ? ({ paddingBottom: keyboardVisible ? 4 : 'max(env(safe-area-inset-bottom), 4px)' } as any)
            : { paddingBottom: keyboardVisible ? 4 : Math.max(insets.bottom, 4) },
        ]}>
          <View style={styles.inputContainer}>
            <TouchableOpacity style={styles.inputCameraBtn} onPress={handleSnapPress}>
              <Camera size={24} color="#FFFFFF" />
            </TouchableOpacity>

            <TextInput
              style={styles.input}
              placeholder="Send a chat..."
              placeholderTextColor="#8E8E93"
              value={inputText}
              onChangeText={setInputText}
              multiline
            />

            <TouchableOpacity
              style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim() || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <Send size={18} color="#000000" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* WhatsApp-Style Group Info & Permissions Modal */}
        <Modal visible={infoModalVisible} animationType="slide" transparent onRequestClose={() => setInfoModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setInfoModalVisible(false)} style={styles.modalCloseBtn}>
                  <X size={22} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.modalTitleText}>Group Info</Text>
                {isCurrentUserAdmin ? (
                  <TouchableOpacity onPress={handleAddMember} style={styles.modalAddBtn}>
                    <UserPlus size={20} color="#FFFC00" />
                  </TouchableOpacity>
                ) : (
                  <View style={{ width: 24 }} />
                )}
              </View>

              <ScrollView contentContainerStyle={{ padding: 20 }}>
                {/* Group Avatar & Title */}
                <View style={{ alignItems: 'center', marginBottom: 20 }}>
                  <View style={styles.groupAvatarBig}>
                    <Users size={40} color="#FFFC00" />
                  </View>
                  
                  {editingName ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                      <TextInput
                        style={styles.editNameInput}
                        value={newGroupName}
                        onChangeText={setNewGroupName}
                        autoFocus
                      />
                      <TouchableOpacity onPress={handleSaveGroupName} style={styles.saveNameBtn}>
                        <Check size={18} color="#000000" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                      <Text style={styles.groupNameBig}>{groupDetails?.name || groupName}</Text>
                      {isCurrentUserAdmin && (
                        <TouchableOpacity onPress={() => setEditingName(true)} style={{ marginLeft: 8 }}>
                          <Edit3 size={16} color="#8E8E93" />
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                  <Text style={styles.groupMetaText}>{members.length} participants</Text>
                </View>

                {/* Creator Information */}
                <View style={styles.infoCard}>
                  <Text style={styles.infoCardLabel}>Group Creator</Text>
                  <Text style={styles.infoCardValue}>
                    {creatorProfile ? `${creatorProfile.full_name || 'User'} (@${creatorProfile.username})` : 'Loading...'}
                  </Text>
                  <Text style={styles.infoCardSub}>Created on {groupDetails?.created_at ? new Date(groupDetails.created_at).toLocaleDateString() : 'N/A'}</Text>
                </View>

                {/* Member Permissions Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 12 }}>
                  <Text style={styles.sectionHeaderTitle}>{members.length} PARTICIPANTS</Text>
                  {isCurrentUserAdmin && (
                    <TouchableOpacity style={styles.addMemberRowBtn} onPress={handleAddMember}>
                      <UserPlus size={14} color="#FFFC00" style={{ marginRight: 4 }} />
                      <Text style={styles.addMemberRowText}>Add Member</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Participants List with Admin Badges */}
                {members.map((m) => {
                  const isMe = m.user_id === currentUserId;
                  const isAdmin = m.role === 'admin';
                  const isCreator = m.user_id === groupDetails?.creator_id;

                  return (
                    <View key={m.id} style={styles.memberRow}>
                      <UserAvatar name={m.profile?.full_name || m.profile?.username} avatarUrl={m.profile?.avatar_url} size={40} />
                      
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={styles.memberNameText}>
                            {m.profile?.full_name || m.profile?.username} {isMe ? '(You)' : ''}
                          </Text>
                          {isAdmin && (
                            <View style={styles.adminBadge}>
                              <ShieldCheck size={10} color="#000000" style={{ marginRight: 2 }} />
                              <Text style={styles.adminBadgeText}>Group Admin</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.memberUsernameText}>@{m.profile?.username}</Text>
                      </View>

                      {/* Admin Controls for other members */}
                      {isCurrentUserAdmin && !isMe && (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <TouchableOpacity 
                            style={[styles.actionTag, isAdmin ? styles.demoteTag : styles.promoteTag]} 
                            onPress={() => handleToggleAdmin(m)}
                          >
                            <Text style={styles.actionTagText}>{isAdmin ? 'Dismiss Admin' : 'Make Admin'}</Text>
                          </TouchableOpacity>

                          {!isCreator && (
                            <TouchableOpacity 
                              style={styles.removeIconBtn} 
                              onPress={() => handleRemoveMember(m)}
                            >
                              <X size={16} color="#FF3B30" />
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* Leave Group Action */}
                <TouchableOpacity style={styles.leaveGroupBtn} onPress={handleLeaveGroup}>
                  <LogOut size={18} color="#FF3B30" style={{ marginRight: 8 }} />
                  <Text style={styles.leaveGroupText}>Exit Group</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
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
    paddingHorizontal: 12,
    height: 56,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#121214',
  },
  backBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#151724',
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 12,
  },
  headerName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#8e92af',
    fontSize: 12,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerCameraBtn: {
    padding: 8,
    marginRight: 4,
  },
  headerOptionsBtn: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageList: {
    padding: 16,
    paddingBottom: 24,
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 4,
    alignItems: 'flex-end',
  },
  myRow: {
    justifyContent: 'flex-end',
  },
  otherRow: {
    justifyContent: 'flex-start',
  },
  chatAvatar: {
    marginRight: 8,
    marginBottom: 4,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '75%',
  },
  myBubble: {
    backgroundColor: '#FFFC00',
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#0f1123',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  snapBubble: {
    minWidth: 160,
  },
  senderLabel: {
    color: '#8e92af',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  myText: {
    color: '#000000',
  },
  otherText: {
    color: '#FFFFFF',
  },
  timeText: {
    fontSize: 10,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  myTime: {
    color: '#555555',
  },
  otherTime: {
    color: '#8e92af',
  },
  snapContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  snapInfo: {
    marginLeft: 8,
    flex: 1,
  },
  snapText: {
    fontSize: 14,
    fontWeight: '600',
  },
  snapSubtext: {
    fontSize: 11,
    color: '#8e92af',
    marginTop: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#07080f',
    borderTopWidth: 1,
    borderTopColor: '#121214',
  },
  inputCameraBtn: {
    padding: 8,
    marginRight: 4,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    backgroundColor: '#0f1123',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 80,
  },
  emptyText: {
    color: '#8e92af',
    fontSize: 15,
  },

  /* WhatsApp Group Info Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0F1123',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    minHeight: '60%',
    borderWidth: 1,
    borderColor: '#1F2444',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1D36',
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalTitleText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  modalAddBtn: {
    padding: 6,
  },
  groupAvatarBig: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 252, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFC00',
  },
  groupNameBig: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  editNameInput: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    backgroundColor: '#1A1D36',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#FFFC00',
    minWidth: 180,
  },
  saveNameBtn: {
    backgroundColor: '#FFFC00',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  groupMetaText: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 4,
  },
  infoCard: {
    backgroundColor: '#161933',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#242952',
    marginBottom: 10,
  },
  infoCardLabel: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoCardValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
  infoCardSub: {
    color: '#64D2FF',
    fontSize: 12,
    marginTop: 2,
  },
  sectionHeaderTitle: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  addMemberRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 252, 0, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  addMemberRowText: {
    color: '#FFFC00',
    fontSize: 12,
    fontWeight: '700',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161933',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  memberNameText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  memberUsernameText: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFC00',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  adminBadgeText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: '900',
  },
  actionTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  promoteTag: {
    backgroundColor: 'rgba(48, 209, 88, 0.15)',
  },
  demoteTag: {
    backgroundColor: 'rgba(255, 159, 10, 0.15)',
  },
  actionTagText: {
    color: '#30D158',
    fontSize: 11,
    fontWeight: '700',
  },
  removeIconBtn: {
    padding: 6,
    marginLeft: 6,
  },
  leaveGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
  },
  leaveGroupText: {
    color: '#FF3B30',
    fontSize: 15,
    fontWeight: '800',
  },
});

export default GroupChatScreen;
