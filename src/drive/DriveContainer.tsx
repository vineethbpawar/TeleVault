import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Modal, Platform, AppState, ScrollView, RefreshControl, Dimensions, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, FolderPlus, Upload, ArrowLeft, Folder, ChevronRight, ChevronLeft, MoreVertical, Search, ArrowUpDown, Lock, FileText, HardDrive, Star, Image as ImageIcon, Video, Trash2, Edit, CheckSquare, X, Share2, CloudUpload, AlertTriangle, Info } from 'lucide-react-native';
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
import { previewCacheService } from '../services/previewCacheService';
import VideoPlayer from '../components/VideoPlayer';

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

let pdfjsPromise: Promise<any> | null = null;

function loadPdfJs(): Promise<any> {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Window undefined'));
      return;
    }
    if ((window as any).pdfjsLib) {
      resolve((window as any).pdfjsLib);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
    script.onload = async () => {
      const pdfjsLib = (window as any).pdfjsLib;
      try {
        const workerRes = await fetch('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js');
        const workerBlob = new Blob([await workerRes.text()], { type: 'application/javascript' });
        pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
      } catch (err) {
        console.warn('Failed to load inline worker, falling back to CDN url:', err);
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
      }
      resolve(pdfjsLib);
    };
    script.onerror = (e) => reject(e);
    document.head.appendChild(script);
  });
  return pdfjsPromise;
}

const WebPdfViewer: React.FC<{ url: string }> = ({ url }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    loadPdfJs()
      .then(async (pdfjsLib) => {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdf = await loadingTask.promise;
        if (!active) return;
        setLoading(false);

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (!active) break;
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.5 });

          const canvas = document.createElement('canvas');
          canvas.style.cssText = 'width: 100%; margin-bottom: 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: block;';
          const context = canvas.getContext('2d');
          if (context) {
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            container.appendChild(canvas);

            const renderContext = {
              canvasContext: context,
              viewport: viewport,
            };
            await page.render(renderContext).promise;
          }
        }
      })
      .catch((err) => {
        console.error('PDF rendering error:', err);
        if (active) {
          setError(err.message || 'Failed to render PDF.');
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [url]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FFFC00" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ color: '#FF3B30', textAlign: 'center' }}>{error}</Text>
      </View>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '75vh',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        padding: '8px',
      }}
    />
  );
};

