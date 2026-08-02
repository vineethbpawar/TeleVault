import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ShieldCheck, RefreshCw, Send, AlertTriangle, Lock } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deviceService, DeviceMetadata } from '../services/deviceService';
import { otpService } from '../services/otpService';
import { showToast } from './ToastBanner';

interface DeviceVerificationModalProps {
  visible: boolean;
  userId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const DeviceVerificationModal: React.FC<DeviceVerificationModalProps> = ({
  visible,
  userId,
  onSuccess,
  onCancel,
}) => {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [deviceMeta, setDeviceMeta] = useState<DeviceMetadata | null>(null);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const [canResend, setCanResend] = useState(false);
  const insets = useSafeAreaInsets();

  const inputRefs = useRef<Array<TextInput | null>>([]);

  // Initialize verification code generation when modal opens
  useEffect(() => {
    if (!visible || !userId) return;

    const initVerification = async () => {
      setLoading(true);
      setErrorMsg('');
      setCode(['', '', '', '', '', '']);
      setTimeLeft(300);
      setCanResend(false);

      const meta = await deviceService.getDeviceMetadata();
      setDeviceMeta(meta);

      try {
        await otpService.generateAndSendDeviceOtp(userId, meta);
        showToast('Verification code sent to Telegram!');
      } catch (err: any) {
        setErrorMsg('Failed to send verification code to Telegram.');
      } finally {
        setLoading(false);
      }
    };

    initVerification();
  }, [visible, userId]);

  // Countdown Timer effect
  useEffect(() => {
    if (!visible || timeLeft <= 0) {
      if (timeLeft <= 0) setCanResend(true);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [visible, timeLeft]);

  const handleInputChange = (text: string, index: number) => {
    if (errorMsg) setErrorMsg('');
    const newCode = [...code];

    // Handle full paste
    if (text.length > 1) {
      const pasted = text.replace(/[^0-9]/g, '').slice(0, 6).split('');
      for (let i = 0; i < 6; i++) {
        newCode[i] = pasted[i] || '';
      }
      setCode(newCode);
      if (pasted.length === 6) {
        inputRefs.current[5]?.focus();
      }
      return;
    }

    newCode[index] = text.replace(/[^0-9]/g, '');
    setCode(newCode);

    // Auto-advance focus
    if (text && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const fullCode = code.join('');
    if (fullCode.length < 6) {
      setErrorMsg('Please enter all 6 digits of the code.');
      return;
    }

    if (!deviceMeta) return;

    setLoading(true);
    setErrorMsg('');

    const res = await otpService.verifyOtp(userId, deviceMeta.deviceId, fullCode);

    if (res.success) {
      // Mark device as trusted in Supabase DB
      await deviceService.markDeviceTrusted(userId, deviceMeta);
      showToast('Device verified and added to Trusted Devices!');
      setLoading(false);
      onSuccess();
    } else {
      setErrorMsg(res.errorMsg || 'Incorrect verification code.');
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!canResend || !deviceMeta) return;
    setLoading(true);
    setErrorMsg('');
    setCode(['', '', '', '', '', '']);
    setTimeLeft(300);
    setCanResend(false);

    try {
      await otpService.generateAndSendDeviceOtp(userId, deviceMeta);
      showToast('New verification code sent to Telegram!');
    } catch (err: any) {
      setErrorMsg('Failed to resend code to Telegram.');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={[styles.overlay, { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 20) }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <View style={styles.headerIcon}>
            <ShieldCheck size={36} color="#FFFC00" />
          </View>

          <Text style={styles.title}>Verify New Device</Text>
          <Text style={styles.subtitle}>We sent a 6-digit verification code to your Telegram account.</Text>

          {deviceMeta && (
            <View style={styles.deviceInfoBadge}>
              <Lock size={12} color="#8E8E93" style={{ marginRight: 4 }} />
              <Text style={styles.deviceInfoText}>
                {deviceMeta.deviceName} • {deviceMeta.browser} ({deviceMeta.platform})
              </Text>
            </View>
          )}

          {errorMsg !== '' && (
            <View style={styles.errorBanner}>
              <AlertTriangle size={16} color="#FF3B30" style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {/* 6 OTP Input Boxes */}
          <View style={styles.otpRow}>
            {code.map((digit, idx) => (
              <TextInput
                key={idx}
                ref={(el) => { inputRefs.current[idx] = el; }}
                style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                value={digit}
                onChangeText={(val) => handleInputChange(val, idx)}
                onKeyPress={(e) => handleKeyPress(e, idx)}
                keyboardType="number-pad"
                maxLength={6}
                selectTextOnFocus
              />
            ))}
          </View>

          <View style={styles.timerRow}>
            <Text style={styles.timerText}>
              {timeLeft > 0 ? `Code expires in: ${formatTime(timeLeft)}` : 'Verification code expired.'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.verifyBtn, (loading || code.join('').length < 6) && styles.verifyBtnDisabled]}
            onPress={handleVerify}
            disabled={loading || code.join('').length < 6}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <>
                <Send size={18} color="#000000" style={{ marginRight: 6 }} />
                <Text style={styles.verifyBtnText}>Verify Device</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.resendBtn, !canResend && styles.resendBtnDisabled]}
            onPress={handleResend}
            disabled={!canResend || loading}
          >
            <RefreshCw size={14} color={canResend ? '#FFFC00' : '#555'} style={{ marginRight: 6 }} />
            <Text style={[styles.resendBtnText, !canResend && { color: '#555' }]}>Resend Code</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 252, 0, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 252, 0, 0.25)',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  subtitle: {
    color: '#8E8E93',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
  },
  deviceInfoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 16,
  },
  deviceInfoText: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
  },
  otpBox: {
    width: 44,
    height: 52,
    backgroundColor: '#0F1123',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  otpBoxFilled: {
    borderColor: '#FFFC00',
    backgroundColor: 'rgba(255, 252, 0, 0.08)',
  },
  timerRow: {
    marginBottom: 20,
  },
  timerText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
  },
  verifyBtn: {
    flexDirection: 'row',
    width: '100%',
    height: 48,
    backgroundColor: '#FFFC00',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  verifyBtnDisabled: {
    opacity: 0.4,
  },
  verifyBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '800',
  },
  resendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  resendBtnDisabled: {
    opacity: 0.5,
  },
  resendBtnText: {
    color: '#FFFC00',
    fontSize: 13,
    fontWeight: '700',
  },
});
