import React, { useRef, useImperativeHandle, forwardRef, useState, useEffect } from 'react';
import { View, StyleSheet, Text, Platform, Animated as RNAnimated, Pressable } from 'react-native';
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

const FocusRing: React.FC<{ x: number; y: number }> = ({ x, y }) => {
  const scale = useRef(new RNAnimated.Value(1.5)).current;
  const opacity = useRef(new RNAnimated.Value(1)).current;

  useEffect(() => {
    scale.setValue(1.5);
    opacity.setValue(1);
    RNAnimated.parallel([
      RNAnimated.timing(scale, {
        toValue: 1.0,
        duration: 200,
        useNativeDriver: true,
      }),
      RNAnimated.timing(opacity, {
        toValue: 0,
        duration: 800,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [x, y]);

  return (
    <RNAnimated.View
      style={{
        position: 'absolute',
        left: x - 30,
        top: y - 30,
        width: 60,
        height: 60,
        borderWidth: 1.5,
        borderColor: '#FFFC00',
        borderRadius: 8,
        transform: [{ scale }],
        opacity,
        zIndex: 9999,
      }}
    />
  );
};

export const CameraPreview = forwardRef<CameraPreviewRef, CameraPreviewProps>(
  ({ facing, flash, lens, zoomShared, onReady, locationText }, ref) => {
    const cameraRef = useRef<CameraView | null>(null);

    const [zoomScale, setZoomScale] = useState(0);
    const [cameraMode, setCameraMode] = useState<'picture' | 'video'>('picture');
    const recordingPromiseRef = useRef<Promise<any> | null>(null);

    const [focusTarget, setFocusTarget] = useState<{ x: number; y: number } | null>(null);
    const [autoFocusMode, setAutoFocusMode] = useState<'on' | 'off'>('off');
    const focusTimeoutRef = useRef<any>(null);

    useEffect(() => {
      const prevent = (e: Event) => {
        e.preventDefault();
      };

      // Prevent multi-touch browser zoom on Web
      const preventZoom = (e: TouchEvent) => {
        if (e.touches.length > 1) {
          e.preventDefault();
        }
      };

      const wheel = (e: WheelEvent) => {
        if (e.ctrlKey) {
          e.preventDefault();
        }
      };

      if (Platform.OS === 'web') {
        document.addEventListener('touchstart', preventZoom, { passive: false });
        document.addEventListener('gesturestart', prevent, { passive: false });
        document.addEventListener('gesturechange', prevent, { passive: false });
        document.addEventListener('gestureend', prevent, { passive: false });
        window.addEventListener('wheel', wheel, { passive: false });
      }

      return () => {
        if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
        if (Platform.OS === 'web') {
          document.removeEventListener('touchstart', preventZoom);
          document.removeEventListener('gesturestart', prevent);
          document.removeEventListener('gesturechange', prevent);
          document.removeEventListener('gestureend', prevent);
          window.removeEventListener('wheel', wheel);
        }
      };
    }, []);

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

    // Focus on Tap Gesture
    const tapGesture = Gesture.Tap()
      .onEnd((event) => {
        runOnJS((x: number, y: number) => {
          setFocusTarget({ x, y });
          setAutoFocusMode('on');
          if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
          focusTimeoutRef.current = setTimeout(() => {
            setFocusTarget(null);
            setAutoFocusMode('off');
          }, 1000);
        })(event.x, event.y);
      });

    const combinedGesture = Gesture.Simultaneous(pinchGesture, tapGesture);

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
        <Pressable
          onPress={(e: any) => {
            const { pageX, pageY } = e.nativeEvent;
            setFocusTarget({ x: pageX, y: pageY });
            setAutoFocusMode('on');
            if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
            focusTimeoutRef.current = setTimeout(() => {
              setFocusTarget(null);
              setAutoFocusMode('off');
            }, 1000);
          }}
          style={styles.container}
        >
          <CameraView
            ref={cameraRef as any}
            style={StyleSheet.absoluteFill}
            facing={facing}
            mode={cameraMode}
            enableTorch={flash === 'on'}
            onCameraReady={onReady}
            zoom={zoomScale}
            autofocus={autoFocusMode}
            videoQuality="2160p"
            videoStabilizationMode="auto"
          />

          {focusTarget && <FocusRing x={focusTarget.x} y={focusTarget.y} />}

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
        </Pressable>
      </GestureDetector>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    touchAction: 'none',
    overscrollBehavior: 'contain',
  } as any,
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
