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
  SectionList,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { Search, Image as ImageIcon, Video, Calendar, Star, Lock, Eye, AlertTriangle } from 'lucide-react-native';
import { CompositeScreenProps, useIsFocused } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, AppStackParamList } from '../types/navigation';
import { fileService } from '../services/fileService';
import { securityService } from '../services/securityService';
import { supabase } from '../lib/supabase';
import { TeleVaultFile, TeleVaultFolder } from '../types/file';
import EmptyState from '../components/EmptyState';
import PinLockModal from '../components/PinLockModal';
import AppCard from '../components/AppCard';
import { previewCacheService } from '../services/previewCacheService';
import { telegramService } from '../services/telegramService';
import { storageService } from '../services/storageService';
import { searchService, SearchFilters } from '../services/searchService';
import Screen from '../components/Screen';
import FilePreviewCard from '../components/FilePreviewCard';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'MemoriesTab'>,
  NativeStackScreenProps<AppStackParamList>
>;

const { width } = Dimensions.get('window');
const GRID_SIZE = (width - 48) / 3;

interface GroupedMemories {
  title: string;
  data: TeleVaultFile[][];
}

const MemoryGridItem = React.memo<{
  item: TeleVaultFile;
  onPress: () => void;
  onLongPress: () => void;
  isSelected: boolean;
  isSelectionMode: boolean;
}>(({ item, onPress, onLongPress, isSelected, isSelectionMode }) => {
  return (
    <View style={{ margin: 4, position: 'relative' }}>
      <FilePreviewCard
        file={item}
        variant="grid"
        size={GRID_SIZE}
        onPress={onPress}
        onLongPress={onLongPress}
      />
      {!item.telegram_file_id && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          justifyContent: 'center',
          alignItems: 'center',
          borderRadius: 8,
        }}>
          <ActivityIndicator size="small" color="#FFFC00" />
        </View>
      )}
      {item.is_favorite && (
        <View style={styles.starBadge}>
          <Star size={10} color="#FFFC00" fill="#FFFC00" />
        </View>
      )}
      {isSelectionMode && (
        <View style={[
          styles.selectionOverlay,
          isSelected && styles.selectionOverlaySelected
        ]}>
          <View style={[
            styles.checkbox,
            isSelected && styles.checkboxSelected
          ]}>
            {isSelected && <Text style={styles.checkboxCheck}>✓</Text>}
          </View>
        </View>
      )}
    </View>
  );
}, (prev, next) => {
  return prev.item.id === next.item.id &&
         prev.item.telegram_file_id === next.item.telegram_file_id &&
         prev.item.is_favorite === next.item.is_favorite &&
         prev.isSelected === next.isSelected &&
         prev.isSelectionMode === next.isSelectionMode;
});

const OnThisDayGridItem = React.memo<{ item: TeleVaultFile; onPress: () => void }>(({ item, onPress }) => {
  return (
    <View style={{ marginRight: 10, position: 'relative' }}>
      <FilePreviewCard
        file={item}
        variant="recent"
        onPress={onPress}
      />
      <View style={styles.onThisDayOverlay}>
        <Text style={styles.onThisDayYear}>{new Date(item.created_at).getFullYear()}</Text>
        <Text style={styles.onThisDayCaption} numberOfLines={1}>{item.caption || item.file_name}</Text>
      </View>
    </View>
  );
}, (prev, next) => {
  return prev.item.id === next.item.id &&
         prev.item.telegram_file_id === next.item.telegram_file_id;
});

const FolderPickerModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  onSelect: (folderId: string | null) => void;
}> = ({ visible, onClose, onSelect }) => {
  const [folders, setFolders] = useState<TeleVaultFolder[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      fileService.fetchDriveFolders(null)
        .then(setFolders)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Select Target Folder</Text>
          {loading ? (
            <ActivityIndicator size="small" color="#FFFC00" style={{ marginVertical: 20 }} />
          ) : (
            <ScrollView style={{ maxHeight: 250, marginVertical: 12 }}>
              <TouchableOpacity onPress={() => onSelect(null)} style={styles.folderRow}>
                <Text style={styles.folderRowText}>📁 Root Drive</Text>
              </TouchableOpacity>
              {folders.map(f => (
                <TouchableOpacity key={f.id} onPress={() => onSelect(f.id)} style={styles.folderRow}>
                  <Text style={styles.folderRowText}>📁 {f.name}</Text>
                </TouchableOpacity>
              ))}
              {folders.length === 0 && (
                <Text style={styles.modalEmptyText}>No folders found in drive.</Text>
              )}
            </ScrollView>
          )}
          <View style={styles.modalActions}>
            <TouchableOpacity onPress={onClose} style={styles.modalCancelBtn}>
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export const MemoriesScreen: React.FC<Props> = ({ navigation }) => {
  const [files, setFiles] = useState<TeleVaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Tabs: all, image, video, favorites, archive, trash, private
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video' | 'favorites' | 'archive' | 'trash' | 'private'>('all');
  
  // Pin Lock Modal for Private Memories
  const [pinVisible, setPinVisible] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);

  // Selection & Bulk modes
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [folderPickerVisible, setFolderPickerVisible] = useState(false);

  const isFocused = useIsFocused();
  const [configReady, setConfigReady] = useState<boolean | null>(telegramService.configReady);

  useEffect(() => {
    const unsubscribe = telegramService.subscribeConfigReady(() => {
      setConfigReady(telegramService.configReady);
    });
    return unsubscribe;
  }, []);

  const loadMemories = async (showSpinner = true) => {
    console.log("MEMORIES STEP 1: loadMemories called, showSpinner =", showSpinner);
    // Optimistic check: Only show spinner if files list is empty
    const shouldShowSpinner = showSpinner && files.length === 0;
    if (shouldShowSpinner) setLoading(true);
    try {
      console.log("MEMORIES STEP 2: Calling fileService.fetchMemories()");
      let data = await fileService.fetchMemories();
      console.log("MEMORIES STEP 3: fetchMemories finished, data length =", data?.length);
      
      // If private mode is active and unlocked, load private memories
      if (filterType === 'private' && isUnlocked) {
        console.log("MEMORIES STEP 4: Loading private memories");
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
      console.log("MEMORIES STEP 5: Setting files state");
      setFiles(data);
      if (data && data.length > 0) {
        console.log("MEMORIES STEP 6: Calling pregenerateThumbnailsInBackground");
        previewCacheService.pregenerateThumbnailsInBackground(data);
        console.log("MEMORIES STEP 7: Calling evictCacheIfLimitExceeded");
        previewCacheService.evictCacheIfLimitExceeded(50 * 1024 * 1024);
      }
      console.log("MEMORIES STEP 8: Success path completed");
    } catch (error: any) {
      console.error('MEMORIES STEP ERROR: Failed to load memories:', error);
    } finally {
      console.log("MEMORIES STEP 9: Finally block resetting loading state");
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Load cached memories first on mount/focus to prevent blocking loader spinner
  useEffect(() => {
    if (isFocused && filterType !== 'private') {
      const loadFromCache = async () => {
        try {
          const cached = await storageService.getItem('televault_cached_memories');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setFiles(parsed);
              setLoading(false); // Hide spinner instantly
            }
          }
        } catch (e) {
          console.warn('Failed to load cached memories:', e);
        }
      };
      loadFromCache();
    }
  }, [isFocused, filterType]);

  useEffect(() => {
    console.log("MEMORIES EFFECT 1: Fired, isFocused =", isFocused, "filterType =", filterType, "isUnlocked =", isUnlocked);
    if (isFocused) {
      if (filterType === 'private' && !isUnlocked) {
        console.log("MEMORIES EFFECT 1: Checking private access");
        checkPrivateAccess();
      } else {
        console.log("MEMORIES EFFECT 1: Triggering loadMemories(true)");
        loadMemories(true);
      }
    }

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      console.log("MEMORIES APPSTATE CHANGE: nextAppState =", nextAppState, "isFocused =", isFocused);
      if (nextAppState === 'active' && isFocused) {
        loadMemories(false);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isFocused, filterType, isUnlocked]);

  useEffect(() => {
    console.log("MEMORIES EFFECT 2 (Realtime): Fired, isFocused =", isFocused);
    if (!isFocused) return;
    const channel = supabase
      .channel('memories_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'files' },
        (payload) => {
          console.log("MEMORIES REALTIME CHANGE DETECTED:", payload);
          loadMemories(false);
        }
      )
      .subscribe();

    return () => {
      console.log("MEMORIES EFFECT 2: Cleaning up realtime subscription channel");
      supabase.removeChannel(channel);
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
    const filters: SearchFilters = {
      query: searchQuery,
      fileType: (filterType === 'image' || filterType === 'video') ? filterType : 'all',
      isFavorite: filterType === 'favorites' ? true : undefined,
      isArchived: filterType === 'archive' ? true : undefined,
      isDeleted: filterType === 'trash' ? true : undefined,
    };
    // If not looking at archive or trash specifically, exclude them
    if (filterType !== 'archive') filters.isArchived = false;
    if (filterType !== 'trash') filters.isDeleted = false;

    return searchService.filterFiles(files, filters);
  };

  const getOnThisDayMemories = () => {
    const todayMonth = new Date().getMonth();
    const todayDate = new Date().getDate();
    const currentYear = new Date().getFullYear();

    return files.filter((file) => {
      // Exclude archived and soft deleted items from On This Day throwing back
      const meta = file.overlay_metadata || {};
      if (meta.is_archived || meta.deleted_at) return false;

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

    return Object.keys(sections).map((title) => {
      const items = sections[title];
      const chunked: TeleVaultFile[][] = [];
      for (let i = 0; i < items.length; i += 3) {
        chunked.push(items.slice(i, i + 3));
      }
      return {
        title,
        data: chunked,
      };
    });
  };

  const handleItemPress = (item: TeleVaultFile) => {
    if (isSelectionMode) {
      toggleSelectFile(item.id);
      return;
    }

    const filteredList = getFilteredFiles();
    const index = filteredList.findIndex(f => f.id === item.id);
    
    // Track recently viewed file
    searchService.trackFileViewed(item.id);

    navigation.navigate('MemoriesViewer', {
      files: filteredList,
      initialIndex: index >= 0 ? index : 0,
    });
  };

  const handleItemLongPress = (item: TeleVaultFile) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedIds([item.id]);
    } else {
      toggleSelectFile(item.id);
    }
  };

  const toggleSelectFile = (id: string) => {
    setSelectedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      if (next.length === 0) {
        setIsSelectionMode(false);
      }
      return next;
    });
  };

  // Bulk Operations
  const handleBulkArchive = async (archive: boolean) => {
    try {
      setLoading(true);
      await fileService.bulkArchive(selectedIds, archive);
      setSelectedIds([]);
      setIsSelectionMode(false);
      await loadMemories(false);
      Alert.alert('Success', `${archive ? 'Archived' : 'Unarchived'} ${selectedIds.length} files.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Bulk archive failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkHide = async (hide: boolean) => {
    try {
      setLoading(true);
      await fileService.bulkHide(selectedIds, hide);
      setSelectedIds([]);
      setIsSelectionMode(false);
      await loadMemories(false);
      Alert.alert('Success', `${hide ? 'Hidden' : 'Unhidden'} ${selectedIds.length} files.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Bulk hide failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkTrash = async () => {
    try {
      setLoading(true);
      await fileService.bulkDelete(selectedIds, false);
      setSelectedIds([]);
      setIsSelectionMode(false);
      await loadMemories(false);
      Alert.alert('Success', `Moved ${selectedIds.length} items to Trash.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Bulk delete failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkRestore = async () => {
    try {
      setLoading(true);
      await fileService.bulkRestore(selectedIds);
      setSelectedIds([]);
      setIsSelectionMode(false);
      await loadMemories(false);
      Alert.alert('Success', `Restored ${selectedIds.length} items.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Bulk restore failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkHardDelete = async () => {
    Alert.alert(
      'Permanently Delete',
      `Are you sure you want to permanently delete these ${selectedIds.length} files? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await fileService.bulkDelete(selectedIds, true);
              setSelectedIds([]);
              setIsSelectionMode(false);
              await loadMemories(false);
              Alert.alert('Deleted', 'Files permanently deleted.');
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Bulk hard delete failed.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleBulkMove = async (folderId: string | null) => {
    try {
      setFolderPickerVisible(false);
      setLoading(true);
      await fileService.bulkMove(selectedIds, folderId);
      setSelectedIds([]);
      setIsSelectionMode(false);
      await loadMemories(false);
      Alert.alert('Success', 'Files moved successfully.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Bulk move failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDuplicate = async () => {
    try {
      setLoading(true);
      await Promise.all(selectedIds.map(id => fileService.duplicateFile(id)));
      setSelectedIds([]);
      setIsSelectionMode(false);
      await loadMemories(false);
      Alert.alert('Success', `Duplicated ${selectedIds.length} files.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Bulk duplicate failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleOnThisDayPress = (item: TeleVaultFile) => {
    const onThisDayList = getOnThisDayMemories();
    const index = onThisDayList.findIndex(f => f.id === item.id);
    navigation.navigate('MemoriesViewer', {
      files: onThisDayList,
      initialIndex: index >= 0 ? index : 0,
    });
  };

  const groupedData = getGroupedMemories();
  const onThisDayData = getOnThisDayMemories();



  return (
    <Screen edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerMainRow}>
          <Text style={styles.headerTitle}>
            {isSelectionMode ? `${selectedIds.length} Selected` : 'Memories'}
          </Text>
          {isSelectionMode ? (
            <TouchableOpacity onPress={() => { setSelectedIds([]); setIsSelectionMode(false); }} style={styles.cancelSelectionHeaderBtn}>
              <Text style={styles.cancelSelectionHeaderBtnText}>Cancel</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.headerCountBadge}>
              {files.length === 1 ? '1 Memory' : `${files.length} Memories`}
            </Text>
          )}
        </View>
        {!isSelectionMode && (
          <Text style={styles.headerSubCountText}>
            {files.filter(f => f.file_type === 'image' && !f.overlay_metadata?.deleted_at && !f.overlay_metadata?.is_archived).length} Photos • {files.filter(f => f.file_type === 'video' && !f.overlay_metadata?.deleted_at && !f.overlay_metadata?.is_archived).length} Videos • {files.filter(f => f.is_favorite === true).length} Favorites
          </Text>
        )}
      </View>

      {/* Search Input */}
      {!isSelectionMode && (
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Search size={18} color="#8e92af" style={{ marginRight: 8 }} />
            <TextInput
              placeholder="Search filename, year, tags..."
              placeholderTextColor="#8e92af"
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>
      )}

      {/* Filter Tabs */}
      <View style={styles.filterTabsWrapper}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={['all', 'image', 'video', 'favorites', 'archive', 'trash', 'private'] as const}
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
                {item === 'all' ? 'All' : item === 'image' ? 'Photos' : item === 'video' ? 'Videos' : item === 'favorites' ? 'Favorites' : item === 'archive' ? 'Archive' : item === 'trash' ? 'Trash' : 'Private'}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* On This Day Carousel */}
      {!isSelectionMode && filterType !== 'private' && onThisDayData.length > 0 && (
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
                onPress={() => handleOnThisDayPress(item)}
              />
            )}
          />
        </View>
      )}

      {/* Grid List */}
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
              title={filterType === 'private' ? 'Private Vault Empty' : filterType === 'trash' ? 'Trash is Empty' : filterType === 'archive' ? 'Archive is Empty' : 'No Memories Found'}
              description={filterType === 'private' ? 'Store your files privately to secure them here behind your lock.' : filterType === 'trash' ? 'Soft-deleted files will appear here.' : filterType === 'archive' ? 'Archived files are stored privately here.' : 'Capture snaps or select media from the camera preview to add memories.'}
            />
          }
        />
      ) : (
        <SectionList
          sections={groupedData as any}
          keyExtractor={(item, index) => index.toString()}
          contentContainerStyle={{ paddingBottom: isSelectionMode ? 180 : 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFC00" />}
          renderSectionHeader={({ section: { title } }) => (
            <View style={[styles.dateHeader, { paddingHorizontal: 16, backgroundColor: '#000000', paddingVertical: 8 }]}>
              <Calendar size={14} color="#8e92af" style={{ marginRight: 6 }} />
              <Text style={styles.dateTitle}>{title}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            return (
              <View style={{ flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 12 }}>
                {item.map((file: TeleVaultFile) => (
                  <View key={file.id} style={{ margin: 2 }}>
                    <MemoryGridItem
                      item={file}
                      onPress={() => handleItemPress(file)}
                      onLongPress={() => handleItemLongPress(file)}
                      isSelected={selectedIds.includes(file.id)}
                      isSelectionMode={isSelectionMode}
                    />
                  </View>
                ))}
              </View>
            );
          }}
          removeClippedSubviews={Platform.OS !== 'web'}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={75}
          initialNumToRender={8}
          windowSize={3}
        />
      )}

      {/* Pin lock Modal */}
      <PinLockModal
        visible={pinVisible}
        onClose={handlePinClose}
        onSuccess={handlePinSuccess}
        mode="verify"
      />

      {/* Folder Picker Modal */}
      <FolderPickerModal
        visible={folderPickerVisible}
        onClose={() => setFolderPickerVisible(false)}
        onSelect={handleBulkMove}
      />

      {/* Floating Bulk Actions Panel */}
      {isSelectionMode && (
        <View style={styles.bulkActionsContainer}>
          <Text style={styles.bulkActionsTitle}>
            {selectedIds.length} Selected
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bulkActionsButtons}>
            <TouchableOpacity style={styles.bulkActionBtn} onPress={() => setFolderPickerVisible(true)}>
              <Text style={styles.bulkActionBtnText}>📁 Move</Text>
            </TouchableOpacity>

            {filterType !== 'archive' ? (
              <TouchableOpacity style={styles.bulkActionBtn} onPress={() => handleBulkArchive(true)}>
                <Text style={styles.bulkActionBtnText}>📦 Archive</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.bulkActionBtn} onPress={() => handleBulkArchive(false)}>
                <Text style={styles.bulkActionBtnText}>📥 Unarchive</Text>
              </TouchableOpacity>
            )}

            {filterType !== 'trash' && (
              <TouchableOpacity style={styles.bulkActionBtn} onPress={() => handleBulkHide(true)}>
                <Text style={styles.bulkActionBtnText}>👁️ Hide</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.bulkActionBtn} onPress={handleBulkDuplicate}>
              <Text style={styles.bulkActionBtnText}>📄 Duplicate</Text>
            </TouchableOpacity>

            {filterType === 'trash' ? (
              <>
                <TouchableOpacity style={[styles.bulkActionBtn, { backgroundColor: '#30D158' }]} onPress={handleBulkRestore}>
                  <Text style={[styles.bulkActionBtnText, { color: '#000000' }]}>🔄 Restore</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.bulkActionBtn, { backgroundColor: '#FF453A' }]} onPress={handleBulkHardDelete}>
                  <Text style={styles.bulkActionBtnText}>🗑️ Delete Permanent</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={[styles.bulkActionBtn, { backgroundColor: '#FF453A' }]} onPress={handleBulkTrash}>
                <Text style={styles.bulkActionBtnText}>🗑️ Trash</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 60,
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
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
  starBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 4,
    borderRadius: 10,
  },
  // Selection Styles
  selectionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  selectionOverlaySelected: {
    borderWidth: 3,
    borderColor: '#FFFC00',
    backgroundColor: 'rgba(255, 252, 0, 0.15)',
  },
  checkbox: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    borderColor: '#FFFC00',
    backgroundColor: '#FFFC00',
  },
  checkboxCheck: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '900',
  },
  cancelSelectionHeaderBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
  },
  cancelSelectionHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  // Bulk actions bottom bar
  bulkActionsContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'web' ? 70 : 80,
    left: 16,
    right: 16,
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    alignItems: 'center',
  },
  bulkActionsTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  bulkActionsButtons: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 10,
  },
  bulkActionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
  },
  bulkActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  // Folder picker modal styles
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    width: '100%',
    maxWidth: 320,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  folderRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#2C2C2E',
  },
  folderRowText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  modalEmptyText: {
    color: '#8e92af',
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 20,
  },
  modalActions: {
    alignItems: 'center',
    marginTop: 10,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
    width: '100%',
    alignItems: 'center',
  },
  modalCancelBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default MemoriesScreen;
