import React, { useState, useMemo } from 'react';
import { StyleSheet, SectionList, View, Text, Dimensions, RefreshControl, Platform, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { Star, Video, ArrowUpCircle, ShieldCheck, Cloud, AlertCircle } from 'lucide-react-native';
import { DeviceMedia } from './deviceTypes';
import { showToast } from '../../components/ToastBanner';

const { width: screenWidth } = Dimensions.get('window');

const groupDateHeader = (timestamp: number) => {
  try {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

    const diffTime = Math.abs(today.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) return 'Last Week';
    if (diffDays <= 30) return 'Last Month';
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } catch (_) {
    return 'Earlier';
  }
};

interface DeviceTimelineGridProps {
  items: DeviceMedia[];
  onPressItem: (item: DeviceMedia) => void;
  onLongPressItem: (item: DeviceMedia) => void;
  selectedIds: Set<string>;
  isSelectionMode: boolean;
  onRefresh?: () => Promise<void>;
  refreshing?: boolean;
  onEndReached?: () => void;
  loadingMore?: boolean;
}

export const DeviceTimelineGrid: React.FC<DeviceTimelineGridProps> = ({
  items,
  onPressItem,
  onLongPressItem,
  selectedIds,
  isSelectionMode,
  onRefresh,
  refreshing = false,
  onEndReached,
  loadingMore = false,
}) => {
  const [columns, setColumns] = useState(3);

  const itemSize = useMemo(() => {
    return (screenWidth - (columns * 4)) / columns;
  }, [columns]);

  const baseScale = useSharedValue(1);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      'worklet';
      baseScale.value = 1;
    })
    .onEnd((event) => {
      'worklet';
      const scale = event.scale;
      runOnJS((finalScale: number) => {
        if (finalScale < 0.75) {
          setColumns((current) => {
            const next = Math.min(5, current + 1);
            if (next !== current) showToast(`Zoomed Out: ${next} Columns`);
            return next;
          });
        } else if (finalScale > 1.35) {
          setColumns((current) => {
            const next = Math.max(2, current - 1);
            if (next !== current) showToast(`Zoomed In: ${next} Columns`);
            return next;
          });
        }
      })(scale);
    });

  const sections = useMemo(() => {
    const groups: { [key: string]: DeviceMedia[] } = {};
    for (const item of items) {
      const header = groupDateHeader(item.creationDate);
      if (!groups[header]) groups[header] = [];
      groups[header].push(item);
    }

    const result: { title: string; data: DeviceMedia[][] }[] = [];
    for (const title of Object.keys(groups)) {
      const groupItems = groups[title];
      const rows: DeviceMedia[][] = [];
      for (let i = 0; i < groupItems.length; i += columns) {
        rows.push(groupItems.slice(i, i + columns));
      }
      result.push({ title, data: rows });
    }
    return result;
  }, [items, columns]);

  return (
    <GestureDetector gesture={pinchGesture}>
      <View style={styles.container}>
        <SectionList
          sections={sections}
          keyExtractor={(row, index) => `timeline-row-${row[0]?.assetId}-${index}`}
          stickySectionHeadersEnabled={true}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews={Platform.OS !== 'web'}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeaderContainer}>
              <Text style={styles.sectionHeaderTitle}>{title}</Text>
            </View>
          )}
          renderItem={({ item: row }) => (
            <View style={styles.rowContainer}>
              {row.map((item) => {
                const isSelected = selectedIds.has(item.assetId);
                const hasThumb = !!item.thumbnailUri;
                return (
                  <TouchableOpacity
                    key={item.assetId}
                    activeOpacity={0.8}
                    onPress={() => onPressItem(item)}
                    onLongPress={() => onLongPressItem(item)}
                    style={{
                      width: itemSize,
                      height: itemSize,
                      margin: 2,
                      position: 'relative',
                      borderRadius: 12,
                      overflow: 'hidden',
                      backgroundColor: '#1E1E1E',
                    }}
                  >
                    {hasThumb ? (
                      <Image
                        source={{ uri: item.thumbnailUri || item.uri }}
                        style={styles.image}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.fallbackMediaIcon}>
                        {item.isVideo ? <Video size={24} color="#8E8E93" /> : <Cloud size={24} color="#8E8E93" />}
                      </View>
                    )}

                    {/* Video Badge */}
                    {item.isVideo && (
                      <View style={styles.videoBadge}>
                        <Video size={10} color="#FFFFFF" fill="#FFFFFF" style={{ marginRight: 2 }} />
                        {item.duration > 0 && <Text style={styles.durationText}>{Math.round(item.duration)}s</Text>}
                      </View>
                    )}

                    {/* Sync / Cloud Location Indicators */}
                    <View style={styles.syncBadge}>
                      {item.isCloudOnly ? (
                        <Cloud size={14} color="#00B2FF" />
                      ) : item.syncStatus === 'verified' || item.syncStatus === 'uploaded' ? (
                        <ShieldCheck size={14} color="#34C759" />
                      ) : item.syncStatus === 'uploading' || item.syncStatus === 'queued' ? (
                        <ActivityIndicator size="small" color="#FFFC00" />
                      ) : item.syncStatus === 'failed' ? (
                        <AlertCircle size={14} color="#FF3B30" />
                      ) : (
                        <ArrowUpCircle size={14} color="rgba(255, 255, 255, 0.6)" />
                      )}
                    </View>

                    {/* Favorite Star */}
                    {item.favorite && (
                      <View style={styles.starBadge}>
                        <Star size={10} color="#FFFC00" fill="#FFFC00" />
                      </View>
                    )}

                    {/* Selection Overlay */}
                    {isSelectionMode && (
                      <View style={[styles.selectionOverlay, isSelected && styles.selectionOverlaySelected]}>
                        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                          {isSelected && <Text style={styles.checkboxCheck}>✓</Text>}
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
              {row.length < columns && 
                Array.from({ length: columns - row.length }).map((_, i) => (
                  <View key={`pad-${i}`} style={{ width: itemSize, margin: 2 }} />
                ))
              }
            </View>
          )}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color="#FFFC00" />
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.gridContent}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#FFFC00']}
                tintColor="#FFFC00"
              />
            ) : undefined
          }
        />
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  gridContent: {
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 80,
  },
  rowContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallbackMediaIcon: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
  },
  sectionHeaderContainer: {
    backgroundColor: '#000000',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  sectionHeaderTitle: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  videoBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  syncBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 10,
    padding: 2,
  },
  starBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 4,
    borderRadius: 8,
  },
  selectionOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    padding: 10,
  },
  selectionOverlaySelected: {
    backgroundColor: 'rgba(255, 252, 0, 0.15)',
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
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
