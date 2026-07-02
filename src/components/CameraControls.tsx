import React from 'react';
import { StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import { Zap, ZapOff, RotateCw, Settings, Image, Grid, Timer, MessageSquare, Inbox, Sparkles } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
}) => {
  const insets = useSafeAreaInsets();

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
          {/* Timer Toggle */}
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

      {/* Bottom controls */}
      <View style={styles.bottomBar}>
        {/* Memories / Grid Button */}
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

        {/* Capture Button */}
        <TouchableOpacity
          style={[styles.captureOuterCircle, isRecording && styles.captureOuterCircleRecording]}
          onPress={onCapture}
          onLongPress={onStartRecording}
          onPressOut={onStopRecording}
          delayLongPress={300}
          activeOpacity={0.9}
        >
          <View style={[styles.captureInnerCircle, isRecording && styles.captureInnerCircleRecording]} />
        </TouchableOpacity>

        {/* Gallery / Drive Button */}
        <TouchableOpacity
          style={styles.bottomIconButton}
          onPress={onGalleryPress}
          activeOpacity={0.7}
          disabled={isRecording}
        >
          <View style={[styles.bottomIconCircle, isRecording && { opacity: 0.3 }]}>
            <Image size={22} color="#FFFFFF" />
          </View>
          <Text style={[styles.bottomButtonText, isRecording && { opacity: 0.3 }]}>Gallery</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 30,
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
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
    paddingBottom: 20,
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
    borderColor: 'rgba(255, 255, 255, 0.1)',
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
    borderWidth: 6,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  captureOuterCircleRecording: {
    borderColor: '#FF453A', // Red border when recording
  },
  captureInnerCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFC00', // Yellow core
  },
  captureInnerCircleRecording: {
    backgroundColor: '#FF453A', // Red core when recording
    width: 48,
    height: 48,
    borderRadius: 24, // Smaller and circular red dot
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
