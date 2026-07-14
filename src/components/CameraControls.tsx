import React, { useRef } from 'react';
import { StyleSheet, View, TouchableOpacity, Text, Platform, Pressable, PanResponder } from 'react-native';
import { Grid, Image as ImageIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SharedValue } from 'react-native-reanimated';
import { UploadDestination } from '../types/camera';

interface CameraControlsProps {
  onCapture: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  isRecording: boolean;
  onGalleryPress: () => void;
  onMemoriesPress: () => void;
  zoomShared: SharedValue<number>;
}

export const CameraControls: React.FC<CameraControlsProps> = ({
  onCapture,
  onStartRecording,
  onStopRecording,
  isRecording,
  onGalleryPress,
  onMemoriesPress,
  zoomShared,
}) => {
  const insets = useSafeAreaInsets();
  const initialTouchY = useRef(0);
  const startZoomRef = useRef(0);
  const touchStartTimeRef = useRef(0);
  const isRecordingStartedRef = useRef(false);
  const longPressTimeoutRef = useRef<any>(null);
  const globalMouseMoveRef = useRef<any>(null);
  const globalMouseUpRef = useRef<any>(null);

  React.useEffect(() => {
    return () => {
      if (Platform.OS === 'web') {
        if (globalMouseMoveRef.current) {
          window.removeEventListener('mousemove', globalMouseMoveRef.current);
        }
        if (globalMouseUpRef.current) {
          window.removeEventListener('mouseup', globalMouseUpRef.current);
        }
      }
    };
  }, []);

  const nativePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt, gestureState) => {
        initialTouchY.current = gestureState.y0;
        startZoomRef.current = zoomShared.value;
        touchStartTimeRef.current = Date.now();
        isRecordingStartedRef.current = false;

        longPressTimeoutRef.current = setTimeout(() => {
          isRecordingStartedRef.current = true;
          onStartRecording();
        }, 350);
      },
      onPanResponderMove: (evt, gestureState) => {
        if (isRecording || isRecordingStartedRef.current || longPressTimeoutRef.current !== null) {
          const dy = initialTouchY.current - gestureState.moveY;
          const sensitivity = 500;
          const newZoom = Math.max(0, Math.min(1, startZoomRef.current + (dy / sensitivity)));
          zoomShared.value = newZoom;
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (longPressTimeoutRef.current) {
          clearTimeout(longPressTimeoutRef.current);
          longPressTimeoutRef.current = null;
        }

        const duration = Date.now() - touchStartTimeRef.current;

        if (isRecording || isRecordingStartedRef.current) {
          onStopRecording();
        } else if (duration < 350) {
          onCapture();
        }

        isRecordingStartedRef.current = false;
      },
      onPanResponderTerminate: (evt, gestureState) => {
        if (longPressTimeoutRef.current) {
          clearTimeout(longPressTimeoutRef.current);
          longPressTimeoutRef.current = null;
        }
        if (isRecording || isRecordingStartedRef.current) {
          onStopRecording();
        }
        isRecordingStartedRef.current = false;
      },
    })
  ).current;

  // Web recording gesture flow helpers
  const startRecordingFlowWeb = (clientY: number) => {
    initialTouchY.current = clientY;
    startZoomRef.current = zoomShared.value;
    touchStartTimeRef.current = Date.now();
    isRecordingStartedRef.current = false;

    if (Platform.OS === 'web') {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        moveRecordingFlowWeb(e.clientY);
      };
      
      const handleGlobalMouseUp = () => {
        if (globalMouseMoveRef.current) {
          window.removeEventListener('mousemove', globalMouseMoveRef.current);
          globalMouseMoveRef.current = null;
        }
        if (globalMouseUpRef.current) {
          window.removeEventListener('mouseup', globalMouseUpRef.current);
          globalMouseUpRef.current = null;
        }
        endRecordingFlowWeb();
      };

      globalMouseMoveRef.current = handleGlobalMouseMove;
      globalMouseUpRef.current = handleGlobalMouseUp;

      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    console.log('[RECORD_TRACE] Hold timer started');
    longPressTimeoutRef.current = setTimeout(() => {
      console.log('[RECORD_TRACE] Hold timer completed');
      isRecordingStartedRef.current = true;
      console.log('[RECORD_TRACE] startRecording()');
      onStartRecording();
    }, 350);
  };

  const moveRecordingFlowWeb = (clientY: number) => {
    const currentY = clientY;
    if (isRecording || isRecordingStartedRef.current || longPressTimeoutRef.current !== null) {
      const dy = initialTouchY.current - currentY;
      const sensitivity = 500;
      const newZoom = Math.max(0, Math.min(1, startZoomRef.current + (dy / sensitivity)));
      zoomShared.value = newZoom;
    }
  };

  const endRecordingFlowWeb = (isCancel = false) => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }

    const duration = Date.now() - touchStartTimeRef.current;

    if (isRecording || isRecordingStartedRef.current) {
      console.log('[RECORD_TRACE] stopRecording()');
      onStopRecording();
    } else if (duration < 350 && !isCancel) {
      onCapture();
    }

    isRecordingStartedRef.current = false;
  };

  const bottomNavHeight = 64 + insets.bottom;
  return (
    <View style={[styles.container, { bottom: (Platform.OS === 'web' ? 'calc(64px + env(safe-area-inset-bottom))' : bottomNavHeight) as any }]} pointerEvents="box-none">

      {/* Capture Button Row */}
      <View style={styles.bottomBar} pointerEvents="box-none">
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

        {/* Capture Button wrapper for gestures */}
        {Platform.OS === 'web' ? (
          <View
            {...({
              onMouseDown: (e: any) => {
                console.log('[RECORD_TRACE] MouseDown');
                if (e && typeof e.preventDefault === 'function') {
                  e.preventDefault();
                }
                startRecordingFlowWeb(e.clientY);
              },
              onMouseMove: (e: any) => {
                if (e && typeof e.preventDefault === 'function') {
                  e.preventDefault();
                }
                moveRecordingFlowWeb(e.clientY);
              },
              onMouseUp: (e: any) => {
                console.log('[RECORD_TRACE] MouseUp');
                endRecordingFlowWeb();
              },
              onTouchStart: (e: any) => {
                console.log('[RECORD_TRACE] TouchStart');
                if (e && typeof e.preventDefault === 'function') {
                  e.preventDefault();
                }
                const touch = e.touches[0] || e.changedTouches[0];
                if (touch) startRecordingFlowWeb(touch.clientY);
              },
              onTouchMove: (e: any) => {
                if (e && typeof e.preventDefault === 'function') {
                  e.preventDefault();
                }
                const touch = e.touches[0] || e.changedTouches[0];
                if (touch) moveRecordingFlowWeb(touch.clientY);
              },
              onTouchEnd: (e: any) => {
                console.log('[RECORD_TRACE] TouchEnd');
                endRecordingFlowWeb();
              },
            } as any)}
            style={styles.captureContainer}
          >
            <View 
              style={[styles.captureOuterCircle, isRecording && styles.captureOuterCircleRecording]}
              pointerEvents="none"
            >
              <View style={[styles.captureInnerCircle, isRecording && styles.captureInnerCircleRecording]} />
            </View>
          </View>
        ) : (
          <View
            {...nativePanResponder.panHandlers}
            style={styles.captureContainer}
          >
            <View 
              style={[styles.captureOuterCircle, isRecording && styles.captureOuterCircleRecording]}
              pointerEvents="none"
            >
              <View style={[styles.captureInnerCircle, isRecording && styles.captureInnerCircleRecording]} />
            </View>
          </View>
        )}

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
    userSelect: 'none',
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
  captureContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    height: 90,
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

export default React.memo(CameraControls);
