import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  Dimensions,
  PanResponder,
  Animated,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { X, Trash2, Lock, Star, MoreVertical, Send, Calendar, Type } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import VideoPlayer from '../components/VideoPlayer';
import { fileService } from '../services/fileService';
import { previewCacheService } from '../services/previewCacheService';
import { showToast } from '../components/ToastBanner';

type Props = NativeStackScreenProps<AppStackParamList, 'MemoriesViewer'>;

const { width, height } = Dimensions.get('window');

// Individual Viewer Slide Item
const ViewerItem = React.memo<{
  file: any;
  isActive: boolean;
  paused: boolean;
}>(({ file, isActive, paused }) => {
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Resolve media URI: local_uri -> previewCache / telegram_url
    if (file.local_uri) {
      setResolvedUri(file.local_uri);
      setLoading(false);
    } else {
      previewCacheService.resolveFilePreview(file).then(res => {
        if (active) {
          const uri = res.playableUri || res.previewUri;
          if (uri) {
            setResolvedUri(uri);
          }
          setLoading(false);
        }
      });
    }

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
    <View style={styles.itemContainer}>
      {isVideo ? (
        <VideoPlayer
          source={resolvedUri}
          style={styles.fullMedia}
          paused={paused}
        />
      ) : (
        <ScrollView
          maximumZoomScale={3}
          minimumZoomScale={1}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ width, height, justifyContent: 'center', alignItems: 'center' }}
        >
          <Image
            source={{ uri: resolvedUri }}
            style={styles.fullMedia}
            resizeMode="contain"
          />
        </ScrollView>
      )}

      {/* Caption Overlay */}
      {file.caption && (
        <View style={styles.captionContainer}>
          <Text style={styles.captionText}>{file.caption}</Text>
        </View>
      )}
    </View>
  );
}, (prev, next) => {
  return prev.file.id === next.file.id &&
         prev.isActive === next.isActive &&
         prev.paused === next.paused;
});

