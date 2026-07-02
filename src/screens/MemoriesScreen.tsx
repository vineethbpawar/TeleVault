import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  FlatList,
  Image,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Alert,
  AppState,
  AppStateStatus,
} from 'react-native';
import { Search, Image as ImageIcon, Video, Calendar, Star, Lock, Eye, AlertTriangle } from 'lucide-react-native';
import { CompositeScreenProps, useIsFocused } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, AppStackParamList } from '../types/navigation';
import { fileService } from '../services/fileService';
import { securityService } from '../services/securityService';
import { supabase } from '../lib/supabase';
import { TeleVaultFile } from '../types/file';
import EmptyState from '../components/EmptyState';
import PinLockModal from '../components/PinLockModal';
import AppCard from '../components/AppCard';
import { previewCacheService } from '../services/previewCacheService';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'MemoriesTab'>,
  NativeStackScreenProps<AppStackParamList>
>;

const { width } = Dimensions.get('window');
const GRID_SIZE = (width - 48) / 3;

interface GroupedMemories {
  title: string;
  data: TeleVaultFile[];
}

const MemoryGridItem: React.FC<{ item: TeleVaultFile; onPress: () => void }> = ({ item, onPress }) => {
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const resolve = async () => {
      setLoading(true);
      setError(false);
      try {
        const uri = await previewCacheService.resolvePreviewForFile({
          id: item.id,
          local_uri: item.local_thumbnail_uri,
          telegram_file_id: item.telegram_file_id,
        });
        if (active) {
          if (uri) {
            setResolvedUri(uri);
          } else {
            setError(true);
          }
        }
      } catch (err) {
        console.error('Error resolving memory preview:', err);
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };

    resolve();

    return () => {
      active = false;
    };
  }, [item.id, item.local_thumbnail_uri, item.telegram_file_id]);

  const isVideo = item.file_type === 'video';

  return (
    <TouchableOpacity
      style={styles.gridItem}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {loading ? (
        <View style={[styles.placeholderGrid, styles.skeletonBg]}>
          <ActivityIndicator size="small" color="#FFFC00" />
        </View>
      ) : error || !resolvedUri ? (
        <View style={[styles.placeholderGrid, styles.errorBg]}>
          {isVideo ? (
            <Video size={24} color="#8E8E93" />
          ) : (
            <ImageIcon size={24} color="#8E8E93" />
          )}
        </View>
      ) : (
        <Image 
          source={{ uri: resolvedUri }} 
          style={styles.gridImage as any} 
          onError={() => {
            previewCacheService.resolvePreviewForFile({
              id: item.id,
              local_uri: item.local_thumbnail_uri,
              telegram_file_id: item.telegram_file_id,
            }, true).then(refreshedUri => {
              if (refreshedUri) {
                setResolvedUri(refreshedUri);
              } else {
                setError(true);
              }
            }).catch(() => setError(true));
          }}
        />
      )}
      {isVideo && (
        <View style={styles.videoBadge}>
          <Text style={styles.videoBadgeText}>▶</Text>
        </View>
      )}
      {item.is_favorite && (
        <View style={styles.starBadge}>
          <Star size={10} color="#FFFC00" fill="#FFFC00" />
        </View>
      )}
    </TouchableOpacity>
  );
};

const OnThisDayGridItem: React.FC<{ item: TeleVaultFile; onPress: () => void }> = ({ item, onPress }) => {
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const resolve = async () => {
      setLoading(true);
      setError(false);
      try {
        const uri = await previewCacheService.resolvePreviewForFile({
          id: item.id,
          local_uri: item.local_thumbnail_uri,
          telegram_file_id: item.telegram_file_id,
        });
        if (active) {
          if (uri) {
            setResolvedUri(uri);
          } else {
            setError(true);
          }
        }
      } catch (err) {
        console.error('Error resolving memory preview:', err);
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };

    resolve();

    return () => {
      active = false;
    };
  }, [item.id, item.local_thumbnail_uri, item.telegram_file_id]);

  return (
    <TouchableOpacity
      style={styles.onThisDayCard}
      onPress={onPress}
    >
      {loading ? (
        <View style={[styles.onThisDayPlaceholder, styles.skeletonBg]}>
          <ActivityIndicator size="small" color="#FFFC00" />
        </View>
      ) : error || !resolvedUri ? (
        <View style={styles.onThisDayPlaceholder}>
          <Calendar size={24} color="#8E8E93" />
        </View>
      ) : (
        <Image 
          source={{ uri: resolvedUri }} 
          style={styles.onThisDayImg as any} 
          onError={() => {
            previewCacheService.resolvePreviewForFile({
              id: item.id,
              local_uri: item.local_thumbnail_uri,
              telegram_file_id: item.telegram_file_id,
            }, true).then(refreshedUri => {
              if (refreshedUri) {
                setResolvedUri(refreshedUri);
              } else {
                setError(true);
              }
            }).catch(() => setError(true));
          }}
        />
      )}
      <View style={styles.onThisDayOverlay}>
        <Text style={styles.onThisDayYear}>{new Date(item.created_at).getFullYear()}</Text>
        <Text style={styles.onThisDayCaption} numberOfLines={1}>{item.caption || item.file_name}</Text>
      </View>
    </TouchableOpacity>
  );
};

