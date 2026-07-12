import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Modal, SafeAreaView, Alert, TextInput, ActivityIndicator, Platform } from 'react-native';
import { Delete, X, Lock, Fingerprint } from 'lucide-react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { securityService } from '../services/securityService';
import { supabase } from '../lib/supabase';

interface PinLockModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode?: 'verify' | 'create';
  undismissable?: boolean;
}

const showAlert = (
  title: string,
  message: string,
  buttons?: { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[]
) => {
  if (Platform.OS === 'web') {
    if (buttons && buttons.length > 1) {
      const confirmBtn = buttons.find(b => b.style !== 'cancel') || buttons[buttons.length - 1];
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed && confirmBtn && confirmBtn.onPress) {
        confirmBtn.onPress();
      }
    } else {
      window.alert(`${title}\n\n${message}`);
      if (buttons && buttons[0] && buttons[0].onPress) {
        buttons[0].onPress();
      }
    }
    return;
  }
  Alert.alert(title, message, buttons);
};

export const PinLockModal: React.FC<PinLockModalProps> = ({
  visible,
  onClose,
  onSuccess,
  mode = 'verify',
  undismissable = false,
}) => {
  const [localMode, setLocalMode] = useState(mode);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState('');
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSec, setLockoutSec] = useState(0);

  // Recovery states
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [accountPassword, setAccountPassword] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutSec <= 0) return;
    const interval = setInterval(() => {
      setLockoutSec((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setFailedAttempts(0);
          setError('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSec]);

  // Check biometric support
  useEffect(() => {
    const checkBiometrics = async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const isEnabled = await securityService.isBiometricsEnabled();
      setBiometricsAvailable(hasHardware && isEnrolled && isEnabled);
    };
    checkBiometrics();
  }, [visible]);

  // Reset state and trigger biometrics when modal opens
  useEffect(() => {
    if (visible) {
      setPin('');
      setConfirmPin('');
      setStep('enter');
      setLocalMode(mode);
      if (lockoutSec <= 0) {
        setError('');
      }

      if (mode === 'verify' && lockoutSec <= 0) {
        // Auto trigger biometrics
        setTimeout(() => {
          triggerBiometrics();
        }, 500);
      }
    }
  }, [visible, biometricsAvailable, lockoutSec, mode]);

  const triggerBiometrics = async () => {
    if (lockoutSec > 0) return;
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const isEnabled = await securityService.isBiometricsEnabled();
 
    if (hasHardware && isEnrolled && isEnabled && localMode === 'verify') {
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock TeleVault',
          fallbackLabel: 'Enter PIN',
        });
        if (result.success) {
          setFailedAttempts(0);
          onSuccess();
        }
      } catch (err) {
        console.warn('Biometric auth error:', err);
      }
    }
  };

  const handleForgotPasscode = () => {
    showAlert(
      'Reset Private Vault?',
      'If you reset your passcode, you can set a new 4-digit PIN. However, to protect your privacy, all snaps currently saved in your Private Vault will be permanently deleted from the database.\n\nDo you want to proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset Vault', style: 'destructive', onPress: () => setShowForgotModal(true) }
      ]
    );
  };

  const handleVerifyPassword = async () => {
    if (!accountPassword) {
      setVerifyError('Please enter your password.');
      return;
    }
    setVerifying(true);
    setVerifyError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !user.email) {
        throw new Error('No active user session found.');
      }

      // Verify account password by trying to log in
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: accountPassword,
      });

      if (signInErr) {
        setVerifyError('Incorrect password. Please try again.');
        setVerifying(false);
        return;
      }

      // 1. Delete all user's private files
      const { error: deleteErr } = await supabase
        .from('files')
        .delete()
        .eq('user_id', user.id)
        .eq('is_private', true);

      if (deleteErr) {
        console.warn('Failed to delete files during recovery reset:', deleteErr);
      }

      // 2. Also delete private files in large_files table if they exist
      try {
        await supabase
          .from('large_files')
          .delete()
          .eq('owner_id', user.id);
      } catch (err) {
        console.warn('Failed to delete large_files:', err);
      }

      // 3. Clear/disable local PIN
      await securityService.disablePin();

      setShowForgotModal(false);
      setAccountPassword('');
      
      showAlert(
        'Vault Reset Successful',
        'Your Private Vault has been reset and all previous private snaps were deleted. You can now configure a new PIN.',
        [
          {
            text: 'OK',
            onPress: () => {
              setPin('');
              setConfirmPin('');
              setStep('enter');
              setError('');
              setLocalMode('create');
            }
          }
        ]
      );
    } catch (err: any) {
      setVerifyError(err.message || 'An error occurred. Please try again.');
    } finally {
      setVerifying(false);
    }
  };
 
  const handleKeyPress = (num: string) => {
    if (lockoutSec > 0) return;
    setError('');
    const currentInput = step === 'enter' ? pin : confirmPin;
    if (currentInput.length >= 4) return;
 
    const newInput = currentInput + num;
    if (step === 'enter') {
      setPin(newInput);
    } else {
      setConfirmPin(newInput);
    }
  };
 
  const handleBackspace = () => {
    if (lockoutSec > 0) return;
    setError('');
    const currentInput = step === 'enter' ? pin : confirmPin;
    if (currentInput.length === 0) return;
 
    const newInput = currentInput.slice(0, -1);
    if (step === 'enter') {
      setPin(newInput);
    } else {
      setConfirmPin(newInput);
    }
  };
 
  // Monitor input length to auto-trigger verification
  useEffect(() => {
    const checkPin = async () => {
      if (lockoutSec > 0) return;
      if (localMode === 'verify') {
        if (pin.length === 4) {
          const isValid = await securityService.verifyPin(pin);
          if (isValid) {
            setFailedAttempts(0);
            onSuccess();
          } else {
            const nextFailed = failedAttempts + 1;
            setFailedAttempts(nextFailed);
            setPin('');
            if (nextFailed >= 5) {
              setLockoutSec(30);
              setError('Too many incorrect attempts. Locked for 30 seconds.');
            } else {
              setError(`Incorrect PIN. ${5 - nextFailed} attempts remaining.`);
            }
          }
        }
      } else {
        // Create mode
        if (step === 'enter' && pin.length === 4) {
          setStep('confirm');
        } else if (step === 'confirm' && confirmPin.length === 4) {
          if (pin === confirmPin) {
            await securityService.createPin(pin);
            showAlert('PIN Created', 'Your security PIN has been set successfully.');
            onSuccess();
          } else {
            setError('PINs do not match. Restarting.');
            setPin('');
            setConfirmPin('');
            setStep('enter');
          }
        }
      }
    };
 
    checkPin();
  }, [pin, confirmPin, lockoutSec, localMode]);
 
  const getHeading = () => {
    if (lockoutSec > 0) {
      return 'Temporarily Locked';
    }
    if (localMode === 'verify') {
      return 'Enter PIN';
    }
    return step === 'enter' ? 'Create PIN' : 'Confirm PIN';
  };
 
  const getSubheading = () => {
    if (lockoutSec > 0) {
      return `Try again in ${lockoutSec} seconds`;
    }
    if (localMode === 'verify') {
      return 'Please enter your 4-digit security PIN';
    }
    return step === 'enter'
      ? 'Choose a 4-digit PIN to secure your vault'
      : 'Re-enter your 4-digit PIN to confirm';
  };

  const renderDots = () => {
    const currentLength = step === 'enter' ? pin.length : confirmPin.length;
    return (
      <View style={styles.dotsContainer}>
        {[0, 1, 2, 3].map((index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index < currentLength ? styles.dotFilled : styles.dotEmpty,
            ]}
          />
        ))}
      </View>
    );
  };

  const renderKey = (val: string) => {
    return (
      <TouchableOpacity
        key={val}
        style={[styles.keypadButton, lockoutSec > 0 && { opacity: 0.3 }]}
        onPress={() => handleKeyPress(val)}
        activeOpacity={0.7}
        disabled={lockoutSec > 0}
      >
        <Text style={styles.keypadText}>{val}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.container}>
        {/* Header Close button */}
        {!undismissable && (
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.contentContainer}>
          <View style={styles.iconCircle}>
            <Lock size={32} color="#FFFC00" />
          </View>

          <Text style={styles.heading}>{getHeading()}</Text>
          <Text style={styles.subheading}>{getSubheading()}</Text>

          {lockoutSec <= 0 && renderDots()}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        {/* Keypad */}
        <View style={styles.keypadContainer}>
          <View style={styles.keypadRow}>
            {['1', '2', '3'].map(renderKey)}
          </View>
          <View style={styles.keypadRow}>
            {['4', '5', '6'].map(renderKey)}
          </View>
          <View style={styles.keypadRow}>
            {['7', '8', '9'].map(renderKey)}
          </View>
          <View style={styles.keypadRow}>
            {/* Left Button (Biometrics or Cancel) */}
            {biometricsAvailable && localMode === 'verify' ? (
              <TouchableOpacity
                style={styles.keypadButton}
                onPress={triggerBiometrics}
                activeOpacity={0.7}
                disabled={lockoutSec > 0}
              >
                <Fingerprint size={28} color={lockoutSec > 0 ? "#555" : "#FFFC00"} />
              </TouchableOpacity>
            ) : undismissable ? (
              <View style={styles.keypadButton} />
            ) : (
              <TouchableOpacity
                style={styles.keypadButton}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={[styles.keypadText, styles.cancelText]}>Cancel</Text>
              </TouchableOpacity>
            )}

            {renderKey('0')}

            {/* Delete/Backspace */}
            <TouchableOpacity
              style={[styles.keypadButton, lockoutSec > 0 && { opacity: 0.3 }]}
              onPress={handleBackspace}
              activeOpacity={0.7}
              disabled={lockoutSec > 0}
            >
              <Delete size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Forgot Passcode Link */}
        {localMode === 'verify' && (
          <TouchableOpacity 
            style={styles.forgotBtn} 
            onPress={handleForgotPasscode}
            activeOpacity={0.7}
          >
            <Text style={styles.forgotBtnText}>Forgot Passcode?</Text>
          </TouchableOpacity>
        )}

        {/* Password Verification Modal */}
        <Modal visible={showForgotModal} animationType="slide" transparent>
          <View style={styles.forgotOverlay}>
            <View style={styles.forgotContent}>
              <Text style={styles.forgotTitle}>Reset Passcode</Text>
              <Text style={styles.forgotSubtitle}>
                Enter your TeleVault account password to reset your vault PIN. Note: to protect your privacy, all snaps in your Private Vault will be permanently deleted.
              </Text>
              <TextInput
                secureTextEntry
                style={styles.passwordInput}
                placeholder="Account Password"
                placeholderTextColor="#8e92af"
                value={accountPassword}
                onChangeText={(txt) => {
                  setAccountPassword(txt);
                  setVerifyError('');
                }}
              />
              {verifyError ? <Text style={styles.forgotError}>{verifyError}</Text> : null}
              <View style={styles.forgotActions}>
                <TouchableOpacity 
                  style={[styles.actionBtn, styles.cancelBtn]} 
                  onPress={() => {
                    setShowForgotModal(false);
                    setAccountPassword('');
                    setVerifyError('');
                  }}
                  disabled={verifying}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.actionBtn, styles.confirmBtn]} 
                  onPress={handleVerifyPassword}
                  disabled={verifying}
                >
                  {verifying ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.confirmBtnText}>Reset PIN</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    alignItems: 'flex-start',
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#0f1123',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#0f1123',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  subheading: {
    color: '#8e92af',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginHorizontal: 12,
    borderWidth: 2,
  },
  dotEmpty: {
    borderColor: '#1f2444',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    borderColor: '#FFFC00',
    backgroundColor: '#FFFC00',
  },
  errorText: {
    color: '#FF453A',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  keypadContainer: {
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginVertical: 8,
  },
  keypadButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#0f1123',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8e92af',
  },
  forgotBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  forgotBtnText: {
    color: '#FFFC00',
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  forgotOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  forgotContent: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#0F1123',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  forgotTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  forgotSubtitle: {
    color: '#8e92af',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  passwordInput: {
    width: '100%',
    height: 48,
    backgroundColor: '#1b1d30',
    borderRadius: 16,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 12,
  },
  forgotError: {
    color: '#FF3B30',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  forgotActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginRight: 8,
  },
  cancelBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  confirmBtn: {
    backgroundColor: '#FF3B30',
    marginLeft: 8,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default PinLockModal;
