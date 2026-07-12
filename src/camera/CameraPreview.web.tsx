import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import { SharedValue, useAnimatedReaction, runOnJS } from 'react-native-reanimated';
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
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    
    const [zoomScale, setZoomScale] = useState(1);

    useAnimatedReaction(
      () => zoomShared ? zoomShared.value : 0,
      (val) => {
        const scale = 1 + val * 7;
        runOnJS(setZoomScale)(scale);
      }
    );

    // FPS performance optimization counters
    const frameCountRef = useRef(0);
    const lastFpsLogRef = useRef(performance.now());

    // Compute CSS filters dynamically for zero-lag lenses
    const getLensCssFilter = (type: CameraLensType): string => {
      switch (type) {
        case 'warm':
          return 'sepia(0.3) saturate(1.4) hue-rotate(-10deg) contrast(1.1)';
        case 'cool':
          return 'saturate(1.1) hue-rotate(10deg) brightness(1.05)';
        case 'bw':
          return 'grayscale(1) contrast(1.25)';
        case 'soft':
          return 'blur(0.4px) saturate(1.15) brightness(1.02)';
        case 'night':
          return 'brightness(1.5) contrast(1.2)';
        case 'vintage':
          return 'sepia(0.45) saturate(0.85) contrast(0.9) brightness(0.95)';
        case 'glow':
          return 'saturate(2.2) contrast(1.3) hue-rotate(-20deg)';
        case 'beauty_light':
          return 'brightness(1.1) saturate(1.1) contrast(0.95)';
        default:
          return 'none';
      }
    };

    // Initialize WebRTC Media stream
    useEffect(() => {
      let active = true;
      let localStream: MediaStream | null = null;

      const initStream = async () => {
        try {
          if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
          }

          const constraints: MediaStreamConstraints = {
            video: {
              facingMode: facing === 'front' ? 'user' : 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 60 }
            },
            audio: true
          };

          localStream = await navigator.mediaDevices.getUserMedia(constraints);
          if (!active) {
            localStream.getTracks().forEach(t => t.stop());
            return;
          }

          setStream(localStream);
          if (videoRef.current) {
            videoRef.current.srcObject = localStream;
          }
          if (onReady) onReady();
        } catch (err: any) {
          console.error('Web Camera stream acquisition failed:', err);
          setErrorMsg('Camera access is unavailable. Please check permissions.');
        }
      };

      initStream();

      return () => {
        active = false;
        if (localStream) {
          localStream.getTracks().forEach(t => t.stop());
        }
      };
    }, [facing]);

    // Use requestVideoFrameCallback for frame rate optimization loop (without setInterval canvas redraws)
    useEffect(() => {
      if (!videoRef.current || !stream) return;

      const video = videoRef.current;
      let frameId: number | null = null;

      const frameLoop = () => {
        frameCountRef.current++;
        const now = performance.now();
        if (now - lastFpsLogRef.current >= 2000) {
          const fps = ((frameCountRef.current * 1000) / (now - lastFpsLogRef.current)).toFixed(1);
          console.log(`[Web Camera] Realtime GPU Preview Frame Rate: ${fps} FPS`);
          frameCountRef.current = 0;
          lastFpsLogRef.current = now;
        }

        if ('requestVideoFrameCallback' in video) {
          frameId = (video as any).requestVideoFrameCallback(frameLoop);
        } else {
          frameId = requestAnimationFrame(frameLoop);
        }
      };

      if ('requestVideoFrameCallback' in video) {
        frameId = (video as any).requestVideoFrameCallback(frameLoop);
      } else {
        frameId = requestAnimationFrame(frameLoop);
      }

      return () => {
        if (frameId !== null) {
          if ('cancelVideoFrameCallback' in video) {
            (video as any).cancelVideoFrameCallback(frameId);
          } else {
            cancelAnimationFrame(frameId);
          }
        }
      };
    }, [stream]);

    // Expose capture and record controls to parent component
    useImperativeHandle(ref, () => ({
      takePicture: async (): Promise<CaptureResult> => {
        if (!videoRef.current) throw new Error('Video preview is not ready');

        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to create canvas context');

        // Capture mirror effect for front camera
        if (facing === 'front') {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }

        // Apply crop bounds to simulate zoom level
        const zoomVal = zoomShared ? zoomShared.value : 0;
        const scale = 1 + zoomVal * 7; // range [1.0x, 8.0x]
        const sWidth = canvas.width / scale;
        const sHeight = canvas.height / scale;
        const sx = (canvas.width - sWidth) / 2;
        const sy = (canvas.height - sHeight) / 2;

        ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);

        // Apply visual lenses onto final snapshot
        const cssFilter = getLensCssFilter(lens);
        if (cssFilter !== 'none') {
          if ('filter' in ctx) {
            (ctx as any).filter = cssFilter;
            ctx.drawImage(canvas, 0, 0);
          }
        }

        const dataUri = canvas.toDataURL('image/jpeg', 0.9);
        return {
          uri: dataUri,
          type: 'image',
          mime_type: 'image/jpeg'
        };
      },

      startRecording: async () => {
        if (!stream) throw new Error('Camera stream is not active');
        recordedChunksRef.current = [];

        let options = { mimeType: 'video/webm;codecs=vp9,opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: 'video/webm;codecs=vp8,opus' };
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: 'video/webm' };
        }

        const recorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };

        recorder.start(100);
      },

      stopRecording: async (): Promise<CaptureResult> => {
        return new Promise((resolve, reject) => {
          const recorder = mediaRecorderRef.current;
          if (!recorder) {
            reject(new Error('MediaRecorder is not active'));
            return;
          }

          recorder.onstop = () => {
            const blobType = recorder.mimeType || 'video/webm';
            const videoBlob = new Blob(recordedChunksRef.current, { type: blobType });
            const fileUri = URL.createObjectURL(videoBlob);
            resolve({
              uri: fileUri,
              type: 'video',
              mime_type: blobType
            });
          };

          recorder.stop();
        });
      }
    }));

    if (errorMsg) {
      return (
        <View style={[styles.container, styles.center]}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      );
    }

    const transformStyle = {
      transform: [
        { scale: zoomScale },
        facing === 'front' ? { scaleX: -1 } : { scaleX: 1 }
      ] as any,
      filter: getLensCssFilter(lens)
    };

    return (
      <View style={styles.container}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            ...transformStyle
          }}
        />

        {/* Date/Time overlays */}
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
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    overflow: 'hidden',
    position: 'relative',
    userSelect: 'none',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  stampOverlay: {
    position: 'absolute',
    bottom: 120,
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
