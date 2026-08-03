import React, { useRef, useImperativeHandle, forwardRef, useState, useEffect, useCallback } from 'react';
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
  onDoubleTap?: () => void;
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
      RNAnimated.timing(scale, { toValue: 1.0, duration: 200, useNativeDriver: true }),
      RNAnimated.timing(opacity, { toValue: 0, duration: 800, delay: 200, useNativeDriver: true }),
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
  ({ facing, flash, lens, zoomShared, onReady, onDoubleTap, locationText }, ref) => {
    const cameraRef = useRef<CameraView | null>(null);
    const containerRef = useRef<any>(null);

    const [zoomScale, setZoomScale] = useState(0);
    const [cameraMode, setCameraMode] = useState<'picture' | 'video'>('picture');
    const recordingPromiseRef = useRef<Promise<any> | null>(null);

    const [focusTarget, setFocusTarget] = useState<{ x: number; y: number } | null>(null);
    const [autoFocusMode, setAutoFocusMode] = useState<'on' | 'off'>('off');
    const focusTimeoutRef = useRef<any>(null);

    // Flash overlay state - briefly shown during photo capture on PWA/front camera
    const [showFlashOverlay, setShowFlashOverlay] = useState(false);

    // ─── Web: Prevent browser pinch/scroll zoom ───────────────────────────
    useEffect(() => {
      if (Platform.OS !== 'web') return;
      const prevent = (e: Event) => e.preventDefault();
      const preventZoom = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
      const wheel = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };

      document.addEventListener('touchstart', preventZoom, { passive: false });
      document.addEventListener('gesturestart', prevent, { passive: false });
      document.addEventListener('gesturechange', prevent, { passive: false });
      document.addEventListener('gestureend', prevent, { passive: false });
      window.addEventListener('wheel', wheel, { passive: false });

      return () => {
        if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
        document.removeEventListener('touchstart', preventZoom);
        document.removeEventListener('gesturestart', prevent);
        document.removeEventListener('gesturechange', prevent);
        document.removeEventListener('gestureend', prevent);
        window.removeEventListener('wheel', wheel);
      };
    }, []);

    // ─── Web: Hardware torch via MediaStream API ──────────────────────────
    useEffect(() => {
      if (Platform.OS !== 'web') return;
      const applyTorch = async () => {
        try {
          const videos = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
          for (const video of videos) {
            if (!video.srcObject) continue;
            const stream = video.srcObject as MediaStream;
            for (const track of stream.getVideoTracks()) {
              try {
                await track.applyConstraints({ advanced: [{ torch: flash === 'on' }] as any });
              } catch (_) {}
            }
          }
        } catch (_) {}
      };
      applyTorch();
    }, [flash]);

    // ─── Web: Double-tap listener attached directly to DOM container ──────
    // We store onDoubleTap in a ref so we don't re-attach on every render
    const onDoubleTapRef = useRef(onDoubleTap);
    useEffect(() => { onDoubleTapRef.current = onDoubleTap; }, [onDoubleTap]);

    useEffect(() => {
      if (Platform.OS !== 'web') return;

      let lastTouch = 0;

      const handleTap = () => {
        const now = Date.now();
        const diff = now - lastTouch;
        if (diff > 0 && diff < 400) {
          lastTouch = 0;
          onDoubleTapRef.current?.();
        } else {
          lastTouch = now;
        }
      };

      // Attach after a short delay so the DOM container element exists
      const tid = setTimeout(() => {
        const el = containerRef.current;
        if (el) {
          // React Native Web exposes the underlying DOM node on ._nativeRef or via findDOMNode equivalent
          // Use the data attribute to find it in the DOM
          const domEl = document.querySelector('[data-camera-preview="true"]');
          const target = domEl || document;
          target.addEventListener('touchstart', handleTap as any, { passive: true });
          target.addEventListener('click', handleTap as any, { passive: true });
        }
      }, 300);

      return () => {
        clearTimeout(tid);
        const domEl = document.querySelector('[data-camera-preview="true"]') || document;
        domEl.removeEventListener('touchstart', handleTap as any);
        domEl.removeEventListener('click', handleTap as any);
      };
    }, []);

    // ─── Reanimated: sync zoom ────────────────────────────────────────────
    useAnimatedReaction(
      () => zoomShared.value,
      (val) => { runOnJS(setZoomScale)(val); }
    );

    // ─── RNGH: Pinch to zoom ──────────────────────────────────────────────
    const baseZoom = useSharedValue(0);
    const pinchGesture = Gesture.Pinch()
      .onStart(() => { 'worklet'; baseZoom.value = zoomShared.value; })
      .onUpdate((event) => {
        'worklet';
        const newZoom = baseZoom.value + (event.scale - 1) * 0.45;
        zoomShared.value = Math.max(0, Math.min(1, newZoom));
      });

    // ─── RNGH: Double tap (Android native — most reliable) ────────────────
    const doubleTapGesture = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(300)
      .onEnd(() => {
        if (onDoubleTap) runOnJS(onDoubleTap)();
      });

    // ─── RNGH: Single tap (focus) ─────────────────────────────────────────
    const singleTapGesture = Gesture.Tap()
      .numberOfTaps(1)
      .requireExternalGestureToFail(doubleTapGesture)
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

    const tapGestures = Gesture.Exclusive(doubleTapGesture, singleTapGesture);
    const combinedGesture = Gesture.Simultaneous(pinchGesture, tapGestures);

    // ─── Capture / recording methods ──────────────────────────────────────
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
            if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
          } catch (_) {}
        }

        // Flash overlay for front camera or web during capture
        if (flash === 'on' && (facing === 'front' || Platform.OS === 'web')) {
          setShowFlashOverlay(true);
          setTimeout(() => setShowFlashOverlay(false), 300);
        }

        const photo = await cameraRef.current.takePictureAsync({ quality: 1.0, skipProcessing: false });
        if (!photo || !photo.uri) throw new Error('Capture failed');
        return { uri: photo.uri, type: 'image', mime_type: 'image/jpeg' };
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
            if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
          } catch (_) {}
        }

        recordingPromiseRef.current = cameraRef.current.recordAsync({ maxDuration: 60 });
      },

      stopRecording: async (): Promise<CaptureResult> => {
        if (!cameraRef.current) throw new Error('Camera is not initialized');
        try { cameraRef.current.stopRecording(); } catch (_) {}

        let videoUri = '';
        if (recordingPromiseRef.current) {
          try {
            const video = await recordingPromiseRef.current;
            if (video?.uri) videoUri = video.uri;
          } catch (_) {} finally {
            recordingPromiseRef.current = null;
          }
        }

        setCameraMode('picture');
        return { uri: videoUri, type: 'video', mime_type: 'video/mp4' };
      },
    }));

    return (
      <GestureDetector gesture={combinedGesture}>
        <Pressable
          ref={containerRef}
          {...(Platform.OS === 'web' ? ({ 'data-camera-preview': 'true' } as any) : {})}
          onPress={(e: any) => {
            // On Android: onPress is NOT used for double-tap (RNGH handles it above).
            // On Web: handled by DOM touchstart/click listeners in useEffect.
            if (Platform.OS !== 'android') return;
            // Focus on single tap (RNGH single tap handles this, but fallback here)
          }}
          style={styles.container}
        >
          <CameraView
            ref={cameraRef as any}
            style={StyleSheet.absoluteFill}
            facing={facing}
            mode={cameraMode}
            flash={flash === 'on' ? 'on' : 'off'}
            enableTorch={flash === 'on'}
            onCameraReady={onReady}
            zoom={zoomScale}
            autofocus={autoFocusMode}
            videoQuality="2160p"
            videoStabilizationMode="auto"
          />

          {focusTarget && <FocusRing x={focusTarget.x} y={focusTarget.y} />}

          {/* Flash overlay — only shown briefly during photo capture */}
          {showFlashOverlay && (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: '#FFFFFF', opacity: 0.9, zIndex: 10 }
              ]}
              pointerEvents="none"
            />
          )}

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
  },
});

export default CameraPreview;
