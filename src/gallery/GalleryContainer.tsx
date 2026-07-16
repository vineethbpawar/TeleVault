import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, Star, Lock, Grid, Trash2, Edit, CheckSquare, X, Share2 } from 'lucide-react-native';

import { MemoryGrid } from './MemoryGrid';
import { GalleryItem, FilterType } from './types';
import { fileService } from '../services/fileService';
import { supabase } from '../lib/supabase';
import { showToast } from '../components/ToastBanner';
import PinLockModal from '../components/PinLockModal';
import { fileOpenService } from '../services/fileOpenService';
import { uploadQueueService } from '../services/uploadQueueService';
import { UploadQueueBadge } from '../components/UploadQueueBadge';

interface GalleryContainerProps {
  navigation: any;
  isFocused: boolean;
}

const showAlert = (
  title: string,
  message: string,
  buttons?: { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[]
) => {
  if (Platform.OS === 'web') {
    if (buttons && buttons.length > 1) {
      const confirmBtn = buttons.find(b => b.style !== 'cancel') || buttons[buttons.length - 1];
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed && confirmBtn && confirmBtn.onPress) {
        confirmBtn.onPress();
      }
    } else {
      window.alert(`${title}\n\n${message}`);
      if (buttons && buttons[0] && buttons[0].onPress) {
        buttons[0].onPress();
      }
    }
    return;
  }
  Alert.alert(title, message, buttons);
};

