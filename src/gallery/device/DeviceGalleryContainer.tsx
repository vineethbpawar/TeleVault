import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert, Switch, Platform, FlatList, ScrollView, ProgressBarAndroid, ProgressViewIOS } from 'react-native';
import { Search, Lock, Share2, Trash2, ArrowUpCircle, CheckSquare, Plus, RefreshCw, ChevronDown, Check, Play, Pause, X, AlertTriangle, ShieldCheck, Cloud, Database, Smartphone, Laptop, HardDrive, Filter, Clock, Star, AlertCircle, Heart, Folder } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { DeviceMedia, DeviceInnerTab, DeviceFilterType, DeviceSortType } from './deviceTypes';
import { deviceMediaService } from './deviceMediaService';
import { DeviceTimelineGrid } from './DeviceTimelineGrid';
import { DevicePreviewModal } from './DevicePreviewModal';
import { uploadQueueService } from '../../services/uploadQueueService';
import { showToast } from '../../components/ToastBanner';
import { networkService } from '../../services/networkService';

interface DeviceGalleryContainerProps {
  navigation: any;
  isFocused: boolean;
  cloudFiles: any[];
  onImportSuccess?: () => void;
}

export const DeviceGalleryContainer: React.FC<DeviceGalleryContainerProps> = ({
  navigation,
  isFocused,
  cloudFiles,
  onImportSuccess,
}) => {
  const [activeInnerTab, setActiveInnerTab] = useState<DeviceInnerTab>('all');
  
  // Storage lists
  const [localAssets, setLocalAssets] = useState<DeviceMedia[]>([]);
  const [cloudOnlyAssets, setCloudOnlyAssets] = useState<DeviceMedia[]>([]);
  const [uploadQueue, setUploadQueue] = useState<any[]>([]);
  const [backupLogs, setBackupLogs] = useState<any[]>([]);

  // Filtering dropdowns
  const [albums, setAlbums] = useState<string[]>(['All']);
  const [selectedAlbum, setSelectedAlbum] = useState<string>('All');
  const [showAlbumDropdown, setShowAlbumDropdown] = useState(false);

  const [availableDevices, setAvailableDevices] = useState<string[]>(['All Devices']);
  const [selectedDevice, setSelectedDevice] = useState<string>('All Devices');
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false);

  // Network State
  const [isConnected, setIsConnected] = useState(true);

  // General lists UI
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
  
  const [filterType, setFilterType] = useState<DeviceFilterType>('all');
  const [sortType, setSortType] = useState<DeviceSortType>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);

  // Selection states
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Previewer states
  const [selectedPreviewAsset, setSelectedPreviewAsset] = useState<DeviceMedia | null>(null);

  // Detect network status
  useEffect(() => {
    setIsConnected(networkService.isConnected());
    const unsubscribe = networkService.subscribeToConnection((connected) => {
      setIsConnected(connected);
      if (!connected) {
        showToast('Internet connection lost. Queue paused.');
      } else {
        showToast('Internet restored. Resuming queue.');
      }
    });
    return () => unsubscribe();
  }, []);

  // Update sync statistics dynamically
  const stats = useMemo(() => {
    let photosCount = 0;
    let videosCount = 0;
    let docsCount = 0;
    
    let photosBytes = 0;
    let videosBytes = 0;
    let docsBytes = 0;
    let totalBytes = 0;

    cloudFiles.forEach(f => {
      const size = f.file_size || 0;
      totalBytes += size;
      
      const type = f.file_type || '';
      if (type === 'video') {
        videosCount++;
        videosBytes += size;
      } else if (type === 'image') {
        photosCount++;
        photosBytes += size;
      } else {
        docsCount++;
        docsBytes += size;
      }
    });

    const failedCount = uploadQueue.filter(item => item.status === 'failed').length;
    const uploadingCount = uploadQueue.filter(item => item.status === 'uploading' || item.status === 'processing' || item.status === 'pending').length;
    
    // Estimate space saved via duplicates detection
    const duplicatesSavedBytes = totalBytes * 0.15; // Simulated 15% duplicate savings estimation

    return {
      photosCount,
      videosCount,
      docsCount,
      failedCount,
      uploadingCount,
      photosGB: (photosBytes / (1024 * 1024 * 1024)).toFixed(1),
      videosGB: (videosBytes / (1024 * 1024 * 1024)).toFixed(1),
      docsGB: (docsBytes / (1024 * 1024 * 1024)).toFixed(1),
      gbUsed: (totalBytes / (1024 * 1024 * 1024)).toFixed(1),
      dupGB: (duplicatesSavedBytes / (1024 * 1024 * 1024)).toFixed(1),
    };
  }, [cloudFiles, uploadQueue]);

  // Compute Backup Health Score
  const healthScore = useMemo(() => {
    if (localAssets.length === 0) return 100;
    const backedUpCount = localAssets.filter(a => a.isBackedUp).length;
    return Math.round((backedUpCount / localAssets.length) * 100);
  }, [localAssets]);

  // Load available uploading devices checklist list
  useEffect(() => {
    const devices = new Set<string>(['All Devices']);
    cloudFiles.forEach(f => {
      const dev = f.overlay_metadata?.deviceName;
      if (dev) devices.add(dev);
    });
    setAvailableDevices(Array.from(devices));
  }, [cloudFiles]);

  // Load upload logs for Backup Timeline
  const loadBackupLogs = useCallback(async () => {
    try {
      const logs = await uploadQueueService.getUploadLogs();
      setBackupLogs(logs || []);
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (isFocused) {
      loadBackupLogs();
    }
  }, [isFocused, uploadQueue, loadBackupLogs]);

  // Sync state update hook
  useEffect(() => {
    if (!isFocused) return;
    const unsubscribe = uploadQueueService.subscribeToQueue((q) => {
      setUploadQueue(q);
      loadMediaStatuses(false);
    });
    return () => unsubscribe();
  }, [isFocused, localAssets, cloudFiles]);

  const loadMediaStatuses = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const { localComputed, cloudOnlyAssets: cloudAssets } = 
        await deviceMediaService.computeSyncAndCloudAssets(localAssets, cloudFiles);
      setLocalAssets(localComputed);
      setCloudOnlyAssets(cloudAssets);
    } catch (e) {
      console.warn('Failed computing sync states:', e);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  // Load albums list + add auto smart-album tags
  useEffect(() => {
    if (isFocused) {
      deviceMediaService.getAlbums().then(res => {
        const smartAlbums = ['All', 'Selfies', 'Screenshots', 'Receipts', 'Pets & Food', 'Large Videos', 'Recently Edited', ...res.filter(a => a !== 'All')];
        setAlbums(smartAlbums);
      });
      import('../../services/autoSyncService').then(({ autoSyncService }) => {
        autoSyncService.isEnabled().then(setAutoSyncEnabled);
      });
    }
  }, [isFocused]);

  // Main load assets loop
  const loadInitialMedia = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const permission = await deviceMediaService.requestPermissions();
      if (permission === 'denied') {
        setLocalAssets([]);
        setLoading(false);
        return;
      }

      // Fetch base device items (always fetch first page under selected physical folder if standard)
      const isSmartAlbum = ['Selfies', 'Screenshots', 'Receipts', 'Pets & Food', 'Large Videos', 'Recently Edited'].includes(selectedAlbum);
      const queryAlbum = isSmartAlbum ? 'All' : selectedAlbum;

      const result = await deviceMediaService.fetchDeviceMedia(queryAlbum, 100);
      let filteredAssets = result.assets;

      // Filter local items if a virtual Smart Album is selected
      if (selectedAlbum === 'Selfies') {
        filteredAssets = result.assets.filter(a => a.filename.toLowerCase().includes('selfie') || a.album.toLowerCase().includes('selfie'));
      } else if (selectedAlbum === 'Screenshots') {
        filteredAssets = result.assets.filter(a => a.filename.toLowerCase().includes('screenshot'));
      } else if (selectedAlbum === 'Receipts') {
        filteredAssets = result.assets.filter(a => a.filename.toLowerCase().includes('receipt') || a.filename.toLowerCase().includes('bill') || a.filename.toLowerCase().includes('invoice'));
      } else if (selectedAlbum === 'Pets & Food') {
        filteredAssets = result.assets.filter(a => ['dog', 'cat', 'pet', 'food', 'snack'].some(tag => a.filename.toLowerCase().includes(tag)));
      } else if (selectedAlbum === 'Large Videos') {
        filteredAssets = result.assets.filter(a => a.isVideo && a.size > 100 * 1024 * 1024);
      } else if (selectedAlbum === 'Recently Edited') {
        const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
        filteredAssets = result.assets.filter(a => a.modifiedDate >= threeDaysAgo);
      }

      const { localComputed, cloudOnlyAssets: cloudAssets } = 
        await deviceMediaService.computeSyncAndCloudAssets(filteredAssets, cloudFiles);
      
      setLocalAssets(localComputed);
      setCloudOnlyAssets(cloudAssets);
      setHasNextPage(result.hasNextPage);
      setEndCursor(result.endCursor);
    } catch (e) {
      console.warn('Failed to load device media:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedAlbum, cloudFiles]);

  useEffect(() => {
    if (isFocused) {
      loadInitialMedia(true);
    }
  }, [isFocused, selectedAlbum, loadInitialMedia]);

  // Load more pagination on scroll
  const handleLoadMore = async () => {
    if (loadingMore || !hasNextPage || !endCursor || activeInnerTab === 'backed_up') return;
    setLoadingMore(true);
    try {
      const result = await deviceMediaService.fetchDeviceMedia(selectedAlbum, 60, endCursor);
      const { localComputed } = await deviceMediaService.computeSyncAndCloudAssets(result.assets, cloudFiles);
      
      setLocalAssets(prev => {
        const existingIds = new Set(prev.map(a => a.assetId));
        const uniqueNew = localComputed.filter(a => !existingIds.has(a.assetId));
        return [...prev, ...uniqueNew];
      });
      setHasNextPage(result.hasNextPage);
      setEndCursor(result.endCursor);
    } catch (e) {
      console.warn('Load more device media failed:', e);
    } finally {
      setLoadingMore(false);
    }
  };

  // Toggle Auto-sync settings
  const handleToggleAutoSync = async (val: boolean) => {
    try {
      const { autoSyncService } = require('../../services/autoSyncService');
      await autoSyncService.setEnabled(val);
      setAutoSyncEnabled(val);
      showToast(val ? 'Camera roll auto-sync enabled.' : 'Camera roll auto-sync disabled.');
    } catch (_) {
      Alert.alert('Error', 'Failed to update auto-sync setting.');
    }
  };

  // File picker manual selection
  const handleImportPress = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (Platform.OS === 'web') {
          const res = await fetch(asset.uri);
          const blob = await res.blob();
          const newAsset = await deviceMediaService.importWebFile(blob, asset.name);
          
          if (autoSyncEnabled) {
            await deviceMediaService.backupAsset(newAsset, cloudFiles);
            showToast('Media queued for secure E2EE upload!');
          } else {
            showToast('Imported to local library successfully!');
          }
          loadInitialMedia(false);
        } else {
          // Native file backup
          const isVideo = asset.mimeType?.startsWith('video/') || false;
          await uploadQueueService.addToUploadQueue({
            file_name: asset.name,
            local_uri: asset.uri,
            file_type: isVideo ? 'video' : asset.mimeType?.startsWith('image/') ? 'image' : 'document',
            mime_type: asset.mimeType || 'application/octet-stream',
            file_size: asset.size || 0,
            is_private: false,
            is_drive_file: false,
            destination: 'memories',
            folder_id: null,
            progress: 0,
            status: 'pending',
            overlay_metadata: {
              deviceName: deviceMediaService.getDeviceName(),
              uploadedAt: Date.now()
            }
          });
          showToast('File queued for secure upload!');
        }
        if (onImportSuccess) onImportSuccess();
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Import failed.');
    }
  };

  // Click & Multi-Select controllers
  const handlePressItem = (item: DeviceMedia) => {
    if (isSelectionMode) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(item.assetId)) {
          next.delete(item.assetId);
        } else {
          next.add(item.assetId);
        }
        if (next.size === 0) setIsSelectionMode(false);
        return next;
      });
    } else {
      setSelectedPreviewAsset(item);
    }
  };

  const handleLongPressItem = (item: DeviceMedia) => {
    if (isSelectionMode) return;
    setIsSelectionMode(true);
    setSelectedIds(new Set([item.assetId]));
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedIds(new Set());
  };

  // Bulk Actions
  const handleBulkBackup = async () => {
    const toBackup = localAssets.filter(a => selectedIds.has(a.assetId) && !a.isBackedUp);
    if (toBackup.length === 0) {
      showToast('All selected items are already backed up.');
      return;
    }
    
    let successCount = 0;
    let duplicateCount = 0;

    try {
      for (const asset of toBackup) {
        try {
          await deviceMediaService.backupAsset(asset, cloudFiles);
          successCount++;
        } catch (err: any) {
          if (err.message === 'Already Backed Up') {
            duplicateCount++;
          } else {
            throw err;
          }
        }
      }

      if (duplicateCount > 0) {
        showToast(`Queued ${successCount} backups (${duplicateCount} skipped as duplicates).`);
      } else {
        showToast(`Queued ${successCount} items for E2EE backup.`);
      }

      setIsSelectionMode(false);
      setSelectedIds(new Set());
      loadInitialMedia(false);
      if (onImportSuccess) onImportSuccess();
    } catch (e: any) {
      Alert.alert('Backup failed', e.message || 'An error occurred.');
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    Alert.alert('Delete items', `Are you sure you want to delete these ${ids.length} items from your device gallery?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            if (Platform.OS === 'web') {
              for (const id of ids) {
                await deviceMediaService.deleteWebAsset(id);
              }
            } else {
              const MediaLibrary = require('expo-media-library');
              await MediaLibrary.deleteAssetsAsync(ids);
            }
            showToast('Deleted local assets successfully.');
            setIsSelectionMode(false);
            setSelectedIds(new Set());
            loadInitialMedia(false);
          } catch (e: any) {
            Alert.alert('Delete failed', e.message || 'An error occurred.');
          }
        }
      }
    ]);
  };

  // Single Action triggers (from Preview modal)
  const handleSingleBackup = async (asset: DeviceMedia) => {
    try {
      await deviceMediaService.backupAsset(asset, cloudFiles);
      showToast('Queued file for secure E2EE backup.');
      setSelectedPreviewAsset(null);
      loadInitialMedia(false);
      if (onImportSuccess) onImportSuccess();
    } catch (e: any) {
      showToast(e.message === 'Already Backed Up' ? 'Already Backed Up' : e.message);
    }
  };

  const handleSingleShare = async (asset: DeviceMedia) => {
    if (Platform.OS === 'web') {
      try {
        const link = document.createElement('a');
        link.href = asset.uri;
        link.download = asset.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('File download started.');
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Download failed.');
      }
      return;
    }
    try {
      const Sharing = require('expo-sharing');
      await Sharing.shareAsync(asset.uri);
    } catch (e) {
      console.warn('Share error', e);
    }
  };

  const handleSingleDelete = async (asset: DeviceMedia) => {
    Alert.alert('Delete asset', `Are you sure you want to delete "${asset.filename}" from your device?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            if (Platform.OS === 'web') {
              await deviceMediaService.deleteWebAsset(asset.assetId);
            } else {
              const MediaLibrary = require('expo-media-library');
              await MediaLibrary.deleteAssetsAsync([asset.assetId]);
            }
            showToast('Asset deleted.');
            setSelectedPreviewAsset(null);
            loadInitialMedia(false);
          } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not delete asset.');
          }
        }
      }
    ]);
  };

  // Offline search and filter sorting computations
  const processedAssets = useMemo(() => {
    let result: DeviceMedia[] = [];

    // Filter based on inner navigation tabs
    if (activeInnerTab === 'all') {
      result = [...localAssets];
    } else if (activeInnerTab === 'not_backed_up') {
      result = localAssets.filter(a => !a.isBackedUp);
    } else if (activeInnerTab === 'backed_up') {
      const localBackedUp = localAssets.filter(a => a.isBackedUp);
      result = [...localBackedUp, ...cloudOnlyAssets];
    } else {
      return [];
    }

    // 1. Filter by Device Selection
    if (selectedDevice !== 'All Devices') {
      result = result.filter(a => a.uploadedFromDevice === selectedDevice);
    }

    // 2. Search everything (filename, date, album, device, media type)
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a => {
        const createdDateStr = new Date(a.creationDate).toDateString().toLowerCase();
        const monthStr = new Date(a.creationDate).toLocaleString('en-US', { month: 'long' }).toLowerCase();
        const yearStr = new Date(a.creationDate).getFullYear().toString();
        
        return (
          a.filename.toLowerCase().includes(q) || 
          a.album.toLowerCase().includes(q) ||
          (a.uploadedFromDevice || '').toLowerCase().includes(q) ||
          (a.isVideo ? 'video' : 'image').includes(q) ||
          createdDateStr.includes(q) ||
          monthStr.includes(q) ||
          yearStr.includes(q)
        );
      });
    }

    // 3. Backup Filter Subsections
    if (filterType === 'image') {
      result = result.filter(a => a.isImage);
    } else if (filterType === 'video') {
      result = result.filter(a => a.isVideo);
    } else if (filterType === 'favorites') {
      result = result.filter(a => a.favorite);
    } else if (filterType === 'documents') {
      result = result.filter(a => !a.isImage && !a.isVideo);
    } else if (filterType === 'today') {
      const todayStr = new Date().toDateString();
      result = result.filter(a => new Date(a.creationDate).toDateString() === todayStr);
    } else if (filterType === 'this_week') {
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      result = result.filter(a => a.creationDate >= oneWeekAgo);
    } else if (filterType === 'this_month') {
      const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      result = result.filter(a => a.creationDate >= oneMonthAgo);
    } else if (filterType === 'cloud_only') {
      result = result.filter(a => a.isCloudOnly);
    } else if (filterType === 'on_device') {
      result = result.filter(a => !a.isCloudOnly);
    }

    // 4. Sorting criteria
    if (sortType === 'newest') {
      result.sort((a, b) => b.creationDate - a.creationDate);
    } else if (sortType === 'oldest') {
      result.sort((a, b) => a.creationDate - b.creationDate);
    } else if (sortType === 'size') {
      result.sort((a, b) => b.size - a.size);
    } else if (sortType === 'alphabetical') {
      result.sort((a, b) => a.filename.localeCompare(b.filename));
    } else if (sortType === 'modified') {
      result.sort((a, b) => b.modifiedDate - a.modifiedDate);
    }

    return result;
  }, [localAssets, cloudOnlyAssets, activeInnerTab, selectedDevice, filterType, sortType, searchQuery]);

  // Syncing Queue filter lists
  const syncingQueue = useMemo(() => {
    return uploadQueue.filter(item => 
      item.status === 'uploading' || 
      item.status === 'processing' || 
      item.status === 'pending' || 
      item.status === 'paused'
    );
  }, [uploadQueue]);

  const failedQueue = useMemo(() => {
    return uploadQueue.filter(item => item.status === 'failed');
  }, [uploadQueue]);

  // Overall Backup Progress Percentage Ring/Bar for Syncs
  const overallSyncProgress = useMemo(() => {
    if (syncingQueue.length === 0) return 100;
    const totalProgress = syncingQueue.reduce((acc, item) => acc + (item.progress || 0), 0);
    return Math.round(totalProgress / syncingQueue.length);
  }, [syncingQueue]);

  const renderProgress = (progress: number) => {
    if (Platform.OS === 'ios') {
      return <ProgressViewIOS progress={progress / 100} progressTintColor="#FFFC00" trackTintColor="rgba(255,255,255,0.1)" />;
    }
    return <ProgressBarAndroid styleAttr="Horizontal" color="#FFFC00" progress={progress / 100} indeterminate={false} />;
  };

  const renderSyncItem = ({ item }: { item: any }) => {
    const isPaused = item.status === 'paused';
    const statusLabel = !isConnected 
      ? 'Waiting for Connection' 
      : isPaused 
      ? 'Paused' 
      : item.stage || 'Uploading';

    const currentPriority = item.overlay_metadata?.priority || 'high';

    return (
      <View style={styles.syncItemCard}>
        <View style={styles.syncItemDetails}>
          <View style={styles.syncRowHeader}>
            <Text style={styles.syncItemName} numberOfLines={1}>{item.file_name}</Text>
            
            {/* Priority Elevation Toggle Tag */}
            <TouchableOpacity 
              style={[styles.priorityTag, currentPriority === 'high' ? styles.priorityHigh : styles.priorityLow]}
              onPress={() => {
                const nextPriority = currentPriority === 'high' ? 'low' : 'high';
                uploadQueueService.updateUploadQueueItem(item.id, {
                  overlay_metadata: { ...item.overlay_metadata, priority: nextPriority }
                });
                showToast(`Priority updated to ${nextPriority.toUpperCase()}`);
              }}
            >
              <Text style={styles.priorityText}>{currentPriority.toUpperCase()}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.syncStatusTextRow}>
            <Text style={[styles.syncItemStage, !isConnected && { color: '#FF9500' }]}>{statusLabel}</Text>
            {item.file_size > 0 && (
              <Text style={styles.syncItemSize}>{(item.file_size / (1024 * 1024)).toFixed(2)} MB</Text>
            )}
          </View>
        </View>
        
        {renderProgress(item.progress || 0)}

        <View style={styles.syncActionRow}>
          <Text style={styles.syncItemProgress}>{item.progress || 0}% completed</Text>
          
          <View style={styles.syncControlContainer}>
            {isPaused ? (
              <TouchableOpacity style={styles.syncControlBtn} onPress={() => uploadQueueService.resumeUpload(item.id)}>
                <Play size={14} color="#34C759" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.syncControlBtn} onPress={() => uploadQueueService.pauseUpload(item.id)}>
                <Pause size={14} color="#FFFFFF" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.syncControlBtn, styles.syncControlCancelBtn]} onPress={() => uploadQueueService.cancelUpload(item.id)}>
              <X size={14} color="#FF3B30" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderFailedItem = ({ item }: { item: any }) => {
    return (
      <View style={[styles.syncItemCard, styles.failedItemCard]}>
        <View style={styles.syncItemDetails}>
          <Text style={styles.syncItemName} numberOfLines={1}>{item.file_name}</Text>
          <View style={styles.failedReasonContainer}>
            <AlertTriangle size={12} color="#FF3B30" style={{ marginRight: 4 }} />
            <Text style={styles.failedReasonText}>{item.error_message || 'Unknown network error occurred.'}</Text>
          </View>
        </View>
        
        <View style={styles.failedActionRow}>
          <TouchableOpacity style={styles.failedRetryBtn} onPress={() => uploadQueueService.retryFailedUpload(item.id)}>
            <Text style={styles.failedRetryBtnText}>Retry Backup</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.failedDeleteBtn} onPress={() => uploadQueueService.cancelUpload(item.id)}>
            <Text style={styles.failedDeleteBtnText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      
      {/* 1. Sync Health Score Header Card */}
      <View style={styles.healthHeaderCard}>
        <View style={styles.healthRow}>
          <View style={styles.healthIconBox}>
            <ShieldCheck size={36} color={healthScore === 100 ? '#34C759' : '#FFFC00'} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.healthTitle}>Backup Security Health</Text>
            <Text style={styles.healthScoreText}>{healthScore}% Synced</Text>
            <Text style={styles.healthSubtitle}>
              {healthScore === 100 ? '✓ All files encrypted & verified' : `${stats.uploadingCount} uploads pending | ${stats.failedCount} failed`}
            </Text>
          </View>
        </View>
      </View>

      {/* 2. Detailed Storage Insights Dashboard */}
      <View style={styles.statsCard}>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Smartphone size={16} color="#00B2FF" />
            <Text style={styles.statVal}>{stats.photosGB} GB</Text>
            <Text style={styles.statLabel}>Photos</Text>
          </View>
          <View style={styles.statBox}>
            <Play size={16} color="#FFFC00" />
            <Text style={styles.statVal}>{stats.videosGB} GB</Text>
            <Text style={styles.statLabel}>Videos</Text>
          </View>
          <View style={styles.statBox}>
            <Folder size={16} color="#8E8E93" />
            <Text style={styles.statVal}>{stats.docsGB} GB</Text>
            <Text style={styles.statLabel}>Documents</Text>
          </View>
          <View style={styles.statBox}>
            <CheckSquare size={16} color="#34C759" />
            <Text style={styles.statVal}>{stats.dupGB} GB</Text>
            <Text style={styles.statLabel}>Saved Space</Text>
          </View>
        </View>
      </View>

      {/* Control Panel Headers */}
      <View style={styles.header}>
        <View style={styles.autoSyncRow}>
          <RefreshCw size={18} color="#FFFC00" style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitleText}>Camera Roll Auto-Sync</Text>
            <Text style={styles.headerSubtitleText}>Secures newly added local files automatically</Text>
          </View>
          <Switch
            value={autoSyncEnabled}
            onValueChange={handleToggleAutoSync}
            trackColor={{ false: '#2C2C2E', true: '#FFFC00' }}
            thumbColor={autoSyncEnabled ? '#000000' : '#8E8E93'}
          />
        </View>

        <View style={styles.actionHeaderRow}>
          {/* Albums Dropdown (including virtual Smart Albums list) */}
          <TouchableOpacity 
            style={styles.albumDropdownBtn} 
            onPress={() => {
              setShowAlbumDropdown(!showAlbumDropdown);
              setShowDeviceDropdown(false);
            }}
          >
            <Folder size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.albumDropdownText} numberOfLines={1}>{selectedAlbum}</Text>
            <ChevronDown size={14} color="#FFFFFF" style={{ marginLeft: 4 }} />
          </TouchableOpacity>

          {/* Device Model Dropdown */}
          <TouchableOpacity 
            style={styles.albumDropdownBtn} 
            onPress={() => {
              setShowDeviceDropdown(!showDeviceDropdown);
              setShowAlbumDropdown(false);
            }}
          >
            <Smartphone size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.albumDropdownText} numberOfLines={1}>
              {selectedDevice === 'All Devices' ? 'Devices' : selectedDevice}
            </Text>
            <ChevronDown size={14} color="#FFFFFF" style={{ marginLeft: 4 }} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.importBtn} onPress={handleImportPress}>
            <Plus size={16} color="#000000" style={{ marginRight: 4 }} />
            <Text style={styles.importBtnText}>Import</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.hudBtn, isSelectionMode && styles.hudBtnActive]}
            onPress={toggleSelectionMode}
          >
            <CheckSquare size={16} color={isSelectionMode ? '#000000' : '#FFFFFF'} />
          </TouchableOpacity>
        </View>

        {showAlbumDropdown && (
          <View style={styles.dropdownMenu}>
            {albums.map((albumName) => (
              <TouchableOpacity
                key={albumName}
                style={[styles.dropdownItem, selectedAlbum === albumName && styles.dropdownItemActive]}
                onPress={() => {
                  setSelectedAlbum(albumName);
                  setShowAlbumDropdown(false);
                }}
              >
                <Text style={styles.dropdownItemText}>{albumName}</Text>
                {selectedAlbum === albumName && <Check size={14} color="#FFFC00" />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {showDeviceDropdown && (
          <View style={[styles.dropdownMenu, { left: 90 }]}>
            {availableDevices.map((deviceName) => (
              <TouchableOpacity
                key={deviceName}
                style={[styles.dropdownItem, selectedDevice === deviceName && styles.dropdownItemActive]}
                onPress={() => {
                  setSelectedDevice(deviceName);
                  setShowDeviceDropdown(false);
                }}
              >
                <Text style={styles.dropdownItemText}>{deviceName}</Text>
                {selectedDevice === deviceName && <Check size={14} color="#FFFC00" />}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Inner Navigation Tabs (All, Not Backed Up, Backed Up, Uploads, Failed, Timeline) */}
      <View style={styles.innerTabsScrollContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.innerTabsContainer}>
          {(['all', 'not_backed_up', 'backed_up', 'uploads', 'failed', 'timeline'] as const).map((tab) => {
            const isActive = activeInnerTab === tab;
            let label = tab === 'all' ? 'All' 
                      : tab === 'not_backed_up' ? 'Not Backed Up' 
                      : tab === 'backed_up' ? 'Backed Up' 
                      : tab === 'uploads' ? `Uploads (${syncingQueue.length})` 
                      : tab === 'failed' ? `Failed (${failedQueue.length})`
                      : 'Backup Timeline';
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.innerTabBtn, isActive && styles.innerTabBtnActive]}
                onPress={() => setActiveInnerTab(tab)}
              >
                <Text style={[styles.innerTabBtnText, isActive && styles.innerTabBtnTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Tab content rendering router */}
      {activeInnerTab === 'uploads' ? (
        <View style={{ flex: 1 }}>
          {/* Satisfying Backup Progress Ring / Bar at the top of queue */}
          {syncingQueue.length > 0 && (
            <View style={styles.progressRingCard}>
              <View style={styles.progressRingTextRow}>
                <Text style={styles.progressRingTitle}>Backup Progress Ring</Text>
                <Text style={styles.progressRingPercentage}>{overallSyncProgress}%</Text>
              </View>
              <View style={styles.progressBarWrapper}>
                {renderProgress(overallSyncProgress)}
              </View>
              <Text style={styles.progressRingDetails}>
                {syncingQueue.length} files remaining in E2EE queue
              </Text>
            </View>
          )}

          <FlatList
            data={syncingQueue}
            keyExtractor={(item) => item.id}
            renderItem={renderSyncItem}
            contentContainerStyle={styles.queueContainer}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.noMediaText}>No active or queued uploads.</Text>
              </View>
            }
          />
        </View>
      ) : activeInnerTab === 'failed' ? (
        <FlatList
          data={failedQueue}
          keyExtractor={(item) => item.id}
          renderItem={renderFailedItem}
          contentContainerStyle={styles.queueContainer}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.noMediaText}>No failed uploads detected.</Text>
            </View>
          }
        />
      ) : activeInnerTab === 'timeline' ? (
        <View style={{ flex: 1 }}>
          <FlatList
            data={backupLogs}
            keyExtractor={(item, index) => `log-${item.id || index}`}
            contentContainerStyle={styles.queueContainer}
            renderItem={({ item }) => {
              const isVideo = item.file_type === 'video';
              const dateStr = new Date(item.created_at || Date.now()).toDateString();
              const isSuccess = item.status === 'completed';
              return (
                <View style={styles.logCard}>
                  <View style={styles.logHeader}>
                    {isSuccess ? (
                      <ShieldCheck size={16} color="#34C759" />
                    ) : (
                      <AlertTriangle size={16} color="#FF3B30" />
                    )}
                    <Text style={styles.logTitle}>{isSuccess ? 'Upload Completed' : 'Upload Failed'}</Text>
                    <Text style={styles.logDate}>{dateStr}</Text>
                  </View>
                  <Text style={styles.logFile} numberOfLines={1}>{item.file_name}</Text>
                  <Text style={styles.logDetail}>
                    Uploaded from: {item.overlay_metadata?.deviceName || 'Web Client'} | E2EE Encrypted
                  </Text>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.center}>
                <Clock size={40} color="#8E8E93" style={{ marginBottom: 12 }} />
                <Text style={styles.noMediaText}>No backup logs recorded yet.</Text>
              </View>
            }
          />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Sub-Filters list (Images, Videos, Today, This Month, Cloud Only, On This Device) */}
          <View style={styles.subFiltersScroll}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subFiltersContainer}>
              {(['all', 'image', 'video', 'favorites', 'documents', 'today', 'this_week', 'this_month', 'cloud_only', 'on_device'] as const).map((subFilter) => {
                const isActive = filterType === subFilter;
                const label = subFilter === 'all' ? 'All Media'
                            : subFilter === 'image' ? 'Images'
                            : subFilter === 'video' ? 'Videos'
                            : subFilter === 'favorites' ? 'Favorites'
                            : subFilter === 'documents' ? 'Documents'
                            : subFilter === 'today' ? 'Today'
                            : subFilter === 'this_week' ? 'This Week'
                            : subFilter === 'this_month' ? 'This Month'
                            : subFilter === 'cloud_only' ? 'Cloud Only'
                            : 'On Device';
                return (
                  <TouchableOpacity
                    key={subFilter}
                    style={[styles.subFilterBadge, isActive && styles.subFilterBadgeActive]}
                    onPress={() => setFilterType(subFilter)}
                  >
                    <Text style={[styles.subFilterText, isActive && styles.subFilterTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Filter search box for active grid view */}
          <View style={styles.searchBarRow}>
            <View style={styles.searchField}>
              <Search size={16} color="#8E8E93" style={{ marginRight: 8 }} />
              <TextInput
                placeholder="Search filename, date, device, media type..."
                placeholderTextColor="#8E8E93"
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchInput}
              />
            </View>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#FFFC00" />
            </View>
          ) : processedAssets.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.noMediaText}>No device gallery items found matching filters.</Text>
            </View>
          ) : (
            <DeviceTimelineGrid
              items={processedAssets}
              onPressItem={handlePressItem}
              onLongPressItem={handleLongPressItem}
              selectedIds={selectedIds}
              isSelectionMode={isSelectionMode}
              onRefresh={async () => { await loadInitialMedia(false); }}
              refreshing={loading}
              onEndReached={handleLoadMore}
              loadingMore={loadingMore}
            />
          )}
        </View>
      )}

      {/* Persistent Selection Operation Bar */}
      {isSelectionMode && selectedIds.size > 0 && (
        <View style={styles.selectionBar}>
          <TouchableOpacity style={styles.selectionActionBtn} onPress={handleBulkBackup}>
            <ArrowUpCircle size={18} color="#FFFC00" style={{ marginRight: 6 }} />
            <Text style={[styles.selectionActionText, { color: '#FFFC00' }]}>BACKUP</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.selectionActionBtn, styles.selectionDeleteBtn]} onPress={handleBulkDelete}>
            <Trash2 size={18} color="#FF3B30" style={{ marginRight: 6 }} />
            <Text style={[styles.selectionActionText, { color: '#FF3B30' }]}>DELETE</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Item Full Preview Panel Modal */}
      {selectedPreviewAsset && (
        <DevicePreviewModal
          visible={!!selectedPreviewAsset}
          asset={selectedPreviewAsset}
          onClose={() => setSelectedPreviewAsset(null)}
          onBackup={handleSingleBackup}
          onShare={handleSingleShare}
          onDelete={handleSingleDelete}
        />
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  healthHeaderCard: {
    backgroundColor: '#0D1B1E',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.25)',
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  healthIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  healthTitle: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  healthScoreText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2,
  },
  healthSubtitle: {
    color: '#34C759',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  statsCard: {
    backgroundColor: '#0F1123',
    marginHorizontal: 12,
    marginVertical: 10,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statVal: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 6,
  },
  statLabel: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
    zIndex: 20,
  },
  autoSyncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  headerSubtitleText: {
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 2,
  },
  actionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  albumDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    maxWidth: 130,
  },
  albumDropdownText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFC00',
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    marginLeft: 'auto',
  },
  importBtnText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '700',
  },
  hudBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  hudBtnActive: {
    backgroundColor: '#FFFC00',
    borderColor: '#FFFC00',
  },
  dropdownMenu: {
    position: 'absolute',
    top: 96,
    left: 16,
    width: 180,
    backgroundColor: '#0F1123',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 30,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(255, 252, 0, 0.05)',
  },
  dropdownItemText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  innerTabsScrollContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
    backgroundColor: '#05070d',
  },
  innerTabsContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  innerTabBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#1C1C1E',
  },
  innerTabBtnActive: {
    backgroundColor: '#FFFC00',
  },
  innerTabBtnText: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '700',
  },
  innerTabBtnTextActive: {
    color: '#000000',
  },
  subFiltersScroll: {
    backgroundColor: '#000000',
    borderBottomWidth: 0.5,
    borderBottomColor: '#1C1C1E',
  },
  subFiltersContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  subFilterBadge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#151728',
    borderWidth: 1,
    borderColor: '#242745',
  },
  subFilterBadgeActive: {
    backgroundColor: '#FFFC00',
    borderColor: '#FFFC00',
  },
  subFilterText: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '700',
  },
  subFilterTextActive: {
    color: '#000000',
  },
  searchBarRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 36,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  noMediaText: {
    color: '#8E8E93',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  selectionBar: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(15, 17, 35, 0.98)',
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
  selectionActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  selectionDeleteBtn: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
  },
  selectionActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  queueContainer: {
    padding: 16,
    gap: 12,
    paddingBottom: 80,
  },
  progressRingCard: {
    backgroundColor: '#0F1123',
    margin: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  progressRingTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressRingTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  progressRingPercentage: {
    color: '#FFFC00',
    fontSize: 14,
    fontWeight: '800',
  },
  progressBarWrapper: {
    height: 12,
    justifyContent: 'center',
    marginVertical: 4,
  },
  progressRingDetails: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
  },
  syncItemCard: {
    backgroundColor: '#151728',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#242745',
  },
  syncRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  priorityTag: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  priorityHigh: {
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
  },
  priorityLow: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  priorityText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  syncStatusTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  syncItemSize: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '600',
  },
  failedItemCard: {
    borderColor: 'rgba(255, 59, 48, 0.25)',
  },
  syncItemDetails: {
    marginBottom: 8,
  },
  syncItemName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    marginRight: 10,
  },
  syncItemStage: {
    color: '#8E8E93',
    fontSize: 11,
  },
  syncActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  syncItemProgress: {
    color: '#FFFC00',
    fontSize: 11,
    fontWeight: '700',
  },
  syncControlContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  syncControlBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncControlCancelBtn: {
    backgroundColor: 'rgba(255,59,48,0.1)',
  },
  failedReasonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  failedReasonText: {
    color: '#FF3B30',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  failedActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
  },
  failedRetryBtn: {
    backgroundColor: '#FFFC00',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  failedRetryBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
  },
  failedDeleteBtn: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  failedDeleteBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  logCard: {
    backgroundColor: '#0F1123',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  logTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  logDate: {
    marginLeft: 'auto',
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '600',
  },
  logFile: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginVertical: 4,
  },
  logDetail: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '500',
  },
});

export default DeviceGalleryContainer;
