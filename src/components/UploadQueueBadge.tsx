import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Animated, Easing } from 'react-native';
import { uploadQueueService } from '../services/uploadQueueService';
import { UploadProgress } from './UploadProgress';
import { Loader2 } from 'lucide-react-native';

export const UploadQueueBadge: React.FC = () => {
  const [activeCount, setActiveCount] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsubscribe = uploadQueueService.subscribeToQueue((queue) => {
      const active = queue.filter(
        (item) => item.status === 'uploading' || item.status === 'processing' || item.status === 'pending'
      );
      setActiveCount(active.length);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Spin animation when there is an active queue
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (activeCount > 0) {
      rotateAnim.setValue(0);
      anim = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1800,
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
  }, [activeCount]);

  if (activeCount === 0) return null;

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <>
      <TouchableOpacity
        style={styles.badgeContainer}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <Loader2 size={16} color="#FFFC00" />
        </Animated.View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{activeCount}</Text>
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
  badgeContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    position: 'relative',
  },
  countBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FFFC00',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
  },
});

export default UploadQueueBadge;
