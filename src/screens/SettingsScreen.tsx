import React, { useState, useEffect } from 'react';
import Screen from '../components/Screen';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Linking,
  Modal,
} from 'react-native';
import AppInput from '../components/AppInput';
import AppButton from '../components/AppButton';

const Alert = {
  alert: (
    title: string,
    message?: string,
    buttons?: { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[]
  ) => {
    if (Platform.OS === 'web') {
      if (buttons && buttons.length > 1) {
        const confirmBtn = buttons.find(b => b.style !== 'cancel') || buttons[buttons.length - 1];
        const confirmed = window.confirm(`${title}\n\n${message || ''}`);
        if (confirmed && confirmBtn && confirmBtn.onPress) {
          confirmBtn.onPress();
        }
      } else {
        window.alert(`${title}\n\n${message || ''}`);
        if (buttons && buttons[0] && buttons[0].onPress) {
          buttons[0].onPress();
        }
      }
      return;
    }
    const RNAlert = require('react-native').Alert;
    RNAlert.alert(title, message, buttons);
  }
};
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
  Mail,
  Globe,
  Clock,
  RefreshCw,
  Trash2,
  HardDrive,
} from 'lucide-react-native';
import { CompositeScreenProps, useIsFocused } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, AppStackParamList } from '../types/navigation';
import { supabase } from '../lib/supabase';
import { securityService } from '../services/securityService';
import { telegramService } from '../services/telegramService';
import { settingsService, AppSettings } from '../services/settingsService';
import { largeFileService } from '../services/largeFileService';
import { exportHelper } from '../utils/exportHelper';
import { showToast } from '../components/ToastBanner';
import * as LocalAuthentication from 'expo-local-authentication';
import PinLockModal from '../components/PinLockModal';
import UploadProgress from '../components/UploadProgress';
import { UploadQueueBadge } from '../components/UploadQueueBadge';
import TeleVaultLogo from '../components/TeleVaultLogo';
import { fileService } from '../services/fileService';
import { storageService } from '../services/storageService';
import { uploadQueueService } from '../services/uploadQueueService';
import { StorageManagerModal } from '../components/StorageManagerModal';
import { autoSyncService } from '../services/autoSyncService';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'SettingsTab'>,
  NativeStackScreenProps<AppStackParamList>
>;

