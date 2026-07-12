import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Modal, Platform, AppState, ScrollView, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, FolderPlus, Upload, ArrowLeft, Folder, ChevronRight, MoreVertical, Search, ArrowUpDown, Lock, FileText, HardDrive, Star, Image as ImageIcon, Video, Trash2, Edit, CheckSquare, X, Share2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

import { DriveContainerProps, DriveFile, DriveFolder, SortField, SortOrder, Breadcrumb } from './types';
import { fileService } from '../services/fileService';
import { telegramService } from '../services/telegramService';
import { uploadQueueService } from '../services/uploadQueueService';
import { showToast } from '../components/ToastBanner';
import FolderCard from '../components/FolderCard';
import FileCard from '../components/FileCard';
import PinLockModal from '../components/PinLockModal';
import UploadProgress from '../components/UploadProgress';
import { fileOpenService } from '../services/fileOpenService';

const Alert = {
  alert: (
    title: string,
    message?: string,
    buttons?: { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[]
  ) => {
    if (Platform.OS === 'web') {
      if (buttons && buttons.length > 1) {
        const confirmBtn = buttons.find(b => b.style !== 'cancel') || buttons[buttons.length - 1];
        const confirmed = window.confirm(`${title}\n\n${message || ''}`);
        if (confirmed && confirmBtn && confirmBtn.onPress) {
          confirmBtn.onPress();
        }
      } else {
        window.alert(`${title}\n\n${message || ''}`);
        if (buttons && buttons[0] && buttons[0].onPress) {
          buttons[0].onPress();
        }
      }
      return;
    }
    const RNAlert = require('react-native').Alert;
    RNAlert.alert(title, message, buttons);
  }
};

export const DriveContainer: React.FC<DriveContainerProps> = ({ navigation, isFocused, isPrivateMode }) => {
  const insets = useSafeAreaInsets();

  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Sort states
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Directory navigation states
  const [currentFolder, setCurrentFolder] = useState<DriveFolder | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: null, name: 'Root' }]);

  // Private verification locks
  const [isUnlocked, setIsUnlocked] = useState(!isPrivateMode);
  const [pinModalVisible, setPinModalVisible] = useState(isPrivateMode);

  // Floating Action menu / modal dialogs
  const [fabMenuVisible, setFabMenuVisible] = useState(false);
  const [queueModalVisible, setQueueModalVisible] = useState(false);
  
  // Action sheet for single item options
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{ type: 'folder' | 'file'; id: string; name: string } | null>(null);

  // Folder Move Modal Picker states
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [moveFolderList, setMoveFolderList] = useState<DriveFolder[]>([]);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string | null>(null);

  // Dialog Mode (Rename / Create Folder)
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create_folder' | 'rename_folder' | 'rename_file'>('create_folder');
  const [dialogInput, setDialogInput] = useState('');

  // Bulk Selection states
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // AppState change lock listener for Private Drive
  useEffect(() => {
    if (!isPrivateMode) return;

    const handleAppStateChange = (nextStatus: string) => {
      if (nextStatus === 'background' || nextStatus === 'inactive') {
        setIsUnlocked(false);
        setPinModalVisible(true);
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      sub.remove();
    };
  }, [isPrivateMode]);

  // Load database metadata
  const loadContent = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const folderId = currentFolder ? currentFolder.id : null;
      
      const [fetchedFolders, fetchedFiles] = await Promise.all([
        isPrivateMode
          ? fileService.fetchPrivateDriveFolders(folderId)
          : fileService.fetchDriveFolders(folderId),
        isPrivateMode
          ? fileService.fetchPrivateDriveFiles(folderId)
          : fileService.fetchDriveFiles(folderId),
      ]);
      
      setFolders(fetchedFolders);
      setFiles(fetchedFiles);
    } catch (err) {
      console.error('[DriveContainer] Failed to load contents:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentFolder, isPrivateMode]);

  // Sync tab loading trigger
  useEffect(() => {
    if (isFocused) {
      if (isPrivateMode && !isUnlocked) {
        setPinModalVisible(true);
      } else {
        loadContent(true);
      }
    } else {
      setIsSelectionMode(false);
      setSelectedIds(new Set());
    }
  }, [isFocused, currentFolder, isUnlocked, isPrivateMode, loadContent]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadContent(false);
  };

  const handleEnterFolder = (folder: DriveFolder) => {
    setCurrentFolder(folder);
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
    // Reset selection mode on folder navigation
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleBreadcrumbPress = (crumb: Breadcrumb, index: number) => {
    setCurrentFolder(crumb.id ? { id: crumb.id, name: crumb.name } as any : null);
    setBreadcrumbs(prev => prev.slice(0, index + 1));
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleFilePress = (targetFile: DriveFile) => {
    if (isSelectionMode) {
      toggleSelectId(targetFile.id);
      return;
    }

    if (targetFile.file_type === 'image' || targetFile.file_type === 'video') {
      const mediaList = files.filter(f => f.file_type === 'image' || f.file_type === 'video');
      const idx = mediaList.findIndex(f => f.id === targetFile.id);
      navigation.navigate('MemoriesViewer', {
        files: mediaList,
        initialIndex: idx >= 0 ? idx : 0,
      });
    } else {
      navigation.navigate('FileDetails', { file: targetFile });
    }
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (next.size === 0) setIsSelectionMode(false);
      return next;
    });
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedIds(new Set());
  };

  const handleSelectItemOption = (type: 'folder' | 'file', id: string, name: string) => {
    setSelectedItem({ type, id, name });
    setOptionsVisible(true);
  };

  // Launch File Selection pickers
  const handleUploadTrigger = async (source: 'camera' | 'document') => {
    setFabMenuVisible(false);
    try {
      const config = await telegramService.getTelegramConfig();
      if (!config.botToken || !config.channelId) {
        Alert.alert('Configuration Required', 'Please set up Telegram Bot sync details in settings first.');
        return;
      }
    } catch (_) {
      return;
    }

    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission Denied', 'Gallery permissions are required to select photos.');
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          allowsEditing: false,
          quality: 0.95,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          await scheduleUpload(
            asset.uri,
            asset.type === 'video' ? 'video' : 'image',
            asset.fileName || `TV_UPLOAD_${Date.now()}.jpg`,
            asset.mimeType || 'image/jpeg',
            asset.fileSize || 0
          );
        }
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: '*/*',
          copyToCacheDirectory: true,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          await scheduleUpload(
            asset.uri,
            'document',
            asset.name,
            asset.mimeType || 'application/octet-stream',
            asset.size || 0
          );
        }
      }
    } catch (err: any) {
      Alert.alert('File Picker Error', err.message || 'Failed to pick file.');
    }
  };

  const scheduleUpload = async (uri: string, type: 'image' | 'video' | 'document', name: string, mime: string, size: number) => {
    if (size > 500 * 1024 * 1024) {
      Alert.alert('Limit Exceeded', 'The maximum upload file size is restricted to 500 MB.');
      return;
    }

    if (size > 50 * 1024 * 1024) {
      Alert.alert('Large File Split', 'Large file detected. TeleVault will partition it into chunked pieces automatically.');
    }

    try {
      await uploadQueueService.addToUploadQueue({
        local_uri: uri,
        file_name: name,
        file_type: type,
        mime_type: mime,
        file_size: size,
        destination: 'drive',
        folder_id: currentFolder ? currentFolder.id : null,
        is_private: isPrivateMode,
        is_drive_file: true,
        overlay_metadata: null,
      });

      setQueueModalVisible(true);
      setTimeout(() => {
        loadContent(false);
      }, 2500);
    } catch (err: any) {
      Alert.alert('Upload Request Failed', err.message || 'Failed to enqueue upload.');
    }
  };

  const handleDialogSubmit = async () => {
    if (!dialogInput.trim()) return;
    setDialogVisible(false);
    setLoading(true);

    try {
      const name = dialogInput.trim();
      const parentId = currentFolder ? currentFolder.id : null;

      if (dialogMode === 'create_folder') {
        await fileService.createFolder(name, parentId, isPrivateMode);
        showToast('Folder created.');
      } else if (dialogMode === 'rename_folder' && selectedItem) {
        await fileService.renameFolder(selectedItem.id, name);
        showToast('Folder renamed.');
      } else if (dialogMode === 'rename_file' && selectedItem) {
        await fileService.renameFile(selectedItem.id, name);
        showToast('File renamed.');
      }
      loadContent(false);
    } catch (err: any) {
      Alert.alert('Action Failed', err.message || 'Failed to perform operation.');
      setLoading(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!selectedItem) return;
    setOptionsVisible(false);

    Alert.alert('Confirm Delete', `Permanently delete ${selectedItem.name}? This will remove metadata immediately.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            if (selectedItem.type === 'folder') {
              await fileService.deleteFolder(selectedItem.id);
            } else {
              await fileService.bulkDelete([selectedItem.id], true);
            }
            loadContent(false);
            showToast('Item deleted.');
          } catch (_) {
            setLoading(false);
          }
        }
      }
    ]);
  };

  const handleRenameTrigger = () => {
    if (!selectedItem) return;
    setOptionsVisible(false);
    setDialogInput(selectedItem.name);
    setDialogMode(selectedItem.type === 'folder' ? 'rename_folder' : 'rename_file');
    setDialogVisible(true);
  };

  // Bulk Operations Handlers
  const handleTriggerBulkMove = async () => {
    try {
      const allFolders = await fileService.fetchAllDriveFolders(isPrivateMode);
      // Filter out self and child folders if bulk moving folders, but for files showing all is fine
      setMoveFolderList(allFolders.filter((f: DriveFolder) => f.id !== currentFolder?.id));
      setMoveTargetFolderId(null);
      setMoveModalVisible(true);
    } catch (_) {
      Alert.alert('Error', 'Failed to retrieve folder structures.');
    }
  };

  const handleExecuteBulkMove = async () => {
    setMoveModalVisible(false);
    setLoading(true);
    try {
      const ids = Array.from(selectedIds);
      await fileService.bulkMove(ids, moveTargetFolderId);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      loadContent(false);
      showToast('Items moved successfully.');
    } catch (err: any) {
      Alert.alert('Move Failed', err.message || 'An error occurred.');
      setLoading(false);
    }
  };

  const handleBulkExport = async () => {
    const ids = Array.from(selectedIds);
    // filter to only include files (folders cannot be shared/downloaded directly)
    const selectedFiles = files.filter(f => ids.includes(f.id));
    if (selectedFiles.length === 0) {
      showToast('No files selected (folders cannot be exported).');
      return;
    }

    const confirmMsg = selectedFiles.length === 1
      ? 'Export/Share this file?'
      : `Export/Share these ${selectedFiles.length} files sequentially?`;

    Alert.alert('Export Files', confirmMsg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Export',
        onPress: async () => {
          try {
            setLoading(true);
            for (const file of selectedFiles) {
              await fileOpenService.openDocument(file as any).catch(err => {
                console.warn('Failed to share file in loop:', err);
              });
            }
            setSelectedIds(new Set());
            setIsSelectionMode(false);
            showToast(Platform.OS === 'web' ? 'Files downloaded.' : 'Files exported successfully.');
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Export failed.');
          } finally {
            setLoading(false);
          }
        }
      }
    ]);
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    Alert.alert('Confirm Delete', `Permanently delete these ${ids.length} items?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await fileService.bulkDelete(ids, true);
            setSelectedIds(new Set());
            setIsSelectionMode(false);
            loadContent(false);
            showToast('Items deleted.');
          } catch (_) {
            setLoading(false);
          }
        }
      }
    ]);
  };

  // Sorting helper
  const handleSortToggle = () => {
    if (sortField === 'date') {
      setSortField('name');
      setSortOrder('asc');
    } else if (sortField === 'name') {
      setSortField('size');
      setSortOrder('desc');
    } else {
      setSortField('date');
      setSortOrder('desc');
    }
  };

  const processedFiles = React.useMemo(() => {
    let list = [...files];
    const query = searchQuery.toLowerCase().trim();

    // 1. Search Query filter
    if (query) {
      list = list.filter(f => f.file_name?.toLowerCase().includes(query));
    }

    // 2. Sorting execution
    list.sort((a, b) => {
      if (sortField === 'name') {
        const nameA = a.file_name?.toLowerCase() || '';
        const nameB = b.file_name?.toLowerCase() || '';
        return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      }
      if (sortField === 'size') {
        const sizeA = a.file_size || 0;
        const sizeB = b.file_size || 0;
        return sortOrder === 'asc' ? sizeA - sizeB : sizeB - sizeA;
      }
      // Fallback: Date
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

    return list;
  }, [files, searchQuery, sortField, sortOrder]);

  const processedFolders = React.useMemo(() => {
    let list = [...folders];
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      list = list.filter(f => f.name.toLowerCase().includes(query));
    }
    // Sort folders by name
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [folders, searchQuery]);

  return (
    <View style={styles.container}>
      {/* Search Header HUD */}
      <View style={[styles.searchBarRow, { marginTop: insets.top > 0 ? insets.top + 6 : 12 }]}>
        <View style={styles.searchFieldWrapper}>
          <Search size={18} color="#8E8E93" style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search folders or files..."
            placeholderTextColor="#8E8E93"
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
        </View>
        <TouchableOpacity
          style={[styles.actionSquareBtn, isSelectionMode && styles.actionSquareBtnActive]}
          onPress={toggleSelectionMode}
        >
          <CheckSquare size={18} color={isSelectionMode ? '#000000' : '#FFFFFF'} />
        </TouchableOpacity>
      </View>

      {/* Directory Breadcrumbs / Sorting row */}
      <View style={styles.breadcrumbRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.crumbScroll}>
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.id || 'root'}>
              {idx > 0 && <ChevronRight size={14} color="#8E8E93" style={{ marginHorizontal: 4 }} />}
              <TouchableOpacity onPress={() => handleBreadcrumbPress(crumb, idx)}>
                <Text style={[styles.crumbText, idx === breadcrumbs.length - 1 && styles.crumbTextActive]}>
                  {crumb.name}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </ScrollView>

        <TouchableOpacity style={styles.sortToggleBtn} onPress={handleSortToggle}>
          <ArrowUpDown size={14} color="#FFFC00" style={{ marginRight: 4 }} />
          <Text style={styles.sortToggleText}>{sortField.toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      {/* Folders and Files list */}
      {loading ? (
        <View style={[styles.container, styles.center]}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : processedFolders.length === 0 && processedFiles.length === 0 ? (
        <View style={[styles.container, styles.center]}>
          <HardDrive size={48} color="#2C2C2E" style={{ marginBottom: 12 }} />
          <Text style={styles.emptyText}>This directory is empty</Text>
        </View>
      ) : (
        <FlatList
          data={[...processedFolders.map(f => ({ ...f, isFolder: true })), ...processedFiles]}
          keyExtractor={(item: any) => (item.isFolder ? `folder-${item.id}` : `file-${item.id}`)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#FFFC00']}
              tintColor="#FFFC00"
            />
          }
          renderItem={({ item }: { item: any }) => {
            if (item.isFolder) {
              return (
                <FolderCard
                  folder={item}
                  onPress={() => handleEnterFolder(item)}
                  onMorePress={() => handleSelectItemOption('folder', item.id, item.name)}
                />
              );
            }

            const isSelected = selectedIds.has(item.id);
            return (
              <View style={styles.fileCardRow}>
                {isSelectionMode && (
                  <TouchableOpacity
                    style={[styles.checkbox, isSelected && styles.checkboxSelected]}
                    onPress={() => toggleSelectId(item.id)}
                  >
                    {isSelected && <Text style={styles.checkboxCheck}>✓</Text>}
                  </TouchableOpacity>
                )}
                <View style={{ flex: 1 }}>
                  <FileCard
                    file={item}
                    onPress={() => handleFilePress(item)}
                    onMorePress={isSelectionMode ? undefined : () => handleSelectItemOption('file', item.id, item.file_name)}
                  />
                </View>
              </View>
            );
          }}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Floating Add trigger */}
      {!isSelectionMode && (
        <TouchableOpacity style={[styles.fabBtn, { bottom: insets.bottom + 80 }]} onPress={() => setFabMenuVisible(true)}>
          <Plus size={24} color="#000000" />
        </TouchableOpacity>
      )}

      {/* Bulk Operations Bottom HUD */}
      {isSelectionMode && selectedIds.size > 0 && (
        <View style={[styles.bulkHud, { bottom: Platform.OS === 'web' ? 76 : 76 + insets.bottom }]}>
          <TouchableOpacity style={styles.bulkActionBtn} onPress={handleTriggerBulkMove}>
            <Folder size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.bulkActionBtnText}>MOVE</Text>
          </TouchableOpacity>
 
          <TouchableOpacity style={styles.bulkActionBtn} onPress={handleBulkExport}>
            <Share2 size={16} color="#FFFC00" style={{ marginRight: 4 }} />
            <Text style={[styles.bulkActionBtnText, { color: '#FFFC00' }]}>SHARE</Text>
          </TouchableOpacity>
 
          <TouchableOpacity style={[styles.bulkActionBtn, styles.bulkActionDeleteBtn]} onPress={handleBulkDelete}>
            <Trash2 size={16} color="#FF3B30" style={{ marginRight: 4 }} />
            <Text style={[styles.bulkActionBtnText, { color: '#FF3B30' }]}>DELETE</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Secure PIN locks */}
      {isPrivateMode && (
        <PinLockModal
          visible={pinModalVisible}
          onSuccess={() => {
            setPinModalVisible(false);
            setIsUnlocked(true);
          }}
          onClose={() => {
            setPinModalVisible(false);
            navigation.goBack();
          }}
        />
      )}

      {/* Floating Plus Actions Modal */}
      <Modal transparent visible={fabMenuVisible} animationType="slide">
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setFabMenuVisible(false)}>
          <View style={styles.sheetContent}>
            <Text style={styles.sheetTitle}>Create / Upload</Text>

            <TouchableOpacity style={styles.sheetRow} onPress={() => { setDialogMode('create_folder'); setDialogInput(''); setDialogVisible(true); setFabMenuVisible(false); }}>
              <FolderPlus size={20} color="#FFFFFF" style={{ marginRight: 12 }} />
              <Text style={styles.sheetRowText}>New Folder</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetRow} onPress={() => handleUploadTrigger('camera')}>
              <ImageIcon size={20} color="#FFFFFF" style={{ marginRight: 12 }} />
              <Text style={styles.sheetRowText}>Upload Images / Videos</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.sheetRow, { borderBottomWidth: 0 }]} onPress={() => handleUploadTrigger('document')}>
              <Upload size={20} color="#FFFFFF" style={{ marginRight: 12 }} />
              <Text style={styles.sheetRowText}>Upload Document File</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Option Sheet Context Menu */}
      {selectedItem && (
        <Modal transparent visible={optionsVisible} animationType="fade">
          <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setOptionsVisible(false)}>
            <View style={styles.sheetContent}>
              <Text style={styles.sheetTitle}>{selectedItem.name}</Text>

              <TouchableOpacity style={styles.sheetRow} onPress={handleRenameTrigger}>
                <Edit size={18} color="#FFFFFF" style={{ marginRight: 12 }} />
                <Text style={styles.sheetRowText}>Rename</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.sheetRow, { borderBottomWidth: 0 }]} onPress={handleDeleteItem}>
                <Trash2 size={18} color="#FF3B30" style={{ marginRight: 12 }} />
                <Text style={[styles.sheetRowText, { color: '#FF3B30' }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Folder Picker Modal (Move Destination) */}
      <Modal transparent visible={moveModalVisible} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Destination</Text>
              <TouchableOpacity onPress={() => setMoveModalVisible(false)}>
                <X size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 250, marginBottom: 20 }}>
              <TouchableOpacity
                style={[styles.moveFolderRow, moveTargetFolderId === null && styles.moveFolderRowSelected]}
                onPress={() => setMoveTargetFolderId(null)}
              >
                <HardDrive size={18} color="#FFFFFF" style={{ marginRight: 12 }} />
                <Text style={styles.moveFolderRowText}>[Root Directory]</Text>
              </TouchableOpacity>

              {moveFolderList.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.moveFolderRow, moveTargetFolderId === f.id && styles.moveFolderRowSelected]}
                  onPress={() => setMoveTargetFolderId(f.id)}
                >
                  <Folder size={18} color="#FFFC00" style={{ marginRight: 12 }} />
                  <Text style={styles.moveFolderRowText}>{f.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.primaryBtn} onPress={handleExecuteBulkMove}>
              <Text style={styles.primaryBtnText}>MOVE HERE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Input dialog (Rename / New Folder) */}
      <Modal transparent visible={dialogVisible} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {dialogMode === 'create_folder' ? 'Create Folder' : 'Rename'}
              </Text>
              <TouchableOpacity onPress={() => setDialogVisible(false)}>
                <X size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <TextInput
              placeholder="Enter name..."
              placeholderTextColor="#8E8E93"
              value={dialogInput}
              onChangeText={setDialogInput}
              style={styles.modalInput}
              maxLength={40}
            />

            <TouchableOpacity style={styles.primaryBtn} onPress={handleDialogSubmit}>
              <Text style={styles.primaryBtnText}>Confirm</Text>
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
    fontSize: 14,
    fontWeight: '600',
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
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
  actionSquareBtn: {
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
  actionSquareBtnActive: {
    backgroundColor: '#FFFC00',
    borderColor: '#FFFC00',
  },
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2C2C2E',
  },
  crumbScroll: {
    alignItems: 'center',
  },
  crumbText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
  crumbTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  sortToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 252, 0, 0.12)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  sortToggleText: {
    color: '#FFFC00',
    fontSize: 11,
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 120,
  },
  fabBtn: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
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
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
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
  modalInput: {
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
  moveFolderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
  moveFolderRowSelected: {
    backgroundColor: 'rgba(255, 252, 0, 0.15)',
  },
  moveFolderRowText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
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
  fileCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxSelected: {
    backgroundColor: '#FFFC00',
    borderColor: '#FFFC00',
  },
  checkboxCheck: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
  },
});
export default DriveContainer;
