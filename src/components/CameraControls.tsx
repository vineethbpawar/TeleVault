import React from 'react';
import { StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import { Zap, ZapOff, RotateCw, Settings, Image, Grid } from 'lucide-react-native';

interface CameraControlsProps {
  onCapture: () => void;
  onFlip: () => void;
  onFlashToggle: () => void;
  flashMode: 'on' | 'off';
  onGalleryPress: () => void;
  onMemoriesPress: () => void;
  onSettingsPress: () => void;
}

export const CameraControls: React.FC<CameraControlsProps> = ({
  onCapture,
  onFlip,
  onFlashToggle,
  flashMode,
  onGalleryPress,
  onMemoriesPress,
  onSettingsPress,
}) => {
  return (
    <View style={styles.container}>
      {/* Top Bar Controls */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconButton} onPress={onSettingsPress}>
          <Settings size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.topRightControls}>
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
        >
          <View style={styles.bottomIconCircle}>
            <Grid size={22} color="#FFFFFF" />
          </View>
          <Text style={styles.bottomButtonText}>Memories</Text>
        </TouchableOpacity>

        {/* Capture Button */}
        <TouchableOpacity
          style={styles.captureOuterCircle}
          onPress={onCapture}
          activeOpacity={0.9}
        >
          <View style={styles.captureInnerCircle} />
        </TouchableOpacity>

        {/* Gallery / Drive Button */}
        <TouchableOpacity
          style={styles.bottomIconButton}
          onPress={onGalleryPress}
          activeOpacity={0.7}
        >
          <View style={styles.bottomIconCircle}>
            <Image size={22} color="#FFFFFF" />
          </View>
          <Text style={styles.bottomButtonText}>Gallery</Text>
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
  captureInnerCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFC00', // Yellow core
  },
});

export default CameraControls;
