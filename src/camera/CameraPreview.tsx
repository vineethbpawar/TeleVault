import React, { useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import { CameraView } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
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
    const [cameraMode, setCameraMode] = useState<'picture' | 'video'>('picture');
    const recordingPromiseRef = useRef<Promise<any> | null>(null);

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
        
        if (cameraMode !== 'picture') {
          setCameraMode('picture');
          await new Promise((resolve) => setTimeout(resolve, 250));
        }

        if (Platform.OS === 'android') {
          try {
            const dir = FileSystem.cacheDirectory + 'Camera/';
            const dirInfo = await FileSystem.getInfoAsync(dir);
            if (!dirInfo.exists) {
              await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
              console.log('[CameraPreview] Created Camera cache directory on Android.');
            }
          } catch (err) {
            console.warn('[CameraPreview] Failed to verify/create Camera cache directory:', err);
          }
        }
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
        
        if (cameraMode !== 'video') {
          setCameraMode('video');
          await new Promise((resolve) => setTimeout(resolve, 250));
        }

        if (Platform.OS === 'android') {
          try {
            const dir = FileSystem.cacheDirectory + 'Camera/';
            const dirInfo = await FileSystem.getInfoAsync(dir);
            if (!dirInfo.exists) {
              await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
              console.log('[CameraPreview] Created Camera cache directory for video on Android.');
            }
          } catch (err) {
            console.warn('[CameraPreview] Failed to verify/create Camera cache directory for video:', err);
          }
        }
        
        recordingPromiseRef.current = cameraRef.current.recordAsync({
          maxDuration: 60,
        });
      },

      stopRecording: async (): Promise<CaptureResult> => {
        if (!cameraRef.current) throw new Error('Camera is not initialized');
        
        try {
          cameraRef.current.stopRecording();
        } catch (e) {
          console.warn('[CameraPreview] stopRecording failed:', e);
        }

        let videoUri = '';
        if (recordingPromiseRef.current) {
          try {
            const video = await recordingPromiseRef.current;
            if (video && video.uri) {
              videoUri = video.uri;
            }
          } catch (err) {
            console.warn('[CameraPreview] Failed to resolve video recording promise:', err);
          } finally {
            recordingPromiseRef.current = null;
          }
        }

        setCameraMode('picture');

        return {
          uri: videoUri,
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
            mode={cameraMode}
            enableTorch={flash === 'on'}
            onCameraReady={onReady}
            zoom={zoomScale}
            videoQuality="2160p"
            videoStabilizationMode="auto"
          />

          {/* Date/Time/Location Overlays */}
          {lens === 'time' && (
            <View style={styles.stampOverlay} pointerEvents="none">
              <Text style={styles.stampText}>🕒 {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
          )}
          {lens === 'date' && (
            <View style={styles.stampOverlay} pointerEvents="none">
              <Text style={styles.stampText}>📅 {new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
            </View>
          )}
          {lens === 'time_date' && (
            <View style={styles.stampOverlay} pointerEvents="none">
              <Text style={styles.stampText}>
                ⏰ {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{'\n'}📅 {new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>
          )}
          {lens === 'location' && locationText && (
            <View style={styles.stampOverlay} pointerEvents="none">
              <Text style={styles.stampText}>📍 {locationText}</Text>
            </View>
          )}
          {lens === 'date_location' && locationText && (
            <View style={styles.stampOverlay} pointerEvents="none">
              <Text style={styles.stampText}>
                📍 {locationText}{'\n'}📅 {new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
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
    bottom: 150,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  stampText: {
    color: '#FFFC00',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
    lineHeight: 20,
  }
});
export default CameraPreview;
