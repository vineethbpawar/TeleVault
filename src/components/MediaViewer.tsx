import React from 'react';
import { StyleSheet, View, Image, TouchableOpacity, Modal, ActivityIndicator, Text } from 'react-native';
import { X } from 'lucide-react-native';
import VideoPlayer from './VideoPlayer';

interface MediaViewerProps {
  visible: boolean;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | null;
  onClose: () => void;
}

export const MediaViewer: React.FC<MediaViewerProps> = ({
  visible,
  mediaUrl,
  mediaType,
  onClose,
}) => {
  if (!visible || !mediaUrl) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
          <X size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.mediaContainer}>
          {mediaType === 'image' ? (
            <Image source={{ uri: mediaUrl }} style={styles.media} resizeMode="contain" />
          ) : mediaType === 'video' ? (
            <VideoPlayer source={mediaUrl} style={styles.media} />
          ) : (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#FFFC00" />
              <Text style={styles.loadingText}>Loading Media...</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaContainer: {
    width: '100%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#8E8E93',
    fontSize: 14,
    marginTop: 10,
  },
});

export default MediaViewer;
