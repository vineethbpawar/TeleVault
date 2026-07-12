import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Alert,
  SectionList,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { Search, Calendar, Star, Lock, Image as ImageIcon, Video, FolderInput, Share2, Send, Trash2, Edit, Type } from 'lucide-react-native';
import { CompositeScreenProps, useIsFocused } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, AppStackParamList } from '../types/navigation';
import { fileService } from '../services/fileService';
import { supabase } from '../lib/supabase';
import { TeleVaultFile, TeleVaultFolder } from '../types/file';
import EmptyState from '../components/EmptyState';
import PinLockModal from '../components/PinLockModal';
import { previewCacheService } from '../services/previewCacheService';
import { showToast } from '../components/ToastBanner';
import Screen from '../components/Screen';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'MemoriesTab'>,
  NativeStackScreenProps<AppStackParamList>
>;

const { width } = Dimensions.get('window');

// Lightweight Grid Item
const MemoryGridItem = React.memo<{
  item: TeleVaultFile;
  size: number;
  onPress: () => void;
  onLongPress: () => void;
  isSelected: boolean;
  isSelectionMode: boolean;
}>(({ item, size, onPress, onLongPress, isSelected, isSelectionMode }) => {
  const [imgUri, setImgUri] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    
    // Resolve thumbnail URL pipeline: local_thumbnail_uri -> previewCache / telegram_url
    if (item.local_thumbnail_uri) {
      setImgUri(item.local_thumbnail_uri);
    } else if (item.overlay_metadata?.thumbnail_url) {
      setImgUri(item.overlay_metadata.thumbnail_url);
    } else if (item.telegram_file_id) {
      previewCacheService.getCachedPreview(item.telegram_file_id).then(url => {
        if (active) {
          if (url) {
            setImgUri(url);
          } else {
            // Fetch remote Telegram URL on demand
            previewCacheService.resolvePreviewForFile(item).then(resolved => {
              if (active && resolved) {
                setImgUri(resolved);
              }
            });
          }
        }
      });
    }

    return () => {
      active = false;
    };
  }, [item]);

  const isVideo = item.file_type === 'video';

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ width: size, height: size, margin: 2, position: 'relative', borderRadius: 16, overflow: 'hidden', backgroundColor: '#1A1A1A' }}
    >
      {imgUri ? (
        <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallbackContainer]}>
          {isVideo ? (
            <Video size={24} color="#8E8E93" />
          ) : (
            <ImageIcon size={24} color="#8E8E93" />
          )}
        </View>
      )}

      {/* Video Indicator Overlay */}
      {isVideo && (
        <View style={styles.videoBadge}>
          <Video size={10} color="#FFFFFF" fill="#FFFFFF" />
        </View>
      )}

      {/* Upload Placeholder Loading Overlay */}
      {!item.telegram_file_id && (
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator size="small" color="#FFFC00" />
        </View>
      )}

      {/* Favorite Indicator */}
      {item.is_favorite && (
        <View style={styles.starBadge}>
          <Star size={10} color="#FFFC00" fill="#FFFC00" />
        </View>
      )}

      {/* Bulk Selection Overlay */}
      {isSelectionMode && (
        <View style={[styles.selectionOverlay, isSelected && styles.selectionOverlaySelected]}>
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Text style={styles.checkboxCheck}>✓</Text>}
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}, (prev, next) => {
  return prev.item.id === next.item.id &&
         prev.item.telegram_file_id === next.item.telegram_file_id &&
         prev.item.is_favorite === next.item.is_favorite &&
         prev.isSelected === next.isSelected &&
         prev.isSelectionMode === next.isSelectionMode &&
         prev.size === next.size;
});

