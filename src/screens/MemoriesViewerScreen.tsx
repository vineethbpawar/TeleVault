import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  FlatList,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
  TextInput,
  Platform,
  Pressable,
  Animated,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { TeleVaultFile, TeleVaultFolder } from '../types/file';
import { previewCacheService } from '../services/previewCacheService';
import { fileService } from '../services/fileService';
import { telegramService } from '../services/telegramService';
import VideoPlayer from '../components/VideoPlayer';
import { X, Info, Share2, Send, Edit, Trash2, Calendar, HardDrive, Type, Star, FolderInput } from 'lucide-react-native';
import * as Sharing from 'expo-sharing';
import { showToast } from '../components/ToastBanner';

type Props = NativeStackScreenProps<AppStackParamList, 'MemoriesViewer'>;

const { width, height } = Dimensions.get('window');

// Item Component for each slide
const ViewerItem = React.memo<{
  file: TeleVaultFile;
  isActive: boolean;
  isNearby: boolean;
  cachedValue?: { previewUri?: string; playableUri?: string };
  paused: boolean;
  onTapLeft: () => void;
  onTapRight: () => void;
  onToggleControls: () => void;
  onCacheResolve: (fileId: string, res: { previewUri?: string; playableUri?: string }) => void;
}>(({ file, isActive, isNearby, cachedValue, paused, onTapLeft, onTapRight, onToggleControls, onCacheResolve }) => {
  const [resolved, setResolved] = useState<{
    previewUri?: string;
    playableUri?: string;
    loading: boolean;
    error?: string;
  }>({ loading: !cachedValue, ...cachedValue });

  const [isZoomed, setIsZoomed] = useState(false);
  const lastTapRef = useRef<number>(0);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Sync cache updates
  useEffect(() => {
    if (cachedValue) {
      setResolved({
        previewUri: cachedValue.previewUri,
        playableUri: cachedValue.playableUri,
        loading: false,
      });
    }
  }, [cachedValue]);

  // Resolve preview if not cached
  useEffect(() => {
    if (cachedValue || !isNearby) return;

    let isMounted = true;
    previewCacheService.resolveFilePreview(file)
      .then((res) => {
        if (isMounted) {
          const update = {
            previewUri: res.previewUri,
            playableUri: res.playableUri,
            loading: false,
            error: res.error,
          };
          setResolved(update);
          onCacheResolve(file.id, { previewUri: res.previewUri, playableUri: res.playableUri });
        }
      })
      .catch((err) => {
        if (isMounted) {
          setResolved({
            loading: false,
            error: err.message || 'Failed preview resolution',
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [file, cachedValue, isNearby]);

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: isZoomed ? 1.75 : 1.0,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
  }, [isZoomed]);

  const handleTouch = (e: any) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap -> Toggle Zoom
      setIsZoomed(prev => !prev);
    } else {
      // Single tap -> Navigation / Controls toggle
      const x = e.nativeEvent.pageX;
      if (x < width * 0.3) {
        onTapLeft();
      } else if (x > width * 0.7) {
        onTapRight();
      } else {
        onToggleControls();
      }
    }
    lastTapRef.current = now;
  };

  // If the media is distant, destroy its players and render a simple thumbnail or black background to save memory
  if (!isNearby) {
    return (
      <View style={styles.itemContainer}>
        {resolved.previewUri ? (
          <Image
            source={{ uri: resolved.previewUri }}
            style={[StyleSheet.absoluteFill, { opacity: 0.15 }]}
            resizeMode="cover"
            blurRadius={15}
          />
        ) : (
          <View style={StyleSheet.absoluteFill} />
        )}
      </View>
    );
  }

  if (resolved.loading) {
    return (
      <View style={styles.itemContainer}>
        <ActivityIndicator size="large" color="#FFFC00" />
      </View>
    );
  }

  const zoomStyle = { transform: [{ scale: scaleAnim }] };

  if (file.file_type === 'video') {
    if (isActive && resolved.playableUri) {
      return (
        <Pressable style={styles.itemContainer} onPress={handleTouch}>
          <Animated.View style={[StyleSheet.absoluteFill, zoomStyle]}>
            <VideoPlayer
              source={resolved.playableUri}
              style={StyleSheet.absoluteFill}
              paused={paused}
              onError={async () => {
                if (file.telegram_file_id) {
                  const repaired = await previewCacheService.forceRepairPreview(file.telegram_file_id, {
                    id: file.id,
                    file_name: file.file_name,
                    file_type: 'video',
                    mime_type: file.mime_type,
                    local_thumbnail_uri: file.local_thumbnail_uri,
                    telegram_file_id: file.telegram_file_id,
                    is_private: file.is_private,
                  });
                  if (repaired) {
                    const update = { ...resolved, ...repaired };
                    setResolved(update);
                    onCacheResolve(file.id, { previewUri: repaired.previewUri, playableUri: repaired.playableUri });
                  }
                }
              }}
            />
          </Animated.View>
        </Pressable>
      );
    }

    return (
      <Pressable style={styles.itemContainer} onPress={handleTouch}>
        {resolved.previewUri ? (
          <Animated.Image
            source={{ uri: resolved.previewUri }}
            style={[StyleSheet.absoluteFill, zoomStyle]}
            resizeMode="contain"
            onError={async () => {
              if (file.telegram_file_id) {
                const repaired = await previewCacheService.forceRepairPreview(file.telegram_file_id, {
                  id: file.id,
                  file_name: file.file_name,
                  file_type: 'video',
                  mime_type: file.mime_type,
                  local_thumbnail_uri: file.local_thumbnail_uri,
                  telegram_file_id: file.telegram_file_id,
                  is_private: file.is_private,
                });
                if (repaired) {
                  const update = { ...resolved, ...repaired };
                  setResolved(update);
                  onCacheResolve(file.id, { previewUri: repaired.previewUri, playableUri: repaired.playableUri });
                }
              }
            }}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.fallbackContainer]}>
            <ActivityIndicator size="small" color="#8E8E93" />
          </View>
        )}
      </Pressable>
    );
  }

  if (resolved.previewUri) {
    return (
      <Pressable style={styles.itemContainer} onPress={handleTouch}>
        <Animated.Image
          source={{ uri: resolved.previewUri }}
          style={[StyleSheet.absoluteFill, zoomStyle]}
          resizeMode="contain"
          onError={async () => {
            if (file.telegram_file_id) {
              const repaired = await previewCacheService.forceRepairPreview(file.telegram_file_id, {
                id: file.id,
                file_name: file.file_name,
                file_type: 'image',
                mime_type: file.mime_type,
                local_thumbnail_uri: file.local_thumbnail_uri,
                telegram_file_id: file.telegram_file_id,
                is_private: file.is_private,
              });
              if (repaired) {
                const update = { ...resolved, ...repaired };
                setResolved(update);
                onCacheResolve(file.id, { previewUri: repaired.previewUri, playableUri: repaired.playableUri });
              }
            }
          }}
        />
      </Pressable>
    );
  }

  return (
    <Pressable style={styles.itemContainer} onPress={handleTouch}>
      <Text style={styles.errorText}>{resolved.error || 'Failed preview.'}</Text>
    </Pressable>
  );
});

