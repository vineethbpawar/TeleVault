import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, PanResponder, Animated, Platform, ActivityIndicator, Alert, Pressable } from 'react-native';
import { X, Trash2, Lock, Star, Send, Calendar, Info } from 'lucide-react-native';
import { Modal } from 'react-native';

import { ImageViewer } from './ImageViewer';
import { VideoPlayer } from './VideoPlayer';
import { previewCacheService } from '../services/previewCacheService';
import { fileService } from '../services/fileService';
import { showToast } from '../components/ToastBanner';
import { supabase } from '../lib/supabase';
import AdBanner from '../components/AdBanner';


const { width, height } = Dimensions.get('window');



// Individual Slide Item wrapper
const ViewerItem = React.memo<{
  file: any;
  isActive: boolean;
  isPreload: boolean;
  paused: boolean;
  onTapLeft: () => void;
  onTapRight: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}>(({ file, isActive, isPreload, paused, onTapLeft, onTapRight, onHoldStart, onHoldEnd }) => {
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);



  const lastFileIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!isActive && !isPreload) {
      setLoading(true);
      setResolvedUri(null);
      lastFileIdRef.current = null;
      return;
    }

    // If the file is the same and we already have resolved it, do not reload
    if (resolvedUri && file.id === lastFileIdRef.current) {
      setLoading(false);
      return;
    }

    // Reset state for new file
    if (file.id !== lastFileIdRef.current) {
      setResolvedUri(null);
      setLoading(true);
    }
    setMediaError(null);
    lastFileIdRef.current = file.id;

    previewCacheService.resolveFilePreview(file).then(res => {
      if (active) {
        const uri = res.playableUri || res.previewUri;
        if (uri) {
          setResolvedUri(uri);
          console.log(`[SINGLE_SUBSYSTEM_LOG] RESOLVED | file_id=${file.id} uri=${uri.slice(0, 60)}`);
        } else if ((res as any).error) {
          setMediaError((res as any).error);
        }
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [file.id, isActive, isPreload, resolvedUri]);

  const renderPressableContent = (content: React.ReactNode) => {
    return (
      <Pressable
        style={styles.itemContainer}
        onPress={(e) => {
          const x = e.nativeEvent.pageX;
          if (x < width * 0.3) {
            onTapLeft();
          } else {
            onTapRight();
          }
        }}
        onLongPress={onHoldStart}
        onPressOut={onHoldEnd}
        delayLongPress={250}
      >
        {content}
      </Pressable>
    );
  };

  if (loading) {
    return renderPressableContent(
      <View style={styles.itemCenter}>
        <ActivityIndicator size="large" color="#FFFC00" />
      </View>
    );
  }

  if (!resolvedUri) {
    return renderPressableContent(
      <View style={[styles.itemCenter, { paddingHorizontal: 32 }]}>
        <Text style={{ color: '#FF3B30', fontSize: 18, textAlign: 'center', marginBottom: 10 }}>⚠️ Can't Play Video</Text>
        <Text style={{ color: '#8E8E93', fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
          {mediaError || 'Unable to load media'}
        </Text>
      </View>
    );
  }

  const isVideo = file.file_type === 'video';

  return (
    <Pressable
      style={styles.itemContainer}
      onPress={(e) => {
        const x = e.nativeEvent.pageX;
        if (x < width * 0.3) {
          onTapLeft();
        } else {
          onTapRight();
        }
      }}
      onLongPress={onHoldStart}
      onPressOut={onHoldEnd}
      delayLongPress={250}
    >
      {isVideo ? (
        isActive ? (
          resolvedUri ? (
            <VideoPlayer
              source={resolvedUri}
              style={styles.fullMedia}
              paused={paused}
            />
          ) : (
            <View style={styles.itemCenter}>
              <ActivityIndicator size="large" color="#FFFC00" />
            </View>
          )
        ) : (
          <View style={styles.itemCenter}>
            <ActivityIndicator size="small" color="#8E8E93" />
          </View>
        )
      ) : (
        <ImageViewer source={resolvedUri} />
      )}

      {/* Dynamic Lens Overlays */}
      {(() => {
        const lens = file.overlay_metadata?.lens || 'none';
        // 'baked' means the lens stamp was already composited into the image/video
        // pixels by PreviewScreen — skip live overlay to avoid double-rendering.
        if (lens === 'none' || lens === 'original' || lens === 'baked') return null;

        const createdDate = file.created_at ? new Date(file.created_at) : new Date();
        const timeString = createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateString = createdDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        
        let locRaw = file.locationText || file.overlay_metadata?.locationText || 'Saved Location';
        // Clean up any double or single 📍 icons that might have been stored in old metadata
        const locText = locRaw.replace(/^📍\s*/g, '').replace(/^📍\s*/g, '').trim();

        return (
          <View style={styles.liveOverlayContainer} pointerEvents="none">
            {lens === 'time' && (
              <View style={styles.textOverlayWrapper}>
                <Text style={styles.liveOverlayStampText}>🕒 {timeString}</Text>
              </View>
            )}
            {lens === 'date' && (
              <View style={styles.textOverlayWrapper}>
                <Text style={styles.liveOverlayStampText}>📅 {dateString}</Text>
              </View>
            )}
            {lens === 'time_date' && (
              <View style={styles.textOverlayWrapper}>
                <Text style={styles.liveOverlayStampText}>⏰ {timeString}{'\n'}📅 {dateString}</Text>
              </View>
            )}
            {lens === 'location' && (
              <View style={styles.textOverlayWrapper}>
                <Text style={styles.liveOverlayStampText}>📍 {locText}</Text>
              </View>
            )}
            {lens === 'date_location' && (
              <View style={styles.textOverlayWrapper}>
                <Text style={styles.liveOverlayStampText}>📍 {locText}{'\n'}📅 {dateString}</Text>
              </View>
            )}
          </View>
        );
      })()}

      {/* Caption Overlay */}
      {file.caption && (
        <View style={styles.captionContainer}>
          <Text style={styles.captionText}>{file.caption}</Text>
        </View>
      )}
    </Pressable>
  );
}, (prev, next) => {
  return prev.file.id === next.file.id &&
         prev.isActive === next.isActive &&
         prev.paused === next.paused;
});

import { activeMemoriesStore } from '../gallery/GalleryContainer';

interface ViewerContainerProps {
  files?: any[];
  initialIndex: number;
  navigation: any;
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

export const ViewerContainer: React.FC<ViewerContainerProps> = ({ files, initialIndex, navigation }) => {
  const [localFiles, setLocalFiles] = useState(() => (files && files.length > 0 ? files : activeMemoriesStore));
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isHoldActive, setIsHoldActive] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showInterstitialModal, setShowInterstitialModal] = useState(false);

  useEffect(() => {
    const { adService } = require('../services/adService');
    const unsubscribe = adService.subscribe((shouldShow: boolean) => {
      if (shouldShow) {
        setShowInterstitialModal(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // Swipe-down-to-dismiss gesture setup
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Snapchat-style animated progress bar timing
  const progressAnim = useRef(new Animated.Value(0)).current;

  const activeFile = localFiles[currentIndex];

  useEffect(() => {
    progressAnim.setValue(0);
    if (isHoldActive || isMenuOpen || showInterstitialModal) {
      progressAnim.stopAnimation();
      return;
    }

    const duration = activeFile?.file_type === 'video' ? 10000 : 5000;

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: duration,
      useNativeDriver: false,
    }).start();

    return () => {
      progressAnim.stopAnimation();
    };
  }, [currentIndex, isHoldActive, isMenuOpen, showInterstitialModal]);

  // Postgres realtime changes listener to automatically update localFiles when database changes
  useEffect(() => {
    const channel = supabase
      .channel('viewer_realtime_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'files' }, async (payload) => {
        if (payload.eventType === 'UPDATE' && payload.new) {
          const updatedFile = payload.new as any;
          setLocalFiles(prev => prev.map(f => f.id === updatedFile.id ? updatedFile : f));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Local upload queue state changes subscription
  useEffect(() => {
    const { uploadQueueService } = require('../services/uploadQueueService');
    const unsubscribe = uploadQueueService.subscribeToQueue(async (updatedQueue: any[]) => {
      const activeQueueItem = updatedQueue.find(q => q.db_file_id === activeFile?.id);
      if (activeQueueItem && activeQueueItem.status === 'completed' && !activeFile.telegram_file_id) {
        try {
          const { data, error } = await supabase
            .from('files')
            .select('*')
            .eq('id', activeFile.id)
            .maybeSingle();

          if (data && !error) {
            setLocalFiles(prev => prev.map(f => f.id === activeFile.id ? data : f));
          }
        } catch (err) {
          console.warn('[ViewerContainer] Failed to update active file metadata:', err);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentIndex, activeFile?.id]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return gestureState.dy > 12 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && !isHoldActive && !isMenuOpen;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dy > 0) {
          translateX.setValue(gestureState.dx);
          translateY.setValue(gestureState.dy);
          const nextScale = Math.max(0.4, 1 - (gestureState.dy / (height * 0.45)) * 0.6);
          scaleAnim.setValue(nextScale);
          overlayOpacity.setValue(Math.max(0.05, 1 - gestureState.dy / (height * 0.4)));
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy > 80 || gestureState.vy > 0.4) {
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: height * 0.8,
              duration: 180,
              useNativeDriver: true,
            }),
            Animated.timing(translateX, {
              toValue: gestureState.dx * 1.5,
              duration: 180,
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: 0.5,
              duration: 180,
              useNativeDriver: true,
            }),
            Animated.timing(overlayOpacity, {
              toValue: 0,
              duration: 180,
              useNativeDriver: true,
            })
          ]).start(() => {
            navigation.goBack();
          });
        } else {
          Animated.parallel([
            Animated.spring(translateX, {
              toValue: 0,
              friction: 9,
              tension: 50,
              useNativeDriver: true,
            }),
            Animated.spring(translateY, {
              toValue: 0,
              friction: 9,
              tension: 50,
              useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
              toValue: 1,
              friction: 9,
              tension: 50,
              useNativeDriver: true,
            }),
            Animated.spring(overlayOpacity, {
              toValue: 1,
              friction: 9,
              tension: 50,
              useNativeDriver: true,
            })
          ]).start();
        }
      },
      onPanResponderTerminate: (evt, gestureState) => {
        if (gestureState.dy > 80 || gestureState.vy > 0.4) {
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: height * 0.8,
              duration: 180,
              useNativeDriver: true,
            }),
            Animated.timing(translateX, {
              toValue: gestureState.dx * 1.5,
              duration: 180,
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: 0.5,
              duration: 180,
              useNativeDriver: true,
            }),
            Animated.timing(overlayOpacity, {
              toValue: 0,
              duration: 180,
              useNativeDriver: true,
            })
          ]).start(() => {
            navigation.goBack();
          });
        } else {
          Animated.parallel([
            Animated.spring(translateX, {
              toValue: 0,
              friction: 9,
              tension: 50,
              useNativeDriver: true,
            }),
            Animated.spring(translateY, {
              toValue: 0,
              friction: 9,
              tension: 50,
              useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
              toValue: 1,
              friction: 9,
              tension: 50,
              useNativeDriver: true,
            }),
            Animated.spring(overlayOpacity, {
              toValue: 1,
              friction: 9,
              tension: 50,
              useNativeDriver: true,
            })
          ]).start();
        }
      },
    })
  ).current;

  const goToNext = () => {
    try {
      const { adService } = require('../services/adService');
      adService.registerMemoryOpen();
    } catch (_) {}

    if (currentIndex < localFiles.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      navigation.goBack();
    }
  };

  const goToPrevious = () => {
    try {
      const { adService } = require('../services/adService');
      adService.registerMemoryOpen();
    } catch (_) {}

    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleMenuFavorite = async () => {
    try {
      const updated = await fileService.toggleFavoriteFile(activeFile.id, !activeFile.is_favorite);
      setLocalFiles(prev => prev.map(f => f.id === activeFile.id ? { ...f, is_favorite: updated.is_favorite } : f));
      showToast(updated.is_favorite ? 'Added to favorites.' : 'Removed from favorites.');
    } catch (_) {
      showAlert('Error', 'Failed to toggle favorite.');
    }
  };

  const handleMenuHide = async () => {
    try {
      await fileService.bulkHide([activeFile.id], true);
      showToast('Moved to Private Vault.');
      navigation.goBack();
    } catch (_) {
      showAlert('Error', 'Failed to hide snap.');
    }
  };

  const handleMenuDelete = async () => {
    showAlert('Delete Snap', 'Are you sure you want to permanently delete this snap?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await fileService.bulkDelete([activeFile.id], true);
            showToast('Snap deleted.');
            navigation.goBack();
          } catch (err: any) {
            console.error('[Delete] Failed to delete snap:', err);
            showAlert('Delete Failed', err.message || 'Failed to delete snap. Please try again.');
          }
        }
      }
    ]);
  };

  const handleMenuSend = () => {
    navigation.navigate('SendTo', {
      fileId: activeFile.id,
      fileName: activeFile.file_name,
      fileType: activeFile.file_type,
      telegramFileId: activeFile.telegram_file_id,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: '#000000',
            opacity: overlayOpacity,
          }
        ]}
      />
      <Animated.View
        style={[
          styles.mainContainer,
          {
            transform: [
              { translateX: translateX },
              { translateY: translateY },
              { scale: scaleAnim }
            ],
            borderRadius: scaleAnim.interpolate({
              inputRange: [0.4, 1],
              outputRange: [56, 0],
              extrapolate: 'clamp',
            }),
            overflow: 'hidden',
          }
        ]}
        {...panResponder.panHandlers}
      >
      {/* Single-item viewer for both Web and Android — no horizontal swipe, tap to navigate */}
      <Animated.View
        style={[
          {
            width,
            height,
            overflow: 'hidden',
            position: 'relative',
            borderRadius: scaleAnim.interpolate({
              inputRange: [0.4, 1],
              outputRange: [56, 0],
              extrapolate: 'clamp',
            }),
          },
          Platform.OS === 'web' && ({ webkitMaskImage: '-webkit-radial-gradient(white, black)' } as any)
        ]}
      >
        <ViewerItem
          file={activeFile}
          isActive={true}
          isPreload={false}
          paused={isHoldActive || isMenuOpen || showInterstitialModal}
          onTapLeft={goToPrevious}
          onTapRight={goToNext}
          onHoldStart={() => setIsHoldActive(true)}
          onHoldEnd={() => setIsHoldActive(false)}
        />
      </Animated.View>

      {/* Ultra-Fast Multi-Snap Preloader (Preloads +1, +2, +3 ahead in background) */}
      {currentIndex < localFiles.length - 1 && (
        <View style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}>
          <ViewerItem
            file={localFiles[currentIndex + 1]}
            isActive={false}
            isPreload={true}
            paused={true}
            onTapLeft={() => {}}
            onTapRight={() => {}}
            onHoldStart={() => {}}
            onHoldEnd={() => {}}
          />
        </View>
      )}
      {currentIndex < localFiles.length - 2 && (
        <View style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}>
          <ViewerItem
            file={localFiles[currentIndex + 2]}
            isActive={false}
            isPreload={true}
            paused={true}
            onTapLeft={() => {}}
            onTapRight={() => {}}
            onHoldStart={() => {}}
            onHoldEnd={() => {}}
          />
        </View>
      )}
      {currentIndex < localFiles.length - 3 && (
        <View style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}>
          <ViewerItem
            file={localFiles[currentIndex + 3]}
            isActive={false}
            isPreload={true}
            paused={true}
            onTapLeft={() => {}}
            onTapRight={() => {}}
            onHoldStart={() => {}}
            onHoldEnd={() => {}}
          />
        </View>
      )}
      {currentIndex > 0 && (
        <View style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}>
          <ViewerItem
            file={localFiles[currentIndex - 1]}
            isActive={false}
            isPreload={true}
            paused={true}
            onTapLeft={() => {}}
            onTapRight={() => {}}
            onHoldStart={() => {}}
            onHoldEnd={() => {}}
          />
        </View>
      )}

      {/* Top HUD (Details and close button) */}
      {!isHoldActive && !isMenuOpen && (
        <View style={styles.topHudContainer}>
          {/* Time and Title Header */}
          <View style={styles.topBar}>
            <View style={styles.topBarLeft}>
              <Calendar size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.dateText}>
                {new Date(activeFile.created_at).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </Text>
              <Text style={styles.indexIndicatorText}>
                {currentIndex + 1} of {localFiles.length}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={() => setShowInfoModal(true)} style={[styles.hudBtn, { marginRight: 10 }]}>
                <Info size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.hudBtn}>
                <X size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Bottom overlay Actions */}
      {!isHoldActive && !isMenuOpen && (
        <View style={styles.bottomHudContainer}>
          <TouchableOpacity style={styles.bottomActionBtn} onPress={handleMenuSend}>
            <Send size={20} color="#000000" fill="#000000" />
            <Text style={styles.bottomActionText}>Send</Text>
          </TouchableOpacity>

          <View style={styles.actionIconsGroup}>
            <TouchableOpacity style={styles.hudBtnSmall} onPress={handleMenuFavorite}>
              <Star size={20} color={activeFile.is_favorite ? '#FFFC00' : '#FFFFFF'} fill={activeFile.is_favorite ? '#FFFC00' : 'transparent'} />
            </TouchableOpacity>

            {!activeFile.is_private && (
              <TouchableOpacity style={styles.hudBtnSmall} onPress={handleMenuHide}>
                <Lock size={20} color="#FFFFFF" />
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.hudBtnSmall} onPress={handleMenuDelete}>
              <Trash2 size={20} color="#FF3B30" />
            </TouchableOpacity>
          </View>
        </View>
      )}
      {/* Media Details / Info Modal */}
      <Modal
        visible={showInfoModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowInfoModal(false)}
      >
        <TouchableOpacity
          style={styles.infoModalOverlay}
          activeOpacity={1}
          onPress={() => setShowInfoModal(false)}
        >
          <View style={styles.infoModalContent}>
            <Text style={styles.infoModalTitle}>Snap Details</Text>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Filename</Text>
              <Text style={styles.infoValue} numberOfLines={1}>{activeFile.file_name}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Type</Text>
              <Text style={styles.infoValue}>{activeFile.file_type === 'video' ? '🎬 Video' : '📸 Image'}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Lens Filter</Text>
              <Text style={[styles.infoValue, { textTransform: 'capitalize' }]}>
                {activeFile.overlay_metadata?.lens || 'Original'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Created At</Text>
              <Text style={styles.infoValue}>
                {new Date(activeFile.created_at).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>File Size</Text>
              <Text style={styles.infoValue}>
                {activeFile.file_size ? `${(activeFile.file_size / (1024 * 1024)).toFixed(2)} MB` : 'Unknown'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Destination</Text>
              <Text style={styles.infoValue}>
                {activeFile.is_private ? '🔒 Private Drive' : activeFile.is_drive_file ? '☁️ Cloud Drive' : '📱 memories'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Telegram Sync</Text>
              <Text style={[styles.infoValue, { color: activeFile.telegram_file_id ? '#34C759' : '#FF3B30' }]}>
                {activeFile.telegram_file_id ? '☁️ Uploaded' : '❌ Pending / Local Only'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Message ID</Text>
              <Text style={styles.infoValue}>{activeFile.telegram_message_id || 'None'}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Upload State</Text>
              <Text style={styles.infoValue}>
                {activeFile.telegram_file_id 
                  ? (activeFile.is_chunked ? 'Completed (Multi-Part Chunked)' : 'Completed (Single File)') 
                  : 'Queued (Offline Mode)'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.infoCloseBtn}
              onPress={() => setShowInfoModal(false)}
            >
              <Text style={styles.infoCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 15-Snap Interstitial Ad Modal */}
      <Modal transparent visible={showInterstitialModal} animationType="fade">
        <View style={styles.interstitialOverlay}>
          <View style={styles.interstitialContent}>
            <View style={styles.interstitialHeader}>
              <View style={styles.adTag}>
                <Text style={styles.adTagText}>SPONSORED</Text>
              </View>
              <TouchableOpacity 
                style={styles.interstitialCloseBtn} 
                onPress={() => setShowInterstitialModal(false)}
              >
                <X size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <Text style={styles.interstitialTitle}>TeleVault Cloud Vault</Text>
            <Text style={styles.interstitialSub}>Unlimited encrypted media cloud storage powered by Telegram</Text>

            <View style={styles.interstitialBody}>
              <AdBanner style={{ width: '100%' }} />
            </View>

            <TouchableOpacity 
              style={styles.interstitialCtaBtn}
              onPress={() => setShowInterstitialModal(false)}
            >
              <Text style={styles.interstitialCtaText}>Skip Ad & Continue Snaps</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  itemContainer: {
    width: width,
    height: height,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  itemCenter: {
    width: width,
    height: height,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  fullMedia: {
    width: '100%',
    height: '100%',
  },
  captionContainer: {
    position: 'absolute',
    bottom: 120,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    maxWidth: '85%',
  },
  captionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  topHudContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 44,
    marginTop: Platform.OS === 'ios' ? 44 : 20,
    marginBottom: 10,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  indexIndicatorText: {
    color: '#FFFC00',
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 8,
    backgroundColor: 'rgba(255, 252, 0, 0.15)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  hudBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hudBtnSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  bottomHudContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  bottomActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFC00',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
  },
  bottomActionText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 6,
  },
  actionIconsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveOverlayContainer: {
    ...StyleSheet.absoluteFill,
    zIndex: 5,
  },
  textOverlayWrapper: {
    position: 'absolute',
    bottom: 120,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 4,
  },
  liveOverlayStampText: {
    color: '#FFFC00',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
    lineHeight: 20,
  },
  stampOverlayWrapper: {
    position: 'absolute',
    top: 100,
    right: 20,
    transform: [{ rotate: '-12deg' }],
  },
  stampOverlayText: {
    color: '#FFFC00',
    fontSize: 11,
    fontWeight: '900',
    borderWidth: 1.5,
    borderColor: '#FFFC00',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  infoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  infoModalContent: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderWidth: 1.5,
    borderColor: '#FFFC00',
  },
  infoModalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  infoLabel: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
  infoValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    maxWidth: '65%',
  },
  infoCloseBtn: {
    backgroundColor: '#FFFC00',
    borderRadius: 24,
    paddingVertical: 12,
    marginTop: 24,
    alignItems: 'center',
  },
  infoCloseBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '800',
  },
  interstitialOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  interstitialContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#0F1123',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#FFFC00',
    alignItems: 'center',
  },
  interstitialHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  adTag: {
    backgroundColor: 'rgba(255, 252, 0, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  adTagText: {
    color: '#FFFC00',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  interstitialCloseBtn: {
    padding: 4,
  },
  interstitialTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  interstitialSub: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  interstitialBody: {
    width: '100%',
    marginVertical: 8,
  },
  interstitialCtaBtn: {
    backgroundColor: '#FFFC00',
    width: '100%',
    paddingVertical: 12,
    borderRadius: 20,
    marginTop: 12,
    alignItems: 'center',
  },
  interstitialCtaText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
});
export default ViewerContainer;