// Inline Folder Picker Modal
const FolderPickerModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  onSelect: (folderId: string | null) => void;
}> = ({ visible, onClose, onSelect }) => {
  const [folders, setFolders] = useState<TeleVaultFolder[]>([]);

  useEffect(() => {
    if (visible) {
      fileService.fetchDriveFolders(null)
        .then(setFolders)
        .catch(console.error);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Select Folder</Text>
          <ScrollView style={{ maxHeight: 250, marginVertical: 12 }}>
            <TouchableOpacity onPress={() => onSelect(null)} style={styles.folderRow}>
              <Text style={styles.folderRowText}>📁 Root Drive</Text>
            </TouchableOpacity>
            {folders.map(f => (
              <TouchableOpacity key={f.id} onPress={() => onSelect(f.id)} style={styles.folderRow}>
                <Text style={styles.folderRowText}>📁 {f.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={onClose} style={styles.modalCancelBtn}>
            <Text style={styles.modalCancelBtnText}>Cancel</Text>
          </TouchableOpacity>
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
  
  // Tabs: all, image, video, favorites, private
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video' | 'favorites' | 'private'>('all');
  const [pinVisible, setPinVisible] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);

  // Selection & Bulk modes
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [folderPickerVisible, setFolderPickerVisible] = useState(false);

  // Dynamic grid state
  const [numColumns, setNumColumns] = useState(3);
  const [scrollY, setScrollY] = useState(0);
  const touchDistanceRef = useRef<number | null>(null);

  // Quick Action Menu States
  const [activeMenuFile, setActiveMenuFile] = useState<TeleVaultFile | null>(null);
  const [captionModalVisible, setCaptionModalVisible] = useState(false);
  const [captionFile, setCaptionFile] = useState<TeleVaultFile | null>(null);
  const [captionText, setCaptionText] = useState('');

  const isFocused = useIsFocused();
  const gridSize = (width - 24 - (numColumns * 4)) / numColumns;
  const filesRef = useRef(files);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const loadMemories = async (showSpinner = true) => {
    if (showSpinner && filesRef.current.length === 0) setLoading(true);
    try {
      let data = await fileService.fetchMemories();
      
      // If private mode is unlocked, fetch private snaps
      if (filterType === 'private' && isUnlocked) {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (userId) {
          const { data: privData, error } = await supabase
            .from('files')
            .select('*')
            .eq('user_id', userId)
            .eq('is_private', true)
            .eq('is_drive_file', false)
            .order('created_at', { ascending: false });
          if (!error && privData) {
            data = privData as TeleVaultFile[];
          }
        }
      }
      setFiles(data);
    } catch (err) {
      console.error('Failed to load memories:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Auth/Tab focus listener
  useEffect(() => {
    if (isFocused) {
      if (filterType === 'private' && !isUnlocked) {
        checkPrivateAccess();
      } else {
        loadMemories(true);
      }
    }
  }, [isFocused, filterType, isUnlocked]);

  // Realtime Supabase updates listener
  useEffect(() => {
    if (!isFocused) return;
    const channel = supabase
      .channel('memories_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'files' }, () => {
        loadMemories(false);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isFocused, filterType, isUnlocked]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadMemories(false);
  }, [filterType, isUnlocked]);

  const checkPrivateAccess = async () => {
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
    let list = [...files];

    // Exclude soft deleted/archived files by default
    list = list.filter(f => !f.overlay_metadata?.deleted_at && !f.overlay_metadata?.is_archived);

    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(f => f.file_name.toLowerCase().includes(q) || (f.caption && f.caption.toLowerCase().includes(q)));
    }

    if (filterType === 'image') {
      list = list.filter(f => f.file_type === 'image');
    } else if (filterType === 'video') {
      list = list.filter(f => f.file_type === 'video');
    } else if (filterType === 'favorites') {
      list = list.filter(f => f.is_favorite);
    }

    return list;
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
      for (let i = 0; i < items.length; i += numColumns) {
        chunked.push(items.slice(i, i + numColumns));
      }
      return { title, data: chunked };
    });
  };

  const handleItemPress = (item: TeleVaultFile) => {
    if (!item.telegram_file_id) {
      showToast('Media is still uploading...');
      return;
    }

    if (isSelectionMode) {
      toggleSelectFile(item.id);
      return;
    }

    const filteredList = getFilteredFiles().filter(f => f.telegram_file_id);
    const index = filteredList.findIndex(f => f.id === item.id);

    navigation.navigate('MemoriesViewer', {
      files: filteredList,
      initialIndex: index >= 0 ? index : 0,
    });
  };

  const handleItemLongPress = (item: TeleVaultFile) => {
    if (!item.telegram_file_id) return;
    if (isSelectionMode) {
      toggleSelectFile(item.id);
    } else {
      setActiveMenuFile(item);
    }
  };

  const toggleSelectFile = (id: string) => {
    setSelectedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      if (next.length === 0) setIsSelectionMode(false);
      return next;
    });
  };

  // Quick Action menu operations
  const handleMenuSend = (file: TeleVaultFile) => {
    setActiveMenuFile(null);
    previewCacheService.resolveFilePreview(file).then(res => {
      const uri = res.playableUri || res.previewUri;
      if (uri) {
        navigation.navigate('SendTo', {
          mediaUri: uri,
          mediaType: file.file_type as 'image' | 'video',
          metadata: file.overlay_metadata,
        });
      } else {
        Alert.alert('Error', 'Unable to resolve file path.');
      }
    });
  };

  const handleMenuFavorite = async (file: TeleVaultFile) => {
    setActiveMenuFile(null);
    try {
      const updated = await fileService.toggleFavoriteFile(file.id, !file.is_favorite);
      await loadMemories(false);
      showToast(updated.is_favorite ? 'Added to favorites.' : 'Removed from favorites.');
    } catch (_) {
      Alert.alert('Error', 'Failed to toggle favorite.');
    }
  };

  const handleMenuHide = async (file: TeleVaultFile) => {
    setActiveMenuFile(null);
    try {
      await fileService.bulkHide([file.id], true);
      await loadMemories(false);
      showToast('Moved to Private Vault.');
    } catch (_) {
      Alert.alert('Error', 'Failed to hide snap.');
    }
  };

  const handleMenuDelete = async (file: TeleVaultFile) => {
    setActiveMenuFile(null);
    Alert.alert('Delete Snap', 'Are you sure you want to delete this snap?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await fileService.bulkDelete([file.id], false);
            await loadMemories(false);
            showToast('Snap moved to Trash.');
          } catch (_) {}
        }
      }
    ]);
  };

  const saveMenuCaption = async () => {
    if (!captionFile) return;
    try {
      await fileService.updateFileCaption(captionFile.id, captionText.trim());
      setCaptionModalVisible(false);
      await loadMemories(false);
      showToast('Caption updated.');
    } catch (_) {
      Alert.alert('Error', 'Failed to update caption.');
    }
  };

  // Bulk Operations
  const handleBulkMove = async (folderId: string | null) => {
    try {
      setFolderPickerVisible(false);
      setLoading(true);
      await fileService.bulkMove(selectedIds, folderId);
      setSelectedIds([]);
      setIsSelectionMode(false);
      await loadMemories(false);
      showToast('Files moved successfully.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Bulk move failed.');
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
      showToast('Snaps moved to Trash.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Bulk delete failed.');
    } finally {
      setLoading(false);
    }
  };

  // Gestures: Pinch to zoom columns & Two-finger drag row select
  const handleTouchStart = (e: any) => {
    const touches = e.nativeEvent.touches;
    if (touches && touches.length === 2) {
      const dx = touches[0].pageX - touches[1].pageX;
      const dy = touches[0].pageY - touches[1].pageY;
      touchDistanceRef.current = Math.sqrt(dx * dx + dy * dy);
      
      if (!isSelectionMode) {
        setIsSelectionMode(true);
      }
    }
  };

  const handleTouchMove = (e: any) => {
    const touches = e.nativeEvent.touches;
    if (touches && touches.length === 2) {
      // 1. Two-finger drag multi-select row calculation
      const y1 = touches[0].pageY;
      const y2 = touches[1].pageY;
      const avgY = (y1 + y2) / 2 - 180 + scrollY;

      const rowHeight = gridSize + 4;
      const rowIndex = Math.floor(avgY / rowHeight);

      const allRows = getGroupedMemories().reduce((acc, section) => {
        return acc.concat(section.data);
      }, [] as TeleVaultFile[][]);

      if (rowIndex >= 0 && rowIndex < allRows.length) {
        const rowFiles = allRows[rowIndex];
        setSelectedIds(prev => {
          const next = [...prev];
          let updated = false;
          rowFiles.forEach(f => {
            if (!next.includes(f.id) && f.telegram_file_id) {
              next.push(f.id);
              updated = true;
            }
          });
          return updated ? next : prev;
        });
      }

      // 2. Two-finger pinch/spread column zoom
      if (touchDistanceRef.current !== null) {
        const dx = touches[0].pageX - touches[1].pageX;
        const dy = touches[0].pageY - touches[1].pageY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);
        const ratio = currentDistance / touchDistanceRef.current;

        if (ratio > 1.35) {
          // Spread -> Decrease columns (Enlarge)
          setNumColumns(prev => {
            const next = Math.max(prev - 1, 2);
            if (next !== prev) touchDistanceRef.current = currentDistance;
            return next;
          });
        } else if (ratio < 0.65) {
          // Pinch -> Increase columns (Shrink)
          setNumColumns(prev => {
            const next = Math.min(prev + 1, 5);
            if (next !== prev) touchDistanceRef.current = currentDistance;
            return next;
          });
        }
      }
    }
  };

  const handleTouchEnd = () => {
    touchDistanceRef.current = null;
  };

  const groupedData = getGroupedMemories();

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
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {files.length > 0 && (
                <TouchableOpacity onPress={() => { setIsSelectionMode(true); setSelectedIds([]); }} style={styles.selectHeaderBtn}>
                  <Text style={styles.selectHeaderBtnText}>Select</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.headerCountBadge}>
                {files.length === 1 ? '1 Snap' : `${files.length} Snaps`}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Search Input */}
      {!isSelectionMode && (
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Search size={18} color="#8e92af" style={{ marginRight: 8 }} />
            <TextInput
              placeholder="Search snaps..."
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
          data={['all', 'image', 'video', 'favorites', 'private'] as const}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.filterTabs}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.filterTab, filterType === item && styles.activeFilterTab]}
              onPress={() => {
                if (item !== 'private') setIsUnlocked(false);
                setFilterType(item);
              }}
            >
              {item === 'favorites' && <Star size={13} color={filterType === item ? '#000000' : '#8e92af'} style={{ marginRight: 4 }} />}
              {item === 'private' && <Lock size={13} color={filterType === item ? '#000000' : '#8e92af'} style={{ marginRight: 4 }} />}
              <Text style={[styles.filterTabText, filterType === item && styles.activeFilterTabText]}>
                {item === 'all' ? 'All' : item === 'image' ? 'Snaps' : item === 'video' ? 'Videos' : item === 'favorites' ? 'Favorites' : 'Private'}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

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
              title={filterType === 'private' ? 'Private Vault Empty' : 'No Memories'}
              description={filterType === 'private' ? 'Store your files privately to secure them here.' : 'Take Snaps from the Camera to save them.'}
            />
          }
        />
      ) : (
        <View 
          style={{ flex: 1 }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <SectionList
            sections={groupedData as any}
            keyExtractor={(item, index) => index.toString()}
            contentContainerStyle={{ paddingBottom: isSelectionMode ? 180 : 100 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFC00" />}
            onScroll={(e) => {
              setScrollY(e.nativeEvent.contentOffset.y);
            }}
            scrollEventThrottle={16}
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
                        size={gridSize}
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
            maxToRenderPerBatch={12}
            updateCellsBatchingPeriod={50}
            initialNumToRender={12}
            windowSize={5}
          />
        </View>
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

      {/* Snapchat-style Long Press Quick Action Menu */}
      {activeMenuFile && (
        <Modal
          visible={!!activeMenuFile}
          transparent
          animationType="fade"
          onRequestClose={() => setActiveMenuFile(null)}
        >
          <TouchableOpacity 
            style={styles.menuModalBg} 
            activeOpacity={1} 
            onPress={() => setActiveMenuFile(null)}
          >
            <View style={styles.menuContainer}>
              <View style={styles.menuPreviewCard}>
                <MemoryGridItem
                  item={activeMenuFile}
                  size={150}
                  onPress={() => {}}
                  onLongPress={() => {}}
                  isSelected={false}
                  isSelectionMode={false}
                />
                <Text style={styles.menuPreviewTitle} numberOfLines={1}>
                  {activeMenuFile.file_name}
                </Text>
              </View>

              <View style={styles.menuActionsList}>
                <TouchableOpacity style={styles.menuActionItem} onPress={() => handleMenuSend(activeMenuFile)}>
                  <Text style={styles.menuActionText}>🚀 Send Snap</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.menuActionItem}
                  onPress={() => {
                    setCaptionFile(activeMenuFile);
                    setCaptionText(activeMenuFile.caption || '');
                    setActiveMenuFile(null);
                    setCaptionModalVisible(true);
                  }}
                >
                  <Text style={styles.menuActionText}>✏️ Edit Caption</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuActionItem} onPress={() => handleMenuHide(activeMenuFile)}>
                  <Text style={styles.menuActionText}>🔒 Move to Private</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuActionItem} onPress={() => handleMenuFavorite(activeMenuFile)}>
                  <Text style={styles.menuActionText}>
                    {activeMenuFile.is_favorite ? '⭐ Remove Favorite' : '⭐ Favorite'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.menuActionItem, styles.menuActionDelete]} onPress={() => handleMenuDelete(activeMenuFile)}>
                  <Text style={[styles.menuActionText, { color: '#FF453A' }]}>🗑️ Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Quick Action Caption Modal */}
      <Modal
        visible={captionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCaptionModalVisible(false)}
      >
        <View style={styles.alertBg}>
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>Edit Caption</Text>
            <TextInput
              style={styles.alertInput}
              value={captionText}
              onChangeText={setCaptionText}
              placeholder="Add caption..."
              placeholderTextColor="#8E8E93"
              autoFocus
            />
            <View style={styles.alertActions}>
              <TouchableOpacity style={styles.alertBtn} onPress={() => setCaptionModalVisible(false)}>
                <Text style={styles.alertCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.alertBtn} onPress={saveMenuCaption}>
                <Text style={styles.alertConfirmText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
            <TouchableOpacity style={[styles.bulkActionBtn, { backgroundColor: '#FF453A' }]} onPress={handleBulkTrash}>
              <Text style={styles.bulkActionBtnText}>🗑️ Trash</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
  },
  videoBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 4,
    borderRadius: 6,
  },
  starBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 4,
    borderRadius: 6,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    padding: 6,
  },
  selectionOverlaySelected: {
    backgroundColor: 'rgba(255, 252, 0, 0.15)',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#FFFC00',
    borderColor: '#FFFC00',
  },
  checkboxCheck: {
    color: '#000000',
    fontSize: 10,
    fontWeight: '800',
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
    gap: 8,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f1123',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2444',
    marginRight: 6,
    height: 36,
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
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateTitle: {
    color: '#8e92af',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  bulkActionsContainer: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    backgroundColor: '#0F1123',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  bulkActionsTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  bulkActionsButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  bulkActionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
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
  modalCancelBtn: {
    paddingVertical: 10,
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 10,
  },
  modalCancelBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  menuModalBg: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContainer: {
    width: '80%',
    maxWidth: 320,
    backgroundColor: '#0F1123',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    padding: 20,
  },
  menuPreviewCard: {
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  menuPreviewTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 10,
    textAlign: 'center',
    width: '100%',
  },
  menuActionsList: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 10,
  },
  menuActionItem: {
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  menuActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  menuActionDelete: {
    borderBottomWidth: 0,
    backgroundColor: 'rgba(255, 69, 58, 0.05)',
    borderRadius: 12,
    marginTop: 8,
  },
  alertBg: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  alertBox: {
    backgroundColor: '#0F1123',
    borderRadius: 20,
    width: '100%',
    padding: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  alertTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center',
  },
  alertInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    color: '#FFFFFF',
    padding: 12,
    fontSize: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  alertActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  alertBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  alertCancelText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '700',
  },
  alertConfirmText: {
    color: '#FFFC00',
    fontSize: 14,
    fontWeight: '800',
  },
  cancelSelectionHeaderBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#2C2C2E',
  },
  cancelSelectionHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  selectHeaderBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#2C2C2E',
    marginRight: 8,
  },
  selectHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default MemoriesScreen;
