import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Eye, ShieldAlert, Key } from 'lucide-react-native';
import AppInput from './AppInput';
import AppButton from './AppButton';
import { securityService } from '../services/securityService';
import { showToast } from './ToastBanner';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const DecoySetupModal: React.FC<Props> = ({ visible, onClose }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [mainPassword, setMainPassword] = useState('');
  const [decoyPassword, setDecoyPassword] = useState('');
  const [confirmDecoy, setConfirmDecoy] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerifyMain = async () => {
    const trimmed = mainPassword.trim();
    if (!trimmed) {
      Alert.alert('Required', 'Please enter your current main Vault Password.');
      return;
    }

    setLoading(true);
    try {
      const verified = await securityService.unlockVault(trimmed);
      if (!verified) {
        throw new Error('Incorrect main Vault Password. Please try again.');
      }
      setStep(2);
    } catch (err: any) {
      Alert.alert('Verification Failed', err.message || 'Incorrect password.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDecoy = async () => {
    const trimmedDecoy = decoyPassword.trim();
    if (trimmedDecoy.length < 6) {
      Alert.alert('Required', 'Decoy password must be at least 6 characters.');
      return;
    }
    if (trimmedDecoy === mainPassword.trim()) {
      Alert.alert('Invalid Password', 'Decoy password cannot be identical to your main password.');
      return;
    }
    if (trimmedDecoy !== confirmDecoy.trim()) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await securityService.setupDecoyVault(trimmedDecoy);
      showToast('Decoy Passphrase configured successfully.');
      handleClose();
    } catch (err: any) {
      Alert.alert('Setup Failed', err.message || 'Could not save decoy configuration.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setMainPassword('');
    setDecoyPassword('');
    setConfirmDecoy('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Eye size={32} color="#FFFC00" />
          </View>

          <Text style={styles.title}>Configure Decoy Password</Text>
          <Text style={styles.subtitle}>
            {step === 1
              ? 'First, verify your main vault password to authorize this action.'
              : 'Enter a secondary password that will unlock a decoy vault under duress.'}
          </Text>

          {step === 1 ? (
            <View style={{ width: '100%' }}>
              <AppInput
                placeholder="Main Vault Password"
                value={mainPassword}
                onChangeText={setMainPassword}
                secureTextEntry
                style={styles.input}
              />
              <AppButton
                title="Verify Password"
                onPress={handleVerifyMain}
                loading={loading}
              />
            </View>
          ) : (
            <View style={{ width: '100%' }}>
              <AppInput
                placeholder="Decoy Password"
                value={decoyPassword}
                onChangeText={setDecoyPassword}
                secureTextEntry
                style={styles.input}
              />
              <AppInput
                placeholder="Confirm Decoy Password"
                value={confirmDecoy}
                onChangeText={setConfirmDecoy}
                secureTextEntry
                style={styles.input}
              />
              
              <View style={styles.warningCard}>
                <ShieldAlert size={16} color="#FFFC00" style={{ marginRight: 8, marginTop: 2 }} />
                <Text style={styles.warningCardText}>
                  Do not share this password. If entered, the app will show dummy files and completely hide your real vault.
                </Text>
              </View>

              <AppButton
                title="Save Decoy Password"
                onPress={handleSaveDecoy}
                loading={loading}
              />
            </View>
          )}

          <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} disabled={loading}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 252, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: '#8E8E93',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  input: {
    width: '100%',
    marginBottom: 16,
  },
  warningCard: {
    backgroundColor: 'rgba(255, 252, 0, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 252, 0, 0.15)',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    width: '100%',
  },
  warningCardText: {
    color: '#FFFC00',
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  cancelBtn: {
    marginTop: 16,
    paddingVertical: 8,
  },
  cancelBtnText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default DecoySetupModal;
