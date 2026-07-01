import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import AppInput from '../components/AppInput';
import AppButton from '../components/AppButton';
import {
  User,
  Send,
  Shield,
  Upload,
  Info,
  ChevronRight,
  LogOut,
  CheckCircle,
  XCircle,
  Camera,
  Sparkles,
  Lock,
  Download,
  Database,
  FileText,
  Users,
} from 'lucide-react-native';
import { CompositeScreenProps, useIsFocused } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, AppStackParamList } from '../types/navigation';
import { supabase } from '../lib/supabase';
import { securityService } from '../services/securityService';
import { telegramService } from '../services/telegramService';
import { settingsService, AppSettings } from '../services/settingsService';
import { exportHelper } from '../utils/exportHelper';
import * as LocalAuthentication from 'expo-local-authentication';
import PinLockModal from '../components/PinLockModal';
import UploadProgress from '../components/UploadProgress';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'SettingsTab'>,
  NativeStackScreenProps<AppStackParamList>
>;

export const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const [userEmail, setUserEmail] = useState('');
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [driveLock, setDriveLock] = useState(false);
  const [privateDriveLock, setPrivateDriveLock] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  // Profile States
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [userRole, setUserRole] = useState('user');
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // Privacy States
  const [privacyMessageMe, setPrivacyMessageMe] = useState('friends');
  const [privacySendSnaps, setPrivacySendSnaps] = useState('friends');
  const [privacyViewStories, setPrivacyViewStories] = useState('friends');
  const [privacyShowOnline, setPrivacyShowOnline] = useState(true);
  const [privacyReadReceipts, setPrivacyReadReceipts] = useState(true);
  const [privacyStoryReceipts, setPrivacyStoryReceipts] = useState(true);

  // Local Security Settings
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [chatLockEnabled, setChatLockEnabled] = useState(false);
  const [deviceSupportsBiometrics, setDeviceSupportsBiometrics] = useState(false);

  // Snap States
  const [defaultSnapViewOnce, setDefaultSnapViewOnce] = useState(true);
  const [saveSentSnapsToMemories, setSaveSentSnapsToMemories] = useState(true);

  // Backup logs States
  const [testingChatBackup, setTestingChatBackup] = useState(false);
  const [testingSnapBackup, setTestingSnapBackup] = useState(false);

  // App Settings States
  const [maxVideoDuration, setMaxVideoDuration] = useState<15 | 30 | 60>(30);
  const [defaultCameraMode, setDefaultCameraMode] = useState<'Photo' | 'Video' | 'LastUsed'>('Photo');
  const [defaultTimer, setDefaultTimer] = useState<'off' | '3s' | '5s' | '10s'>('off');
  const [saveOverlays, setSaveOverlays] = useState(true);
  const [locationLensAsk, setLocationLensAsk] = useState(true);
  const [defaultLens, setDefaultLens] = useState('none');
  const [faceLensesMode, setFaceLensesMode] = useState(true);
  const [photoOptimization, setPhotoOptimization] = useState(true);
  const [maxPhotoWidth, setMaxPhotoWidth] = useState(1600);
  const [jpegQuality, setJpegQuality] = useState(0.75);
  const [backgroundUpload, setBackgroundUpload] = useState(true);

  // Queue Modal State
  const [queueModalVisible, setQueueModalVisible] = useState(false);

  // Pin Modal State
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<'create' | 'verify'>('create');
  const [pendingToggle, setPendingToggle] = useState<'drive' | 'private' | null>(null);

  const isFocused = useIsFocused();

  const loadSettingsData = async () => {
    // 1. Get user email and profile
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      if (user.email) {
        setUserEmail(user.email);
      }
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      
      if (profile) {
        setUsername(profile.username || '');
        setFullName(profile.full_name || '');
        setUserRole(profile.role || 'user');
        setPrivacyMessageMe(profile.privacy_message_me || 'friends');
        setPrivacySendSnaps(profile.privacy_send_snaps || 'friends');
        setPrivacyViewStories(profile.privacy_view_stories || 'friends');
        setPrivacyShowOnline(profile.privacy_show_online ?? true);
        setPrivacyReadReceipts(profile.privacy_read_receipts ?? true);
        setPrivacyStoryReceipts(profile.privacy_story_receipts ?? true);
      }
    }

    // 2. Get Telegram credentials status
    const config = await telegramService.getTelegramConfig();
    setTelegramConfigured(!!config.botToken && !!config.channelId);

    // 3. Get PIN security status
    const pinExists = await securityService.hasPin();
    setHasPin(pinExists);

    if (pinExists) {
      const driveEnabled = await securityService.isDriveLockEnabled();
      const privateEnabled = await securityService.isPrivateDriveLockEnabled();
      const bioEnabled = await securityService.isBiometricsEnabled();
      const cLockEnabled = await securityService.isChatLockEnabled();

      setDriveLock(driveEnabled);
      setPrivateDriveLock(privateEnabled);
      setBiometricsEnabled(bioEnabled);
      setChatLockEnabled(cLockEnabled);
    } else {
      setDriveLock(false);
      setPrivateDriveLock(false);
      setBiometricsEnabled(false);
      setChatLockEnabled(false);
    }

    // Check device biometrics support
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    setDeviceSupportsBiometrics(hasHardware && isEnrolled);

    // 4. Get App configuration settings
    const appSettings = await settingsService.getSettings();
    setMaxVideoDuration(appSettings.maxVideoDuration);
    setDefaultCameraMode(appSettings.defaultCameraMode);
    setDefaultTimer(appSettings.defaultTimer);
    setSaveOverlays(appSettings.saveOverlaysAsMetadata);
    setLocationLensAsk(appSettings.locationLensAskPermission);
    setDefaultLens(appSettings.defaultLens);
    setFaceLensesMode(appSettings.faceLensesStickersMode);
    setPhotoOptimization(appSettings.photoOptimization);
    setMaxPhotoWidth(appSettings.maxPhotoWidth);
    setJpegQuality(appSettings.jpegQuality);
    setBackgroundUpload(appSettings.backgroundUpload);
    setDefaultSnapViewOnce(appSettings.defaultSnapViewOnce ?? true);
    setSaveSentSnapsToMemories(appSettings.saveSentSnapsToMemories ?? true);
  };

  const updateSetting = async (key: keyof AppSettings, value: any) => {
    try {
      await settingsService.updateSettings({ [key]: value });
      loadSettingsData();
    } catch (error) {
      Alert.alert('Error', 'Failed to update setting.');
    }
  };

  const updateProfilePrivacy = async (key: string, value: any) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({ [key]: value })
        .eq('id', user.id);

      if (error) throw error;
      loadSettingsData();
    } catch (err) {
      Alert.alert('Error', 'Failed to update privacy setting.');
    }
  };

  useEffect(() => {
    if (isFocused) {
      loadSettingsData();
    }
  }, [isFocused]);

  const handleSaveProfile = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Username is required.');
      return;
    }

    setSavingProfile(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found.');

      // Check unique username
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username.trim().toLowerCase())
        .neq('id', user.id)
        .maybeSingle();

      if (existing) {
        Alert.alert('Username Taken', 'This username is already claimed by another user.');
        setSavingProfile(false);
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          username: username.trim().toLowerCase(),
          full_name: fullName.trim(),
        })
        .eq('id', user.id);

      if (error) throw error;
      Alert.alert('Success', 'Profile updated successfully.');
      setEditingProfile(false);
    } catch (error: any) {
      Alert.alert('Save Failed', error.message || 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleTogglePinLock = async (value: boolean) => {
    if (value) {
      setPinModalMode('create');
      setPinModalVisible(true);
    } else {
      Alert.alert('Remove PIN', 'Are you sure you want to disable all PIN locks? This will remove all folder protection.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await securityService.disablePin();
            loadSettingsData();
          },
        },
      ]);
    }
  };

  const handlePinSuccess = async () => {
    setPinModalVisible(false);
    await loadSettingsData();
  };

  const handleToggleBiometrics = async (val: boolean) => {
    if (!hasPin) {
      Alert.alert('PIN Required', 'Please set up a security PIN before enabling biometrics.');
      return;
    }
    await securityService.setBiometricsEnabled(val);
    setBiometricsEnabled(val);
  };

  const handleToggleChatLock = async (val: boolean) => {
    if (!hasPin) {
      Alert.alert('PIN Required', 'Please set up a security PIN before locking chats.');
      return;
    }
    await securityService.setChatLockEnabled(val);
    setChatLockEnabled(val);
    if (val) {
      Alert.alert('Chat Lock Enabled', 'Locked chats will require PIN verification to view.');
    }
  };

  const handleToggleDriveLock = async (val: boolean) => {
    if (!hasPin) {
      Alert.alert('PIN Required', 'Please set up a security PIN before locking Drive.');
      return;
    }
    await securityService.setDriveLockEnabled(val);
    setDriveLock(val);
  };

  const handleTogglePrivateDriveLock = async (val: boolean) => {
    if (!hasPin) {
      Alert.alert('PIN Required', 'Please set up a security PIN before locking Private Drive.');
      return;
    }
    await securityService.setPrivateDriveLockEnabled(val);
    setPrivateDriveLock(val);
  };

  const handleTestTelegram = async () => {
    const config = await telegramService.getTelegramConfig();
    if (!config.botToken || !config.channelId) {
      Alert.alert('Error', 'Please configure your Telegram sync details first.');
      return;
    }

    setTestingConnection(true);
    try {
      await telegramService.testTelegramConnection(config.botToken, config.channelId);
      Alert.alert('Success', 'Telegram connection is active and message sent!');
    } catch (error: any) {
      Alert.alert('Connection Failed', error.message || 'Check bot token and channel ID.');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Log Out', 'Are you sure you want to log out of TeleVault?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <PinLockModal
        visible={pinModalVisible}
        onClose={() => setPinModalVisible(false)}
        onSuccess={handlePinSuccess}
        mode={pinModalMode}
      />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Card */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>User Profile</Text>
          <View style={styles.card}>
            {editingProfile ? (
              <View style={{ padding: 16 }}>
                <AppInput
                  label="Display Name"
                  placeholder="Enter full name"
                  value={fullName}
                  onChangeText={setFullName}
                />
                <AppInput
                  label="Username"
                  placeholder="Enter username"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                />
                <View style={styles.profileBtnRow}>
                  <AppButton
                    title="Cancel"
                    variant="secondary"
                    onPress={() => setEditingProfile(false)}
                    style={styles.smallBtn}
                  />
                  <AppButton
                    title="Save"
                    onPress={handleSaveProfile}
                    loading={savingProfile}
                    style={styles.smallBtn}
                  />
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.profileSummary} onPress={() => setEditingProfile(true)}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarLetter}>
                    {(fullName || username || '?').substring(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.profileText}>
                  <Text style={styles.profileNameText}>{fullName || 'Set display name'}</Text>
                  <Text style={styles.profileUsernameText}>@{username || 'set_username'}</Text>
                  <Text style={styles.profileEmailText}>{userEmail}</Text>
                </View>
                <ChevronRight size={20} color="#8E8E93" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Admin Dashboard */}
        {userRole === 'admin' && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Admin Controls</Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.itemRow}
                onPress={() => navigation.navigate('AdminDashboard')}
              >
                <View style={styles.itemLeft}>
                  <Shield size={20} color="#FFFC00" />
                  <View style={styles.itemMeta}>
                    <Text style={styles.itemTitle}>Admin Moderation Panel</Text>
                    <Text style={styles.itemSubtitle}>View safety reports and app statistics</Text>
                  </View>
                </View>
                <ChevronRight size={20} color="#8E8E93" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Telegram Sync Configuration */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Telegram Sync Storage</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.itemRow}
              onPress={() => navigation.navigate('TelegramConnect', { fromSettings: true })}
            >
              <View style={styles.itemLeft}>
                <Database size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Telegram Channel Keys</Text>
                  <Text style={styles.itemSubtitle}>
                    {telegramConfigured ? 'Bot and channel sync active' : 'Sync credentials not configured'}
                  </Text>
                </View>
              </View>
              {telegramConfigured ? (
                <CheckCircle size={20} color="#30D158" style={{ marginRight: 8 }} />
              ) : (
                <XCircle size={20} color="#FF453A" style={{ marginRight: 8 }} />
              )}
              <ChevronRight size={18} color="#8E8E93" />
            </TouchableOpacity>

            {telegramConfigured && (
              <TouchableOpacity style={styles.itemRow} onPress={handleTestTelegram} disabled={testingConnection}>
                <View style={styles.itemLeft}>
                  <Send size={20} color="#FFFC00" />
                  <View style={styles.itemMeta}>
                    <Text style={styles.itemTitle}>Test Connection</Text>
                    <Text style={styles.itemSubtitle}>Send verification ping log to Telegram</Text>
                  </View>
                </View>
                {testingConnection ? <ActivityIndicator size="small" color="#FFFC00" /> : <ChevronRight size={18} color="#8E8E93" />}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Privacy Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Privacy Controls</Text>
          <View style={styles.card}>
            <View style={styles.segmentRow}>
              <Text style={styles.segmentLabel}>Who can message me</Text>
              <View style={styles.segmentContainer}>
                {(['friends', 'everyone'] as const).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.segmentBtn, privacyMessageMe === mode && styles.segmentBtnActive]}
                    onPress={() => updateProfilePrivacy('privacy_message_me', mode)}
                  >
                    <Text style={[styles.segmentBtnText, privacyMessageMe === mode && styles.segmentBtnTextActive]}>
                      {mode === 'friends' ? 'Friends' : 'Everyone'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.segmentRow}>
              <Text style={styles.segmentLabel}>Who can send snaps</Text>
              <View style={styles.segmentContainer}>
                {(['friends', 'everyone'] as const).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.segmentBtn, privacySendSnaps === mode && styles.segmentBtnActive]}
                    onPress={() => updateProfilePrivacy('privacy_send_snaps', mode)}
                  >
                    <Text style={[styles.segmentBtnText, privacySendSnaps === mode && styles.segmentBtnTextActive]}>
                      {mode === 'friends' ? 'Friends' : 'Everyone'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.segmentRow}>
              <Text style={styles.segmentLabel}>Who can view my stories</Text>
              <View style={styles.segmentContainer}>
                {(['friends', 'everyone'] as const).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.segmentBtn, privacyViewStories === mode && styles.segmentBtnActive]}
                    onPress={() => updateProfilePrivacy('privacy_view_stories', mode)}
                  >
                    <Text style={[styles.segmentBtnText, privacyViewStories === mode && styles.segmentBtnTextActive]}>
                      {mode === 'friends' ? 'Friends' : 'Everyone'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.itemRowNoPress}>
              <View style={styles.itemLeft}>
                <Users size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Show Online Status</Text>
                  <Text style={styles.itemSubtitle}>Let others see when you are active</Text>
                </View>
              </View>
              <Switch
                value={privacyShowOnline}
                onValueChange={(val) => updateProfilePrivacy('privacy_show_online', val)}
                trackColor={{ false: '#2C2C2E', true: '#FFFC00' }}
                thumbColor={privacyShowOnline ? '#000000' : '#8E8E93'}
              />
            </View>

            <View style={styles.itemRowNoPress}>
              <View style={styles.itemLeft}>
                <Users size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Read Receipts</Text>
                  <Text style={styles.itemSubtitle}>Let others know when you read chats</Text>
                </View>
              </View>
              <Switch
                value={privacyReadReceipts}
                onValueChange={(val) => updateProfilePrivacy('privacy_read_receipts', val)}
                trackColor={{ false: '#2C2C2E', true: '#FFFC00' }}
                thumbColor={privacyReadReceipts ? '#000000' : '#8E8E93'}
              />
            </View>

            <View style={styles.itemRowNoPress}>
              <View style={styles.itemLeft}>
                <Users size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Story View Receipts</Text>
                  <Text style={styles.itemSubtitle}>Let others see when you view stories</Text>
                </View>
              </View>
              <Switch
                value={privacyStoryReceipts}
                onValueChange={(val) => updateProfilePrivacy('privacy_story_receipts', val)}
                trackColor={{ false: '#2C2C2E', true: '#FFFC00' }}
                thumbColor={privacyStoryReceipts ? '#000000' : '#8E8E93'}
              />
            </View>
          </View>
        </View>

        {/* Security Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Vault Security</Text>
          <View style={styles.card}>
            <View style={styles.itemRowNoPress}>
              <View style={styles.itemLeft}>
                <Lock size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>App Security PIN</Text>
                  <Text style={styles.itemSubtitle}>Secure folder items behind 4-digit code</Text>
                </View>
              </View>
              <Switch
                value={hasPin}
                onValueChange={handleTogglePinLock}
                trackColor={{ false: '#2C2C2E', true: '#FFFC00' }}
                thumbColor={hasPin ? '#000000' : '#8E8E93'}
              />
            </View>

            {hasPin && deviceSupportsBiometrics && (
              <View style={styles.itemRowNoPress}>
                <View style={styles.itemLeft}>
                  <Lock size={20} color="#FFFC00" />
                  <View style={styles.itemMeta}>
                    <Text style={styles.itemTitle}>Biometric Unlock</Text>
                    <Text style={styles.itemSubtitle}>Use face or fingerprint to unlock vaults</Text>
                  </View>
                </View>
                <Switch
                  value={biometricsEnabled}
                  onValueChange={handleToggleBiometrics}
                  trackColor={{ false: '#2C2C2E', true: '#FFFC00' }}
                  thumbColor={biometricsEnabled ? '#000000' : '#8E8E93'}
                />
              </View>
            )}

            {hasPin && (
              <>
                <View style={styles.itemRowNoPress}>
                  <View style={styles.itemLeft}>
                    <Lock size={20} color="#FFFC00" />
                    <View style={styles.itemMeta}>
                      <Text style={styles.itemTitle}>Cloud Drive Lock</Text>
                      <Text style={styles.itemSubtitle}>Require PIN before opening public Drive</Text>
                    </View>
                  </View>
                  <Switch
                    value={driveLock}
                    onValueChange={handleToggleDriveLock}
                    trackColor={{ false: '#2C2C2E', true: '#FFFC00' }}
                    thumbColor={driveLock ? '#000000' : '#8E8E93'}
                  />
                </View>

                <View style={styles.itemRowNoPress}>
                  <View style={styles.itemLeft}>
                    <Lock size={20} color="#FFFC00" />
                    <View style={styles.itemMeta}>
                      <Text style={styles.itemTitle}>Private Drive Lock</Text>
                      <Text style={styles.itemSubtitle}>Require PIN before opening Private Vault</Text>
                    </View>
                  </View>
                  <Switch
                    value={privateDriveLock}
                    onValueChange={handleTogglePrivateDriveLock}
                    trackColor={{ false: '#2C2C2E', true: '#FFFC00' }}
                    thumbColor={privateDriveLock ? '#000000' : '#8E8E93'}
                  />
                </View>

                <View style={styles.itemRowNoPress}>
                  <View style={styles.itemLeft}>
                    <Lock size={20} color="#8E8E93" />
                    <View style={styles.itemMeta}>
                      <Text style={[styles.itemTitle, { color: '#8E8E93' }]}>Chat Lock</Text>
                      <Text style={styles.itemSubtitle}>Secure specific direct chats behind PIN (Soon)</Text>
                    </View>
                  </View>
                  <Switch
                    value={chatLockEnabled}
                    onValueChange={handleToggleChatLock}
                    trackColor={{ false: '#2C2C2E', true: '#FFFC00' }}
                    thumbColor={chatLockEnabled ? '#000000' : '#8E8E93'}
                  />
                </View>
              </>
            )}
          </View>
        </View>

        {/* Backup and Export Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Data Backup & Export</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.itemRow} onPress={() => exportHelper.exportChatsAsTXT()}>
              <View style={styles.itemLeft}>
                <Download size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Export Chat Logs (.txt)</Text>
                  <Text style={styles.itemSubtitle}>Generate readable txt file of all messages</Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.itemRow} onPress={() => exportHelper.exportChatsAsJSON()}>
              <View style={styles.itemLeft}>
                <Download size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Export Chat Data (.json)</Text>
                  <Text style={styles.itemSubtitle}>Export raw message payloads in JSON format</Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.itemRow} onPress={() => exportHelper.exportFileListAsJSON()}>
              <View style={styles.itemLeft}>
                <Download size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Export File List (.json)</Text>
                  <Text style={styles.itemSubtitle}>Backup file metadata links and properties</Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.itemRow} onPress={() => exportHelper.exportMemoriesAsJSON()}>
              <View style={styles.itemLeft}>
                <Download size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Export Memories List (.json)</Text>
                  <Text style={styles.itemSubtitle}>Backup snaps and caption index metadata</Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.itemRow} onPress={() => exportHelper.exportAccountMetadata()}>
              <View style={styles.itemLeft}>
                <Download size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Export Profile Metadata (.json)</Text>
                  <Text style={styles.itemSubtitle}>Export username, email, and dates</Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.itemRow}
              onPress={() => Alert.alert('Restore Backup', 'To restore your metadata backup, please contact admin support. Full self-service JSON restorer is coming in next release.')}
            >
              <View style={styles.itemLeft}>
                <Database size={20} color="#8E8E93" />
                <View style={styles.itemMeta}>
                  <Text style={[styles.itemTitle, { color: '#8E8E93' }]}>Restore Backup Metadata</Text>
                  <Text style={styles.itemSubtitle}>Restore database indexes from local backup files</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Large File Mode */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>File Upload Settings</Text>
          <View style={styles.card}>
            <View style={styles.itemRowNoPress}>
              <View style={styles.itemLeft}>
                <Upload size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Photo Optimization</Text>
                  <Text style={styles.itemSubtitle}>Resize & compress images before upload</Text>
                </View>
              </View>
              <Switch
                value={photoOptimization}
                onValueChange={(val) => updateSetting('photoOptimization', val)}
                trackColor={{ false: '#2C2C2E', true: '#FFFC00' }}
                thumbColor={photoOptimization ? '#000000' : '#8E8E93'}
              />
            </View>

            <View style={styles.itemRowNoPress}>
              <View style={styles.itemLeft}>
                <Upload size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Background Uploads</Text>
                  <Text style={styles.itemSubtitle}>Runs sync in background (OS limitations apply)</Text>
                </View>
              </View>
              <Switch
                value={backgroundUpload}
                onValueChange={(val) => updateSetting('backgroundUpload', val)}
                trackColor={{ false: '#2C2C2E', true: '#FFFC00' }}
                thumbColor={backgroundUpload ? '#000000' : '#8E8E93'}
              />
            </View>

            <TouchableOpacity
              style={styles.itemRow}
              onPress={() => {
                Alert.alert(
                  'Large File Mode Info',
                  'Telegram Bot API enforces a strict 50 MB upload limit for standard bots. To upload files larger than 50 MB, TeleVault will support connecting to a locally hosted Telegram Bot API server in the future. Video compression and chunk uploading placeholders are currently being tested.',
                  [{ text: 'Got it' }]
                );
              }}
            >
              <View style={styles.itemLeft}>
                <Upload size={20} color="#8E8E93" />
                <View style={styles.itemMeta}>
                  <Text style={[styles.itemTitle, { color: '#8E8E93' }]}>Large File Mode (Coming Soon)</Text>
                  <Text style={styles.itemSubtitle}>Upload {'>'} 50 MB files via local Bot servers (Learn More)</Text>
                </View>
              </View>
              <ChevronRight size={18} color="#8E8E93" />
            </TouchableOpacity>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>About</Text>
          <View style={styles.card}>
            <View style={styles.itemRowNoPress}>
              <View style={styles.itemLeft}>
                <Info size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>TeleVault</Text>
                  <Text style={styles.itemSubtitle}>Version 2.0.0 (Secure Social Upgrade)</Text>
                  <Text style={styles.aboutText}>
                    TeleVault is a Snapchat-inspired camera, memories, and drive vault app powered by your own private Telegram cloud storage bot. Built with React Native & Expo.
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Log Out */}
        <View style={[styles.section, { marginBottom: 30 }]}>
          <AppButton title="Log Out" onPress={handleLogout} variant="danger" />
        </View>
      </ScrollView>

      {/* Upload Queue Overlay */}
      <UploadProgress visible={queueModalVisible} onClose={() => setQueueModalVisible(false)} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    paddingHorizontal: 16,
    height: 56,
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  section: {
    marginTop: 20,
  },
  sectionHeader: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#0f1123', // Deep Navy
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1f2444',
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#1f2444',
  },
  itemRowNoPress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#1f2444',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemMeta: {
    marginLeft: 12,
    flex: 1,
  },
  itemTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  itemSubtitle: {
    color: '#8e92af',
    fontSize: 12,
    marginTop: 2,
  },
  aboutText: {
    color: '#8e92af',
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#1f2444',
  },
  segmentLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#07080f',
    borderRadius: 12,
    padding: 2,
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  segmentBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFC00',
  },
  segmentBtnText: {
    color: '#8e92af',
    fontSize: 12,
    fontWeight: '600',
  },
  segmentBtnTextActive: {
    color: '#000000',
    fontWeight: '800',
  },
  profileSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1f2444',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#FFFC00',
  },
  avatarLetter: {
    color: '#FFFC00',
    fontSize: 22,
    fontWeight: '700',
  },
  profileText: {
    flex: 1,
  },
  profileNameText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  profileUsernameText: {
    color: '#8e92af',
    fontSize: 14,
    marginTop: 2,
  },
  profileEmailText: {
    color: '#4f526c',
    fontSize: 12,
    marginTop: 2,
  },
  profileBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  smallBtn: {
    width: '48%',
    height: 44,
    borderRadius: 22,
  },
});

export default SettingsScreen;