export const DriveFileGridItem: React.FC<{
  file: any;
  size: number;
  onPress: () => void;
  onMorePress: () => void;
  isSelected: boolean;
  isSelectionMode: boolean;
  onSelectToggle: () => void;
}> = React.memo(({ file, size, onPress, onMorePress, isSelected, isSelectionMode, onSelectToggle }) => {
  const isVideo = file.file_type === 'video';
  const isImage = file.file_type === 'image' ||
    (file.mime_type && file.mime_type.startsWith('image/')) ||
    (file.file_name && /\.(jpg|jpeg|png|gif|webp|bmp|heic)$/i.test(file.file_name));

  const [imgUri, setImgUri] = useState<string | null>(() => {
    if (!isImage && !isVideo) return null;
    return previewCacheService.getInMemoryPreview(file.telegram_file_id || file.id);
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    if (isImage || isVideo) {
      setLoading(true);
      previewCacheService.resolveFilePreview(file, false, undefined, (generatedUri) => {
        if (active) {
          setImgUri(generatedUri);
        }
      }, 'low').then(res => {
        if (active) {
          if (res.previewUri) {
            setImgUri(res.previewUri);
          }
          setLoading(false);
        }
      }).catch(() => {
        if (active) setLoading(false);
      });
    }

    return () => {
      active = false;
    };
  }, [file.id, file.local_thumbnail_uri, file.telegram_file_id]);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={isSelectionMode ? onSelectToggle : onPress}
      onLongPress={onMorePress}
      style={{
        width: size,
        height: size,
        margin: 4,
        position: 'relative',
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#1E1E1E',
        borderWidth: 1,
        borderColor: '#2C2C2E',
      }}
    >
      {/* Thumbnail background */}
      {imgUri ? (
        <Image source={{ uri: imgUri }} style={styles.gridFileImage} resizeMode="cover" />
      ) : (
        <View style={styles.gridFileFallback}>
          {loading ? (
            <ActivityIndicator size="small" color="#FFFC00" />
          ) : isVideo ? (
            <Video size={24} color="#8E8E93" />
          ) : isImage ? (
            <ImageIcon size={24} color="#8E8E93" />
          ) : (
            <FileText size={24} color="#007AFF" />
          )}
          {(!isImage && !isVideo) && (
            <Text style={styles.gridDocName} numberOfLines={2}>
              {file.file_name}
            </Text>
          )}
        </View>
      )}

      {/* Title overlay for images/videos in drive to keep the drive feel */}
      {(isImage || isVideo) && imgUri && (
        <View style={styles.gridFileTitleOverlay}>
          <Text style={styles.gridFileTitleText} numberOfLines={1}>
            {file.file_name}
          </Text>
        </View>
      )}

      {/* Video Badge */}
      {isVideo && (
        <View style={styles.gridVideoBadge}>
          <Video size={8} color="#FFFFFF" fill="#FFFFFF" />
        </View>
      )}

      {/* Uploading indicator */}
      {!file.telegram_file_id && (
        <View style={styles.gridUploadingBadge}>
          <CloudUpload size={8} color="#FFFC00" />
        </View>
      )}

      {/* More menu trigger */}
      {!isSelectionMode && (
        <TouchableOpacity
          style={styles.gridFileMore}
          onPress={onMorePress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MoreVertical size={14} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Selection Checkbox */}
      {isSelectionMode && (
        <View style={[styles.gridSelectionOverlay, isSelected && styles.gridSelectionOverlaySelected]}>
          <View style={[styles.gridCheckbox, isSelected && styles.gridCheckboxSelected]}>
            {isSelected && <Text style={styles.gridCheckboxCheck}>✓</Text>}
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
});

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

  // Custom Google Drive-like Preview states
  const [previewFile, setPreviewFile] = useState<any | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number>(-1);
  const [resolvedPreviewUri, setResolvedPreviewUri] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [openingDoc, setOpeningDoc] = useState<boolean>(false);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState<boolean>(false);

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

    const idx = processedFiles.findIndex(f => f.id === targetFile.id);
    setPreviewIndex(idx);
    setPreviewFile(targetFile);
  };

  useEffect(() => {
    if (!previewFile) {
      setResolvedPreviewUri(null);
      setPreviewError(null);
      return;
    }

    let active = true;
    setPreviewLoading(true);
    setPreviewError(null);

    previewCacheService.resolveFilePreview(previewFile, false)
    .then(res => {
      if (active) {
        const uri = res.playableUri || res.previewUri;
        if (uri) {
          setResolvedPreviewUri(uri);
        } else {
          setPreviewError('Failed to resolve preview.');
        }
        setPreviewLoading(false);
      }
    })
    .catch(err => {
      if (active) {
        setPreviewError(err.message || 'Failed to resolve preview.');
        setPreviewLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [previewFile?.id]);

  useEffect(() => {
    if (!resolvedPreviewUri || !previewFile) {
      setTextContent(null);
      return;
    }

    const isText = previewFile.mime_type?.startsWith('text/') ||
      (previewFile.file_name && /\.(txt|log|json|csv|md|js|ts|html|css|xml|yaml|yml)$/i.test(previewFile.file_name));

    if (isText && Platform.OS === 'web') {
      let active = true;
      setLoadingText(true);
      fetch(resolvedPreviewUri)
        .then(res => res.text())
        .then(text => {
          if (active) {
            setTextContent(text);
            setLoadingText(false);
          }
        })
        .catch(() => {
          if (active) {
            setTextContent('Failed to load document content.');
            setLoadingText(false);
          }
        });

      return () => {
        active = false;
      };
    } else {
      setTextContent(null);
    }
  }, [resolvedPreviewUri, previewFile?.id]);

  const handleNextPreview = () => {
    if (previewIndex >= 0 && previewIndex < processedFiles.length - 1) {
      const nextIndex = previewIndex + 1;
      setPreviewIndex(nextIndex);
      setPreviewFile(processedFiles[nextIndex]);
    }
  };

  const handlePrevPreview = () => {
    if (previewIndex > 0) {
      const prevIndex = previewIndex - 1;
      setPreviewIndex(prevIndex);
      setPreviewFile(processedFiles[prevIndex]);
    }
  };

  const handleToggleFavorite = async () => {
    if (!previewFile) return;
    try {
      const updated = await fileService.toggleFavoriteFile(previewFile.id, !previewFile.is_favorite);
      setPreviewFile(updated);
      loadContent(false);
      showToast(updated.is_favorite ? 'Added to favorites.' : 'Removed from favorites.');
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle favorite.');
    }
  };

  const handleOpenFile = async () => {
    if (!previewFile) return;
    setOpeningDoc(true);
    try {
      await fileOpenService.openDocument(previewFile as any);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to open file.');
    } finally {
      setOpeningDoc(false);
    }
  };

  const handleDeletePreviewFile = () => {
    if (!previewFile) return;
    Alert.alert('Confirm Delete', 'Permanently delete this file?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await fileService.bulkDelete([previewFile.id], true);
            setPreviewFile(null);
            loadContent(false);
            showToast('File deleted.');
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to delete file.');
          }
        }
      }
    ]);
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
          const mime = asset.mimeType || 'application/octet-stream';
          let detectedType: 'image' | 'video' | 'document' = 'document';
          if (mime.startsWith('image/')) {
            detectedType = 'image';
          } else if (mime.startsWith('video/')) {
            detectedType = 'video';
          }
          await scheduleUpload(
            asset.uri,
            detectedType,
            asset.name,
            mime,
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
      // 1. Create placeholder record in Supabase immediately with local URI cached in local_thumbnail_uri
      const placeholder = await fileService.saveFileMetadata({
        folder_id: currentFolder ? currentFolder.id : null,
        file_name: name,
        file_type: type,
        mime_type: mime,
        file_size: size,
        is_private: isPrivateMode,
        is_drive_file: true,
        local_thumbnail_uri: uri, // Cache local uri as preview cache during upload
        telegram_file_id: null,
        telegram_message_id: null,
        telegram_file_unique_id: null,
        overlay_metadata: null,
      });

      // 2. Queue the item referencing the placeholder's database ID
      await uploadQueueService.addToUploadQueue({
        db_file_id: placeholder.id,
        local_uri: uri,
        local_thumbnail_uri: uri,
        file_name: name,
        file_type: type,
        mime_type: mime,
        file_size: size,
        destination: isPrivateMode ? 'private' : 'drive',
        folder_id: currentFolder ? currentFolder.id : null,
        is_private: isPrivateMode,
        is_drive_file: true,
        overlay_metadata: null,
      });

      // Refresh files list immediately to show the placeholder
      loadContent(false);

      setQueueModalVisible(true);
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

  const screenWidth = Dimensions.get('window').width;

  const renderHeader = () => {
    return (
      <View>
        {/* Folders Section */}
        {processedFolders.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Folders</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.foldersScroll}
            >
              {processedFolders.map(folder => (
                <TouchableOpacity
                  key={folder.id}
                  style={styles.gridFolderCard}
                  onPress={() => handleEnterFolder(folder)}
                  onLongPress={() => handleSelectItemOption('folder', folder.id, folder.name)}
                >
                  <Folder size={18} color="#FFFC00" style={{ marginRight: 8 }} />
                  <Text style={styles.gridFolderName} numberOfLines={1}>{folder.name}</Text>
                  <TouchableOpacity
                    style={styles.gridFolderMore}
                    onPress={() => handleSelectItemOption('folder', folder.id, folder.name)}
                  >
                    <MoreVertical size={14} color="#8E8E93" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Files Section Title */}
        {processedFiles.length > 0 && (
          <Text style={styles.sectionTitle}>Files</Text>
        )}
      </View>
    );
  };

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
          key="grid-3-columns"
          data={processedFiles}
          numColumns={3}
          keyExtractor={(item) => `file-${item.id}`}
          ListHeaderComponent={renderHeader}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#FFFC00']}
              tintColor="#FFFC00"
            />
          }
          renderItem={({ item }) => {
            const isSelected = selectedIds.has(item.id);
            const size = (screenWidth - 32) / 3;
            return (
              <View style={{ padding: 2 }}>
                <DriveFileGridItem
                  file={item}
                  size={size}
                  onPress={() => handleFilePress(item)}
                  onMorePress={() => handleSelectItemOption('file', item.id, item.file_name)}
                  isSelected={isSelected}
                  isSelectionMode={isSelectionMode}
                  onSelectToggle={() => toggleSelectId(item.id)}
                />
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

      {/* Custom Google Drive Preview Modal */}
      {previewFile && (
        <Modal
          visible={previewFile !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setPreviewFile(null)}
        >
          <View style={styles.previewBackdrop}>
            {/* Top Toolbar */}
            <View style={[styles.previewHeader, { paddingTop: insets.top > 0 ? insets.top + 6 : 16 }]}>
              <TouchableOpacity onPress={() => setPreviewFile(null)} style={styles.previewBackBtn}>
                <ArrowLeft size={24} color="#FFFFFF" />
              </TouchableOpacity>
              
              <Text style={styles.previewTitle} numberOfLines={1}>
                {previewFile.file_name}
              </Text>

              <View style={styles.previewActions}>
                <TouchableOpacity onPress={() => setShowDetails(!showDetails)} style={styles.previewActionBtn}>
                  <Info size={20} color={showDetails ? '#FFFC00' : '#FFFFFF'} />
                </TouchableOpacity>

                <TouchableOpacity onPress={handleToggleFavorite} style={styles.previewActionBtn}>
                  <Star
                    size={20}
                    color={previewFile.is_favorite ? '#FFFC00' : '#FFFFFF'}
                    fill={previewFile.is_favorite ? '#FFFC00' : 'none'}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleOpenFile}
                  disabled={openingDoc}
                  style={styles.previewActionBtn}
                >
                  {openingDoc ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Share2 size={20} color="#FFFFFF" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity onPress={handleDeletePreviewFile} style={styles.previewActionBtn}>
                  <Trash2 size={20} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Viewport Center */}
            <View style={styles.previewViewport}>
              {previewLoading ? (
                <ActivityIndicator size="large" color="#FFFC00" />
              ) : previewError ? (
                <View style={styles.previewErrorBox}>
                  <AlertTriangle size={48} color="#FF3B30" style={{ marginBottom: 12 }} />
                  <Text style={styles.previewErrorText}>{previewError}</Text>
                </View>
              ) : resolvedPreviewUri ? (
                (() => {
                  const isImage = previewFile.file_type === 'image' ||
                    (previewFile.mime_type && previewFile.mime_type.startsWith('image/')) ||
                    (previewFile.file_name && /\.(jpg|jpeg|png|gif|webp|bmp|heic)$/i.test(previewFile.file_name));
                  const isVideo = previewFile.file_type === 'video';
                  const isPdf = previewFile.mime_type === 'application/pdf' ||
                    (previewFile.file_name && /\.pdf$/i.test(previewFile.file_name));
                  const isText = previewFile.mime_type?.startsWith('text/') ||
                    (previewFile.file_name && /\.(txt|log|json|csv|md|js|ts|html|css|xml|yaml|yml)$/i.test(previewFile.file_name));
 
                  if (isImage) {
                    return (
                      <Image
                        source={{ uri: resolvedPreviewUri }}
                        style={styles.previewImage}
                        resizeMode="contain"
                      />
                    );
                  } else if (isVideo) {
                    return (
                      <VideoPlayer
                        source={resolvedPreviewUri}
                        style={styles.previewVideo}
                      />
                    );
                  } else if (isText && Platform.OS === 'web') {
                    return (
                      <View style={{
                        width: '100%',
                        height: '75vh',
                        backgroundColor: '#121324',
                        borderRadius: 12,
                        padding: 16,
                        borderWidth: 1,
                        borderColor: 'rgba(255, 252, 0, 0.15)',
                      } as any}>
                        {loadingText ? (
                          <ActivityIndicator size="large" color="#FFFC00" />
                        ) : (
                          <ScrollView showsVerticalScrollIndicator={true}>
                            <Text style={{
                              color: '#E5E5EA',
                              fontFamily: 'monospace',
                              fontSize: 13,
                              lineHeight: 18,
                            } as any}>
                              {textContent}
                            </Text>
                          </ScrollView>
                        )}
                      </View>
                    );
                  } else {
                    return (
                      <View style={styles.previewDocCard}>
                        <FileText size={64} color="#007AFF" style={{ marginBottom: 16 }} />
                        <Text style={styles.previewDocTitle} numberOfLines={2}>
                          {previewFile.file_name}
                        </Text>
                        <Text style={styles.previewDocMeta}>
                          {previewFile.mime_type || 'application/octet-stream'}
                        </Text>
                        <TouchableOpacity style={styles.previewOpenBtn} onPress={handleOpenFile}>
                          <Text style={styles.previewOpenBtnText}>Open File</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  }
                })()
              ) : (
                <View style={styles.previewErrorBox}>
                  <CloudUpload size={48} color="#FFFC00" style={{ marginBottom: 12 }} />
                  <Text style={styles.previewErrorText}>File is enqueued for upload...</Text>
                </View>
              )}

              {/* Navigation Arrows */}
              {previewIndex > 0 && (
                <TouchableOpacity style={styles.previewArrowLeft} onPress={handlePrevPreview}>
                  <ChevronLeft size={36} color="#FFFFFF" />
                </TouchableOpacity>
              )}
              {previewIndex < processedFiles.length - 1 && (
                <TouchableOpacity style={styles.previewArrowRight} onPress={handleNextPreview}>
                  <ChevronRight size={36} color="#FFFFFF" />
                </TouchableOpacity>
              )}
            </View>

            {/* Bottom details pane */}
            {showDetails && (
              <View style={[styles.previewDetailsPane, { paddingBottom: insets.bottom > 0 ? insets.bottom + 12 : 20 }]}>
                <View style={styles.previewDetailRow}>
                  <Text style={styles.previewDetailLabel}>Size</Text>
                  <Text style={styles.previewDetailValue}>
                    {previewFile.file_size ? (previewFile.file_size / (1024 * 1024)).toFixed(2) + ' MB' : '0 B'}
                  </Text>
                </View>
                <View style={styles.previewDetailRow}>
                  <Text style={styles.previewDetailLabel}>Date</Text>
                  <Text style={styles.previewDetailValue}>
                    {previewFile.created_at ? new Date(previewFile.created_at).toLocaleDateString() : 'N/A'}
                  </Text>
                </View>
                <View style={styles.previewDetailRow}>
                  <Text style={styles.previewDetailLabel}>Protection</Text>
                  <Text style={[styles.previewDetailValue, { color: previewFile.is_private ? '#FFFC00' : '#8E8E93' }]}>
                    {previewFile.is_private ? '🔒 E2EE Encrypted' : '🌐 Cloud storage'}
                  </Text>
                </View>
                {previewFile.telegram_message_id && (
                  <View style={styles.previewDetailRow}>
                    <Text style={styles.previewDetailLabel}>Message ID</Text>
                    <Text style={styles.previewDetailValue}>#{previewFile.telegram_message_id}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </Modal>
      )}
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
  gridFolderCard: {
    width: 140,
    height: 44,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginRight: 10,
  },
  gridFolderName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  gridFolderMore: {
    padding: 2,
  },
  gridFileImage: {
    width: '100%',
    height: '100%',
  },
  gridFileFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  gridDocName: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
    width: '100%',
  },
  gridFileTitleOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  gridFileTitleText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '500',
  },
  gridVideoBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    padding: 3,
    borderRadius: 6,
  },
  gridUploadingBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    padding: 3,
    borderRadius: 6,
  },
  gridFileMore: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 4,
    borderRadius: 10,
  },
  gridSelectionOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    padding: 8,
  },
  gridSelectionOverlaySelected: {
    backgroundColor: 'rgba(255, 252, 0, 0.15)',
  },
  gridCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridCheckboxSelected: {
    backgroundColor: '#FFFC00',
    borderColor: '#FFFC00',
  },
  gridCheckboxCheck: {
    color: '#000000',
    fontSize: 10,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginHorizontal: 12,
    marginTop: 16,
    marginBottom: 8,
  },
  foldersScroll: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: '#090A14',
    justifyContent: 'space-between',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  previewBackBtn: {
    padding: 4,
  },
  previewTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginHorizontal: 16,
  },
  previewActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewActionBtn: {
    marginLeft: 16,
    padding: 4,
  },
  previewViewport: {
    flex: 1,
    width: '100%',
    minHeight: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingHorizontal: 40,
  },
  previewImage: {
    width: '100%',
    height: '85%',
    alignSelf: 'stretch',
  },
  previewVideo: {
    width: '100%',
    height: '85%',
    alignSelf: 'stretch',
  },
  previewDocCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  previewDocTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  previewDocMeta: {
    color: '#8E8E93',
    fontSize: 13,
    marginBottom: 20,
  },
  previewOpenBtn: {
    backgroundColor: '#FFFC00',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  previewOpenBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
  previewErrorBox: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  previewErrorText: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
  },
  previewArrowLeft: {
    position: 'absolute',
    left: 8,
    top: '50%',
    transform: [{ translateY: -18 }],
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 6,
    borderRadius: 20,
  },
  previewArrowRight: {
    position: 'absolute',
    right: 8,
    top: '50%',
    transform: [{ translateY: -18 }],
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 6,
    borderRadius: 20,
  },
  previewDetailsPane: {
    backgroundColor: '#0F1123',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  previewDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  previewDetailLabel: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
  },
  previewDetailValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
export default DriveContainer;
