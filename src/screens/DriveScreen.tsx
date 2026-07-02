import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Image,
} from 'react-native';
import { previewCacheService } from '../services/previewCacheService';
import {
  Plus,
  FolderPlus,
  Upload,
  ArrowLeft,
  Folder,
  ChevronRight,
  MoreVertical,
  Search,
  ArrowUpDown,
  FileText,
  HardDrive,
  Star,
  Image as ImageIcon,
  Video,
  FileCode,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { CompositeScreenProps, useIsFocused } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, AppStackParamList } from '../types/navigation';
import { fileService } from '../services/fileService';
import { telegramService } from '../services/telegramService';
import { securityService } from '../services/securityService';
import { uploadQueueService } from '../services/uploadQueueService';
import { TeleVaultFile, TeleVaultFolder } from '../types/file';
import FolderCard from '../components/FolderCard';
import FileCard from '../components/FileCard';
import EmptyState from '../components/EmptyState';
import PinLockModal from '../components/PinLockModal';
import UploadProgress from '../components/UploadProgress';
import AppButton from '../components/AppButton';
import AppInput from '../components/AppInput';
import AppCard from '../components/AppCard';

import Screen from '../components/Screen';
import FilePreviewCard from '../components/FilePreviewCard';

const RecentFileCard: React.FC<{ item: TeleVaultFile; onPress: () => void; formatSize: (size: number) => string }> = ({ item, onPress, formatSize }) => {
  return (
    <View style={{ marginRight: 10, position: 'relative' }}>
      <FilePreviewCard
        file={item}
        variant="recent"
        onPress={onPress}
      />
      <View style={styles.recentOverlay}>
        <Text style={styles.recentFileName} numberOfLines={1}>{item.file_name}</Text>
        <Text style={styles.recentFileSize}>{formatSize(item.file_size || 0)}</Text>
      </View>
    </View>
  );
};

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'DriveTab'>,
  NativeStackScreenProps<AppStackParamList>
>;

type SortOption = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc' | 'size_desc';

