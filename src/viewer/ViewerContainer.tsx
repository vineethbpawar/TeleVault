import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, Dimensions, PanResponder, Animated, Platform, ActivityIndicator, Alert, Pressable } from 'react-native';
import { X, Trash2, Lock, Star, Send, Calendar, Info } from 'lucide-react-native';
import { Modal } from 'react-native';

import { ImageViewer } from './ImageViewer';
import { VideoPlayer } from './VideoPlayer';
import { previewCacheService } from '../services/previewCacheService';
import { fileService } from '../services/fileService';
import { showToast } from '../components/ToastBanner';

const { width, height } = Dimensions.get('window');

// Individual Slide Item wrapper
const ViewerItem = React.memo<{
  file: any;
  isActive: boolean;
  paused: boolean;
  onTapLeft: () => void;
  onTapRight: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}>(({ file, isActive, paused, onTapLeft, onTapRight, onHoldStart, onHoldEnd }) => {
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    previewCacheService.resolveFilePreview(file).then(res => {
      if (active) {
        const uri = res.playableUri || res.previewUri;
        if (uri) {
          setResolvedUri(uri);
        }
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [file]);

  if (loading) {
    return (
      <View style={styles.itemCenter}>
        <ActivityIndicator size="large" color="#FFFC00" />
      </View>
    );
  }

  if (!resolvedUri) {
    return (
      <View style={styles.itemCenter}>
        <Text style={{ color: '#8E8E93' }}>Unable to load media</Text>
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
      {/* 
        Strict Single Video Player Policy:
        Mount VideoPlayer ONLY when this slide is the active fullscreen slide.
        This destroys player instances on non-active preloaded slides.
      */}
      {isVideo ? (
        isActive ? (
          <VideoPlayer
            source={resolvedUri}
            style={styles.fullMedia}
            paused={paused}
          />
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
        if (lens === 'none' || lens === 'original') return null;

        const createdDate = file.created_at ? new Date(file.created_at) : new Date();
        const timeString = createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateString = createdDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        const locText = file.locationText || file.overlay_metadata?.locationText || '📍 Saved Location';

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
                <Text style={styles.liveOverlayStampText}>{locText}</Text>
              </View>
            )}
            {lens === 'date_location' && (
              <View style={styles.textOverlayWrapper}>
                <Text style={styles.liveOverlayStampText}>{locText}{'\n'}📅 {dateString}</Text>
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

interface ViewerContainerProps {
  files: any[];
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
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isHoldActive, setIsHoldActive] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Swipe-down-to-dismiss gesture setup
  const translateY = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const flatListRef = useRef<FlatList>(null);

  // Snapchat-style animated progress bar timing
  const progressAnim = useRef(new Animated.Value(0)).current;

  const activeFile = files[currentIndex];

  useEffect(() => {
    progressAnim.setValue(0);
    if (isHoldActive || isMenuOpen || isDragging) {
      progressAnim.stopAnimation();
      return;
    }

    const duration = activeFile?.file_type === 'video' ? 10000 : 5000;

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: duration,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        goToNext();
      }
    });

    return () => {
      progressAnim.stopAnimation();
    };
  }, [currentIndex, isHoldActive, isMenuOpen, isDragging]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Prevent wobble or tap cancellation on HUD buttons: require significant vertical swipe
        return gestureState.dy > 35 && Math.abs(gestureState.dx) < 20 && !isHoldActive && !isMenuOpen;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
          overlayOpacity.setValue(Math.max(0.4, 1 - gestureState.dy / height));
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy > 120 || gestureState.vy > 0.8) {
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: height,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(overlayOpacity, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            })
          ]).start(() => {
            navigation.goBack();
          });
        } else {
          Animated.parallel([
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
            }),
            Animated.spring(overlayOpacity, {
              toValue: 1,
              useNativeDriver: true,
            })
          ]).start();
        }
      },
    })
  ).current;

  const goToNext = () => {
    if (currentIndex < files.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: false });
    } else {
      navigation.goBack();
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      setCurrentIndex(prevIndex);
      flatListRef.current?.scrollToIndex({ index: prevIndex, animated: false });
    }
  };

  const handleScrollEnd = (e: any) => {
    setIsDragging(false);
    const contentOffsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / width);
    if (index !== currentIndex && index >= 0 && index < files.length) {
      setCurrentIndex(index);
    }
  };

  const handleMenuFavorite = async () => {
    try {
      const updated = await fileService.toggleFavoriteFile(activeFile.id, !activeFile.is_favorite);
      activeFile.is_favorite = updated.is_favorite;
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
    <Animated.View
      style={[
        styles.mainContainer,
        {
          opacity: overlayOpacity,
          transform: [{ translateY: translateY }],
        }
      ]}
      {...panResponder.panHandlers}
    >
      {/* Horizontal virtual swiper */}
      <FlatList
        ref={flatListRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={files}
        keyExtractor={(item) => item.id}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        onScrollBeginDrag={() => setIsDragging(true)}
        onMomentumScrollEnd={handleScrollEnd}
        renderItem={({ item, index }) => {
          const isCurrent = index === currentIndex;
          const isPrev = index === currentIndex - 1;
          const isNext = index === currentIndex + 1;
          const isNearby = isCurrent || isPrev || isNext;

          if (!isNearby) {
            return <View style={{ width, height, backgroundColor: '#000000' }} />;
          }

          return (
            <ViewerItem
              file={item}
              isActive={isCurrent}
              paused={!isCurrent || isHoldActive || isDragging || isMenuOpen}
              onTapLeft={goToPrevious}
              onTapRight={goToNext}
              onHoldStart={() => setIsHoldActive(true)}
              onHoldEnd={() => setIsHoldActive(false)}
            />
          );
        }}
        windowSize={3}
        maxToRenderPerBatch={1}
        updateCellsBatchingPeriod={100}
        initialNumToRender={1}
        removeClippedSubviews={Platform.OS !== 'web'}
      />

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
                {currentIndex + 1} of {files.length}
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

            <TouchableOpacity
              style={styles.infoCloseBtn}
              onPress={() => setShowInfoModal(false)}
            >
              <Text style={styles.infoCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </Animated.View>
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
    top: 90,
    left: 20,
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
    textAlign: 'left',
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
});
export default ViewerContainer;
