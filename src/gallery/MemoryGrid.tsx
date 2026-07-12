import React, { useState, useMemo } from 'react';
import { StyleSheet, SectionList, View, Text, Dimensions, RefreshControl, Platform } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useSharedValue, runOnJS } from 'react-native-reanimated';

import { MemoryItem } from './MemoryItem';
import { MemoryGridProps, GalleryItem } from './types';
import { showToast } from '../components/ToastBanner';

const { width: screenWidth } = Dimensions.get('window');

const formatDateHeader = (dateStr: string) => {
  try {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
  } catch (_) {
    return 'Other';
  }
};

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

  // Group items by date header, then partition into rows of size 'columns'
  const sections = useMemo(() => {
    const groups: { [key: string]: GalleryItem[] } = {};
    
    for (const item of items) {
      const header = formatDateHeader(item.created_at || item.uploaded_at);
      if (!groups[header]) {
        groups[header] = [];
      }
      groups[header].push(item);
    }

    const result: { title: string; data: GalleryItem[][] }[] = [];
    
    for (const title of Object.keys(groups)) {
      const groupItems = groups[title];
      const rows: GalleryItem[][] = [];
      
      for (let i = 0; i < groupItems.length; i += columns) {
        rows.push(groupItems.slice(i, i + columns));
      }
      
      result.push({
        title,
        data: rows
      });
    }
    
    return result;
  }, [items, columns]);

  return (
    <GestureDetector gesture={pinchGesture}>
      <View style={styles.container}>
        <SectionList
          sections={sections}
          keyExtractor={(row, index) => `row-${row[0]?.id}-${index}`}
          stickySectionHeadersEnabled={true}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeaderContainer}>
              <Text style={styles.sectionHeaderTitle}>{title}</Text>
            </View>
          )}
          renderItem={({ item: row }) => (
            <View style={styles.rowContainer}>
              {row.map((item) => (
                <MemoryItem
                  key={item.id}
                  item={item}
                  size={itemSize}
                  onPress={() => onPressItem(item)}
                  onLongPress={() => onLongPressItem(item)}
                  isSelected={selectedIds.has(item.id)}
                  isSelectionMode={isSelectionMode}
                />
              ))}
              {row.length < columns && 
                Array.from({ length: columns - row.length }).map((_, i) => (
                  <View key={`pad-${i}`} style={{ width: itemSize, margin: 2 }} />
                ))
              }
            </View>
          )}
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
});
export default MemoryGrid;