export const DriveScreen: React.FC<Props> = ({ navigation }) => {
  const [folders, setFolders] = useState<TeleVaultFolder[]>([]);
  const [files, setFiles] = useState<TeleVaultFile[]>([]);
  const [recentFiles, setRecentFiles] = useState<TeleVaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video' | 'document'>('all');

  // Storage Stats State
  const [storageUsage, setStorageUsage] = useState({ totalSize: 0, filesCount: 0 });

  // Folder navigation state
  const [currentFolder, setCurrentFolder] = useState<TeleVaultFolder | null>(null);
  const [folderHistory, setFolderHistory] = useState<TeleVaultFolder[]>([]);

  // Security state
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const isFocused = useIsFocused();
  const [configReady, setConfigReady] = useState<boolean | null>(telegramService.configReady);

  useEffect(() => {
    const unsubscribe = telegramService.subscribeConfigReady(() => {
      setConfigReady(telegramService.configReady);
    });
    return unsubscribe;
  }, []);

  // Floating Action Menu state
  const [fabMenuVisible, setFabMenuVisible] = useState(false);

  // Upload/Progress State
  const [queueModalVisible, setQueueModalVisible] = useState(false);

  // Dialog State (Create Folder / Rename)
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create_folder' | 'rename_folder' | 'rename_file'>('create_folder');
  const [dialogInput, setDialogInput] = useState('');
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  // File Options bottom sheet style modal
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{ type: 'folder' | 'file'; id: string; name: string } | null>(null);

  // PIN verification check
  useEffect(() => {
    if (isFocused) {
      const checkLock = async () => {
        const lockEnabled = await securityService.isDriveLockEnabled();
        if (lockEnabled && !isUnlocked) {
          setPinModalVisible(true);
        } else {
          loadContent(true);
        }
      };
      checkLock();
    } else {
      // Re-lock when screen loses focus
      setIsUnlocked(false);
    }
  }, [isFocused, isUnlocked]);

  const loadContent = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const parentId = currentFolder ? currentFolder.id : null;
      const [fetchedFolders, fetchedFiles, fetchedRecents, usage] = await Promise.all([
        fileService.fetchDriveFolders(parentId),
        fileService.fetchDriveFiles(parentId),
        fileService.fetchRecentDriveFiles(),
        fileService.getStorageUsage(),
      ]);
      setFolders(fetchedFolders);
      setFiles(fetchedFiles);
      setRecentFiles(fetchedRecents);
      setStorageUsage(usage);
    } catch (error) {
      console.error('Failed to load drive content:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isUnlocked || !pinModalVisible) {
      loadContent(true);
    }
  }, [currentFolder]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadContent(false);
  }, [currentFolder]);

  const handlePinSuccess = () => {
    setIsUnlocked(true);
    setPinModalVisible(false);
    loadContent(true);
  };

  const handlePinCancel = () => {
    setPinModalVisible(false);
    navigation.navigate('CameraTab');
  };

  // Folder navigation helpers
  const navigateToFolder = (folder: TeleVaultFolder) => {
    setFolderHistory((prev) => [...prev, folder]);
    setCurrentFolder(folder);
  };

  const navigateBack = () => {
    if (folderHistory.length === 0) return;
    const newHistory = folderHistory.slice(0, -1);
    setFolderHistory(newHistory);
    setCurrentFolder(newHistory.length > 0 ? newHistory[newHistory.length - 1] : null);
  };

  // Upload Actions
  const handleUpload = async (source: 'camera' | 'document') => {
    setFabMenuVisible(false);

    try {
      const config = await telegramService.getTelegramConfig();
      if (!config.botToken || !config.channelId) {
        Alert.alert(
          'Sync Credentials Required',
          'Please configure Telegram storage settings before uploading.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Settings', onPress: () => navigation.navigate('TelegramConnect', { fromSettings: false }) },
          ]
        );
        return;
      }
    } catch (err) {
      return;
    }

    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission Denied', 'TeleVault needs access to your gallery.');
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          allowsEditing: false,
          quality: 0.9,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          await processUpload(
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
          await processUpload(
            asset.uri,
            'document',
            asset.name,
            asset.mimeType || 'application/octet-stream',
            asset.size || 0
          );
        }
      }
    } catch (error: any) {
      console.error('File pick error:', error);
      Alert.alert('Error', error.message || 'Failed to select file.');
    }
  };

  const processUpload = async (uri: string, type: 'image' | 'video' | 'document', name: string, mime: string, size: number) => {
    if (size > 500 * 1024 * 1024) {
      Alert.alert(
        'File Too Large',
        'This file is too large for Large File Mode MVP. Current max is 500 MB.'
      );
      return;
    }

    if (size > 50 * 1024 * 1024) {
      Alert.alert(
        'Large File Detected',
        'TeleVault will split this into smaller parts (45 MB chunks) and upload to Telegram.'
      );
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
        is_private: false,
        is_drive_file: true,
        overlay_metadata: null,
      });

      setQueueModalVisible(true);
      setTimeout(() => {
        loadContent(false);
      }, 3000);
    } catch (error: any) {
      console.error('Upload process failed:', error);
      Alert.alert('Upload Failed', error.message || 'An error occurred during file upload scheduling.');
    }
  };

  const handleDialogSubmit = async () => {
    if (!dialogInput.trim()) {
      Alert.alert('Error', 'Please enter a name.');
      return;
    }

    setDialogVisible(false);
    setLoading(true);

    try {
      const name = dialogInput.trim();
      if (dialogMode === 'create_folder') {
        const parentId = currentFolder ? currentFolder.id : null;
        await fileService.createFolder(name, parentId, false);
        Alert.alert('Success', 'Folder created.');
      } else if (dialogMode === 'rename_folder' && activeItemId) {
        await fileService.renameFolder(activeItemId, name);
        Alert.alert('Success', 'Folder renamed.');
      } else if (dialogMode === 'rename_file' && activeItemId) {
        await fileService.renameFile(activeItemId, name);
        Alert.alert('Success', 'File renamed.');
      }
      loadContent(false);
    } catch (error: any) {
      Alert.alert('Operation Failed', error.message || 'An error occurred.');
      setLoading(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!selectedItem) return;
    setOptionsVisible(false);

    Alert.alert(
      'Delete Confirmation',
      `Are you sure you want to delete ${selectedItem.name}? This will delete the metadata. Telegram file storage remains unaffected.`,
      [
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
                await fileService.deleteFileMetadata(selectedItem.id);
              }
              loadContent(false);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete item.');
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleRenameTrigger = () => {
    if (!selectedItem) return;
    setOptionsVisible(false);
    setDialogInput(selectedItem.name);
    setActiveItemId(selectedItem.id);
    setDialogMode(selectedItem.type === 'folder' ? 'rename_folder' : 'rename_file');
    setDialogVisible(true);
  };

  const openItemMenu = (type: 'folder' | 'file', id: string, name: string) => {
    setSelectedItem({ type, id, name });
    setOptionsVisible(true);
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getProcessedItems = () => {
    const query = searchQuery.toLowerCase();
    
    // Filter folders
    const filteredFolders = folders.filter((f) => f.name.toLowerCase().includes(query));
    
    // Filter files (by search query and file type tab)
    const filteredFiles = files.filter((f) => {
      const matchesSearch = f.file_name.toLowerCase().includes(query);
      const matchesType = filterType === 'all' || f.file_type === filterType;
      return matchesSearch && matchesType;
    });

    // Sorting
    const sortedFolders = [...filteredFolders].sort((a, b) => {
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const sortedFiles = [...filteredFiles].sort((a, b) => {
      if (sortBy === 'name_asc') return a.file_name.localeCompare(b.file_name);
      if (sortBy === 'name_desc') return b.file_name.localeCompare(a.file_name);
      if (sortBy === 'date_asc') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === 'size_desc') return (b.file_size || 0) - (a.file_size || 0);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return { sortedFolders, sortedFiles };
  };

  const { sortedFolders, sortedFiles } = getProcessedItems();

  if (configReady === null) {
    return (
      <Screen edges={['top']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FFFC00" />
          <Text style={{ color: '#8e92af', marginTop: 12, fontSize: 15, fontWeight: '600' }}>
            Restoring Telegram connection...
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <PinLockModal visible={pinModalVisible} onClose={handlePinCancel} onSuccess={handlePinSuccess} mode="verify" />
      <UploadProgress visible={queueModalVisible} onClose={() => setQueueModalVisible(false)} />

      {/* Header */}
      <View style={styles.header}>
        {currentFolder ? (
          <TouchableOpacity onPress={navigateBack} style={styles.backButton}>
            <ArrowLeft size={24} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 16 }} />
        )}
        <Text style={styles.headerTitle}>{currentFolder ? currentFolder.name : 'Cloud Drive'}</Text>
        <TouchableOpacity onPress={() => setQueueModalVisible(true)} style={styles.queueBtn}>
          <Upload size={20} color="#FFFC00" />
        </TouchableOpacity>
      </View>

      {/* Storage usage statistics widget */}
      {!currentFolder && (
        <AppCard style={styles.storageCard}>
          <View style={styles.storageHeader}>
            <HardDrive size={20} color="#FFFC00" />
            <Text style={styles.storageTitle}>DRIVE STORAGE USAGE</Text>
          </View>
          <View style={styles.storageDetails}>
            <Text style={styles.storageNum}>{formatSize(storageUsage.totalSize)}</Text>
            <Text style={styles.storageLabel}>Used across {storageUsage.filesCount} files</Text>
          </View>
          <View style={styles.progressBarBg}>
            {/* Standard progress bar representation */}
            <View style={[styles.progressBarFill, { width: `${Math.min(100, (storageUsage.totalSize / (1024 * 1024 * 1024)) * 100)}%` }]} />
          </View>
        </AppCard>
      )}

      {/* Search and Sort Toolbar */}
      <View style={styles.toolbar}>
        <View style={styles.searchBar}>
          <Search size={16} color="#8e92af" style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search files..."
            placeholderTextColor="#8e92af"
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => {
            const options: { text: string; value: SortOption }[] = [
              { text: 'Date (Newest)', value: 'date_desc' },
              { text: 'Date (Oldest)', value: 'date_asc' },
              { text: 'Name (A-Z)', value: 'name_asc' },
              { text: 'Name (Z-A)', value: 'name_desc' },
              { text: 'Size (Largest)', value: 'size_desc' },
            ];
            Alert.alert(
              'Sort By',
              '',
              options.map((opt) => ({
                text: opt.text + (sortBy === opt.value ? ' ✓' : ''),
                onPress: () => setSortBy(opt.value),
              }))
            );
          }}
        >
          <ArrowUpDown size={18} color="#FFFC00" />
        </TouchableOpacity>
      </View>

      {/* File Type Filter Tabs */}
      <View style={styles.typeTabs}>
        {(['all', 'image', 'video', 'document'] as const).map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.typeTab, filterType === type && styles.activeTypeTab]}
            onPress={() => setFilterType(type)}
          >
            <Text style={[styles.typeTabText, filterType === type && styles.activeTypeTabText]}>
              {type === 'all' ? 'All' : type === 'image' ? 'Photos' : type === 'video' ? 'Videos' : 'Files'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recent Uploads Row (Root level only) */}
      {!currentFolder && recentFiles.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>RECENT UPLOADS</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={recentFiles}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.recentList}
            renderItem={({ item }) => (
              <RecentFileCard
                item={item}
                onPress={() => navigation.navigate('FileDetails', { file: item })}
                formatSize={formatSize}
              />
            )}
          />
        </View>
      )}

      {/* Main drive list */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : sortedFolders.length === 0 && sortedFiles.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFC00" />}
        >
          <EmptyState
            title="Drive is Empty"
            description="Tap the '+' button to create folders or upload documents to secure them."
          />
        </ScrollView>
      ) : (
        <FlatList
          data={[...sortedFolders.map((f) => ({ ...f, isFolder: true })), ...sortedFiles.map((f) => ({ ...f, isFolder: false }))]}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFC00" />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }: { item: any }) => {
            if (item.isFolder) {
              return (
                <FolderCard
                  folder={item}
                  onPress={() => navigateToFolder(item)}
                  onMorePress={() => openItemMenu('folder', item.id, item.name)}
                />
              );
            } else {
              return (
                <FileCard
                  file={item}
                  onPress={() => navigation.navigate('FileDetails', { file: item })}
                  onMorePress={() => openItemMenu('file', item.id, item.file_name)}
                />
              );
            }
          }}
        />
      )}

      {/* FAB Floating Menu */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setFabMenuVisible(!fabMenuVisible)}
        activeOpacity={0.8}
      >
        <Plus size={28} color="#000000" style={fabMenuVisible && { transform: [{ rotate: '45deg' }] }} />
      </TouchableOpacity>

      {/* FAB Option Overlay */}
      {fabMenuVisible && (
        <Modal transparent visible={fabMenuVisible} animationType="none">
          <TouchableOpacity style={styles.fabOverlay} activeOpacity={1} onPress={() => setFabMenuVisible(false)}>
            <View style={styles.fabMenuContainer}>
              <TouchableOpacity
                style={styles.fabMenuItem}
                onPress={() => {
                  setFabMenuVisible(false);
                  setDialogInput('');
                  setDialogMode('create_folder');
                  setDialogVisible(true);
                }}
              >
                <Text style={styles.fabMenuText}>New Folder</Text>
                <View style={styles.fabIconCircle}>
                  <FolderPlus size={20} color="#FFFC00" />
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.fabMenuItem} onPress={() => handleUpload('camera')}>
                <Text style={styles.fabMenuText}>Upload Gallery</Text>
                <View style={styles.fabIconCircle}>
                  <Upload size={20} color="#FFFC00" />
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.fabMenuItem} onPress={() => handleUpload('document')}>
                <Text style={styles.fabMenuText}>Upload File</Text>
                <View style={styles.fabIconCircle}>
                  <FileText size={20} color="#FFFC00" />
                </View>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Reusable dialog modal */}
      <Modal visible={dialogVisible} transparent animationType="fade">
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogBox}>
            <Text style={styles.dialogTitle}>
              {dialogMode === 'create_folder'
                ? 'Create Folder'
                : dialogMode === 'rename_folder'
                ? 'Rename Folder'
                : 'Rename File'}
            </Text>
            <AppInput
              placeholder="Enter name..."
              value={dialogInput}
              onChangeText={setDialogInput}
              autoFocus
            />
            <View style={styles.dialogButtons}>
              <AppButton
                title="Cancel"
                variant="secondary"
                onPress={() => setDialogVisible(false)}
                style={styles.dialogButton}
              />
              <AppButton title="Submit" onPress={handleDialogSubmit} style={styles.dialogButton} />
            </View>
          </View>
        </View>
      </Modal>

      {/* File/Folder Options Bottom Sheet Modal */}
      <Modal visible={optionsVisible} transparent animationType="slide">
        <TouchableOpacity
          style={styles.bottomSheetOverlay}
          activeOpacity={1}
          onPress={() => setOptionsVisible(false)}
        >
          <View style={styles.bottomSheetContainer}>
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle} numberOfLines={1}>
                {selectedItem?.name}
              </Text>
            </View>

            <TouchableOpacity style={styles.bottomSheetItem} onPress={handleRenameTrigger}>
              <Text style={styles.bottomSheetText}>Rename</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.bottomSheetItem, styles.bottomSheetItemDanger]}
              onPress={handleDeleteItem}
            >
              <Text style={[styles.bottomSheetText, styles.dangerText]}>Delete</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.bottomSheetItem, styles.bottomSheetItemCancel]}
              onPress={() => setOptionsVisible(false)}
            >
              <Text style={[styles.bottomSheetText, styles.cancelText]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  queueBtn: {
    padding: 8,
  },
  storageCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
  },
  storageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  storageTitle: {
    color: '#8e92af',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginLeft: 6,
  },
  storageDetails: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  storageNum: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  storageLabel: {
    color: '#8e92af',
    fontSize: 12,
    marginLeft: 8,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#1f2444',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFFC00',
  },
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 10,
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f1123',
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#1f2444',
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
  },
  sortButton: {
    width: 40,
    height: 40,
    backgroundColor: '#0f1123',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  typeTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  typeTab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginRight: 8,
    backgroundColor: '#0f1123',
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  activeTypeTab: {
    backgroundColor: '#FFFC00',
    borderColor: '#FFFC00',
  },
  typeTabText: {
    color: '#8e92af',
    fontSize: 12,
    fontWeight: '600',
  },
  activeTypeTabText: {
    color: '#000000',
  },
  recentSection: {
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  recentTitle: {
    color: '#FFFC00',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  recentList: {
    paddingRight: 16,
  },
  recentCard: {
    width: 100,
    height: 120,
    borderRadius: 16,
    marginRight: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1f2444',
    backgroundColor: '#0f1123',
  },
  recentImg: {
    width: '100%',
    height: '100%',
  },
  recentPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    padding: 6,
  },
  skeletonBg: {
    backgroundColor: '#0f1123',
  },
  recentFileName: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  recentFileSize: {
    color: '#FFFC00',
    fontSize: 9,
    marginTop: 2,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 10,
  },
  fabOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingBottom: 90,
    paddingRight: 24,
  },
  fabMenuContainer: {
    alignItems: 'flex-end',
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  fabMenuText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginRight: 12,
    backgroundColor: '#0f1123',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1f2444',
    overflow: 'hidden',
  },
  fabIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0f1123',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialogBox: {
    width: '100%',
    backgroundColor: '#0f1123',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  dialogTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  dialogButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  dialogButton: {
    width: '48%',
    marginVertical: 0,
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheetContainer: {
    backgroundColor: '#0f1123',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  bottomSheetHeader: {
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderColor: '#1f2444',
    paddingBottom: 12,
  },
  bottomSheetTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  bottomSheetItem: {
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#1f2444',
  },
  bottomSheetItemDanger: {
    borderColor: '#1f2444',
  },
  bottomSheetItemCancel: {
    borderBottomWidth: 0,
    marginTop: 8,
  },
  bottomSheetText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  dangerText: {
    color: '#FF453A',
  },
  cancelText: {
    color: '#8e92af',
  },
});

export default DriveScreen;
