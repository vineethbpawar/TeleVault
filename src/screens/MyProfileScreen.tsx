import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import { AppStackParamList } from '../types/navigation';
import { ArrowLeft, User, Database, Settings, LogOut, Shield, Info, Edit3, Grid, Users } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { telegramService } from '../services/telegramService';
import { UserProfile } from '../types/chat';
import AppHeader from '../components/AppHeader';
import { accountService, SavedAccount } from '../services/accountService';

type Props = NativeStackScreenProps<AppStackParamList, 'MyProfile'>;

export const MyProfileScreen: React.FC<Props> = ({ navigation }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  
  // Stats
  const [stats, setStats] = useState({ memories: 0, friends: 0 });
  const [telegramStatus, setTelegramStatus] = useState({ configured: false, maskedToken: '', channelId: '' });

  const fetchProfileAndStats = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'Not logged in.');
        return;
      }

      // 1. Fetch Profile
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profErr) throw profErr;
      setProfile(prof as UserProfile);

      // 2. Fetch counts
      const [memoriesRes, friendsRes] = await Promise.all([
        supabase
          .from('files')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_drive_file', false),
        supabase
          .from('friendships')
          .select('*', { count: 'exact', head: true })
          .or(`user_a.eq.${user.id},user_b.eq.${user.id}`),
      ]);

      setStats({
        memories: memoriesRes.count || 0,
        friends: friendsRes.count || 0,
      });

      // 3. Fetch Telegram config
      const tgConfig = await telegramService.getTelegramConfig();
      if (tgConfig.botToken && tgConfig.channelId) {
        const parts = tgConfig.botToken.split(':');
        const prefix = parts[0] || '';
        const suffix = parts[1] ? parts[1].substring(0, 4) : '';
        setTelegramStatus({
          configured: true,
          maskedToken: `${prefix}:${suffix}••••••`,
          channelId: tgConfig.channelId,
        });
      } else {
        setTelegramStatus({
          configured: false,
          maskedToken: '',
          channelId: '',
        });
      }

      // Fetch saved accounts (excluding current user)
      const accs = await accountService.getAccounts();
      setSavedAccounts(accs.filter((a) => a.id !== user.id));

    } catch (err: any) {
      console.error('Failed to load profile details:', err);
      Alert.alert('Error', 'Failed to retrieve profile information.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileAndStats();
  }, []);

  const handleEditBio = () => {
    if (!profile) return;
    
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Update Bio',
        'Enter your new bio:',
        async (newBio) => {
          try {
            setLoading(true);
            const { error } = await supabase
              .from('profiles')
              .update({ bio: newBio?.trim() || '' })
              .eq('id', profile.id);

            if (error) throw error;
            Alert.alert('Success', 'Bio updated.');
            fetchProfileAndStats();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to update bio.');
            setLoading(false);
          }
        },
        'plain-text',
        profile.bio || ''
      );
    } else {
      // Android simple prompt simulation or input
      Alert.alert(
        'Update Bio',
        'Enter new bio:',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear Bio',
            style: 'destructive',
            onPress: async () => {
              try {
                setLoading(true);
                const { error } = await supabase
                  .from('profiles')
                  .update({ bio: '' })
                  .eq('id', profile.id);
                if (error) throw error;
                fetchProfileAndStats();
              } catch (e) {
                setLoading(false);
              }
            }
          },
          {
            text: 'Set Default Bio',
            onPress: async () => {
              try {
                setLoading(true);
                const { error } = await supabase
                  .from('profiles')
                  .update({ bio: 'Securing my moments with TeleVault.' })
                  .eq('id', profile.id);
                if (error) throw error;
                fetchProfileAndStats();
              } catch (e) {
                setLoading(false);
              }
            }
          }
        ]
      );
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to log out of TeleVault?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            // Remove from saved accounts if user signs out completely
            if (profile) {
              await accountService.removeAccount(profile.id);
            }
            await telegramService.deleteTelegramConfig();
            await supabase.auth.signOut();
          }
        }
      ]
    );
  };

  const handleSwitchAccount = async (targetUserId: string) => {
    setLoading(true);
    try {
      const success = await accountService.switchAccount(targetUserId);
      if (!success) {
        Alert.alert('Error', 'Failed to switch account.');
        setLoading(false);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'An error occurred.');
      setLoading(false);
    }
  };

  const handleRemoveAccount = (userId: string) => {
    Alert.alert(
      'Remove Account',
      'Are you sure you want to remove this account from this device?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            await accountService.removeAccount(userId);
            fetchProfileAndStats();
          }
        }
      ]
    );
  };

  const handleAddAccount = async () => {
    Alert.alert(
      'Add Account',
      'You will be signed out temporarily to log in with another account. Your current session will be saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Proceed',
          onPress: async () => {
            setLoading(true);
            await accountService.prepareAddAccount();
          }
        }
      ]
    );
  };

  if (loading && !profile) {
    return (
      <Screen>
        <AppHeader title="My Profile" showBackButton={true} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      </Screen>
    );
  }

  const nameLetter = (profile?.full_name || profile?.username || 'U').substring(0, 1).toUpperCase();

  return (
    <Screen>
      <AppHeader title="My Profile" showBackButton={true} />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Profile Card */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{nameLetter}</Text>
          </View>
          <Text style={styles.fullName}>{profile?.full_name || 'TeleVault User'}</Text>
          <Text style={styles.username}>@{profile?.username}</Text>
          <Text style={styles.bio}>
            {profile?.bio ? `"${profile.bio}"` : 'No bio configured yet.'}
          </Text>
          
          <TouchableOpacity style={styles.editBtn} onPress={handleEditBio}>
            <Edit3 size={16} color="#000000" style={{ marginRight: 6 }} />
            <Text style={styles.editBtnText}>Edit Bio</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Grid size={24} color="#FFFC00" />
            <Text style={styles.statVal}>{stats.memories}</Text>
            <Text style={styles.statLbl}>Memories</Text>
          </View>
          <View style={styles.statBox}>
            <Users size={24} color="#FFFC00" />
            <Text style={styles.statVal}>{stats.friends}</Text>
            <Text style={styles.statLbl}>Friends</Text>
          </View>
        </View>

        {/* Storage State Card */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TELEGRAM SYNC STORAGE</Text>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Database size={20} color="#FFFC00" style={{ marginRight: 12 }} />
              <View style={styles.cardMeta}>
                <Text style={styles.cardTitle}>Status</Text>
                <Text style={[styles.cardVal, telegramStatus.configured ? { color: '#30D158' } : { color: '#FF453A' }]}>
                  {telegramStatus.configured ? 'Connected & Synced' : 'Not Connected'}
                </Text>
              </View>
            </View>

            {telegramStatus.configured && (
              <>
                <View style={styles.cardRow}>
                  <View style={{ width: 32 }} />
                  <View style={styles.cardMeta}>
                    <Text style={styles.cardTitle}>Bot Token</Text>
                    <Text style={styles.cardVal}>{telegramStatus.maskedToken}</Text>
                  </View>
                </View>
                <View style={styles.cardRow}>
                  <View style={{ width: 32 }} />
                  <View style={styles.cardMeta}>
                    <Text style={styles.cardTitle}>Channel ID</Text>
                    <Text style={styles.cardVal}>{telegramStatus.channelId}</Text>
                  </View>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Saved Accounts / Switch Account Section */}
        {savedAccounts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SWITCH ACCOUNT</Text>
            {savedAccounts.map((acc) => (
              <View key={acc.id} style={styles.accountRow}>
                <TouchableOpacity
                  style={styles.accountPressable}
                  onPress={() => handleSwitchAccount(acc.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.miniAvatar}>
                    <Text style={styles.miniAvatarText}>
                      {(acc.full_name || acc.username || 'U').substring(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.accountMeta}>
                    <Text style={styles.accountName}>{acc.full_name || 'TeleVault User'}</Text>
                    <Text style={styles.accountUser}>@{acc.username}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.removeAccountBtn}
                  onPress={() => handleRemoveAccount(acc.id)}
                  activeOpacity={0.7}
                >
                  <LogOut size={16} color="#FF453A" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Options / Settings list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CONTROLS</Text>
          
          <TouchableOpacity 
            style={styles.controlRow} 
            onPress={() => navigation.navigate('Main', { screen: 'SettingsTab' } as any)}
          >
            <Settings size={20} color="#8E8E93" style={{ marginRight: 12 }} />
            <Text style={styles.controlText}>Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.controlRow} onPress={handleAddAccount}>
            <Users size={20} color="#FFFC00" style={{ marginRight: 12 }} />
            <Text style={[styles.controlText, { color: '#FFFC00' }]}>Add Account</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.controlRow} onPress={handleLogout}>
            <LogOut size={20} color="#FF453A" style={{ marginRight: 12 }} />
            <Text style={[styles.controlText, { color: '#FF453A' }]}>Logout</Text>
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
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFC00',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 14,
  },
  editBtnText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderColor: '#1E1E1E',
    backgroundColor: '#0F1015',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statVal: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 6,
  },
  statLbl: {
    color: '#8E8E93',
    fontSize: 10,
    marginTop: 2,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  section: {
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
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    marginHorizontal: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardMeta: {
    flex: 1,
  },
  cardTitle: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '500',
  },
  cardVal: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  controlText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#1E1E1E',
  },
  accountPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  miniAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  miniAvatarText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
  accountMeta: {
    flex: 1,
  },
  accountName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  accountUser: {
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 1,
  },
  removeAccountBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
  },
});

export default MyProfileScreen;
