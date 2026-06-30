import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Alert,
  Dimensions,
} from 'react-native';
import { ArrowLeft, Send, HardDrive, Lock, Image as ImageIcon } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { telegramService } from '../services/telegramService';
import { fileService } from '../services/fileService';
import UploadProgress from '../components/UploadProgress';

type Props = NativeStackScreenProps<AppStackParamList, 'Preview'>;

const { width } = Dimensions.get('window');

const FILTERS = [
  { name: 'Normal', color: 'transparent' },
  { name: 'Warm', color: 'rgba(255, 160, 0, 0.15)' },
  { name: 'Cool', color: 'rgba(0, 120, 255, 0.15)' },
  { name: 'Bright', color: 'rgba(255, 255, 255, 0.15)' },
  { name: 'Vintage', color: 'rgba(139, 69, 19, 0.2)' },
  { name: 'Moody', color: 'rgba(0, 0, 0, 0.35)' },
];

export const PreviewScreen: React.FC<Props> = ({ navigation, route }) => {
  const { uri, type, fromGallery } = route.params;
  const [selectedFilter, setSelectedFilter] = useState(FILTERS[0]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');

  const handleUpload = async (destination: 'memories' | 'drive' | 'private_drive') => {
    // 1. Verify Telegram configuration first
    try {
      const config = await telegramService.getTelegramConfig();
      if (!config.botToken || !config.channelId) {
        Alert.alert(
          'Storage Sync Required',
          'You need to configure your Telegram Bot and Channel details first.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Configure Now',
              onPress: () => navigation.navigate('TelegramConnect', { fromSettings: false }),
            },
          ]
        );
        return;
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to check sync credentials.');
      return;
    }

    setUploading(true);
    setUploadMsg('Uploading media to Telegram cloud...');

    const timestamp = Date.now();
    const extension = type === 'video' ? 'mp4' : 'jpg';
    const fileName = `TV_${destination.toUpperCase()}_${timestamp}.${extension}`;
    const mimeType = type === 'video' ? 'video/mp4' : 'image/jpeg';

    try {
      // 2. Upload to Telegram
      const telegramResult = await telegramService.uploadToTelegram(
        uri,
        type,
        fileName,
        mimeType
      );

      setUploadMsg('Saving metadata to Supabase...');

      // 3. Save to Supabase
      const isPrivate = destination === 'private_drive';
      const isDriveFile = destination !== 'memories';

      await fileService.saveFileMetadata({
        folder_id: null, // Root folder by default
        file_name: fileName,
        file_type: type,
        mime_type: mimeType,
        file_size: null, // Handled inside telegramService but can be null in table
        is_private: isPrivate,
        is_drive_file: isDriveFile,
        telegram_message_id: telegramResult.telegramMessageId,
        telegram_file_id: telegramResult.telegramFileId,
        telegram_file_unique_id: telegramResult.telegramFileUniqueId,
        local_thumbnail_uri: type === 'image' ? uri : null,
      });

      Alert.alert('Success', 'Media uploaded and secured successfully!', [
        {
          text: 'OK',
          onPress: () => {
            if (destination === 'memories') {
              navigation.replace('Main', { screen: 'MemoriesTab' });
            } else if (destination === 'private_drive') {
              navigation.replace('Main', { screen: 'PrivateDriveTab' });
            } else {
              navigation.replace('Main', { screen: 'DriveTab' });
            }
          },
        },
      ]);
    } catch (error: any) {
      console.error('Upload flow error:', error);
      Alert.alert('Upload Failed', error.message || 'An error occurred during upload.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <UploadProgress visible={uploading} message={uploadMsg} />

      {/* Header back button */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Preview</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Main Media Preview */}
      <View style={styles.previewContainer}>
        {type === 'image' ? (
          <Image source={{ uri }} style={styles.media} resizeMode="contain" />
        ) : (
          <View style={styles.videoPlaceholder}>
            <Image source={{ uri }} style={[styles.media, { opacity: 0.5 }]} resizeMode="contain" />
            <View style={styles.playIconCircle}>
              <Text style={styles.playText}>▶</Text>
            </View>
          </View>
        )}
        {/* Filter overlay */}
        <View style={[styles.filterOverlay, { backgroundColor: selectedFilter.color }]} pointerEvents="none" />
      </View>

      {/* Filter Horizontal Selector */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Swipe Filter</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {FILTERS.map((filter) => (
            <TouchableOpacity
              key={filter.name}
              style={[
                styles.filterItem,
                selectedFilter.name === filter.name && styles.selectedFilterItem,
              ]}
              onPress={() => setSelectedFilter(filter)}
            >
              <View style={[styles.filterPreview, { backgroundColor: filter.color }]} />
              <Text style={styles.filterName}>{filter.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleUpload('memories')}
          activeOpacity={0.8}
        >
          <View style={[styles.iconCircle, { backgroundColor: '#FFFC00' }]}>
            <ImageIcon size={22} color="#000000" />
          </View>
          <Text style={styles.actionText}>Save Memories</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleUpload('drive')}
          activeOpacity={0.8}
        >
          <View style={[styles.iconCircle, { backgroundColor: '#1E1E1E', borderColor: '#2C2C2E', borderWidth: 1 }]}>
            <HardDrive size={22} color="#FFFFFF" />
          </View>
          <Text style={styles.actionText}>Save Drive</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleUpload('private_drive')}
          activeOpacity={0.8}
        >
          <View style={[styles.iconCircle, { backgroundColor: '#1E1E1E', borderColor: '#FF453A', borderWidth: 1 }]}>
            <Lock size={22} color="#FF453A" />
          </View>
          <Text style={[styles.actionText, { color: '#FF453A' }]}>Private Drive</Text>
        </TouchableOpacity>
      </View>
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  previewContainer: {
    flex: 1,
    marginVertical: 16,
    marginHorizontal: 16,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  filterOverlay: {
    ...StyleSheet.absoluteFill,
  },
  videoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIconCircle: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  playText: {
    color: '#FFFFFF',
    fontSize: 24,
    marginLeft: 4,
  },
  filterSection: {
    marginBottom: 20,
  },
  filterLabel: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 20,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
  },
  filterItem: {
    alignItems: 'center',
    marginRight: 16,
    width: 64,
  },
  selectedFilterItem: {
    transform: [{ scale: 1.05 }],
  },
  filterPreview: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2C2C2E',
    marginBottom: 6,
    backgroundColor: '#1E1E1E',
  },
  filterName: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '500',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  actionButton: {
    alignItems: 'center',
    width: 100,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default PreviewScreen;
