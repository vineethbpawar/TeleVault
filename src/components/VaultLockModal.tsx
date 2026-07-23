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
import { Lock, Eye, EyeOff, ShieldAlert } from 'lucide-react-native';
import { securityService } from '../services/securityService';
import AppButton from './AppButton';

interface Props {
  visible: boolean;
  onSuccess: () => void;
  onClose: () => void;
}

export const VaultLockModal: React.FC<Props> = ({ visible, onSuccess, onClose }) => {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const checkVaultConfig = async () => {
    try {
      const configured = await securityService.isVaultConfigured();
      setIsConfigured(configured);
    } catch (_) {
      setIsConfigured(false);
    }
  };

  useEffect(() => {
    if (visible) {
      checkVaultConfig();
      setPassword('');
      setConfirmPassword('');
      setError('');
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (!isConfigured) {
        // Setup flow
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          setLoading(false);
          return;
        }

        await securityService.setupVaultPassword(password);
        Alert.alert('Vault Created', 'Your Zero-Knowledge Vault has been successfully initialized.');
        onSuccess();
      } else {
        // Unlock flow
        const success = await securityService.unlockVault(password);
        if (success) {
          onSuccess();
        } else {
          setError('Incorrect Vault Password.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  if (isConfigured === null) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Lock size={32} color="#FFFC00" />
          </View>

          <Text style={styles.title}>
            {isConfigured ? 'Unlock Private Vault' : 'Initialize Private Vault'}
          </Text>
          <Text style={styles.subtitle}>
            {isConfigured
              ? 'Enter your Vault Password to decrypt your private files.'
              : 'Set a Vault Password. This key is zero-knowledge and is never uploaded to the cloud.'}
          </Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder={isConfigured ? 'Vault Password' : 'Choose Vault Password'}
              placeholderTextColor="#8E8E93"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              autoFocus
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff size={20} color="#8E8E93" />
              ) : (
                <Eye size={20} color="#8E8E93" />
              )}
            </TouchableOpacity>
          </View>

          {/* Confirm Password Input (only on Setup) */}
          {!isConfigured && (
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Confirm Vault Password"
                placeholderTextColor="#8E8E93"
                secureTextEntry={!showPassword}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            </View>
          )}

          {!isConfigured && (
            <View style={styles.warnBox}>
              <ShieldAlert size={16} color="#FFD60A" style={{ marginRight: 8 }} />
              <Text style={styles.warnText}>
                If you forget this password, files inside the vault cannot be recovered.
              </Text>
            </View>
          )}

          {/* Action buttons */}
          <AppButton
            title={isConfigured ? 'Unlock' : 'Create Vault'}
            onPress={handleSubmit}
            loading={loading}
            style={styles.submitBtn}
          />

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={loading}>
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
    fontSize: 20,
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
    paddingHorizontal: 8,
  },
  inputContainer: {
    width: '100%',
    height: 50,
    backgroundColor: '#000000',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
  },
  eyeBtn: {
    padding: 4,
  },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 214, 10, 0.08)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 214, 10, 0.2)',
  },
  warnText: {
    flex: 1,
    color: '#FFD60A',
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 15,
  },
  submitBtn: {
    width: '100%',
    marginTop: 8,
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
  errorText: {
    color: '#FF453A',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 12,
    textAlign: 'center',
  },
});

export default VaultLockModal;
