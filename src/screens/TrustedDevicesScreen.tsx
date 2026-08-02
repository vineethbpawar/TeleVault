import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Shield, Smartphone, Monitor, Trash2, CheckCircle2, Laptop, Globe } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { supabase } from '../lib/supabase';
import { deviceService, TrustedDeviceRecord } from '../services/deviceService';
import AppHeader from '../components/AppHeader';
import Screen from '../components/Screen';
import { showToast } from '../components/ToastBanner';

type Props = NativeStackScreenProps<AppStackParamList, 'TrustedDevices'>;

export const TrustedDevicesScreen: React.FC<Props> = ({ navigation }) => {
  const [devices, setDevices] = useState<TrustedDeviceRecord[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDevices = async () => {
    try {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;

      const currentId = await deviceService.getOrCreateDeviceId();
      setCurrentDeviceId(currentId);

      const records = await deviceService.getTrustedDevices(authData.user.id);
      setDevices(records);
    } catch (err) {
      console.error('[TrustedDevicesScreen] Error loading devices:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const handleRemoveDevice = (device: TrustedDeviceRecord) => {
    const isCurrent = device.device_id === currentDeviceId;
    Alert.alert(
      'Remove Trusted Device',
      isCurrent
        ? 'Removing your current device will require Telegram verification on your next sign-in.'
        : `Are you sure you want to remove '${device.device_name}'? Next sign-in from this device will require verification code.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove Device',
          style: 'destructive',
          onPress: async () => {
            try {
              await deviceService.removeTrustedDevice(device.id);
              showToast(`Removed ${device.device_name}`);
              loadDevices();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to remove device.');
            }
          },
        },
      ]
    );
  };

  const handleRemoveAllOthers = () => {
    Alert.alert(
      'Remove All Other Devices',
      'This will revoke trust for all devices except your current active device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove Others',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: authData } = await supabase.auth.getUser();
              if (authData.user && currentDeviceId) {
                await deviceService.removeAllOtherDevices(authData.user.id, currentDeviceId);
                showToast('Removed all other trusted devices.');
                loadDevices();
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to remove other devices.');
            }
          },
        },
      ]
    );
  };

  const renderPlatformIcon = (platform: string) => {
    if (platform === 'iOS' || platform === 'Android') {
      return <Smartphone size={20} color="#FFFC00" />;
    } else if (platform === 'Mac' || platform === 'Windows' || platform === 'Linux') {
      return <Laptop size={20} color="#64D2FF" />;
    }
    return <Globe size={20} color="#8E8E93" />;
  };

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader title="Trusted Devices" showBackButton={true} />

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadDevices(); }} tintColor="#FFFC00" />}
        >
          <Text style={styles.sectionHeader}>REGISTERED TRUSTED DEVICES</Text>

          <View style={styles.card}>
            {devices.length === 0 ? (
              <View style={styles.emptyBox}>
                <Shield size={32} color="#8E8E93" style={{ marginBottom: 8 }} />
                <Text style={styles.emptyText}>No trusted devices recorded yet.</Text>
              </View>
            ) : (
              devices.map((device, idx) => {
                const isCurrent = device.device_id === currentDeviceId;
                return (
                  <View key={device.id} style={[styles.deviceRow, idx < devices.length - 1 && styles.borderBottom]}>
                    <View style={styles.iconCircle}>
                      {renderPlatformIcon(device.platform)}
                    </View>

                    <View style={styles.metaContainer}>
                      <View style={styles.nameRow}>
                        <Text style={styles.deviceNameText}>{device.device_name}</Text>
                        {isCurrent && (
                          <View style={styles.currentBadge}>
                            <CheckCircle2 size={10} color="#000" style={{ marginRight: 2 }} />
                            <Text style={styles.currentBadgeText}>Current Device</Text>
                          </View>
                        )}
                      </View>

                      <Text style={styles.deviceMetaSub}>
                        {device.browser} • {device.platform}
                      </Text>
                      <Text style={styles.lastActiveText}>
                        Last Active: {new Date(device.last_login_at || device.created_at).toLocaleDateString()} at {new Date(device.last_login_at || device.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>

                    <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemoveDevice(device)}>
                      <Trash2 size={18} color="#FF453A" />
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>

          {devices.length > 1 && (
            <TouchableOpacity style={styles.removeAllBtn} onPress={handleRemoveAllOthers}>
              <Trash2 size={16} color="#FF453A" style={{ marginRight: 6 }} />
              <Text style={styles.removeAllBtnText}>Remove All Other Devices</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeader: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#121420',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  emptyBox: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 14,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  borderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  metaContainer: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceNameText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginRight: 8,
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFC00',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  currentBadgeText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: '800',
  },
  deviceMetaSub: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  lastActiveText: {
    color: '#555',
    fontSize: 11,
    marginTop: 2,
  },
  removeBtn: {
    padding: 8,
  },
  removeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 20,
  },
  removeAllBtnText: {
    color: '#FF453A',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default TrustedDevicesScreen;
