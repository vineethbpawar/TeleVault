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
} from 'react-native';
import {
  Plus,
  FolderPlus,
  Upload,
  ArrowLeft,
  Lock,
  ChevronRight,
  MoreVertical,
  Search,
  ArrowUpDown,
  FileText,
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
import { TeleVaultFile, TeleVaultFolder } from '../types/file';
import FolderCard from '../components/FolderCard';
import FileCard from '../components/FileCard';
import EmptyState from '../components/EmptyState';
import PinLockModal from '../components/PinLockModal';
import UploadProgress from '../components/UploadProgress';
import AppButton from '../components/AppButton';
import AppInput from '../components/AppInput';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'PrivateDriveTab'>,
  NativeStackScreenProps<AppStackParamList>
>;

type SortOption = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc' | 'size_desc';

export const PrivateDriveScreen: React.FC<Props> = ({ navigation }) => {
  const [folders, setFolders] = useState<TeleVaultFolder[]>([]);
  const [files, setFiles] = useState<TeleVaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');

  // Folder navigation state
  const [currentFolder, setCurrentFolder] = useState<TeleVaultFolder | null>(null);
  const [folderHistory, setFolderHistory] = useState<TeleVaultFolder[]>([]);

  // Security state
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<'verify' | 'create'>('verify');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const isFocused = useIsFocused();

  // Floating Action Menu state
  const [fabMenuVisible, setFabMenuVisible] = useState(false);

  // Upload/Progress State
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');

  // Dialog State (Create Folder / Rename)
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create_folder' | 'rename_folder' | 'rename_file'>('create_folder');
  const [dialogInput, setDialogInput] = useState('');
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  // File Options bottom sheet style modal
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{ type: 'folder' | 'file'; id: string; name: string } | null>(null);

  // Check PIN security on focus
  useEffect(() => {
    if (isFocused) {
      const checkSecurity = async () => {
        const hasPin = await securityService.hasPin();
        if (!hasPin) {
          // First time, prompt to create PIN
          Alert.alert(
            'Secure Private Vault',
            'Would you like to set up a security PIN for your Private Drive? This keeps your vault private.',
            [
              {
                text: 'Skip',
                style: 'cancel',
                onPress: () => {
                  setIsUnlocked(true);
                  loadContent(true);
                },
              },
              {
                text: 'Create PIN',
                onPress: () => {
                  setPinModalMode('create');
                  setPinModalVisible(true);
                },
              },
            ]
          );
        } else {
          const lockEnabled = await securityService.isPrivateDriveLockEnabled();
          if (lockEnabled && !isUnlocked) {
            setPinModalMode('verify');
            setPinModalVisible(true);
          } else {
            setIsUnlocked(true);
            loadContent(true);
          }
        }
      };
      checkSecurity();
    } else {
      // Re-lock when screen loses focus
      setIsUnlocked(false);
    }
  }, [isFocused, isUnlocked]);

  const loadContent = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const parentId = currentFolder ? currentFolder.id : null;
      const [fetchedFolders, fetchedFiles] = await Promise.all([
        fileService.fetchPrivateDriveFolders(parentId),
        fileService.fetchPrivateDriveFiles(parentId),
      ]);
      setFolders(fetchedFolders);
      setFiles(fetchedFiles);
    } catch (error) {
      console.error('Failed to load private drive content:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isUnlocked) {
      loadContent(true);
    }
  }, [currentFolder, isUnlocked]);

  const onRefresh = useCallback(() => {
    if (!isUnlocked) return;
    setRefreshing(true);
    loadContent(false);
  }, [currentFolder, isUnlocked]);

  const handlePinSuccess = async () => {
    setIsUnlocked(true);
    setPinModalVisible(false);
    if (pinModalMode === 'create') {
      // Enable Private Drive Lock by default when PIN is created
      await securityService.setPrivateDriveLockEnabled(true);
    }
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

    // Verify Telegram Sync config
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
            asset.fileName || `TV_PRIVATE_${Date.now()}.jpg`,
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
    setUploading(true);
    setUploadMsg(`Securing & Uploading ${name} to Telegram...`);

    try {
      const telegramResult = await telegramService.uploadToTelegram(uri, type, name, mime);

      setUploadMsg('Saving private metadata to Supabase...');

      await fileService.saveFileMetadata({
        folder_id: currentFolder ? currentFolder.id : null,
        file_name: name,
        file_type: type,
        mime_type: mime,
        file_size: size || null,
        is_private: true,
        is_drive_file: true,
        telegram_message_id: telegramResult.telegramMessageId,
        telegram_file_id: telegramResult.telegramFileId,
        telegram_file_unique_id: telegramResult.telegramFileUniqueId,
        local_thumbnail_uri: type === 'image' ? uri : null,
      });

      Alert.alert('Success', 'Private file uploaded successfully.');
      loadContent(false);
    } catch (error: any) {
      console.error('Private upload failed:', error);
      Alert.alert('Upload Failed', error.message || 'An error occurred during private upload.');
    } finally {
      setUploading(false);
    }
  };

  // CRUD Operations Dialog Submission
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
        await fileService.createFolder(name, parentId, true); // isPrivate = true
        Alert.alert('Success', 'Private folder created.');
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

  // Delete Action
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

  // Rename action trigger
  const handleRenameTrigger = () => {
    if (!selectedItem) return;
    setOptionsVisible(false);
    setDialogInput(selectedItem.name);
    setActiveItemId(selectedItem.id);
    setDialogMode(selectedItem.type === 'folder' ? 'rename_folder' : 'rename_file');
    setDialogVisible(true);
  };

  // Open item menu
  const openItemMenu = (type: 'folder' | 'file', id: string, name: string) => {
    setSelectedItem({ type, id, name });
    setOptionsVisible(true);
  };

  // Sort and Filter computations
  const getProcessedItems = () => {
    const query = searchQuery.toLowerCase();
    const filteredFolders = folders.filter((f) => f.name.toLowerCase().includes(query));
    const filteredFiles = files.filter((f) => f.file_name.toLowerCase().includes(query));

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

  return (
    <SafeAreaView style={styles.container}>
      <PinLockModal visible={pinModalVisible} onClose={handlePinCancel} onSuccess={handlePinSuccess} mode={pinModalMode} />
      <UploadProgress visible={uploading} message={uploadMsg} />

      {/* Header */}
      <View style={styles.header}>
        {currentFolder ? (
          <TouchableOpacity onPress={navigateBack} style={styles.backButton}>
            <ArrowLeft size={24} color="#FF453A" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 16 }} />
        )}
        <Text style={[styles.headerTitle, { color: '#FF453A' }]}>
          {currentFolder ? currentFolder.name : 'Private Drive'}
        </Text>
        <Lock size={18} color="#FF453A" style={{ marginLeft: 6 }} />
        <View style={{ flex: 1 }} />
      </View>

      {/* Search and Sort Toolbar */}
      <View style={styles.toolbar}>
        <View style={styles.searchBar}>
          <Search size={16} color="#8E8E93" style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search private vault..."
            placeholderTextColor="#8E8E93"
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
          <ArrowUpDown size={18} color="#FF453A" />
        </TouchableOpacity>
      </View>

      {/* Main drive list */}
      {!isUnlocked || loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FF453A" />
        </View>
      ) : sortedFolders.length === 0 && sortedFiles.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF453A" />}
        >
          <EmptyState
            title="Private Drive is Empty"
            description="Secure your sensitive files here. Tap the '+' button to add folders or private files."
            icon={<Lock size={48} color="#FF453A" />}
          />
        </ScrollView>
      ) : (
        <FlatList
          data={[...sortedFolders.map((f) => ({ ...f, isFolder: true })), ...sortedFiles.map((f) => ({ ...f, isFolder: false }))]}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF453A" />}
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
      {isUnlocked && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: '#FF453A' }]}
          onPress={() => setFabMenuVisible(!fabMenuVisible)}
          activeOpacity={0.8}
        >
          <Plus size={28} color="#FFFFFF" style={fabMenuVisible && { transform: [{ rotate: '45deg' }] }} />
        </TouchableOpacity>
      )}

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
                <Text style={styles.fabMenuText}>New Private Folder</Text>
                <View style={styles.fabIconCircle}>
                  <FolderPlus size={20} color="#FF453A" />
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.fabMenuItem} onPress={() => handleUpload('camera')}>
                <Text style={styles.fabMenuText}>Upload Private Photo/Video</Text>
                <View style={styles.fabIconCircle}>
                  <Upload size={20} color="#FF453A" />
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.fabMenuItem} onPress={() => handleUpload('document')}>
                <Text style={styles.fabMenuText}>Upload Private File</Text>
                <View style={styles.fabIconCircle}>
                  <FileText size={20} color="#FF453A" />
                </View>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Reusable dialog modal for Creating/Renaming */}
      <Modal visible={dialogVisible} transparent animationType="fade">
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogBox}>
            <Text style={styles.dialogTitle}>
              {dialogMode === 'create_folder'
                ? 'Create Private Folder'
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
    paddingHorizontal: 16,
    height: 56,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
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
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
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
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    overflow: 'hidden',
  },
  fabIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
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
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2C2C2E',
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
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  bottomSheetHeader: {
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderColor: '#2C2C2E',
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
    borderColor: '#2C2C2E',
  },
  bottomSheetItemDanger: {
    borderColor: '#2C2C2E',
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
    color: '#8E8E93',
  },
});

export default PrivateDriveScreen;