export const MemoriesScreen: React.FC<Props> = ({ navigation }) => {
  const [files, setFiles] = useState<TeleVaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Tabs: all, image, video, favorites, private
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video' | 'favorites' | 'private'>('all');
  
  // Pin Lock Modal for Private Memories
  const [pinVisible, setPinVisible] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);

  const isFocused = useIsFocused();

  const loadMemories = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      let data = await fileService.fetchMemories();
      
      // If private mode is active and unlocked, load private memories
      if (filterType === 'private' && isUnlocked) {
        // Fetch files where is_private = true, is_drive_file = false
        const { data: privData, error } = await supabase
          .from('files')
          .select('*')
          .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
          .eq('is_private', true)
          .eq('is_drive_file', false)
          .order('created_at', { ascending: false });
        if (!error && privData) {
          data = privData as TeleVaultFile[];
        }
      }
      setFiles(data);
    } catch (error) {
      console.error('Failed to load memories:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      if (filterType === 'private' && !isUnlocked) {
        checkPrivateAccess();
      } else {
        loadMemories(true);
      }
    }

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && isFocused) {
        loadMemories(false);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isFocused, filterType, isUnlocked]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadMemories(false);
  }, [filterType, isUnlocked]);

  const checkPrivateAccess = async () => {
    const hasPin = await securityService.hasPin();
    if (!hasPin) {
      Alert.alert(
        'PIN Setup Required',
        'Please set up a security PIN in settings to lock your private memories.',
        [
          { text: 'Cancel', onPress: () => setFilterType('all'), style: 'cancel' },
          { text: 'Go to Settings', onPress: () => navigation.navigate('Main', { screen: 'SettingsTab' } as any) }
        ]
      );
      return;
    }
    setPinVisible(true);
  };

  const handlePinSuccess = () => {
    setPinVisible(false);
    setIsUnlocked(true);
  };

  const handlePinClose = () => {
    setPinVisible(false);
    setFilterType('all');
  };

  const getFilteredFiles = () => {
    return files.filter((file) => {
      const matchesSearch = file.file_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (file.caption && file.caption.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesType = 
        filterType === 'all' || 
        filterType === 'private' || // Private filters loaded separately
        (filterType === 'image' && file.file_type === 'image') ||
        (filterType === 'video' && file.file_type === 'video') ||
        (filterType === 'favorites' && file.is_favorite === true);
      
      return matchesSearch && matchesType;
    });
  };

  // "On This Day" filtering: memories uploaded on this calendar date in any past year
  const getOnThisDayMemories = () => {
    const todayMonth = new Date().getMonth();
    const todayDate = new Date().getDate();
    const currentYear = new Date().getFullYear();

    return files.filter((file) => {
      const fileDate = new Date(file.created_at);
      const isPastYear = fileDate.getFullYear() < currentYear;
      const isSameDayMonth = fileDate.getMonth() === todayMonth && fileDate.getDate() === todayDate;
      return isPastYear && isSameDayMonth;
    });
  };

  const getGroupedMemories = () => {
    const filtered = getFilteredFiles();
    const sections: Record<string, TeleVaultFile[]> = {};

    filtered.forEach((file) => {
      // Group by Date string (e.g., July 1, 2026)
      const dateString = new Date(file.created_at).toLocaleDateString([], {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      if (!sections[dateString]) {
        sections[dateString] = [];
      }
      sections[dateString].push(file);
    });

    return Object.keys(sections).map((title) => ({
      title,
      data: sections[title],
    }));
  };

  const renderGridItem = ({ item }: { item: TeleVaultFile }) => {
    return (
      <MemoryGridItem
        item={item}
        onPress={() => navigation.navigate('FileDetails', { file: item })}
      />
    );
  };

  const groupedData = getGroupedMemories();
  const onThisDayData = getOnThisDayMemories();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerMainRow}>
          <Text style={styles.headerTitle}>Memories</Text>
          <Text style={styles.headerCountBadge}>
            {files.length === 1 ? '1 Memory' : `${files.length} Memories`}
          </Text>
        </View>
        <Text style={styles.headerSubCountText}>
          {files.filter(f => f.file_type === 'image').length} Photos • {files.filter(f => f.file_type === 'video').length} Videos • {files.filter(f => f.is_favorite === true).length} Favorites
        </Text>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Search size={18} color="#8e92af" style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search memories or captions..."
            placeholderTextColor="#8e92af"
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabsWrapper}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={['all', 'image', 'video', 'favorites', 'private'] as const}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.filterTabs}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.filterTab, filterType === item && styles.activeFilterTab]}
              onPress={() => {
                if (item !== 'private') {
                  setIsUnlocked(false);
                }
                setFilterType(item);
              }}
            >
              {item === 'favorites' && <Star size={13} color={filterType === item ? '#000000' : '#8e92af'} style={{ marginRight: 4 }} />}
              {item === 'private' && <Lock size={13} color={filterType === item ? '#000000' : '#8e92af'} style={{ marginRight: 4 }} />}
              <Text style={[styles.filterTabText, filterType === item && styles.activeFilterTabText]}>
                {item === 'all' ? 'All' : item === 'image' ? 'Photos' : item === 'video' ? 'Videos' : item === 'favorites' ? 'Favorites' : 'Private'}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* On This Day Carousel */}
      {filterType !== 'private' && onThisDayData.length > 0 && (
        <View style={styles.onThisDaySection}>
          <Text style={styles.sectionHeaderTitle}>ON THIS DAY...</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={onThisDayData}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.onThisDayList}
            renderItem={({ item }) => (
              <OnThisDayGridItem
                item={item}
                onPress={() => navigation.navigate('FileDetails', { file: item })}
              />
            )}
          />
        </View>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : groupedData.length === 0 ? (
        <FlatList
          data={[]}
          renderItem={null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFC00" />}
          ListEmptyComponent={
            <EmptyState
              title={filterType === 'private' ? 'Private Vault Empty' : 'No Memories Found'}
              description={filterType === 'private' ? 'Store your files privately to secure them here behind your lock.' : 'Capture snaps or select media from the camera preview to add memories.'}
            />
          }
        />
      ) : (
        <FlatList
          data={groupedData}
          keyExtractor={(item) => item.title}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFC00" />}
          renderItem={({ item }) => (
            <View style={styles.sectionContainer}>
              <View style={styles.dateHeader}>
                <Calendar size={14} color="#8e92af" style={{ marginRight: 6 }} />
                <Text style={styles.dateTitle}>{item.title}</Text>
              </View>
              <FlatList
                data={item.data}
                keyExtractor={(file) => file.id}
                numColumns={3}
                renderItem={renderGridItem}
                scrollEnabled={false}
              />
            </View>
          )}
        />
      )}

      <PinLockModal
        visible={pinVisible}
        onClose={handlePinClose}
        onSuccess={handlePinSuccess}
        mode="verify"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 56,
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCountBadge: {
    color: '#FFFC00',
    backgroundColor: 'rgba(255, 252, 0, 0.1)',
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  headerSubCountText: {
    color: '#8e92af',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  skeletonBg: {
    backgroundColor: '#0f1123',
  },
  errorBg: {
    backgroundColor: '#1b1b1b',
  },
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f1123',
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
  },
  filterTabsWrapper: {
    height: 46,
    marginBottom: 12,
  },
  filterTabs: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    marginRight: 8,
    backgroundColor: '#0f1123',
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  activeFilterTab: {
    backgroundColor: '#FFFC00',
    borderColor: '#FFFC00',
  },
  filterTabText: {
    color: '#8e92af',
    fontSize: 13,
    fontWeight: '600',
  },
  activeFilterTabText: {
    color: '#000000',
  },
  onThisDaySection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionHeaderTitle: {
    color: '#FFFC00',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  onThisDayList: {
    paddingRight: 16,
  },
  onThisDayCard: {
    width: 100,
    height: 120,
    borderRadius: 16,
    marginRight: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1f2444',
    backgroundColor: '#0f1123',
  },
  onThisDayImg: {
    width: '100%',
    height: '100%',
  },
  onThisDayPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  onThisDayOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    padding: 6,
  },
  onThisDayYear: {
    color: '#FFFC00',
    fontSize: 12,
    fontWeight: '800',
  },
  onThisDayCaption: {
    color: '#FFFFFF',
    fontSize: 10,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionContainer: {
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingLeft: 4,
  },
  dateTitle: {
    color: '#8e92af',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  gridItem: {
    width: GRID_SIZE,
    height: GRID_SIZE,
    margin: 4,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0f1123',
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  placeholderGrid: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f1123',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    marginLeft: 1,
  },
  starBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 4,
    borderRadius: 10,
  },
});

export default MemoriesScreen;
