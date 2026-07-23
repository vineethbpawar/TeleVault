import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Shield, RefreshCw, LogOut } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../lib/supabase';
import { telegramService } from '../services/telegramService';

interface Props {
  visible: boolean;
  onSuccess: () => void;
  onLogout: () => void;
}

export const TwoFactorModal: React.FC<Props> = ({ visible, onSuccess, onLogout }) => {
  const [code, setCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (visible) {
      sendVerificationCode();
    }
  }, [visible]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const sendVerificationCode = async () => {
    setSending(true);
    try {
      // 1. Generate 6-digit random code
      const newCode = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedCode(newCode);

      // 2. Send via Telegram message
      const message = `🛡️ TeleVault 2FA Verification\n\nA new device is requesting access to your TeleVault account.\n\nVerification Code: ${newCode}\n\nIf you did not initiate this login, please secure your account immediately.`;
      const sent = await telegramService.sendTextMessage(message);

      if (!sent) {
        throw new Error('Telegram configuration missing or message delivery failed.');
      }

      setResendCooldown(30);
    } catch (err: any) {
      Alert.alert('Delivery Failed', err.message || 'Could not send 2FA code to Telegram.');
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    if (code.trim() !== generatedCode) {
      Alert.alert('Invalid Code', 'The verification code you entered is incorrect.');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User session not found.');

      // Get or create unique device ID
      let deviceId = await SecureStore.getItemAsync('televault_device_id');
      if (!deviceId) {
        deviceId = Math.random().toString(36).substring(2) + Date.now().toString(36);
        await SecureStore.setItemAsync('televault_device_id', deviceId);
      }

      // Add device to metadata
      const currentDevices = user.user_metadata?.authorized_devices || [];
      if (!currentDevices.includes(deviceId)) {
        currentDevices.push(deviceId);
      }

      const { error } = await supabase.auth.updateUser({
        data: { authorized_devices: currentDevices }
      });

      if (error) throw error;

      onSuccess();
    } catch (err: any) {
      Alert.alert('Verification Error', err.message || 'Failed to save device authorization.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Shield size={38} color="#FFFC00" />
          </View>

          <Text style={styles.title}>2-Factor Authentication</Text>
          <Text style={styles.subtitle}>
            A verification code has been sent to your private Telegram channel. Enter it below to authorize this device.
          </Text>

          <TextInput
            placeholder="Enter 6-digit code"
            placeholderTextColor="#8E8E93"
            keyboardType="number-pad"
            maxLength={6}
            style={styles.input}
            value={code}
            onChangeText={setCode}
          />

          <TouchableOpacity
            style={[styles.verifyBtn, loading && styles.btnDisabled]}
            onPress={handleVerify}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#000000" size="small" />
            ) : (
              <Text style={styles.verifyBtnText}>Verify & Authorize</Text>
            )}
          </TouchableOpacity>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              onPress={sendVerificationCode}
              disabled={sending || resendCooldown > 0}
              style={styles.actionLink}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFC00" />
              ) : (
                <Text style={[styles.actionText, resendCooldown > 0 && styles.textDisabled]}>
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={onLogout} style={styles.actionLink}>
              <LogOut size={16} color="#FF3B30" style={{ marginRight: 4 }} />
              <Text style={[styles.actionText, { color: '#FF3B30' }]}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 252, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    color: '#8E8E93',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 28,
  },
  input: {
    width: '100%',
    backgroundColor: '#000000',
    color: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 2,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    marginBottom: 20,
  },
  verifyBtn: {
    width: '100%',
    backgroundColor: '#FFFC00',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  verifyBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
  },
  actionLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  actionText: {
    color: '#FFFC00',
    fontSize: 13,
    fontWeight: '600',
  },
  textDisabled: {
    color: '#8E8E93',
  },
});

export default TwoFactorModal;
