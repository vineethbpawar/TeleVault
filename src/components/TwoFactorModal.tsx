import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, Modal, TextInput, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Shield, KeyRound, Check, RefreshCw, X, AlertTriangle } from 'lucide-react-native';
import { telegramService } from '../services/telegramService';
import { showToast } from './ToastBanner';

interface TwoFactorModalProps {
  visible: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

export const TwoFactorModal: React.FC<TwoFactorModalProps> = ({ visible, onSuccess, onCancel }) => {
  const [code, setCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const [canResend, setCanResend] = useState(false);

  const send2FACode = async () => {
    setSending(true);
    setErrorMsg('');
    try {
      const config = await telegramService.getTelegramConfig();
      if (!config.botToken || !config.channelId) {
        setErrorMsg('Telegram bot/channel is not connected in Settings.');
        setSending(false);
        return;
      }

      // Generate random 6-digit verification code
      const newCode = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedCode(newCode);

      const messageText = `🔐 *TeleVault 2FA Verification Code*\n\nYour login code is: ${newCode}\n\nValid for 5 minutes. Do not share this code with anyone.`;
      
      const url = telegramService.getTelegramApiUrl('sendMessage', config.botToken);
      const { fetchWithRetry } = require('../services/telegramService');
      const res = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.channelId,
          text: messageText,
          parse_mode: 'Markdown',
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        showToast('2FA code sent to Telegram!');
        setTimeLeft(60);
        setCanResend(false);
      } else {
        setErrorMsg(data.description || 'Failed to send code via Telegram bot.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error sending 2FA code.');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setCode('');
      send2FACode();
    }
  }, [visible]);

  useEffect(() => {
    let timer: any;
    if (visible && timeLeft > 0 && !canResend) {
      timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0) {
      setCanResend(true);
    }
    return () => clearTimeout(timer);
  }, [visible, timeLeft, canResend]);

  const handleVerify = () => {
    if (!code || code.trim().length !== 6) {
      setErrorMsg('Please enter the 6-digit code.');
      return;
    }

    setVerifying(true);
    if (code.trim() === generatedCode.trim()) {
      showToast('2FA verification successful!');
      setVerifying(false);
      onSuccess();
    } else {
      setErrorMsg('Invalid verification code. Please try again.');
      setVerifying(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.closeBtn} onPress={onCancel}>
            <X size={20} color="#8E8E93" />
          </TouchableOpacity>

          <View style={styles.headerIcon}>
            <Shield size={32} color="#FFFC00" />
          </View>

          <Text style={styles.title}>Telegram 2FA Security</Text>
          <Text style={styles.subtitle}>
            A 6-digit verification code has been sent to your connected Telegram channel.
          </Text>

          {errorMsg !== '' && (
            <View style={styles.errorBanner}>
              <AlertTriangle size={16} color="#FF3B30" style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          <View style={styles.inputContainer}>
            <KeyRound size={20} color="#8E8E93" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={(val) => {
                setCode(val);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="Enter 6-digit code"
              placeholderTextColor="#555"
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
          </View>

          <TouchableOpacity
            style={[styles.verifyBtn, (sending || verifying) && styles.disabledBtn]}
            onPress={handleVerify}
            disabled={sending || verifying}
          >
            {verifying ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <>
                <Check size={18} color="#000000" style={{ marginRight: 6 }} />
                <Text style={styles.verifyBtnText}>Verify & Proceed</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.resendRow}>
            {canResend ? (
              <TouchableOpacity style={styles.resendBtn} onPress={send2FACode} disabled={sending}>
                <RefreshCw size={14} color="#FFFC00" style={{ marginRight: 4 }} />
                <Text style={styles.resendText}>Resend 2FA Code</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.timerText}>Resend available in {timeLeft}s</Text>
            )}
          </View>
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
    height: 52,
    width: '100%',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    letterSpacing: 4,
    fontWeight: '700',
  },
  verifyBtn: {
    flexDirection: 'row',
    width: '100%',
    height: 50,
    backgroundColor: '#FFFC00',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  verifyBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '800',
  },
  resendRow: {
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resendText: {
    color: '#FFFC00',
    fontSize: 13,
    fontWeight: '600',
  },
  timerText: {
    color: '#666666',
    fontSize: 12,
  },
});

export default TwoFactorModal;
