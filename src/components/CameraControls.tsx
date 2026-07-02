import React, { useRef } from 'react';
import { StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import { Grid, Image as ImageIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UploadDestination } from '../types/camera';

interface CameraControlsProps {
  onCapture: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  isRecording: boolean;
  onGalleryPress: () => void;
  onMemoriesPress: () => void;
  zoom: number;
  onZoomChange?: (zoom: number) => void;
  destination: UploadDestination;
  onDestinationChange: (dest: UploadDestination) => void;
}

export const CameraControls: React.FC<CameraControlsProps> = ({
  onCapture,
  onStartRecording,
  onStopRecording,
  isRecording,
  onGalleryPress,
  onMemoriesPress,
  zoom,
  onZoomChange,
  destination,
  onDestinationChange,
}) => {
  const insets = useSafeAreaInsets();
  const initialTouchY = useRef(0);

  const handleTouchStart = (e: any) => {
    initialTouchY.current = e.nativeEvent.pageY;
  };

  const handleTouchMove = (e: any) => {
    if (isRecording && onZoomChange) {
      const currentY = e.nativeEvent.pageY;
      const dy = currentY - initialTouchY.current;
      // Drag up = negative dy -> zoom in. Map delta to 0-1 range
      const sensitivity = 250; // pixels for full zoom
      const zoomDelta = -dy / sensitivity;
      const newZoom = Math.max(0, Math.min(1, zoom + zoomDelta));
      onZoomChange(newZoom);
      // Reset start Y to current to allow continuous smooth drag
      initialTouchY.current = currentY;
    }
  };

  const bottomNavHeight = 64 + insets.bottom;
  const zoomDisplay = (zoom * 3 + 1).toFixed(1) + 'x';

  return (
    <View style={[styles.container, { bottom: bottomNavHeight }]}>
      {/* Zoom Indicator */}
      <View style={styles.zoomIndicatorContainer}>
        <Text style={styles.zoomIndicatorText}>{zoomDisplay}</Text>
      </View>

      {/* Destination Toggle / Vault Mode */}
      {!isRecording && (
        <View style={styles.destinationToggleContainer}>
          <TouchableOpacity 
            style={[styles.destBtn, destination === 'memories' && styles.destActive]}
            onPress={() => onDestinationChange('memories')}
          >
            <Text style={[styles.destText, destination === 'memories' && styles.destTextActive]}>Memories</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.destBtn, destination === 'drive' && styles.destActive]}
            onPress={() => onDestinationChange('drive')}
          >
            <Text style={[styles.destText, destination === 'drive' && styles.destTextActive]}>Drive</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.destBtn, destination === 'private' && styles.destActive]}
            onPress={() => onDestinationChange('private')}
          >
            <Text style={[styles.destText, destination === 'private' && styles.destTextActive]}>Vault</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Capture Button Row */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.bottomIconButton}
          onPress={onMemoriesPress}
          activeOpacity={0.7}
          disabled={isRecording}
        >
          <View style={[styles.bottomIconCircle, isRecording && { opacity: 0.3 }]}>
            <Grid size={22} color="#FFFFFF" />
          </View>
        </TouchableOpacity>

        {/* Capture Button with Drag to Zoom */}
        <View
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
        >
          <TouchableOpacity
            style={[styles.captureOuterCircle, isRecording && styles.captureOuterCircleRecording]}
            onPress={onCapture}
            onLongPress={onStartRecording}
            onPressOut={onStopRecording}
            delayLongPress={350}
            activeOpacity={0.9}
          >
            <View style={[styles.captureInnerCircle, isRecording && styles.captureInnerCircleRecording]} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.bottomIconButton}
          onPress={onGalleryPress}
          activeOpacity={0.7}
          disabled={isRecording}
        >
          <View style={[styles.bottomIconCircle, isRecording && { opacity: 0.3 }]}>
            <ImageIcon size={22} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  zoomIndicatorContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  zoomIndicatorText: {
    color: '#FFFC00',
    fontSize: 12,
    fontWeight: '700',
  },
  destinationToggleContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 24,
    padding: 3,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  destBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  destActive: {
    backgroundColor: '#FFFC00',
  },
  destText: {
    color: '#E0E0E0',
    fontSize: 12,
    fontWeight: '600',
  },
  destTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
  },
  bottomIconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
  },
  bottomIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  captureOuterCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  captureOuterCircleRecording: {
    borderColor: '#FF453A',
    transform: [{ scale: 1.15 }],
  },
  captureInnerCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
  },
  captureInnerCircleRecording: {
    backgroundColor: '#FF453A',
    width: 28,
    height: 28,
    borderRadius: 6,
  },
});

export default CameraControls;