export const MemoriesViewerScreen: React.FC<Props> = ({ route, navigation }) => {
  const { files, initialIndex } = route.params;

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isHoldActive, setIsHoldActive] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Swipe-down-to-dismiss gesture setup
  const translateY = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const flatListRef = useRef<FlatList>(null);

  const activeFile = files[currentIndex];

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Intercept vertical downward drag only
        return Math.abs(gestureState.dy) > 15 && gestureState.dy > 0 && !isHoldActive && !isMenuOpen;
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

  // Horizontal tap navigation (Snapchat style)
  const handleScreenPress = (evt: any) => {
    const x = evt.nativeEvent.pageX;
    const threshold = width * 0.3; // Left 30%
    if (x < threshold) {
      goToPrevious();
    } else {
      goToNext();
    }
  };

  const goToNext = () => {
    if (currentIndex < files.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: false });
    } else {
      // Auto close on last story
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

  // Quick Action Menu Operations
  const handleMenuFavorite = async () => {
    setIsMenuOpen(false);
    try {
      const updated = await fileService.toggleFavoriteFile(activeFile.id, !activeFile.is_favorite);
      activeFile.is_favorite = updated.is_favorite;
      showToast(updated.is_favorite ? 'Added to favorites.' : 'Removed from favorites.');
    } catch (_) {
      Alert.alert('Error', 'Failed to toggle favorite.');
    }
  };

  const handleMenuHide = async () => {
    setIsMenuOpen(false);
    try {
      await fileService.bulkHide([activeFile.id], true);
      showToast('Moved to Private Vault.');
      navigation.goBack();
    } catch (_) {
      Alert.alert('Error', 'Failed to hide snap.');
    }
  };

  const handleMenuDelete = async () => {
    setIsMenuOpen(false);
    Alert.alert('Delete Snap', 'Are you sure you want to delete this snap?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await fileService.bulkDelete([activeFile.id], false);
            showToast('Moved to Trash.');
            navigation.goBack();
          } catch (_) {}
        }
      }
    ]);
  };

  const handleMenuSend = () => {
    setIsMenuOpen(false);
    previewCacheService.resolveFilePreview(activeFile).then(res => {
      const uri = res.playableUri || res.previewUri;
      if (uri) {
        navigation.navigate('SendTo', {
          mediaUri: uri,
          mediaType: activeFile.file_type as 'image' | 'video',
          metadata: activeFile.overlay_metadata,
        });
      } else {
        Alert.alert('Error', 'Unable to resolve file.');
      }
    });
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity: overlayOpacity,
        }
      ]}
      {...panResponder.panHandlers}
    >
      {/* Tap Gesture Overlay for Left/Right Jumps */}
      {!isMenuOpen && (
        <TouchableOpacity
          activeOpacity={1}
          style={StyleSheet.absoluteFill}
          onPress={handleScreenPress}
          onLongPress={() => setIsHoldActive(true)}
          onPressOut={() => setIsHoldActive(false)}
        />
      )}

      {/* Immersive Horizontal FlatList */}
      <FlatList
        ref={flatListRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={files}
        keyExtractor={(item) => item.id}
        initialScrollIndex={initialIndex}
        getItemLayout={(data, index) => ({
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

          // STRICT CLEANUP (Free resources outside ±1 page)
          if (!isNearby) {
            return <View style={{ width, height, backgroundColor: '#000000' }} />;
          }

          return (
            <ViewerItem
              file={item}
              isActive={isCurrent}
              paused={!isCurrent || isHoldActive || isDragging || isMenuOpen}
            />
          );
        }}
        windowSize={3}
        maxToRenderPerBatch={1}
        updateCellsBatchingPeriod={100}
        initialNumToRender={1}
        removeClippedSubviews={Platform.OS !== 'web'}
      />

      {/* Top Overlay HUD (Progress bar and Close) */}
      {!isHoldActive && !isMenuOpen && (
        <View style={styles.topHudContainer}>
          {/* Progress Segment indicators */}
          <View style={styles.progressContainer}>
            {files.map((_, idx) => (
              <View key={idx} style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarActive,
                    {
                      width: idx < currentIndex ? '100%' : idx === currentIndex ? '100%' : '0%',
                      backgroundColor: idx === currentIndex ? '#FFFC00' : '#FFFFFF',
                    }
                  ]}
                />
              </View>
            ))}
          </View>

          {/* Title / Action bar */}
          <View style={styles.topBar}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Calendar size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.dateText}>
                {new Date(activeFile.created_at).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </Text>
            </View>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.hudBtn}>
              <X size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Bottom Action HUD */}
      {!isHoldActive && !isMenuOpen && (
        <View style={styles.bottomHudContainer}>
          <TouchableOpacity style={styles.bottomActionBtn} onPress={handleMenuSend}>
            <Send size={20} color="#000000" fill="#000000" />
            <Text style={styles.bottomActionText}>Send</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuTriggerBtn} onPress={() => setIsMenuOpen(true)}>
            <MoreVertical size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* Snapchat-style Bottom Action Sheet Menu */}
      <Modal
        visible={isMenuOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsMenuOpen(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setIsMenuOpen(false)}
        >
          <View style={styles.sheetContainer}>
            <View style={styles.sheetDragIndicator} />
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {activeFile.file_name}
            </Text>

            <TouchableOpacity style={styles.sheetItem} onPress={handleMenuSend}>
              <Send size={18} color="#FFFFFF" style={{ marginRight: 12 }} />
              <Text style={styles.sheetText}>Send Snap</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetItem} onPress={handleMenuFavorite}>
              <Star size={18} color="#FFFFFF" style={{ marginRight: 12 }} />
              <Text style={styles.sheetText}>
                {activeFile.is_favorite ? 'Remove Favorite' : 'Add to Favorites'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetItem} onPress={handleMenuHide}>
              <Lock size={18} color="#FFFFFF" style={{ marginRight: 12 }} />
              <Text style={styles.sheetText}>Move to Private Vault</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.sheetItem, styles.sheetItemDelete]} onPress={handleMenuDelete}>
              <Trash2 size={18} color="#FF453A" style={{ marginRight: 12 }} />
              <Text style={[styles.sheetText, { color: '#FF453A' }]}>Delete Snap</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </Animated.View>
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
  },
  itemCenter: {
    width,
    height,
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
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  captionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  topHudContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  progressContainer: {
    flexDirection: 'row',
    height: 3,
    gap: 4,
    marginBottom: 12,
  },
  progressBarBackground: {
    flex: 1,
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarActive: {
    height: '100%',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  hudBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
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
    fontWeight: '700',
    marginLeft: 6,
  },
  menuTriggerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#0F1123',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 40,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sheetDragIndicator: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  sheetItemDelete: {
    borderBottomWidth: 0,
    marginTop: 10,
  },
  sheetText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default MemoriesViewerScreen;
