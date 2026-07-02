import React, { useRef } from 'react';
import { StyleSheet, View, TouchableOpacity, Text, Animated } from 'react-native';
import { Zap, ZapOff, RotateCw, Settings, Image as ImageIcon, Grid, Timer, MessageSquare, Inbox, Sparkles, Cloud, Lock } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UploadDestination } from '../types/camera';

interface CameraControlsProps {
  onCapture: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  isRecording: boolean;
  timerOption: 'off' | '3s' | '5s' | '10s';
  onTimerToggle: () => void;
  onFlip: () => void;
  onFlashToggle: () => void;
  flashMode: 'on' | 'off';
  onGalleryPress: () => void;
  onMemoriesPress: () => void;
  onSettingsPress: () => void;
  onChatPress: () => void;
  onStoriesPress: () => void;
  onInboxPress: () => void;
  onZoomChange?: (zoom: number) => void;
  destination: UploadDestination;
  onDestinationChange: (dest: UploadDestination) => void;
}

export const CameraControls: React.FC<CameraControlsProps> = ({
  onCapture,
  onStartRecording,
  onStopRecording,
  isRecording,
  timerOption,
  onTimerToggle,
  onFlip,
  onFlashToggle,
  flashMode,
  onGalleryPress,
  onMemoriesPress,
  onSettingsPress,
  onChatPress,
  onStoriesPress,
  onInboxPress,
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
      // Drag up = negative dy -> zoom in
      const zoomValue = Math.max(0, Math.min(1, -dy / 300));
      onZoomChange(zoomValue);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top > 0 ? insets.top + 10 : 30, paddingBottom: insets.bottom > 0 ? insets.bottom + 10 : 20 }]}>
      {/* Top Bar Controls */}
      <View style={styles.topBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={styles.iconButton} onPress={onSettingsPress}>
            <Settings size={22} color="#FFFFFF" />
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.iconButton, { marginLeft: 10 }]} onPress={onChatPress}>
            <MessageSquare size={22} color="#FFFC00" />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.iconButton, { marginLeft: 10 }]} onPress={onInboxPress}>
            <Inbox size={22} color="#FFFC00" />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.iconButton, { marginLeft: 10 }]} onPress={onStoriesPress}>
            <Sparkles size={22} color="#FFFC00" />
          </TouchableOpacity>
        </View>

        <View style={styles.topRightControls}>
          <TouchableOpacity style={[styles.iconButton, { marginRight: 12 }]} onPress={onTimerToggle}>
            <Timer size={24} color={timerOption !== 'off' ? '#FFFC00' : '#FFFFFF'} />
            {timerOption !== 'off' && (
              <Text style={styles.timerBadgeText}>{timerOption}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={[styles.iconButton, { marginRight: 12 }]} onPress={onFlashToggle}>
            {flashMode === 'on' ? (
              <Zap size={24} color="#FFFC00" fill="#FFFC00" />
            ) : (
              <ZapOff size={24} color="#FFFFFF" />
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconButton} onPress={onFlip}>
            <RotateCw size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom Area */}
      <View style={styles.bottomArea}>
        {/* Destination Toggle (Vault Mode) */}
        {!isRecording && (
          <View style={styles.destinationToggleContainer}>
            <TouchableOpacity 
              style={[styles.destBtn, destination === 'memories' && styles.destActive]}
              onPress={() => onDestinationChange('memories')}
            >
              <Grid size={14} color={destination === 'memories' ? '#000' : '#FFF'} style={{ marginRight: 4 }} />
              <Text style={[styles.destText, destination === 'memories' && styles.destTextActive]}>Memories</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.destBtn, destination === 'drive' && styles.destActive]}
              onPress={() => onDestinationChange('drive')}
            >
              <Cloud size={14} color={destination === 'drive' ? '#000' : '#FFF'} style={{ marginRight: 4 }} />
              <Text style={[styles.destText, destination === 'drive' && styles.destTextActive]}>Drive</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.destBtn, destination === 'private' && styles.destActive]}
              onPress={() => onDestinationChange('private')}
            >
              <Lock size={14} color={destination === 'private' ? '#000' : '#FFF'} style={{ marginRight: 4 }} />
              <Text style={[styles.destText, destination === 'private' && styles.destTextActive]}>Vault</Text>
            </TouchableOpacity>
          </View>
        )}

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
            <Text style={[styles.bottomButtonText, isRecording && { opacity: 0.3 }]}>Memories</Text>
          </TouchableOpacity>

          {/* Capture Button with Drag to Zoom */}
          {/* @ts-ignore */}
          <TouchableOpacity
            style={[styles.captureOuterCircle, isRecording && styles.captureOuterCircleRecording]}
            onPress={onCapture}
            onLongPress={onStartRecording}
            onPressOut={onStopRecording}
            // @ts-ignore
            onTouchStart={handleTouchStart}
            // @ts-ignore
            onTouchMove={handleTouchMove}
            delayLongPress={300}
            activeOpacity={0.9}
          >
            <View style={[styles.captureInnerCircle, isRecording && styles.captureInnerCircleRecording]} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bottomIconButton}
            onPress={onGalleryPress}
            activeOpacity={0.7}
            disabled={isRecording}
          >
            <View style={[styles.bottomIconCircle, isRecording && { opacity: 0.3 }]}>
              <ImageIcon size={22} color="#FFFFFF" />
            </View>
            <Text style={[styles.bottomButtonText, isRecording && { opacity: 0.3 }]}>Gallery</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  topRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  bottomArea: {
    alignItems: 'center',
    width: '100%',
  },
  destinationToggleContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 24,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  destBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  destActive: {
    backgroundColor: '#FFFC00',
  },
  destText: {
    color: '#FFFFFF',
    fontSize: 13,
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
    width: 80,
  },
  bottomIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  bottomButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 3,
  },
  captureOuterCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 5,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
  },
  captureOuterCircleRecording: {
    borderColor: '#FF453A',
    transform: [{ scale: 1.2 }], // Grow slightly when recording
  },
  captureInnerCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FFFFFF', // Clean white core
  },
  captureInnerCircleRecording: {
    backgroundColor: '#FF453A',
    width: 32,
    height: 32,
    borderRadius: 8, // Square-ish red stop button look
  },
  timerBadgeText: {
    color: '#FFFC00',
    fontSize: 9,
    fontWeight: '800',
    position: 'absolute',
    bottom: 2,
  },
});

export default CameraControls;
