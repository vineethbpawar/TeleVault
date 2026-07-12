import React, { useState, useMemo } from 'react';
import { StyleSheet, FlatList, View, Dimensions, RefreshControl, Platform } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useSharedValue, runOnJS } from 'react-native-reanimated';

import { MemoryItem } from './MemoryItem';
import { MemoryGridProps, GalleryItem } from './types';
import { showToast } from '../components/ToastBanner';

const { width: screenWidth } = Dimensions.get('window');

export const MemoryGrid: React.FC<MemoryGridProps> = ({
  items,
  onPressItem,
  onLongPressItem,
  selectedIds,
  isSelectionMode,
  onRefresh,
  refreshing = false,
}) => {
  const [columns, setColumns] = useState(3);

  // Compute item size dynamically based on columns
  const itemSize = useMemo(() => {
    // 4px total margin between items (2px left, 2px right)
    return (screenWidth - (columns * 4)) / columns;
  }, [columns]);

  // Track pinch scaling factor
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
          // Pinch together: shrink thumbnails, show more columns
          setColumns((current) => {
            const next = Math.min(5, current + 1);
            if (next !== current) {
              showToast(`Zoomed Out: ${next} Columns`);
            }
            return next;
          });
        } else if (finalScale > 1.35) {
          // Spread apart: enlarge thumbnails, show fewer columns
          setColumns((current) => {
            const next = Math.max(2, current - 1);
            if (next !== current) {
              showToast(`Zoomed In: ${next} Columns`);
            }
            return next;
          });
        }
      })(scale);
    });

  // FlatList optimization parameters for lag-free rendering
  const renderItem = ({ item }: { item: GalleryItem }) => (
    <MemoryItem
      item={item}
      size={itemSize}
      onPress={() => onPressItem(item)}
      onLongPress={() => onLongPressItem(item)}
      isSelected={selectedIds.has(item.id)}
      isSelectionMode={isSelectionMode}
    />
  );

  return (
    <GestureDetector gesture={pinchGesture}>
      <View style={styles.container}>
        <FlatList
          key={`grid-cols-${columns}`} // Force key recreate to adjust column dimensions
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          numColumns={columns}
          showsVerticalScrollIndicator={false}
          maxToRenderPerBatch={8}
          windowSize={5}
          initialNumToRender={12}
          removeClippedSubviews={Platform.OS !== 'web'}
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
});
export default MemoryGrid;
