import React, { useState, useEffect } from 'react';
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
import { Database, Trash2, HardDrive } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import AppButton from './AppButton';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const StorageManagerModal: React.FC<Props> = ({ visible, onClose }) => {
  const [cacheSize, setCacheSize] = useState<string>('Calculating...');
  const [loading, setLoading] = useState(false);

  const calculateCacheSize = async () => {
    if (Platform.OS === 'web') {
      setCacheSize('0.00 MB (Web Browser Cache)');
      return;
    }

    try {
      const files = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory!);
      let totalSize = 0;
      for (const file of files) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(`${FileSystem.cacheDirectory!}${file}`);
          if (fileInfo.exists) {
            totalSize += fileInfo.size;
          }
        } catch (_) {}
      }
      const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
      setCacheSize(`${sizeInMB} MB`);
    } catch (err) {
      console.warn('Failed to calculate cache size:', err);
      setCacheSize('Unknown');
    }
  };

  useEffect(() => {
    if (visible) {
      calculateCacheSize();
    }
  }, [visible]);

  const handleClearCache = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Information', 'Browser cache is managed by your web browser.');
      return;
    }

    setLoading(true);
    try {
      const files = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory!);
      let clearedCount = 0;
      for (const file of files) {
        try {
          await FileSystem.deleteAsync(`${FileSystem.cacheDirectory!}${file}`, { idempotent: true });
          clearedCount++;
        } catch (_) {}
      }
      Alert.alert('Cache Cleared', `Successfully cleaned up ${clearedCount} temporary cache files.`);
      calculateCacheSize();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to clear cache.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <HardDrive size={32} color="#FFFC00" />
          </View>

          <Text style={styles.title}>Storage & Cache Manager</Text>
          <Text style={styles.subtitle}>
            TeleVault caches decrypted documents, video previews, and image thumbnails locally for rapid offline loading.
          </Text>

          <View style={styles.statBox}>
            <Database size={20} color="#8E8E93" style={{ marginRight: 10 }} />
            <View>
              <Text style={styles.statLabel}>Local Cache Size</Text>
              <Text style={styles.statValue}>{cacheSize}</Text>
            </View>
          </View>

          <AppButton
            title="Clear Cache"
            onPress={handleClearCache}
            loading={loading}
            style={styles.clearBtn}
          />

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
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  statBox: {
    width: '100%',
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  statLabel: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '500',
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  clearBtn: {
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

export default StorageManagerModal;
