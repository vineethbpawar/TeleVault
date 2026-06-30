import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { ArrowLeft, Trash2, Download, ExternalLink, FileText, Video, Eye } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { telegramService } from '../services/telegramService';
import { fileService } from '../services/fileService';

type Props = NativeStackScreenProps<AppStackParamList, 'FileDetails'>;

export const FileDetailsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { file } = route.params;
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTelegramUrl = async () => {
      if (!file.telegram_file_id) {
        setLoading(false);
        setError('Telegram File ID is missing.');
        return;
      }

      try {
        const config = await telegramService.getTelegramConfig();
        if (!config.botToken) {
          throw new Error('Telegram bot token is not configured.');
        }

        const res = await fetch(`https://api.telegram.org/bot${config.botToken}/getFile?file_id=${file.telegram_file_id}`);
        const data = await res.json();

        if (res.ok && data.ok) {
          const filePath = data.result.file_path;
          const url = `https://api.telegram.org/file/bot${config.botToken}/${filePath}`;
          setMediaUrl(url);
        } else {
          throw new Error(data.description || 'Failed to locate file on Telegram.');
        }
      } catch (err: any) {
        console.error('File url fetch error:', err);
        setError(err.message || 'Could not fetch file download link.');
      } finally {
        setLoading(false);
      }
    };

    fetchTelegramUrl();
  }, [file.telegram_file_id]);

  const handleDelete = () => {
    Alert.alert(
      'Delete File Metadata',
      'Are you sure you want to delete this file from your TeleVault? The file will remain on your private Telegram channel, but it will be removed from your app drive.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await fileService.deleteFileMetadata(file.id);
              Alert.alert('Success', 'File removed from TeleVault.', [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete file.');
            }
          },
        },
      ]
    );
  };

  const handleOpenInBrowser = () => {
    if (mediaUrl) {
      Linking.openURL(mediaUrl);
    } else {
      Alert.alert('Unavailable', 'Download URL is not ready yet.');
    }
  };

  const formatSize = (bytes: number | null): string => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString();
    } catch (_) {
      return '';
    }
  };

  const renderPreview = () => {
    if (loading) {
      return (
        <View style={styles.previewPlaceholder}>
          <ActivityIndicator size="large" color="#FFFC00" />
          <Text style={styles.placeholderText}>Loading media preview...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.previewPlaceholder}>
          <FileText size={48} color="#FF453A" />
          <Text style={[styles.placeholderText, { color: '#FF453A', marginTop: 12 }]}>{error}</Text>
        </View>
      );
    }

    if (file.file_type === 'image' && mediaUrl) {
      return (
        <Image
          source={{ uri: mediaUrl }}
          style={styles.fullImage}
          resizeMode="contain"
        />
      );
    }

    if (file.file_type === 'video') {
      return (
        <View style={styles.previewPlaceholder}>
          <Video size={56} color="#FFFC00" />
          <Text style={styles.placeholderText}>Video Storage Secure</Text>
          <TouchableOpacity style={styles.playButton} onPress={handleOpenInBrowser}>
            <Text style={styles.playButtonText}>Play Video External</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.previewPlaceholder}>
        <FileText size={56} color="#007AFF" />
        <Text style={styles.placeholderText}>Document Storage Secure</Text>
        <Text style={styles.docSubtitle}>{file.file_name}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Details
        </Text>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Trash2 size={22} color="#FF453A" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Media Preview Box */}
        <View style={styles.previewWrapper}>{renderPreview()}</View>

        {/* Media Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionBtn, !mediaUrl && styles.disabledBtn]}
            onPress={handleOpenInBrowser}
            disabled={!mediaUrl}
          >
            <ExternalLink size={20} color="#000000" />
            <Text style={styles.actionBtnText}>Open / Download</Text>
          </TouchableOpacity>
        </View>

        {/* Metadata Details Card */}
        <View style={styles.detailsCard}>
          <Text style={styles.cardTitle}>Metadata Details</Text>

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Name</Text>
            <Text style={styles.metaValue}>{file.file_name}</Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Type</Text>
            <Text style={styles.metaValue}>{file.file_type.toUpperCase()}</Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Mime Type</Text>
            <Text style={styles.metaValue}>{file.mime_type || 'Unknown'}</Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>File Size</Text>
            <Text style={styles.metaValue}>{formatSize(file.file_size)}</Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Privacy</Text>
            <Text style={[styles.metaValue, file.is_private && { color: '#FF453A', fontWeight: 'bold' }]}>
              {file.is_private ? 'PRIVATE VAULT' : 'PUBLIC'}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Uploaded At</Text>
            <Text style={styles.metaValue}>{formatDate(file.uploaded_at)}</Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Telegram Msg ID</Text>
            <Text style={styles.metaValue} numberOfLines={1}>{file.telegram_message_id || 'N/A'}</Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Telegram File ID</Text>
            <Text style={styles.metaValue} numberOfLines={1}>{file.telegram_file_id || 'N/A'}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#1E1E1E',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  deleteButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  previewWrapper: {
    width: '100%',
    height: 300,
    borderRadius: 24,
    backgroundColor: '#121212',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  previewPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  placeholderText: {
    color: '#8E8E93',
    fontSize: 15,
    marginTop: 16,
    fontWeight: '600',
  },
  playButton: {
    marginTop: 20,
    backgroundColor: '#FFFC00',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  playButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  docSubtitle: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  actionsContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFC00',
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 24,
    width: '100%',
  },
  disabledBtn: {
    opacity: 0.5,
    backgroundColor: '#8E8E93',
  },
  actionBtnText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 15,
    marginLeft: 8,
  },
  detailsCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderColor: '#2C2C2E',
    paddingBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderColor: 'rgba(44, 44, 46, 0.5)',
  },
  metaLabel: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
    width: '35%',
  },
  metaValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    width: '60%',
    textAlign: 'right',
  },
});

export default FileDetailsScreen;
