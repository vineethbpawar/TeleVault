import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Modal, SafeAreaView, Alert } from 'react-native';
import { Delete, X, Lock, Fingerprint } from 'lucide-react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { securityService } from '../services/securityService';

interface PinLockModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode?: 'verify' | 'create';
  undismissable?: boolean;
}

export const PinLockModal: React.FC<PinLockModalProps> = ({
  visible,
  onClose,
  onSuccess,
  mode = 'verify',
  undismissable = false,
}) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState('');
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSec, setLockoutSec] = useState(0);

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
  }, [visible, biometricsAvailable, lockoutSec]);

  const triggerBiometrics = async () => {
    if (lockoutSec > 0) return;
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const isEnabled = await securityService.isBiometricsEnabled();

    if (hasHardware && isEnrolled && isEnabled && mode === 'verify') {
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
      if (mode === 'verify') {
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
            Alert.alert('PIN Created', 'Your security PIN has been set successfully.');
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
  }, [pin, confirmPin, lockoutSec]);

  const getHeading = () => {
    if (lockoutSec > 0) {
      return 'Temporarily Locked';
    }
    if (mode === 'verify') {
      return 'Enter PIN';
    }
    return step === 'enter' ? 'Create PIN' : 'Confirm PIN';
  };

  const getSubheading = () => {
    if (lockoutSec > 0) {
      return `Try again in ${lockoutSec} seconds`;
    }
    if (mode === 'verify') {
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
            {biometricsAvailable && mode === 'verify' ? (
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
    paddingBottom: 40,
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
});

export default PinLockModal;
