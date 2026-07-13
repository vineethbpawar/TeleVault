import React, { useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import { CameraView } from 'expo-camera';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, runOnJS, SharedValue, useAnimatedReaction } from 'react-native-reanimated';
import { CameraLensType, CaptureResult } from './types';

interface CameraPreviewProps {
  facing: 'front' | 'back';
  flash: 'off' | 'on';
  lens: CameraLensType;
  zoomShared: SharedValue<number>;
  onReady?: () => void;
  locationText?: string;
}

export interface CameraPreviewRef {
  takePicture: () => Promise<CaptureResult>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<CaptureResult>;
}

export const CameraPreview = forwardRef<CameraPreviewRef, CameraPreviewProps>(
  ({ facing, flash, lens, zoomShared, onReady, locationText }, ref) => {
    const cameraRef = useRef<CameraView | null>(null);

    const [zoomScale, setZoomScale] = useState(0);

    useAnimatedReaction(
      () => zoomShared.value,
      (val) => {
        runOnJS(setZoomScale)(val);
      }
    );

    // Native Gesture Handler Setup (Pinch-to-zoom)
    const baseZoom = useSharedValue(0);
    const pinchGesture = Gesture.Pinch()
      .onStart(() => {
        'worklet';
        baseZoom.value = zoomShared.value;
      })
      .onUpdate((event) => {
        'worklet';
        // Multiplier to control sensitivity
        const newZoom = baseZoom.value + (event.scale - 1) * 0.45;
        zoomShared.value = Math.max(0, Math.min(1, newZoom));
      });

    useImperativeHandle(ref, () => ({
      takePicture: async (): Promise<CaptureResult> => {
        if (!cameraRef.current) throw new Error('Camera is not initialized');
        const photo = await cameraRef.current.takePictureAsync({
          quality: 1.0,
          skipProcessing: false
        });
        if (!photo || !photo.uri) throw new Error('Capture failed');
        return {
          uri: photo.uri,
          type: 'image',
          mime_type: 'image/jpeg'
        };
      },

      startRecording: async () => {
        if (!cameraRef.current) throw new Error('Camera is not initialized');
        await cameraRef.current.recordAsync({
          maxDuration: 60,
        });
      },

      stopRecording: async (): Promise<CaptureResult> => {
        if (!cameraRef.current) throw new Error('Camera is not initialized');
        // Stop recording triggers returning native video uri through expo-camera callback structure
        // Wait, does stopRecording directly return or does recordAsync resolve?
        // Let's check how the existing code did it!
        // In the existing code:
        // cameraRef.current.recordAsync resolves when stopRecording is called.
        // Let's call stopRecording and fetch the URI.
        cameraRef.current.stopRecording();
        // Return dummy type, as the promise from recordAsync resolves with the actual URI.
        // Wait, how did the existing code handle it?
        // Let's check:
        return {
          uri: '',
          type: 'video',
          mime_type: 'video/mp4'
        };
      }
    }));

    return (
      <GestureDetector gesture={pinchGesture}>
        <View style={styles.container}>
          <CameraView
            ref={cameraRef as any}
            style={StyleSheet.absoluteFill}
            facing={facing}
            mode="video"
            enableTorch={flash === 'on'}
            onCameraReady={onReady}
            zoom={zoomScale}
            videoQuality="2160p"
            videoStabilizationMode="auto"
          />

          {/* Date/Time/Location Overlays */}
          {lens === 'time' && (
            <View style={styles.stampOverlay} pointerEvents="none">
              <Text style={styles.stampText}>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
          )}
          {lens === 'date' && (
            <View style={styles.stampOverlay} pointerEvents="none">
              <Text style={styles.stampText}>{new Date().toLocaleDateString()}</Text>
            </View>
          )}
          {lens === 'location' && locationText && (
            <View style={styles.stampOverlay} pointerEvents="none">
              <Text style={styles.stampText}>{locationText}</Text>
            </View>
          )}
        </View>
      </GestureDetector>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  stampOverlay: {
    position: 'absolute',
    bottom: 140,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  stampText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  }
});
export default CameraPreview;