export const GalleryContainer: React.FC<GalleryContainerProps> = ({ navigation, isFocused }) => {
  const insets = useSafeAreaInsets();
  
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Secure Private Vault states
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);

  // Bulk Selection states
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Quick Action Context Menu states
  const [activeMenuFile, setActiveMenuFile] = useState<GalleryItem | null>(null);
  const [captionFile, setCaptionFile] = useState<GalleryItem | null>(null);
  const [captionText, setCaptionText] = useState('');
  const [captionModalVisible, setCaptionModalVisible] = useState(false);

  const isFetchingRef = React.useRef(false);

  // Load files from metadata database
  const loadMemories = useCallback(async (showSpinner = true) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (showSpinner && items.length === 0) setLoading(true);
    try {
      const data = await fileService.fetchMemories();
      setItems(data);
    } catch (err) {
      console.error('[GalleryContainer] Failed to load memories:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFetchingRef.current = false;
    }
  }, [items.length]);

  // Auth State change listener to reload memories when session completes restoration
  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && active) {
        loadMemories(false);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadMemories]);

  // Tab focus reload
  useEffect(() => {
    if (isFocused) {
      if (filterType === 'private' && !isUnlocked) {
        setPinModalVisible(true);
      } else {
        loadMemories(true);
      }
    } else {
      // Reset selection mode when navigating away
      setIsSelectionMode(false);
      setSelectedIds(new Set());
    }
  }, [isFocused, filterType, isUnlocked, loadMemories]);

  // Postgres realtime changes listener (Only enabled on Native to prevent WebSocket hangs on Web/PWA)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!isFocused) return;
    const channel = supabase
      .channel('memories_realtime_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'files' }, () => {
        loadMemories(false);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isFocused, loadMemories]);

  // Local upload queue changes listener
  useEffect(() => {
    if (!isFocused) return;
    const unsubscribe = uploadQueueService.subscribeToQueue(() => {
      loadMemories(false);
    });

    return () => {
      unsubscribe();
    };
  }, [isFocused, loadMemories]);

  // Filter and Search items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Filter Type check
      if (filterType === 'private') {
        if (!item.is_private) return false;
      } else {
        if (item.is_private) return false; // Hide private items from normal tabs
      }

      if (filterType === 'image' && item.file_type !== 'image') return false;
      if (filterType === 'video' && item.file_type !== 'video') return false;
      if (filterType === 'favorites' && !item.is_favorite) return false;

      // 2. Search query check
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.toLowerCase();
        const matchesName = item.file_name?.toLowerCase().includes(query);
        const matchesCaption = item.caption?.toLowerCase().includes(query);
        return matchesName || matchesCaption;
      }

      return true;
    });
  }, [items, filterType, searchQuery]);

  function useMemo(factory: () => GalleryItem[], deps: any[]): GalleryItem[] {
    return React.useMemo(factory, deps);
  }

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadMemories(false);
  };

  const handlePressItem = (item: GalleryItem) => {
    if (isSelectionMode) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(item.id)) {
          next.delete(item.id);
        } else {
          next.add(item.id);
        }
        if (next.size === 0) {
          setIsSelectionMode(false);
        }
        return next;
      });
      return;
    }

    // Filter to only include items of the current tab/search that are ready
    const index = filteredItems.findIndex((f) => f.id === item.id);
    navigation.navigate('MemoriesViewer', {
      files: filteredItems,
      initialIndex: index >= 0 ? index : 0,
    });
  };

  const handleLongPressItem = (item: GalleryItem) => {
    if (isSelectionMode) return;
    setActiveMenuFile(item);
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedIds(new Set());
  };

  // Quick Action Actions
  const handleToggleFavorite = async (item: GalleryItem) => {
    setActiveMenuFile(null);
    try {
      const updated = await fileService.toggleFavoriteFile(item.id, !item.is_favorite);
      await loadMemories(false);
      showToast(updated.is_favorite ? 'Added to favorites.' : 'Removed from favorites.');
    } catch (_) {
      showAlert('Error', 'Failed to toggle favorite.');
    }
  };

  const handleMoveToVault = async (item: GalleryItem) => {
    setActiveMenuFile(null);
    try {
      await fileService.bulkHide([item.id], true);
      await loadMemories(false);
      showToast('Moved to Private Vault.');
    } catch (_) {
      showAlert('Error', 'Failed to move snap to vault.');
    }
  };

  const handleDeleteItem = async (item: GalleryItem) => {
    setActiveMenuFile(null);
    showAlert('Delete Snap', 'Are you sure you want to permanently delete this snap?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await fileService.bulkDelete([item.id], true);
            await loadMemories(false);
            showToast('Snap permanently deleted.');
          } catch (err: any) {
            console.error('[Delete] Failed to delete snap:', err);
            showAlert('Delete Failed', err.message || 'Failed to delete snap. Please try again.');
          }
        },
      },
    ]);
  };

  // Bulk Operations
  const handleBulkExport = async () => {
    const ids = Array.from(selectedIds);
    const selectedFiles = items.filter(f => ids.includes(f.id));
    if (selectedFiles.length === 0) return;

    const confirmMsg = selectedFiles.length === 1
      ? 'Export/Share this file?'
      : `Export/Share these ${selectedFiles.length} files sequentially?`;

    showAlert('Export Snaps', confirmMsg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Export',
        onPress: async () => {
          try {
            setLoading(true);
            for (const file of selectedFiles) {
              await fileOpenService.openDocument(file).catch(err => {
                console.warn('Failed to share file in loop:', err);
              });
            }
            setSelectedIds(new Set());
            setIsSelectionMode(false);
            showToast(Platform.OS === 'web' ? 'Files downloaded.' : 'Files exported successfully.');
          } catch (err: any) {
            showAlert('Error', err.message || 'Export failed.');
          } finally {
            setLoading(false);
          }
        }
      }
    ]);
  };

  const handleBulkTrash = async () => {
    const ids = Array.from(selectedIds);
    showAlert('Delete Snaps', `Are you sure you want to permanently delete these ${ids.length} snaps?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            await fileService.bulkDelete(ids, true);
            setSelectedIds(new Set());
            setIsSelectionMode(false);
            await loadMemories(false);
            showToast('Snaps permanently deleted.');
          } catch (err: any) {
            showAlert('Error', err.message || 'Bulk delete failed.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const handleBulkHide = async () => {
    const ids = Array.from(selectedIds);
    try {
      setLoading(true);
      await fileService.bulkHide(ids, true);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      await loadMemories(false);
      showToast('Snaps moved to Private Vault.');
    } catch (err: any) {
      showAlert('Error', err.message || 'Bulk hide failed.');
    } finally {
      setLoading(false);
    }
  };

  const saveCaption = async () => {
    if (!captionFile) return;
    try {
      await fileService.updateFileCaption(captionFile.id, captionText.trim());
      setCaptionModalVisible(false);
      await loadMemories(false);
      showToast('Caption updated.');
    } catch (_) {
      showAlert('Error', 'Failed to update caption.');
    }
  };

  return (
    <View style={styles.container}>
      {/* Search HUD */}
      <View style={[styles.searchBarContainer, { marginTop: insets.top > 0 ? insets.top + 6 : 12 }]}>
        <View style={styles.searchFieldWrapper}>
          <Search size={18} color="#8E8E93" style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search Snaps or captions..."
            placeholderTextColor="#8E8E93"
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
        </View>
        <UploadQueueBadge />
        <TouchableOpacity
          style={[styles.bulkSelectToggleBtn, isSelectionMode && styles.bulkSelectToggleBtnActive]}
          onPress={toggleSelectionMode}
        >
          <CheckSquare size={18} color={isSelectionMode ? '#000000' : '#FFFFFF'} />
        </TouchableOpacity>
      </View>

      {/* Tabs Filter Row */}
      <View style={styles.tabContainer}>
        {(['all', 'image', 'video', 'favorites', 'private'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabItem, filterType === tab && styles.tabItemActive]}
            onPress={() => {
              if (tab === 'private' && !isUnlocked) {
                setPinModalVisible(true);
              } else {
                setFilterType(tab);
              }
            }}
          >
            {tab === 'favorites' && <Star size={12} color={filterType === tab ? '#000000' : '#8E8E93'} style={{ marginRight: 4 }} />}
            {tab === 'private' && <Lock size={12} color={filterType === tab ? '#000000' : '#8E8E93'} style={{ marginRight: 4 }} />}
            <Text style={[styles.tabText, filterType === tab && styles.tabTextActive]}>
              {tab.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Media Grid */}
      {loading ? (
        <View style={[styles.container, styles.center]}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={[styles.container, styles.center]}>
          <Text style={styles.emptyText}>
            {filterType === 'private' ? 'Private Vault Empty' : 'No Memories Found'}
          </Text>
        </View>
      ) : (
        <MemoryGrid
          items={filteredItems}
          onPressItem={handlePressItem}
          onLongPressItem={handleLongPressItem}
          selectedIds={selectedIds}
          isSelectionMode={isSelectionMode}
          onRefresh={handleRefresh}
          refreshing={refreshing}
        />
      )}

      {/* Bulk Operations Bottom HUD */}
      {isSelectionMode && selectedIds.size > 0 && (
        <View style={[styles.bulkHud, { bottom: Platform.OS === 'web' ? 76 : 76 + insets.bottom }]}>
          <TouchableOpacity style={styles.bulkActionBtn} onPress={handleBulkHide}>
            <Lock size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.bulkActionBtnText}>HIDE</Text>
          </TouchableOpacity>
 
          <TouchableOpacity style={styles.bulkActionBtn} onPress={handleBulkExport}>
            <Share2 size={16} color="#FFFC00" style={{ marginRight: 4 }} />
            <Text style={[styles.bulkActionBtnText, { color: '#FFFC00' }]}>SHARE</Text>
          </TouchableOpacity>
 
          <TouchableOpacity style={[styles.bulkActionBtn, styles.bulkActionDeleteBtn]} onPress={handleBulkTrash}>
            <Trash2 size={16} color="#FF3B30" style={{ marginRight: 4 }} />
            <Text style={[styles.bulkActionBtnText, { color: '#FF3B30' }]}>DELETE</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* PinLock Biometrics Secure modal */}
      <PinLockModal
        visible={pinModalVisible}
        onSuccess={() => {
          setPinModalVisible(false);
          setIsUnlocked(true);
          setFilterType('private');
        }}
        onClose={() => {
          setPinModalVisible(false);
          if (filterType === 'private') {
            setFilterType('all');
          }
        }}
      />

      {/* Context Quick Action Sheet */}
      {activeMenuFile && (
        <Modal transparent visible={!!activeMenuFile} animationType="fade">
          <TouchableOpacity
            style={styles.sheetOverlay}
            activeOpacity={1}
            onPress={() => setActiveMenuFile(null)}
          >
            <View style={styles.sheetContent}>
              <Text style={styles.sheetTitle}>{activeMenuFile.file_name}</Text>
              
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => handleToggleFavorite(activeMenuFile)}
              >
                <Star size={18} color="#FFFFFF" style={{ marginRight: 12 }} />
                <Text style={styles.sheetRowText}>
                  {activeMenuFile.is_favorite ? 'Remove Favorite' : 'Add Favorite'}
                </Text>
              </TouchableOpacity>

              {!activeMenuFile.is_private && (
                <TouchableOpacity
                  style={styles.sheetRow}
                  onPress={() => handleMoveToVault(activeMenuFile)}
                >
                  <Lock size={18} color="#FFFFFF" style={{ marginRight: 12 }} />
                  <Text style={styles.sheetRowText}>Move to Private Vault</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => {
                  setCaptionFile(activeMenuFile);
                  setCaptionText(activeMenuFile.caption || '');
                  setCaptionModalVisible(true);
                  setActiveMenuFile(null);
                }}
              >
                <Edit size={18} color="#FFFFFF" style={{ marginRight: 12 }} />
                <Text style={styles.sheetRowText}>Edit Caption</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sheetRow, { borderBottomWidth: 0 }]}
                onPress={() => handleDeleteItem(activeMenuFile)}
              >
                <Trash2 size={18} color="#FF3B30" style={{ marginRight: 12 }} />
                <Text style={[styles.sheetRowText, { color: '#FF3B30' }]}>Delete Permanently</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Caption Edit Modal */}
      <Modal transparent visible={captionModalVisible} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Caption</Text>
              <TouchableOpacity onPress={() => setCaptionModalVisible(false)}>
                <X size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <TextInput
              placeholder="Write a caption..."
              placeholderTextColor="#8E8E93"
              value={captionText}
              onChangeText={setCaptionText}
              style={styles.captionInput}
              maxLength={200}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={saveCaption}>
              <Text style={styles.primaryBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 16,
    fontWeight: '600',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  searchFieldWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  bulkSelectToggleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  bulkSelectToggleBtnActive: {
    backgroundColor: '#FFFC00',
    borderColor: '#FFFC00',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 8,
    justifyContent: 'space-between',
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  tabItemActive: {
    backgroundColor: '#FFFC00',
  },
  tabText: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '800',
  },
  tabTextActive: {
    color: '#000000',
  },
  bulkHud: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(25, 28, 50, 0.98)',
    borderRadius: 24,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },
  bulkActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  bulkActionDeleteBtn: {
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
  },
  bulkActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    backgroundColor: '#0F1123',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sheetTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center',
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  sheetRowText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#0F1123',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  captionInput: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    height: 48,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  primaryBtn: {
    backgroundColor: '#FFFC00',
    borderRadius: 20,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
});
export default GalleryContainer;
