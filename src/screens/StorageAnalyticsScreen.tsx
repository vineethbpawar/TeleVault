import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { ArrowLeft, Database, Image as ImageIcon, Video, FileText, Shield, HardDrive, RefreshCw } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { fileService } from '../services/fileService';
import { telegramService, TelegramChannelConfig } from '../services/telegramService';
import { previewCacheService } from '../services/previewCacheService';
import Screen from '../components/Screen';

type Props = NativeStackScreenProps<AppStackParamList, 'StorageAnalytics'>;

export const StorageAnalyticsScreen: React.FC<Props> = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalCount: 0,
    totalSize: 0,
    photoCount: 0,
    photoSize: 0,
    videoCount: 0,
    videoSize: 0,
    docCount: 0,
    docSize: 0,
    privateCount: 0,
    privateSize: 0,
    publicCount: 0,
    publicSize: 0,
    cacheSize: 0,
  });

  const [channels, setChannels] = useState<TelegramChannelConfig[]>([]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      // 1. Fetch memories/files metadata
      const allFiles = await fileService.fetchMemories();
      
      let totalCount = 0;
      let totalSize = 0;
      let photoCount = 0;
      let photoSize = 0;
      let videoCount = 0;
      let videoSize = 0;
      let docCount = 0;
      let docSize = 0;
      let privateCount = 0;
      let privateSize = 0;
      let publicCount = 0;
      let publicSize = 0;

      allFiles.forEach((file) => {
        const size = Number(file.file_size || 0);
        totalCount++;
        totalSize += size;

        if (file.file_type === 'image') {
          photoCount++;
          photoSize += size;
        } else if (file.file_type === 'video') {
          videoCount++;
          videoSize += size;
        } else {
          docCount++;
          docSize += size;
        }

        if (file.is_private) {
          privateCount++;
          privateSize += size;
        } else {
          publicCount++;
          publicSize += size;
        }
      });

      // 2. Load channels stats
      const chansList = await telegramService.getChannelsList();
      setChannels(chansList);

      // 3. Approximate cache size (Platform specific check, on web it's in localStorage)
      let cacheSize = 0;
      try {
        const cacheUris = await previewCacheService.getCacheStats?.();
        cacheSize = cacheUris?.totalSize || 0;
      } catch (_) {
        // Fallback placeholder size if not supported on platform
        cacheSize = 1.2 * 1024 * 1024;
      }

      setStats({
        totalCount,
        totalSize,
        photoCount,
        photoSize,
        videoCount,
        videoSize,
        docCount,
        docSize,
        privateCount,
        privateSize,
        publicCount,
        publicSize,
        cacheSize,
      });

    } catch (err) {
      console.error('Failed to load storage analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getPercentage = (value: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  };

  return (
    <Screen edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.8}>
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Storage Analytics</Text>
        <TouchableOpacity onPress={loadAnalytics} style={styles.refreshBtn} activeOpacity={0.8}>
          <RefreshCw size={20} color="#FFFC00" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFFC00" />
          <Text style={styles.loadingText}>Compiling storage dashboards...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Main Storage Usage Card */}
          <View style={styles.dashboardCard}>
            <View style={styles.dashboardCardHeader}>
              <HardDrive size={24} color="#FFFC00" />
              <Text style={styles.dashboardCardTitle}>Telegram Storage Used</Text>
            </View>
            <Text style={styles.mainStorageText}>{formatSize(stats.totalSize)}</Text>
            <Text style={styles.mainStorageSub}>{stats.totalCount} Files Total</Text>

            {/* Segmented Progress Bar */}
            <View style={styles.segmentedProgress}>
              <View style={[styles.progressFill, { width: `${getPercentage(stats.photoSize, stats.totalSize)}%`, backgroundColor: '#FFFC00' }]} />
              <View style={[styles.progressFill, { width: `${getPercentage(stats.videoSize, stats.totalSize)}%`, backgroundColor: '#FF9500' }]} />
              <View style={[styles.progressFill, { width: `${getPercentage(stats.docSize, stats.totalSize)}%`, backgroundColor: '#007AFF' }]} />
            </View>
          </View>

          {/* Breakdown Categories */}
          <Text style={styles.sectionTitle}>Category Breakdown</Text>
          <View style={styles.listCard}>
            {/* Photos */}
            <View style={styles.categoryRow}>
              <View style={styles.categoryLeft}>
                <View style={[styles.categoryIconCircle, { backgroundColor: 'rgba(255, 252, 0, 0.1)' }]}>
                  <ImageIcon size={20} color="#FFFC00" />
                </View>
                <View>
                  <Text style={styles.categoryName}>Photos</Text>
                  <Text style={styles.categoryCount}>{stats.photoCount} files</Text>
                </View>
              </View>
              <View style={styles.categoryRight}>
                <Text style={styles.categorySize}>{formatSize(stats.photoSize)}</Text>
                <Text style={styles.categoryPercentage}>{getPercentage(stats.photoSize, stats.totalSize)}%</Text>
              </View>
            </View>

            {/* Videos */}
            <View style={styles.categoryRow}>
              <View style={styles.categoryLeft}>
                <View style={[styles.categoryIconCircle, { backgroundColor: 'rgba(255, 149, 0, 0.1)' }]}>
                  <Video size={20} color="#FF9500" />
                </View>
                <View>
                  <Text style={styles.categoryName}>Videos</Text>
                  <Text style={styles.categoryCount}>{stats.videoCount} files</Text>
                </View>
              </View>
              <View style={styles.categoryRight}>
                <Text style={styles.categorySize}>{formatSize(stats.videoSize)}</Text>
                <Text style={styles.categoryPercentage}>{getPercentage(stats.videoSize, stats.totalSize)}%</Text>
              </View>
            </View>

            {/* Documents */}
            <View style={styles.categoryRow}>
              <View style={styles.categoryLeft}>
                <View style={[styles.categoryIconCircle, { backgroundColor: 'rgba(0, 122, 255, 0.1)' }]}>
                  <FileText size={20} color="#007AFF" />
                </View>
                <View>
                  <Text style={styles.categoryName}>Documents</Text>
                  <Text style={styles.categoryCount}>{stats.docCount} files</Text>
                </View>
              </View>
              <View style={styles.categoryRight}>
                <Text style={styles.categorySize}>{formatSize(stats.docSize)}</Text>
                <Text style={styles.categoryPercentage}>{getPercentage(stats.docSize, stats.totalSize)}%</Text>
              </View>
            </View>
          </View>

          {/* Encryption Dashboard */}
          <Text style={styles.sectionTitle}>Privacy & Cryptography</Text>
          <View style={styles.listCard}>
            <View style={styles.categoryRow}>
              <View style={styles.categoryLeft}>
                <View style={[styles.categoryIconCircle, { backgroundColor: 'rgba(48, 209, 88, 0.1)' }]}>
                  <Shield size={20} color="#30D158" />
                </View>
                <View>
                  <Text style={styles.categoryName}>Zero-Knowledge E2EE</Text>
                  <Text style={styles.categoryCount}>{stats.privateCount} private files</Text>
                </View>
              </View>
              <View style={styles.categoryRight}>
                <Text style={styles.categorySize}>{formatSize(stats.privateSize)}</Text>
                <Text style={styles.categoryPercentage}>{getPercentage(stats.privateSize, stats.totalSize)}%</Text>
              </View>
            </View>

            <View style={styles.categoryRow}>
              <View style={styles.categoryLeft}>
                <View style={[styles.categoryIconCircle, { backgroundColor: 'rgba(142, 142, 147, 0.1)' }]}>
                  <Database size={20} color="#8E8E93" />
                </View>
                <View>
                  <Text style={styles.categoryName}>Public Storage</Text>
                  <Text style={styles.categoryCount}>{stats.publicCount} standard files</Text>
                </View>
              </View>
              <View style={styles.categoryRight}>
                <Text style={styles.categorySize}>{formatSize(stats.publicSize)}</Text>
                <Text style={styles.categoryPercentage}>{getPercentage(stats.publicSize, stats.totalSize)}%</Text>
              </View>
            </View>
          </View>

          {/* Backup Channels Load Balancing */}
          <Text style={styles.sectionTitle}>Telegram Bot channels</Text>
          {channels.length === 0 ? (
            <View style={styles.emptyChannelsCard}>
              <Text style={styles.emptyChannelsText}>No load balanced channels configured.</Text>
            </View>
          ) : (
            channels.map((chan) => (
              <View key={chan.id} style={styles.channelCard}>
                <View style={styles.channelCardHeader}>
                  <Text style={styles.channelName} numberOfLines={1}>{chan.name}</Text>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: chan.status === 'healthy' ? 'rgba(48, 209, 88, 0.1)' : 'rgba(255, 69, 58, 0.1)' }
                  ]}>
                    <Text style={[
                      styles.statusBadgeText,
                      { color: chan.status === 'healthy' ? '#30D158' : '#FF453A' }
                    ]}>
                      {chan.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.channelSubText}>ID: {chan.id}</Text>
                <View style={styles.channelStatsRow}>
                  <View>
                    <Text style={styles.channelStatLabel}>Uploaded</Text>
                    <Text style={styles.channelStatValue}>{chan.filesUploaded} files</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.channelStatLabel}>Size</Text>
                    <Text style={styles.channelStatValue}>{formatSize(chan.bytesUploaded)}</Text>
                  </View>
                </View>
              </View>
            ))
          )}

          {/* Local Cache Management */}
          <Text style={styles.sectionTitle}>Local Disk Cache</Text>
          <View style={styles.cacheCard}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.cacheTitle}>Temporary Cache</Text>
              <Text style={styles.cacheSubtitle}>Stores decrypted media copies for inline viewing.</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.cacheSizeText}>{formatSize(stats.cacheSize)}</Text>
              <TouchableOpacity
                onPress={async () => {
                  try {
                    await previewCacheService.clearCache?.();
                    Alert.alert('Success', 'Local preview caches cleared successfully.');
                    loadAnalytics();
                  } catch (_) {
                    Alert.alert('Error', 'Failed to clear cache.');
                  }
                }}
                style={styles.clearCacheBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.clearCacheBtnText}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}
    </Screen>
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
    borderBottomWidth: 1,
    borderColor: '#1C1C1E',
  },
  backBtn: {
    padding: 6,
    borderRadius: 16,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  refreshBtn: {
    padding: 6,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#8E8E93',
    fontSize: 14,
    marginTop: 12,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  dashboardCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    marginBottom: 20,
  },
  dashboardCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  dashboardCardTitle: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  mainStorageText: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '900',
  },
  mainStorageSub: {
    color: '#FFFC00',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
    marginBottom: 16,
  },
  segmentedProgress: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2C2C2E',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
    marginTop: 8,
  },
  listCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    overflow: 'hidden',
    marginBottom: 20,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#2C2C2E',
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  categoryCount: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
  },
  categoryRight: {
    alignItems: 'flex-end',
  },
  categorySize: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  categoryPercentage: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyChannelsCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyChannelsText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
  },
  channelCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    marginBottom: 12,
  },
  channelCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  channelName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  channelSubText: {
    color: '#8E8E93',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 12,
  },
  channelStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: '#2C2C2E',
    paddingTop: 10,
  },
  channelStatLabel: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  channelStatValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  cacheCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    marginBottom: 20,
  },
  cacheTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  cacheSubtitle: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  cacheSizeText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  clearCacheBtn: {
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  clearCacheBtnText: {
    color: '#FF453A',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default StorageAnalyticsScreen;
