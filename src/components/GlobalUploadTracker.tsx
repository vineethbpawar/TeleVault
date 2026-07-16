import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Animated, Easing, Platform } from 'react-native';
import { uploadQueueService } from '../services/uploadQueueService';
import { UploadProgress } from './UploadProgress';
import { Cloud, Loader2 } from 'lucide-react-native';

export const GlobalUploadTracker: React.FC = () => {
  const [activeItem, setActiveItem] = useState<any | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Subscribe to the upload queue changes
    const unsubscribe = uploadQueueService.subscribeToQueue((queue) => {
      const active = queue.filter(
        (item) => item.status === 'uploading' || item.status === 'processing' || item.status === 'pending'
      );
      
      setActiveCount(active.length);
      if (active.length > 0) {
        // Find the one that is currently uploading or processing, otherwise fallback to the first pending
        const current = active.find((i) => i.status === 'uploading' || i.status === 'processing') || active[0];
        setActiveItem(current);
      } else {
        setActiveItem(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Spin animation for the loader icon
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (activeItem) {
      rotateAnim.setValue(0);
      anim = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      anim.start();
    } else {
      rotateAnim.setValue(0);
    }

    return () => {
      if (anim) anim.stop();
    };
  }, [activeItem]);

  if (!activeItem) return null;

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const getStatusText = () => {
    if (activeItem.status === 'processing') {
      return `🔒 Encrypting... (${activeItem.progress}%)`;
    }
    if (activeItem.status === 'uploading') {
      return `☁️ Uploading... (${activeItem.progress}%)`;
    }
    return `⏳ Queued...`;
  };

  return (
    <>
      <TouchableOpacity
        style={styles.container}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
      >
        <Animated.View style={{ transform: [{ rotate: spin }], marginRight: 8 }}>
          <Loader2 size={16} color="#FFFC00" />
        </Animated.View>
        <View style={styles.textContainer}>
          <Text style={styles.statusText} numberOfLines={1}>
            {getStatusText()}
          </Text>
          {activeCount > 1 && (
            <Text style={styles.countText}>
              +{activeCount - 1} more
            </Text>
          )}
        </View>
      </TouchableOpacity>

      {modalVisible && (
        <UploadProgress
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 16 : 56,
    right: 16,
    backgroundColor: 'rgba(15, 17, 35, 0.92)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 252, 0, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 10,
    zIndex: 99999, // Float on top of everything
  },
  textContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  countText: {
    color: '#FFFC00',
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 6,
    backgroundColor: 'rgba(255, 252, 0, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
});

export default GlobalUploadTracker;
