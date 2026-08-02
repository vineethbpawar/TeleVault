import React, { useState } from 'react';
import { StyleSheet, View, Text, Modal, TextInput, TouchableOpacity, Platform } from 'react-native';
import { Shield, KeyRound, Check, X, AlertTriangle, UserCheck } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showToast } from './ToastBanner';

interface AdminAuthModalProps {
  visible: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({ visible, onSuccess, onCancel }) => {
  const [adminId, setAdminId] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const insets = useSafeAreaInsets();

  const HARDCODED_ADMIN_ID = 'tv-vini-root';
  const HARDCODED_PASSWORD = 'bhoom@sandy@2007';

  const handleLogin = () => {
    if (!adminId || !password) {
      setErrorMsg('Please enter both Admin ID and Password.');
      return;
    }

    if (adminId.trim() === HARDCODED_ADMIN_ID && password.trim() === HARDCODED_PASSWORD) {
      showToast('Admin Authentication Granted!');
      setErrorMsg('');
      setAdminId('');
      setPassword('');
      onSuccess();
    } else {
      setErrorMsg('Invalid Admin ID or Password.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.overlay, { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.closeBtn} onPress={onCancel}>
            <X size={20} color="#8E8E93" />
          </TouchableOpacity>

          <View style={styles.headerIcon}>
            <Shield size={32} color="#FFFC00" />
          </View>

          <Text style={styles.title}>Admin Access Control</Text>
          <Text style={styles.subtitle}>
            Enter hardcoded root administrator credentials to access the moderation panel.
          </Text>

          {errorMsg !== '' && (
            <View style={styles.errorBanner}>
              <AlertTriangle size={16} color="#FF3B30" style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          <View style={styles.inputContainer}>
            <UserCheck size={18} color="#8E8E93" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={adminId}
              onChangeText={(val) => {
                setAdminId(val);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="Admin Root ID"
              placeholderTextColor="#555"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <KeyRound size={18} color="#8E8E93" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={(val) => {
                setPassword(val);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="Admin Password"
              placeholderTextColor="#555"
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
            <Check size={18} color="#000000" style={{ marginRight: 6 }} />
            <Text style={styles.loginBtnText}>Unlock Admin Panel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 252, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 252, 0, 0.2)',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 16,
    width: '100%',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 50,
    width: '100%',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  loginBtn: {
    flexDirection: 'row',
    width: '100%',
    height: 50,
    backgroundColor: '#FFFC00',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  loginBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '800',
  },
});

export default AdminAuthModal;