export const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const [userEmail, setUserEmail] = useState('');
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [maskedBotToken, setMaskedBotToken] = useState<string | null>(null);
  const [telegramChannelId, setTelegramChannelId] = useState<string | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const [driveLock, setDriveLock] = useState(false);
  const [privateDriveLock, setPrivateDriveLock] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [storageModalVisible, setStorageModalVisible] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);

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
  const [appLockEnabled, setAppLockEnabled] = useState(false);

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
  const [uploadMode, setUploadMode] = useState<'Stable' | 'Fast'>('Stable');
  const [largeFileStats, setLargeFileStats] = useState({
    active: 0,
    failed: 0,
    completed: 0,
  });

  // Queue Modal State
  const [queueModalVisible, setQueueModalVisible] = useState(false);

  // Pin Modal State
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<'create' | 'verify'>('create');
  const [pendingToggle, setPendingToggle] = useState<'drive' | 'private' | null>(null);
  const [pendingDisable, setPendingDisable] = useState(false);

  // Nuke Modal State
  const [nukeModalVisible, setNukeModalVisible] = useState(false);
  const [nukePassword, setNukePassword] = useState('');
  const [nukeLoading, setNukeLoading] = useState(false);
  const [nukeError, setNukeError] = useState('');

  // Upload Logs States
  const [logsModalVisible, setLogsModalVisible] = useState(false);
  const [uploadLogs, setUploadLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

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
    setTelegramChannelId(config.channelId || null);
    if (config.botToken) {
      const parts = config.botToken.split(':');
      if (parts.length > 1) {
        const prefix = parts[0];
        const suffix = parts[1].substring(0, Math.min(3, parts[1].length));
        setMaskedBotToken(`${prefix}:${suffix}••••••`);
      } else {
        setMaskedBotToken(`${config.botToken.substring(0, Math.min(6, config.botToken.length))}••••••`);
      }
    } else {
      setMaskedBotToken(null);
    }

    // 3. Get PIN security status
    const pinExists = await securityService.hasPin();
    setHasPin(pinExists);

    const appLockActive = await securityService.isAppLockEnabled();
    setAppLockEnabled(appLockActive);

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
    setUploadMode(appSettings.uploadMode || 'Stable');

    const syncEnabled = await autoSyncService.isEnabled();
    setAutoSyncEnabled(syncEnabled);

    try {
      const stats = await largeFileService.getLargeFileStats();
      setLargeFileStats(stats);
    } catch (statsErr) {
      console.error('Failed to load large file stats in SettingsScreen:', statsErr);
    }
  };

  const updateSetting = async (key: keyof AppSettings, value: any) => {
    try {
      await settingsService.updateSettings({ [key]: value });
      loadSettingsData();
    } catch (error) {
      Alert.alert('Error', 'Failed to update setting.');
    }
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const logs = await uploadQueueService.getUploadLogs();
      setUploadLogs(logs || []);
    } catch (err) {
      console.error('Failed to load upload logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleOpenLogsModal = () => {
    setLogsModalVisible(true);
    fetchLogs();
  };

  const handleClearLogs = async () => {
    Alert.alert('Clear History Logs', 'Are you sure you want to clear all upload logs?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          try {
            await uploadQueueService.clearUploadLogs();
            setUploadLogs([]);
            showToast('Logs cleared.');
          } catch (e) {
            Alert.alert('Error', 'Failed to clear logs.');
          }
        }
      }
    ]);
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

  const handleToggleAutoSync = async (val: boolean) => {
    try {
      await autoSyncService.setEnabled(val);
      setAutoSyncEnabled(val);
      showToast(val ? 'Camera roll auto-sync enabled.' : 'Camera roll auto-sync disabled.');
    } catch (_) {
      Alert.alert('Error', 'Failed to update auto-sync setting.');
    }
  };

  const handleTogglePinLock = async (value: boolean) => {
    if (value) {
      if (hasPin) {
        await securityService.setAppLockEnabled(true);
        showToast('App security lock enabled.');
        await loadSettingsData();
      } else {
        setPinModalMode('create');
        setPinModalVisible(true);
        setPendingDisable(false);
      }
    } else {
      setPinModalMode('verify');
      setPinModalVisible(true);
      setPendingDisable(true);
    }
  };

  const handlePinSuccess = async () => {
    setPinModalVisible(false);
    if (pendingDisable) {
      await securityService.setAppLockEnabled(false);
      setPendingDisable(false);
      showToast('App security lock disabled.');
    } else {
      await securityService.setAppLockEnabled(true);
      showToast('App security lock enabled.');
    }
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

  const handleSyncTelegramConfig = async () => {
    setTestingConnection(true);
    try {
      const success = await telegramService.syncTelegramConfig();
      if (success) {
        setTelegramConfigured(true);
        // Refresh masked token
        const config = await telegramService.getTelegramConfig();
        setTelegramChannelId(config.channelId || null);
        if (config.botToken) {
          const parts = config.botToken.split(':');
          if (parts.length > 1) {
            setMaskedBotToken(`${parts[0]}:${parts[1].substring(0, Math.min(3, parts[1].length))}••••••`);
          } else {
            setMaskedBotToken(`${config.botToken.substring(0, Math.min(6, config.botToken.length))}••••••`);
          }
        }
        Alert.alert('Success', 'Telegram credentials restored from cloud sync successfully!');
      } else {
        Alert.alert('Not Found', 'No Telegram credentials backup found in your cloud account.');
      }
    } catch (err: any) {
      Alert.alert('Sync Failed', err.message || 'An error occurred during synchronization.');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleBackupTelegramConfig = async () => {
    setTestingConnection(true);
    try {
      const config = await telegramService.getTelegramConfig();
      if (!config.botToken || !config.channelId) {
        Alert.alert('Error', 'Please configure your Telegram sync details first.');
        return;
      }
      await telegramService.saveTelegramConfig(config.botToken, config.channelId);
      Alert.alert('Success', 'Telegram credentials backed up to cloud successfully!');
    } catch (err: any) {
      Alert.alert('Backup Failed', err.message || 'An error occurred during backup.');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleRemoveTelegramConfig = async () => {
    Alert.alert(
      'Remove Telegram Credentials',
      'This will delete your storage credentials locally and from your cloud account. Your uploaded files will remain on Telegram, but you will not be able to sync new files until you re-configure. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await telegramService.deleteTelegramConfig();
              setTelegramConfigured(false);
              setMaskedBotToken(null);
              setTelegramChannelId(null);
              Alert.alert('Removed', 'Telegram configuration deleted.');
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete configuration.');
            }
          },
        },
      ]
    );
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

  const handleDeleteAllData = async () => {
    if (!nukePassword) {
      setNukeError('Please enter your password.');
      return;
    }

    setNukeLoading(true);
    setNukeError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !user.email) {
        throw new Error('User session not found.');
      }

      // 1. Verify password by logging in again
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: nukePassword,
      });

      if (signInErr) {
        throw new Error('Incorrect password. Please try again.');
      }

      // 2. Fetch and delete all user files (deletes from both Telegram and Supabase)
      const { data: files, error: filesErr } = await supabase
        .from('files')
        .select('id')
        .eq('user_id', user.id);

      if (filesErr) {
        throw new Error(filesErr.message || 'Failed to fetch files for deletion.');
      }

      if (files && files.length > 0) {
        const fileIds = files.map((f: any) => f.id);
        await fileService.bulkDelete(fileIds, true);
      }

      // 3. Delete folders
      const { error: foldersErr } = await supabase
        .from('folders')
        .delete()
        .eq('user_id', user.id);

      if (foldersErr) {
        throw new Error(foldersErr.message || 'Failed to delete folders.');
      }

      // 4. Delete Telegram Configuration from Supabase & Storage
      await telegramService.deleteTelegramConfig();

      // 5. Clear all storage keys
      await storageService.clear();

      // 6. Delete user profile record
      await supabase
        .from('profiles')
        .delete()
        .eq('id', user.id);

      // 7. Sign out of Supabase
      await supabase.auth.signOut();

      setNukeModalVisible(false);
      setNukePassword('');
      showToast('All data has been permanently deleted.');
    } catch (err: any) {
      setNukeError(err.message || 'An error occurred during data deletion.');
    } finally {
      setNukeLoading(false);
    }
  };

  return (
    <Screen edges={['top']}>
      <PinLockModal
        visible={pinModalVisible}
        onClose={() => setPinModalVisible(false)}
        onSuccess={handlePinSuccess}
        mode={pinModalMode}
      />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
        <UploadQueueBadge />
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
                  <Text style={styles.itemTitle}>Telegram Sync Connection</Text>
                  <Text style={[styles.itemSubtitle, telegramConfigured ? { color: '#30D158' } : { color: '#FF453A' }]}>
                    {telegramConfigured ? 'Connected & Verified' : 'Not Connected'}
                  </Text>
                </View>
              </View>
              <ChevronRight size={18} color="#8E8E93" />
            </TouchableOpacity>

            {telegramConfigured && (
              <>
                <View style={[styles.itemRow, { borderTopWidth: 1, borderColor: '#1C1C1E', paddingLeft: 32 }]}>
                  <View style={styles.itemMeta}>
                    <Text style={[styles.itemTitle, { fontSize: 13, color: '#8E8E93' }]}>Bot Token</Text>
                    <Text style={[styles.itemSubtitle, { color: '#FFFFFF' }]}>{maskedBotToken}</Text>
                  </View>
                </View>

                <View style={[styles.itemRow, { borderTopWidth: 1, borderColor: '#1C1C1E', paddingLeft: 32 }]}>
                  <View style={styles.itemMeta}>
                    <Text style={[styles.itemTitle, { fontSize: 13, color: '#8E8E93' }]}>Channel ID</Text>
                    <Text style={[styles.itemSubtitle, { color: '#FFFFFF' }]}>{telegramChannelId}</Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.itemRow} onPress={handleBackupTelegramConfig} disabled={testingConnection}>
                  <View style={styles.itemLeft}>
                    <Upload size={20} color="#FFFC00" />
                    <View style={styles.itemMeta}>
                      <Text style={styles.itemTitle}>Backup credentials to Cloud</Text>
                      <Text style={styles.itemSubtitle}>Save keys to secure cloud sync database</Text>
                    </View>
                  </View>
                  {testingConnection ? <ActivityIndicator size="small" color="#FFFC00" /> : <ChevronRight size={18} color="#8E8E93" />}
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.itemRow} onPress={handleSyncTelegramConfig} disabled={testingConnection}>
              <View style={styles.itemLeft}>
                <RefreshCw size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Restore credentials from Cloud</Text>
                  <Text style={styles.itemSubtitle}>Pull keys from secure cloud backup</Text>
                </View>
              </View>
              {testingConnection ? <ActivityIndicator size="small" color="#FFFC00" /> : <ChevronRight size={18} color="#8E8E93" />}
            </TouchableOpacity>

            {telegramConfigured && (
              <>
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

                <TouchableOpacity style={styles.itemRow} onPress={handleRemoveTelegramConfig}>
                  <View style={styles.itemLeft}>
                    <Trash2 size={20} color="#FF453A" />
                    <View style={styles.itemMeta}>
                      <Text style={[styles.itemTitle, { color: '#FF453A' }]}>Remove Telegram Config</Text>
                      <Text style={styles.itemSubtitle}>Delete credentials locally and from cloud</Text>
                    </View>
                  </View>
                  <ChevronRight size={18} color="#8E8E93" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Large File Mode */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Large File Mode</Text>
          <View style={styles.card}>
            <View style={styles.itemRow}>
              <View style={styles.itemLeft}>
                <Database size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Normal Upload Limit</Text>
                  <Text style={styles.itemSubtitle}>50 MB</Text>
                </View>
              </View>
            </View>

            <View style={styles.itemRow}>
              <View style={styles.itemLeft}>
                <Database size={20} color="#FF9500" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Chunk Size</Text>
                  <Text style={styles.itemSubtitle}>45 MB chunks</Text>
                </View>
              </View>
            </View>

            <View style={styles.itemRow}>
              <View style={styles.itemLeft}>
                <Database size={20} color="#FF9500" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Max Chunked Upload</Text>
                  <Text style={styles.itemSubtitle}>500 MB</Text>
                </View>
              </View>
            </View>

            <View style={styles.itemRow}>
              <View style={styles.itemLeft}>
                <CheckCircle size={20} color="#30D158" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Resume Failed Uploads</Text>
                  <Text style={styles.itemSubtitle}>Supported</Text>
                </View>
              </View>
            </View>

            <View style={styles.itemRow}>
              <View style={styles.itemLeft}>
                <Clock size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Download / Rebuild</Text>
                  <Text style={styles.itemSubtitle}>Beta</Text>
                </View>
              </View>
            </View>

            <View style={[styles.itemRowNoPress, { paddingVertical: 12 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', width: '100%', paddingHorizontal: 10 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: '#FFFC00', fontWeight: '800', fontSize: 16 }}>{largeFileStats.active}</Text>
                  <Text style={{ color: '#8E8E93', fontSize: 11, marginTop: 2 }}>Active</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: '#FF453A', fontWeight: '800', fontSize: 16 }}>{largeFileStats.failed}</Text>
                  <Text style={{ color: '#8E8E93', fontSize: 11, marginTop: 2 }}>Failed</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: '#30D158', fontWeight: '800', fontSize: 16 }}>{largeFileStats.completed}</Text>
                  <Text style={{ color: '#8E8E93', fontSize: 11, marginTop: 2 }}>Completed</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.openManagerBtn}
              onPress={() => navigation.navigate('ChunkManager')}
              activeOpacity={0.8}
            >
              <Text style={styles.openManagerBtnText}>Open Chunk Manager</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Upload History & Logs */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Activity Logs</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.itemRow} onPress={handleOpenLogsModal}>
              <View style={styles.itemLeft}>
                <FileText size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Upload History Logs</Text>
                  <Text style={styles.itemSubtitle}>View logs of completed and failed enqueued tasks</Text>
                </View>
              </View>
              <ChevronRight size={18} color="#8E8E93" />
            </TouchableOpacity>
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
                value={appLockEnabled}
                onValueChange={handleTogglePinLock}
                trackColor={{ false: '#2C2C2E', true: '#FFFC00' }}
                thumbColor={appLockEnabled ? '#000000' : '#8E8E93'}
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
          <Text style={styles.sectionHeader}>Storage, Sync & Backup</Text>
          <View style={styles.card}>
            {/* Auto Sync Toggle */}
            <View style={styles.itemRowNoPress}>
              <View style={styles.itemLeft}>
                <RefreshCw size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Camera roll Auto-Sync</Text>
                  <Text style={styles.itemSubtitle}>Backup new photos/videos automatically</Text>
                </View>
              </View>
              <Switch
                value={autoSyncEnabled}
                onValueChange={handleToggleAutoSync}
                trackColor={{ false: '#2C2C2E', true: '#FFFC00' }}
                thumbColor={autoSyncEnabled ? '#000000' : '#8E8E93'}
              />
            </View>

            {/* Storage Manager */}
            <TouchableOpacity style={styles.itemRow} onPress={() => setStorageModalVisible(true)}>
              <View style={styles.itemLeft}>
                <HardDrive size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Storage & Cache Manager</Text>
                  <Text style={styles.itemSubtitle}>Manage and clear local decrypted previews</Text>
                </View>
              </View>
            </TouchableOpacity>

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

            <View style={styles.itemRowNoPress}>
              <View style={styles.itemLeft}>
                <Upload size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Upload Mode</Text>
                  <Text style={styles.itemSubtitle}>Stable (1 upload) or Fast (2 uploads)</Text>
                </View>
              </View>
              <View style={styles.segmentContainer}>
                {(['Stable', 'Fast'] as const).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.segmentBtn, uploadMode === mode && styles.segmentBtnActive]}
                    onPress={() => updateSetting('uploadMode', mode)}
                  >
                    <Text style={[styles.segmentBtnText, uploadMode === mode && styles.segmentBtnTextActive]}>
                      {mode}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={styles.itemRow}
              onPress={() => navigation.navigate('StorageAnalytics' as any)}
            >
              <View style={styles.itemLeft}>
                <Database size={20} color="#30D158" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Storage Analytics Dashboard</Text>
                  <Text style={styles.itemSubtitle}>View Telegram storage stats, channel balance, and caches</Text>
                </View>
              </View>
              <ChevronRight size={18} color="#8E8E93" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.itemRow}
              onPress={() => navigation.navigate('ChunkManager')}
            >
              <View style={styles.itemLeft}>
                <Database size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Open Chunk Manager</Text>
                  <Text style={styles.itemSubtitle}>View upload parts and resume failed chunks</Text>
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
                <TeleVaultLogo size={24} style={{ marginRight: 4 }} />
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

        {/* About Developer Section */}
        <View style={styles.section}>
          <View style={[styles.card, { padding: 20, alignItems: 'center' }]}>
            <TeleVaultLogo size={60} />
            <Text style={[styles.devName, { marginTop: 12 }]}>Vineeth</Text>
            <Text style={styles.devTitle}>Creator of TeleVault</Text>

            <View style={styles.devDivider} />

            <View style={styles.linksContainer}>
              <TouchableOpacity 
                style={styles.linkRow} 
                onPress={async () => {
                  const url = 'https://linkedin.com/in/vineethbpawar';
                  try {
                    const supported = await Linking.canOpenURL(url);
                    if (supported) {
                      await Linking.openURL(url);
                    } else {
                      Alert.alert('Error', `Cannot open link: ${url}`);
                    }
                  } catch (error) {
                    Alert.alert('Error', `An error occurred: ${error}`);
                  }
                }}
              >
                <Users size={16} color="#FFFC00" style={styles.linkIcon} />
                <Text style={styles.linkText}>linkedin.com/in/vineethbpawar</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.devDivider} />

            <Text style={styles.appInfoTitle}>TeleVault</Text>
            <Text style={styles.appInfoSubtitle}>Version: v2.0 Beta</Text>
            <Text style={styles.copyright}>© 2026 Vineeth. All rights reserved.</Text>
          </View>
        </View>

        {/* Log Out & Danger Zone */}
        <View style={[styles.section, { marginBottom: 30 }]}>
          <AppButton 
            title="Log Out" 
            onPress={handleLogout} 
            variant="secondary" 
            style={{ marginBottom: 12 }} 
          />
          <AppButton 
            title="Delete All Data (Danger Zone)" 
            onPress={() => setNukeModalVisible(true)} 
            variant="danger" 
          />
        </View>
      </ScrollView>

      <StorageManagerModal
        visible={storageModalVisible}
        onClose={() => setStorageModalVisible(false)}
      />

      {/* Upload History Logs Modal */}
      <Modal
        visible={logsModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setLogsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%', width: '90%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={styles.modalTitle}>Upload History Logs</Text>
              <TouchableOpacity onPress={() => setLogsModalVisible(false)}>
                <XCircle size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            {logsLoading ? (
              <ActivityIndicator size="large" color="#FFFC00" style={{ marginVertical: 40 }} />
            ) : uploadLogs.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <FileText size={48} color="#2C2C2E" style={{ marginBottom: 12 }} />
                <Text style={{ color: '#8E8E93', fontSize: 14 }}>No upload history logs recorded yet.</Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }}>
                {uploadLogs.map((log) => {
                  const statusColors: Record<string, string> = {
                    completed: '#30D158',
                    failed: '#FF453A',
                    pending: '#0A84FF',
                    uploading: '#FFD60A',
                    processing: '#BF5AF2',
                  };
                  const statusColor = statusColors[log.status] || '#8E8E93';
                  const dateStr = log.created_at ? new Date(log.created_at).toLocaleString() : '';

                  return (
                    <View
                      key={log.id}
                      style={{
                        paddingVertical: 12,
                        borderBottomWidth: 0.5,
                        borderBottomColor: '#2C2C2E',
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600', flex: 1, marginRight: 8 }} numberOfLines={1}>
                          {log.file_name}
                        </Text>
                        <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ color: statusColor, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>
                            {log.status}
                          </Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                        <Text style={{ color: '#8E8E93', fontSize: 11 }}>
                          {log.file_size ? (log.file_size / (1024 * 1024)).toFixed(2) : '0.00'} MB • {log.destination ? log.destination.toUpperCase() : 'UNKNOWN'}
                        </Text>
                        <Text style={{ color: '#8E8E93', fontSize: 11 }}>
                          {dateStr}
                        </Text>
                      </View>

                      {log.error_message && (
                        <Text style={{ color: '#FF453A', fontSize: 11, marginTop: 4, fontStyle: 'italic' }}>
                          Error: {log.error_message}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}

            {uploadLogs.length > 0 && (
              <TouchableOpacity
                style={{ backgroundColor: '#FF453A', marginTop: 16, paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
                onPress={handleClearLogs}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>Clear History Logs</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Nuke Data Modal */}
      <Modal
        visible={nukeModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          if (!nukeLoading) setNukeModalVisible(false);
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            if (!nukeLoading) setNukeModalVisible(false);
          }}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>⚠️ Delete All Data</Text>
            <Text style={styles.modalSubtitle}>
              This action is <Text style={{ fontWeight: 'bold', color: '#FF3B30' }}>permanent and irreversible</Text>. 
              It will completely delete all your files, folders, and configurations from both Supabase and your Telegram channel.
            </Text>

            <AppInput
              label="Enter Account Password"
              placeholder="Password"
              value={nukePassword}
              onChangeText={(text) => {
                setNukePassword(text);
                setNukeError('');
              }}
              isPassword={true}
              autoCapitalize="none"
            />

            {nukeError ? <Text style={styles.errorText}>{nukeError}</Text> : null}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setNukeModalVisible(false);
                  setNukePassword('');
                  setNukeError('');
                }}
                disabled={nukeLoading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleDeleteAllData}
                disabled={nukeLoading}
              >
                {nukeLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmButtonText}>Delete Everything</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Upload Queue Overlay */}
      <UploadProgress visible={queueModalVisible} onClose={() => setQueueModalVisible(false)} />
    </Screen>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  devName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  devTitle: {
    color: '#FFFC00',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  devBio: {
    color: '#8e92af',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
    paddingHorizontal: 10,
  },
  devDivider: {
    height: 1,
    backgroundColor: '#1f2444',
    width: '100%',
    marginVertical: 16,
  },
  linksContainer: {
    width: '100%',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  linkIcon: {
    marginRight: 12,
  },
  linkText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  appInfoTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  appInfoSubtitle: {
    color: '#8e92af',
    fontSize: 12,
    marginTop: 2,
  },
  copyright: {
    color: '#4f5370',
    fontSize: 10,
    marginTop: 8,
  },
  openManagerBtn: {
    backgroundColor: 'rgba(255, 252, 0, 0.1)',
    borderWidth: 1,
    borderColor: '#FFFC00',
    paddingVertical: 12,
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openManagerBtnText: {
    color: '#FFFC00',
    fontSize: 14,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalSubtitle: {
    color: '#8E8E93',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#2C2C2E',
    marginRight: 8,
  },
  confirmButton: {
    backgroundColor: '#FF3B30',
    marginLeft: 8,
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 12,
    fontWeight: '600',
    marginTop: -8,
    marginBottom: 12,
    textAlign: 'center',
  },
});

export default SettingsScreen;
