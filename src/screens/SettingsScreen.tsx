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
} from 'react-native';
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
} from 'lucide-react-native';
import { CompositeScreenProps, useIsFocused } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, AppStackParamList } from '../types/navigation';
import { supabase } from '../lib/supabase';
import { securityService } from '../services/securityService';
import { telegramService } from '../services/telegramService';
import PinLockModal from '../components/PinLockModal';

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

  // Pin Modal State
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<'create' | 'verify'>('create');
  const [pendingToggle, setPendingToggle] = useState<'drive' | 'private' | null>(null);

  const isFocused = useIsFocused();

  const loadSettingsData = async () => {
    // 1. Get user email
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      setUserEmail(user.email);
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
      setDriveLock(driveEnabled);
      setPrivateDriveLock(privateEnabled);
    } else {
      setDriveLock(false);
      setPrivateDriveLock(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      loadSettingsData();
    }
  }, [isFocused]);

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

  const handleDriveLockToggle = async (value: boolean) => {
    if (value) {
      if (!hasPin) {
        setPendingToggle('drive');
        setPinModalMode('create');
        setPinModalVisible(true);
      } else {
        await securityService.setDriveLockEnabled(true);
        setDriveLock(true);
      }
    } else {
      await securityService.setDriveLockEnabled(false);
      setDriveLock(false);
    }
  };

  const handlePrivateDriveLockToggle = async (value: boolean) => {
    if (value) {
      if (!hasPin) {
        setPendingToggle('private');
        setPinModalMode('create');
        setPinModalVisible(true);
      } else {
        await securityService.setPrivateDriveLockEnabled(true);
        setPrivateDriveLock(true);
      }
    } else {
      await securityService.setPrivateDriveLockEnabled(false);
      setPrivateDriveLock(false);
    }
  };

  const handlePinSuccess = async () => {
    setPinModalVisible(false);
    setHasPin(true);

    if (pendingToggle === 'drive') {
      await securityService.setDriveLockEnabled(true);
      setDriveLock(true);
    } else if (pendingToggle === 'private') {
      await securityService.setPrivateDriveLockEnabled(true);
      setPrivateDriveLock(true);
    } else {
      // Changed PIN or custom action
      Alert.alert('Success', 'PIN action completed.');
    }
    setPendingToggle(null);
  };

  const handlePinCancel = () => {
    setPinModalVisible(false);
    setPendingToggle(null);
  };

  const handleDisablePin = async () => {
    Alert.alert(
      'Disable PIN Lock',
      'Are you sure you want to remove PIN security? This will unlock your Drive and Private Drive.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: async () => {
            await securityService.disablePin();
            setHasPin(false);
            setDriveLock(false);
            setPrivateDriveLock(false);
            Alert.alert('PIN Disabled', 'Security PIN has been removed.');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <PinLockModal
        visible={pinModalVisible}
        onClose={handlePinCancel}
        onSuccess={handlePinSuccess}
        mode={pinModalMode}
      />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Account</Text>
          <View style={styles.card}>
            <View style={styles.itemRowNoPress}>
              <View style={styles.itemLeft}>
                <User size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Email Address</Text>
                  <Text style={styles.itemSubtitle}>{userEmail || 'Loading...'}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.itemRow} onPress={handleLogout}>
              <View style={styles.itemLeft}>
                <LogOut size={20} color="#FF453A" />
                <Text style={[styles.itemTitle, { color: '#FF453A' }]}>Log Out</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Telegram Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Telegram Cloud Storage</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.itemRow}
              onPress={() => navigation.navigate('TelegramConnect', { fromSettings: true })}
            >
              <View style={styles.itemLeft}>
                <Send size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Telegram Configuration</Text>
                  <Text style={styles.itemSubtitle}>
                    {telegramConfigured ? 'Bot and channel set' : 'Sync is not configured'}
                  </Text>
                </View>
              </View>
              <View style={styles.itemRight}>
                {telegramConfigured ? (
                  <CheckCircle size={18} color="#30D158" style={{ marginRight: 8 }} />
                ) : (
                  <XCircle size={18} color="#FF453A" style={{ marginRight: 8 }} />
                )}
                <ChevronRight size={18} color="#8E8E93" />
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.itemRow} onPress={handleTestTelegram} disabled={testingConnection}>
              <View style={styles.itemLeft}>
                <Send size={20} color="#FFFC00" />
                <Text style={styles.itemTitle}>Test Storage Connection</Text>
              </View>
              <View style={styles.itemRight}>
                {testingConnection ? <ActivityIndicator size="small" color="#FFFC00" /> : null}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Security Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Security & Vault PIN</Text>
          <View style={styles.card}>
            <View style={styles.itemRowNoPress}>
              <View style={styles.itemLeft}>
                <Shield size={20} color="#FFFC00" />
                <Text style={styles.itemTitle}>Lock Normal Drive</Text>
              </View>
              <Switch
                value={driveLock}
                onValueChange={handleDriveLockToggle}
                trackColor={{ false: '#2C2C2E', true: '#FFFC00' }}
                thumbColor={driveLock ? '#000000' : '#8E8E93'}
              />
            </View>

            <View style={styles.itemRowNoPress}>
              <View style={styles.itemLeft}>
                <Shield size={20} color="#FFFC00" />
                <Text style={styles.itemTitle}>Lock Private Drive</Text>
              </View>
              <Switch
                value={privateDriveLock}
                onValueChange={handlePrivateDriveLockToggle}
                trackColor={{ false: '#2C2C2E', true: '#FFFC00' }}
                thumbColor={privateDriveLock ? '#000000' : '#8E8E93'}
              />
            </View>

            {!hasPin ? (
              <TouchableOpacity
                style={styles.itemRow}
                onPress={() => {
                  setPendingToggle(null);
                  setPinModalMode('create');
                  setPinModalVisible(true);
                }}
              >
                <View style={styles.itemLeft}>
                  <Shield size={20} color="#FFFC00" />
                  <Text style={styles.itemTitle}>Create Vault PIN</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.itemRow}
                  onPress={() => {
                    setPendingToggle(null);
                    setPinModalMode('create');
                    setPinModalVisible(true);
                  }}
                >
                  <View style={styles.itemLeft}>
                    <Shield size={20} color="#FFFC00" />
                    <Text style={styles.itemTitle}>Change Vault PIN</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.itemRow} onPress={handleDisablePin}>
                  <View style={styles.itemLeft}>
                    <Shield size={20} color="#FF453A" />
                    <Text style={[styles.itemTitle, { color: '#FF453A' }]}>Disable Vault PIN</Text>
                  </View>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Uploads Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Upload Settings</Text>
          <View style={styles.card}>
            <View style={styles.itemRowNoPress}>
              <View style={styles.itemLeft}>
                <Upload size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Max Upload Size Limit</Text>
                  <Text style={styles.itemSubtitle}>Max 50 MB per file (Telegram bot restriction)</Text>
                </View>
              </View>
            </View>
            <View style={styles.itemRowNoPress}>
              <View style={styles.itemLeft}>
                <Upload size={20} color="#FFFC00" />
                <View style={styles.itemMeta}>
                  <Text style={styles.itemTitle}>Wi-Fi Only Uploads</Text>
                  <Text style={styles.itemSubtitle}>Disabled (Always upload to keep synced)</Text>
                </View>
              </View>
            </View>
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
                  <Text style={styles.itemSubtitle}>Version 1.0.0 (Stable MVP)</Text>
                  <Text style={styles.aboutText}>
                    TeleVault is a Snapchat-inspired camera, memories, and drive vault app powered by your own private Telegram cloud storage bot.
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
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
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#2C2C2E',
  },
  itemRowNoPress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#2C2C2E',
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
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  itemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aboutText: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
});

export default SettingsScreen;
