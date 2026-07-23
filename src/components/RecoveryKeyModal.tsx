import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { ShieldAlert, Download, Key } from 'lucide-react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import AppInput from './AppInput';
import AppButton from './AppButton';
import { securityService } from '../services/securityService';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const RecoveryKeyModal: React.FC<Props> = ({ visible, onClose }) => {
  const [passphrase, setPassphrase] = useState('');
  const [loading, setLoading] = useState(false);

  const handleExportPDF = async () => {
    const trimmed = passphrase.trim();
    if (!trimmed) {
      Alert.alert('Required', 'Please enter your Vault Passphrase to verify ownership.');
      return;
    }

    setLoading(true);
    try {
      // 1. Verify passphrase by attempting to match verification token
      const verified = await securityService.unlockVault(trimmed);
      if (!verified) {
        throw new Error('Incorrect Vault Passphrase. Please try again.');
      }

      // 2. Derive master recovery key representation using PBKDF2
      const { encryptionService } = require('../services/encryptionService');
      const keyObj = await encryptionService.deriveKeyFromPassword(trimmed);
      const derivedKey = keyObj ? keyObj.toString() : 'Failed to derive key';

      // 3. Construct print-optimized HTML Certificate
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
              color: #000000;
              padding: 40px;
              background-color: #FFFFFF;
            }
            .border-wrap {
              border: 4px solid #FFFC00;
              padding: 30px;
              border-radius: 12px;
            }
            .header {
              text-align: center;
              margin-bottom: 40px;
            }
            .logo {
              font-size: 28px;
              font-weight: 800;
              color: #000000;
              background-color: #FFFC00;
              display: inline-block;
              padding: 8px 24px;
              border-radius: 8px;
              margin-bottom: 12px;
            }
            .title {
              font-size: 22px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .subtitle {
              color: #666666;
              font-size: 14px;
              margin-top: 5px;
            }
            .card {
              background-color: #F8F9FA;
              border: 1px solid #E9ECEF;
              border-radius: 8px;
              padding: 24px;
              margin-bottom: 30px;
            }
            .card-title {
              font-size: 11px;
              font-weight: 800;
              color: #6C757D;
              text-transform: uppercase;
              letter-spacing: 1.5px;
              margin-bottom: 8px;
            }
            .key-value {
              font-family: 'Courier New', Courier, monospace;
              font-size: 16px;
              font-weight: 700;
              word-break: break-all;
              background-color: #E9ECEF;
              padding: 12px;
              border-radius: 6px;
              color: #1A1D20;
            }
            .warning-box {
              border-left: 4px solid #DC3545;
              background-color: #FFF8F8;
              padding: 16px;
              border-radius: 0 8px 8px 0;
              margin-bottom: 30px;
            }
            .warning-title {
              color: #DC3545;
              font-weight: 700;
              font-size: 14px;
              margin-bottom: 4px;
            }
            .warning-text {
              color: #555555;
              font-size: 12px;
              line-height: 18px;
            }
            .footer-note {
              text-align: center;
              font-size: 11px;
              color: #888888;
              margin-top: 50px;
            }
          </style>
        </head>
        <body>
          <div class="border-wrap">
            <div class="header">
              <div class="logo">TELEVAULT</div>
              <div class="title">Zero-Knowledge Recovery Sheet</div>
              <div class="subtitle">Store this document offline in a highly secure, private location.</div>
            </div>

            <div class="warning-box">
              <div class="warning-title">CRITICAL SECURITY WARNING</div>
              <div class="warning-text">
                TeleVault is a zero-knowledge encrypted vault app. Your recovery credentials are only known to you.
                If you forget your passphrase and lose this sheet, Vineeth's developer team and Supabase CANNOT recover your private files.
                All data in your private folder will be permanently lost.
              </div>
            </div>

            <div class="card">
              <div class="card-title">My Vault Passphrase</div>
              <div class="key-value">${passphrase}</div>
            </div>

            <div class="card">
              <div class="card-title">Derived AES-256 Master Key (Hex)</div>
              <div class="key-value">${derivedKey}</div>
            </div>

            <div class="footer-note">
              Generated securely on-device by TeleVault Client Cryptography Engine. © 2026 TeleVault. All rights reserved.
            </div>
          </div>
        </body>
        </html>
      `;

      // 4. Generate PDF file
      const { uri } = await Print.printToFileAsync({ html: htmlContent });

      // 5. Trigger OS Share sheet to export PDF
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Export TeleVault Recovery Key',
        UTI: 'com.adobe.pdf',
      });

      setPassphrase('');
      onClose();
    } catch (err: any) {
      Alert.alert('Export Failed', err.message || 'An error occurred during export.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <ShieldAlert size={32} color="#FFFC00" />
          </View>

          <Text style={styles.title}>Export Recovery Certificate</Text>
          <Text style={styles.subtitle}>
            Enter your Vault Passphrase to generate a printable PDF copy of your cryptographic master keys.
          </Text>

          <AppInput
            placeholder="Vault Passphrase"
            value={passphrase}
            onChangeText={setPassphrase}
            secureTextEntry
            style={styles.input}
          />

          <View style={styles.warningCard}>
            <Key size={16} color="#FF3B30" style={{ marginRight: 8, marginTop: 2 }} />
            <Text style={styles.warningCardText}>
              Do NOT store this PDF in unencrypted cloud services (such as raw email attachments or generic notes app).
            </Text>
          </View>

          <AppButton
            title="Generate & Export PDF"
            onPress={handleExportPDF}
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
  },
  input: {
    width: '100%',
    marginBottom: 16,
  },
  warningCard: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.2)',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
    width: '100%',
  },
  warningCardText: {
    color: '#FF3B30',
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  submitBtn: {
    width: '100%',
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

export default RecoveryKeyModal;