export const MemoriesViewerScreen: React.FC<Props> = ({ navigation, route }) => {
  const { files: initialFiles, initialIndex } = route.params;
  const insets = useSafeAreaInsets();
  
  const [files, setFiles] = useState<TeleVaultFile[]>(initialFiles);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [infoVisible, setInfoVisible] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [captionVisible, setCaptionVisible] = useState(false);
  const [newCaption, setNewCaption] = useState('');

  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<any>(null);

  const flatListRef = useRef<FlatList>(null);
  const currentFile = files[currentIndex] || null;

  // Reusable Media Viewer state
  const [resolvedCache, setResolvedCache] = useState<Record<string, { previewUri?: string; playableUri?: string }>>({});
  const [isHoldActive, setIsHoldActive] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [folders, setFolders] = useState<TeleVaultFolder[]>([]);
  const [folderPickerVisible, setFolderPickerVisible] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);

  // Sync Favorite status
  useEffect(() => {
    if (currentFile) {
      setIsFavorite(currentFile.is_favorite || false);
    }
  }, [currentFile]);

  // Preload resolved URLs for nearby media items dynamically on index change
  useEffect(() => {
    const preloadIndices = [currentIndex - 1, currentIndex + 1];
    preloadIndices.forEach(idx => {
      if (idx >= 0 && idx < files.length) {
        const file = files[idx];
        if (file && !resolvedCache[file.id]) {
          previewCacheService.resolveFilePreview(file)
            .then(res => {
              setResolvedCache(prev => ({
                ...prev,
                [file.id]: {
                  previewUri: res.previewUri,
                  playableUri: res.playableUri
                }
              }));
            })
            .catch(err => console.warn('[PRELOAD] Failed to preload media index', idx, err));
        }
      }
    });
  }, [currentIndex, files, resolvedCache]);

  // Fetch folders for Move Folder modal when visible
  useEffect(() => {
    if (folderPickerVisible) {
      fileService.fetchDriveFolders(null)
        .then(setFolders)
        .catch(console.error);
    }
  }, [folderPickerVisible]);

  const resetHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    if (!infoVisible && !renameVisible && !captionVisible && !folderPickerVisible) {
      hideTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3000);
    }
  };

  const handleToggleControls = () => {
    setControlsVisible((prev) => {
      const next = !prev;
      if (next) {
        resetHideTimer();
      } else {
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
        }
      }
      return next;
    });
  };

  useEffect(() => {
    setControlsVisible(true);
    resetHideTimer();
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [currentIndex, infoVisible, renameVisible, captionVisible, folderPickerVisible]);

  const goToNext = () => {
    if (currentIndex < files.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      setCurrentIndex(prevIndex);
      flatListRef.current?.scrollToIndex({ index: prevIndex, animated: true });
    }
  };

  const handleHoldStart = () => {
    setIsHoldActive(true);
    setControlsVisible(false); // Hide controls on hold (Snapchat UX)
  };

  const handleHoldEnd = () => {
    setIsHoldActive(false);
    setControlsVisible(true);
  };

  const formatSize = (bytes: number | null | undefined): string => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleShare = async () => {
    if (!currentFile) return;
    try {
      showToast('Preparing file to share...');
      const res = await previewCacheService.resolveFilePreview(currentFile);
      const targetUri = res.playableUri || res.previewUri;
      if (!targetUri) {
        Alert.alert('Share Failed', 'Unable to resolve file link.');
        return;
      }

      let localPath = targetUri;
      if (targetUri.startsWith('http')) {
        localPath = await telegramService.downloadTelegramFileToCache(
          currentFile.telegram_file_id || '',
          currentFile.file_name
        );
      }

      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(localPath);
      } else {
        Alert.alert('Error', 'Sharing is not available on this device.');
      }
    } catch (error: any) {
      console.error('Share error:', error);
      Alert.alert('Share Failed', error.message || 'Unable to share this file.');
    }
  };

  const handleSendTo = () => {
    if (!currentFile) return;
    if (currentFile.file_type === 'document') {
      Alert.alert('Unsupported', 'Documents cannot be sent as snaps.');
      return;
    }
    previewCacheService.resolveFilePreview(currentFile).then(res => {
      const uri = res.playableUri || res.previewUri;
      if (uri) {
        navigation.navigate('SendTo', {
          mediaUri: uri,
          mediaType: currentFile.file_type as 'image' | 'video',
          metadata: currentFile.overlay_metadata,
        });
      } else {
        Alert.alert('Error', 'Unable to resolve file path for sharing.');
      }
    });
  };

  const handleDelete = () => {
    if (!currentFile) return;
    Alert.alert(
      'Delete Memory',
      'Are you sure you want to delete this memory?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await fileService.deleteFileMetadata(currentFile.id);
              showToast('Memory deleted.');
              
              const updated = files.filter(f => f.id !== currentFile.id);
              if (updated.length === 0) {
                navigation.goBack();
              } else {
                setFiles(updated);
                const nextIndex = Math.min(currentIndex, updated.length - 1);
                setCurrentIndex(nextIndex);
              }
            } catch (err: any) {
              Alert.alert('Delete Failed', err.message || 'Failed to delete file.');
            }
          }
        }
      ]
    );
  };

  const handleToggleFavorite = async () => {
    if (!currentFile) return;
    try {
      const updated = await fileService.toggleFavoriteFile(currentFile.id, !isFavorite);
      setIsFavorite(updated.is_favorite || false);
      const updatedList = files.map(f => f.id === currentFile.id ? { ...f, is_favorite: updated.is_favorite } : f);
      setFiles(updatedList);
      showToast(updated.is_favorite ? 'Added to favorites.' : 'Removed from favorites.');
    } catch (err: any) {
      Alert.alert('Error', 'Failed to update favorite status.');
    }
  };

  const handleMoveFile = async (folderId: string | null) => {
    if (!currentFile) return;
    try {
      await fileService.moveFile(currentFile.id, folderId);
      const updatedList = files.map(f => f.id === currentFile.id ? { ...f, folder_id: folderId } : f);
      setFiles(updatedList);
      setFolderPickerVisible(false);
      showToast('File moved successfully.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to move file.');
    }
  };

  const triggerRename = () => {
    if (!currentFile) return;
    setNewName(currentFile.file_name);
    setInfoVisible(false);
    setRenameVisible(true);
  };

  const executeRename = async () => {
    if (!currentFile || !newName.trim()) return;
    try {
      const updated = await fileService.renameFile(currentFile.id, newName.trim());
      const updatedList = files.map(f => f.id === currentFile.id ? updated : f);
      setFiles(updatedList);
      setRenameVisible(false);
      showToast('Renamed successfully.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to rename.');
    }
  };

  const triggerCaption = () => {
    if (!currentFile) return;
    setNewCaption(currentFile.caption || '');
    setInfoVisible(false);
    setCaptionVisible(true);
  };

  const executeCaption = async () => {
    if (!currentFile) return;
    try {
      const updated = await fileService.updateFileCaption(currentFile.id, newCaption.trim());
      const updatedList = files.map(f => f.id === currentFile.id ? updated : f);
      setFiles(updatedList);
      setCaptionVisible(false);
      showToast('Caption updated.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update caption.');
    }
  };

  if (!currentFile) {
    return (
      <View style={styles.fallbackContainer}>
        <ActivityIndicator size="large" color="#FFFC00" />
      </View>
    );
  }

  const dateString = new Date(currentFile.created_at).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={styles.container}>
      {/* Immersive Touch Gesture Area wrapping the swiper */}
      <View 
        style={StyleSheet.absoluteFill}
        onTouchStart={handleHoldStart}
        onTouchEnd={handleHoldEnd}
        onTouchCancel={handleHoldEnd}
      >
        {/* Horizontal FlatList Swiper */}
        <FlatList
          ref={flatListRef}
          horizontal
          pagingEnabled
          data={files}
          keyExtractor={(item) => item.id}
          initialScrollIndex={initialIndex}
          getItemLayout={(data, index) => ({ length: width, offset: width * index, index })}
          showsHorizontalScrollIndicator={false}
          scrollEnabled={!isHoldActive}
          decelerationRate="fast"
          snapToInterval={width}
          snapToAlignment="center"
          onScrollBeginDrag={() => {
            setIsDragging(true);
          }}
          onMomentumScrollEnd={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.x / width);
            setCurrentIndex(index);
            setIsDragging(false);
          }}
          onScrollEndDrag={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.x / width);
            setCurrentIndex(index);
            setIsDragging(false);
          }}
          onScroll={(e) => {
            const offset = e.nativeEvent.contentOffset.x;
            const index = Math.round(offset / width);
            if (index !== currentIndex && index >= 0 && index < files.length) {
              setCurrentIndex(index);
            }
          }}
          scrollEventThrottle={16}
          renderItem={({ item, index }) => {
            const isNearby = Math.abs(index - currentIndex) <= 1;
            return (
              <ViewerItem 
                file={item} 
                isActive={index === currentIndex} 
                isNearby={isNearby}
                cachedValue={resolvedCache[item.id]}
                paused={isHoldActive || isDragging}
                onTapLeft={goToPrevious}
                onTapRight={goToNext}
                onToggleControls={handleToggleControls}
                onCacheResolve={(fileId, res) => {
                  setResolvedCache(prev => ({ ...prev, [fileId]: res }));
                }}
              />
            );
          }}
        />
      </View>

      {/* Top Header Overlay */}
      {controlsVisible && (
        <View style={[styles.headerOverlay, { top: insets.top || 16 }]} pointerEvents="box-none">
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
            <X size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {currentFile.caption || currentFile.file_name}
            </Text>
            <Text style={styles.headerSub}>{dateString}</Text>
          </View>

          <TouchableOpacity style={styles.headerBtn} onPress={() => setInfoVisible(true)}>
            <Info size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom Actions Overlay */}
      {controlsVisible && (
        <View style={[styles.bottomOverlay, { bottom: insets.bottom || 16 }]} pointerEvents="box-none">
          <TouchableOpacity style={styles.actionBtn} onPress={triggerCaption}>
            <Type size={18} color="#FFFFFF" />
            <Text style={styles.actionBtnLabel}>Caption</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
            <Share2 size={18} color="#FFFFFF" />
            <Text style={styles.actionBtnLabel}>Share</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={handleSendTo}>
            <Send size={18} color="#FFFFFF" />
            <Text style={styles.actionBtnLabel}>Send</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={() => setInfoVisible(true)}>
            <Info size={18} color="#FFFC00" />
            <Text style={[styles.actionBtnLabel, { color: '#FFFC00' }]}>Details</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Metadata Bottom Sheet Modal */}
      <Modal
        visible={infoVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setInfoVisible(false)}
      >
        <View style={styles.modalBg}>
          <TouchableOpacity style={styles.modalDismissHitbox} onPress={() => setInfoVisible(false)} />
          <View style={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Memory Details</Text>
              <TouchableOpacity onPress={() => setInfoVisible(false)}>
                <Text style={styles.sheetCloseBtn}>Done</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.detailRow}>
              <HardDrive size={15} color="#8E8E93" style={{ marginRight: 8 }} />
              <Text style={styles.detailLabel}>File Name:</Text>
              <Text style={styles.detailValue} numberOfLines={1}>{currentFile.file_name}</Text>
            </View>

            <View style={styles.detailRow}>
              <Calendar size={15} color="#8E8E93" style={{ marginRight: 8 }} />
              <Text style={styles.detailLabel}>Created At:</Text>
              <Text style={styles.detailValue}>{dateString}</Text>
            </View>

            <View style={styles.detailRow}>
              <HardDrive size={15} color="#8E8E93" style={{ marginRight: 8 }} />
              <Text style={styles.detailLabel}>File Size:</Text>
              <Text style={styles.detailValue}>{formatSize(currentFile.file_size)}</Text>
            </View>

            {currentFile.caption && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Caption:</Text>
                <Text style={styles.detailValue} numberOfLines={2}>{currentFile.caption}</Text>
              </View>
            )}

            {/* Actions Grid */}
            <View style={styles.sheetActionsContainer}>
              <TouchableOpacity style={styles.sheetActionBtn} onPress={handleToggleFavorite}>
                <Star size={16} color={isFavorite ? '#FFFC00' : '#FFFFFF'} fill={isFavorite ? '#FFFC00' : 'none'} style={{ marginBottom: 4 }} />
                <Text style={styles.sheetActionBtnLabel}>{isFavorite ? 'Unfavorite' : 'Favorite'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetActionBtn} onPress={() => { setInfoVisible(false); setFolderPickerVisible(true); }}>
                <FolderInput size={16} color="#FFFFFF" style={{ marginBottom: 4 }} />
                <Text style={styles.sheetActionBtnLabel}>Move To</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetActionBtn} onPress={triggerRename}>
                <Edit size={16} color="#FFFFFF" style={{ marginBottom: 4 }} />
                <Text style={styles.sheetActionBtnLabel}>Rename</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetActionBtn} onPress={triggerCaption}>
                <Type size={16} color="#FFFFFF" style={{ marginBottom: 4 }} />
                <Text style={styles.sheetActionBtnLabel}>Caption</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.sheetActionBtn, styles.deleteBtn]} onPress={handleDelete}>
                <Trash2 size={16} color="#FF453A" style={{ marginBottom: 4 }} />
                <Text style={[styles.sheetActionBtnLabel, { color: '#FF453A' }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Folder Picker Modal */}
      <Modal
        visible={folderPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFolderPickerVisible(false)}
      >
        <View style={styles.modalBg}>
          <TouchableOpacity style={styles.modalDismissHitbox} onPress={() => setFolderPickerVisible(false)} />
          <View style={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Move to Folder</Text>
              <TouchableOpacity onPress={() => setFolderPickerVisible(false)}>
                <Text style={styles.sheetCloseBtn}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 300, marginBottom: 20 }}>
              <TouchableOpacity
                style={styles.folderRow}
                onPress={() => handleMoveFile(null)}
              >
                <HardDrive size={18} color="#FFFC00" style={{ marginRight: 12 }} />
                <Text style={styles.folderName}>Root (No Folder)</Text>
              </TouchableOpacity>

              {folders.map(f => (
                <TouchableOpacity
                  key={f.id}
                  style={styles.folderRow}
                  onPress={() => handleMoveFile(f.id)}
                >
                  <HardDrive size={18} color="#8E8E93" style={{ marginRight: 12 }} />
                  <Text style={styles.folderName}>{f.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Rename Prompt Modal */}
      <Modal
        visible={renameVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameVisible(false)}
      >
        <View style={styles.alertBg}>
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>Rename Memory</Text>
            <TextInput
              style={styles.alertInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="Enter new file name"
              placeholderTextColor="#8E8E93"
              autoFocus
            />
            <View style={styles.alertActions}>
              <TouchableOpacity style={styles.alertBtn} onPress={() => setRenameVisible(false)}>
                <Text style={styles.alertCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.alertBtn} onPress={executeRename}>
                <Text style={styles.alertConfirmText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Caption Prompt Modal */}
      <Modal
        visible={captionVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCaptionVisible(false)}
      >
        <View style={styles.alertBg}>
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>Memory Caption</Text>
            <TextInput
              style={styles.alertInput}
              value={newCaption}
              onChangeText={setNewCaption}
              placeholder="Add caption details..."
              placeholderTextColor="#8E8E93"
              autoFocus
            />
            <View style={styles.alertActions}>
              <TouchableOpacity style={styles.alertBtn} onPress={() => setCaptionVisible(false)}>
                <Text style={styles.alertCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.alertBtn} onPress={executeCaption}>
                <Text style={styles.alertConfirmText}>Save</Text>
              </TouchableOpacity>
            </View>
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
  itemContainer: {
    width,
    height,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    position: 'relative',
  },
  fallbackContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  thumbnailBackground: {
    ...StyleSheet.absoluteFill,
    opacity: 0.15,
  },
  errorText: {
    color: '#FF453A',
    fontSize: 14,
    fontWeight: '700',
  },
  headerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    marginHorizontal: 12,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerSub: {
    color: '#CCCCCC',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomOverlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 10,
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  actionBtnLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalDismissHitbox: {
    flex: 1,
  },
  sheetContent: {
    backgroundColor: '#0F1123',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    borderTopWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  sheetCloseBtn: {
    color: '#FFFC00',
    fontSize: 14,
    fontWeight: '700',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  detailLabel: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
    width: 90,
  },
  detailValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  sheetActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 24,
  },
  sheetActionBtn: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sheetActionBtnLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  deleteBtn: {
    backgroundColor: 'rgba(255,69,58,0.1)',
    borderColor: 'rgba(255,69,58,0.2)',
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  folderName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  alertBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    backgroundColor: 'rgba(255,255,255,0.06)',
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
});

export default MemoriesViewerScreen;
