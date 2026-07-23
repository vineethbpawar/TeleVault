import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  Clipboard,
  Platform,
} from 'react-native';
import { Share2, Clock, Check, Copy, Link } from 'lucide-react-native';
import { telegramService } from '../services/telegramService';
import { encryptionService } from '../services/encryptionService';
import * as FileSystem from 'expo-file-system/legacy';
import AppButton from './AppButton';
import { TeleVaultFile } from '../types/file';

interface Props {
  visible: boolean;
  file: TeleVaultFile | null;
  onClose: () => void;
}

type ExpiryOption = '5m' | '1h' | '1d' | '1download';

export const ShareLinkModal: React.FC<Props> = ({ visible, file, onClose }) => {
  const [expiry, setExpiry] = useState<ExpiryOption>('1h');
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (visible) {
      setShareUrl('');
      setCopied(false);
      setLoading(false);
      setLoadingStage('');
    }
  }, [visible]);

  const handleGenerateLink = async () => {
    if (!file) return;

    setLoading(true);
    setLoadingStage('Downloading from cloud...');

    let cachedUri: string | null = null;
    let decryptedUri: string | null = null;

    try {
      // 1. Download file from Telegram
      if (!file.telegram_file_id) {
        throw new Error('Telegram file ID is missing.');
      }
      cachedUri = await telegramService.downloadTelegramFileToCache(file.telegram_file_id, file.file_name);

      // 2. Decrypt file if it is private/encrypted
      setLoadingStage('Decrypting file...');
      if (file.is_private) {
        decryptedUri = await encryptionService.decryptFile(cachedUri, file.file_name, file.mime_type, file.is_private);
      } else {
        decryptedUri = cachedUri;
      }

      // 3. Upload to file.io
      setLoadingStage('Uploading to secure ephemeral server...');
      const formData = new FormData();
      
      if (Platform.OS === 'web') {
        const fetchRes = await fetch(decryptedUri);
        const blob = await fetchRes.blob();
        formData.append('file', blob, file.file_name);
      } else {
        formData.append('file', {
          uri: decryptedUri,
          name: file.file_name,
          type: file.mime_type || 'application/octet-stream',
        } as any);
      }

      if (expiry === '1download') {
        formData.append('maxDownloads', '1');
      } else {
        formData.append('expiry', expiry);
      }

      const uploadResponse = await fetch('https://file.io', {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
        },
      });

      const result = await uploadResponse.json();
      if (result.success) {
        setShareUrl(result.link);
      } else {
        throw new Error(result.message || 'Failed to generate expiring link.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to generate link.');
    } finally {
      setLoading(false);
      setLoadingStage('');

      // Cleanup temporary decrypted file if created
      if (decryptedUri && decryptedUri !== cachedUri && Platform.OS !== 'web') {
        try {
          await FileSystem.deleteAsync(decryptedUri, { idempotent: true });
        } catch (_) {}
      }
    }
  };

  const handleCopyLink = () => {
    Clipboard.setString(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Here is a secure self-destructing file link: ${shareUrl}`,
      });
    } catch (_) {}
  };

  if (!file) return null;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Share2 size={32} color="#FFFC00" />
          </View>

          <Text style={styles.title}>Self-Destructing Share Link</Text>
          <Text style={styles.subtitle}>
            Decrypts and uploads <Text style={styles.bold}>{file.file_name}</Text> to a temporary, secure server.
          </Text>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#FFFC00" />
              <Text style={styles.loadingText}>{loadingStage}</Text>
            </View>
          ) : shareUrl ? (
            <View style={styles.resultBox}>
              <View style={styles.urlInput}>
                <Link size={18} color="#8E8E93" style={{ marginRight: 8 }} />
                <Text style={styles.urlText} numberOfLines={1}>
                  {shareUrl}
                </Text>
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={handleCopyLink}>
                  {copied ? (
                    <Check size={20} color="#30D158" />
                  ) : (
                    <Copy size={20} color="#FFFFFF" />
                  )}
                  <Text style={[styles.actionBtnText, copied && { color: '#30D158' }]}>
                    {copied ? 'Copied' : 'Copy'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
                  <Share2 size={20} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.label}>Link Expiration Target</Text>
              <View style={styles.optionsRow}>
                {(['5m', '1h', '1d', '1download'] as ExpiryOption[]).map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.optionBtn, expiry === opt && styles.optionBtnActive]}
                    onPress={() => setExpiry(opt)}
                  >
                    <Clock size={14} color={expiry === opt ? '#000000' : '#8E8E93'} style={{ marginRight: 4 }} />
                    <Text style={[styles.optionBtnText, expiry === opt && styles.optionBtnTextActive]}>
                      {opt === '5m'
                        ? '5 Mins'
                        : opt === '1h'
                        ? '1 Hour'
                        : opt === '1d'
                        ? '1 Day'
                        : '1 View'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <AppButton
                title="Generate Secure Link"
                onPress={handleGenerateLink}
                style={styles.submitBtn}
              />
            </View>
          )}

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={loading}>
            <Text style={styles.cancelBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 360,
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
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  bold: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  form: {
    width: '100%',
  },
  label: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 8,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    minWidth: '45%',
    justifyContent: 'center',
  },
  optionBtnActive: {
    backgroundColor: '#FFFC00',
    borderColor: '#FFFC00',
  },
  optionBtnText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
  },
  optionBtnTextActive: {
    color: '#000000',
  },
  submitBtn: {
    width: '100%',
  },
  cancelBtn: {
    marginTop: 20,
    paddingVertical: 8,
  },
  cancelBtnText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingBox: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  loadingText: {
    color: '#8E8E93',
    fontSize: 14,
    marginTop: 14,
    textAlign: 'center',
  },
  resultBox: {
    width: '100%',
    alignItems: 'center',
  },
  urlInput: {
    width: '100%',
    height: 50,
    backgroundColor: '#000000',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  urlText: {
    color: '#30D158',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default ShareLinkModal;
