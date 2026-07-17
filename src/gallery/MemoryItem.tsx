import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image } from 'react-native';
import { Star, Video, Image as ImageIcon, CloudUpload } from 'lucide-react-native';
import { GalleryItem } from './types';
import { previewCacheService } from '../services/previewCacheService';

interface MemoryItemProps {
  item: GalleryItem;
  size: number;
  onPress: () => void;
  onLongPress: () => void;
  isSelected: boolean;
  isSelectionMode: boolean;
}

export const MemoryItem: React.FC<MemoryItemProps> = React.memo(
  ({ item, size, onPress, onLongPress, isSelected, isSelectionMode }) => {
    const [imgUri, setImgUri] = useState<string | null>(() => {
      return previewCacheService.getInMemoryPreview(item.telegram_file_id || item.id);
    });

    useEffect(() => {
      let active = true;

      previewCacheService
        .resolveFilePreview(item, false, undefined, (generatedUri) => {
          if (active) {
            setImgUri(generatedUri);
          }
        }, 'low')
        .then((res) => {
          if (active && res.previewUri) {
            setImgUri(res.previewUri);
          }
        });

      return () => {
        active = false;
      };
    }, [item.id, item.local_thumbnail_uri, item.telegram_file_id]);

    const isVideo = item.file_type === 'video';

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        onLongPress={onLongPress}
        style={{
          width: size,
          height: size,
          margin: 2,
          position: 'relative',
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: '#1A1A1A',
        }}
      >
        {imgUri ? (
          <Image source={{ uri: imgUri }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.fallbackContainer}>
            {isVideo ? (
              <Video size={24} color="#8E8E93" />
            ) : (
              <ImageIcon size={24} color="#8E8E93" />
            )}
          </View>
        )}

        {/* Video Badge Overlay */}
        {isVideo && (
          <View style={styles.videoBadge}>
            <Video size={10} color="#FFFFFF" fill="#FFFFFF" />
          </View>
        )}

        {/* Uploading Badge Indicator */}
        {!item.telegram_file_id && (
          <View style={styles.uploadingBadge}>
            <CloudUpload size={10} color="#FFFC00" />
          </View>
        )}

        {/* Favorite Star Badge */}
        {item.is_favorite && (
          <View style={styles.starBadge}>
            <Star size={10} color="#FFFC00" fill="#FFFC00" />
          </View>
        )}

        {/* Selection Checkbox Overlay */}
        {isSelectionMode && (
          <View style={[styles.selectionOverlay, isSelected && styles.selectionOverlaySelected]}>
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Text style={styles.checkboxCheck}>✓</Text>}
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  }
);

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
  },
  fallbackContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
  },
  videoBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 4,
    borderRadius: 8,
  },
  uploadingBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 4,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
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
});
export default MemoryItem;
