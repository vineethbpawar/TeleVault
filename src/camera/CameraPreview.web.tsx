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
    
    const startPinchDistRef = useRef(0);
    const startZoomRef = useRef(0);
    const recordingCanvasLoopRef = useRef<number | null>(null);
    const canvasStreamRef = useRef<MediaStream | null>(null);

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
              width: { ideal: 1920 },
              height: { ideal: 1080 },
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
            videoRef.current.play().catch(e => console.warn('Safari video play trigger failed:', e));
          }
          if (onReady) onReady();
        } catch (err: any) {
          console.warn('Web Camera stream acquisition failed with ideal constraints, retrying simplified:', err);
          try {
            localStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: facing === 'front' ? 'user' : 'environment' },
              audio: true
            });
            if (!active) {
              localStream.getTracks().forEach(t => t.stop());
              return;
            }

            setStream(localStream);
            if (videoRef.current) {
              videoRef.current.srcObject = localStream;
              videoRef.current.play().catch(e => console.warn('Safari video play trigger failed:', e));
            }
            if (onReady) onReady();
          } catch (retryErr: any) {
            console.error('All camera initialization attempts failed:', retryErr);
            setErrorMsg('Camera access is unavailable. Please check permissions.');
          }
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

        const dataUri = canvas.toDataURL('image/jpeg', 1.0);
        return {
          uri: dataUri,
          type: 'image',
          mime_type: 'image/jpeg'
        };
      },

      startRecording: async () => {
        if (!stream) throw new Error('Camera stream is not active');
        recordedChunksRef.current = [];

        // Create recording canvas dynamically
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current?.videoWidth || 1280;
        canvas.height = videoRef.current?.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to create canvas context');

        // Draw loop with mirroring, zoom, and filters
        let isRecordingActive = true;
        const renderFrame = () => {
          if (!isRecordingActive || !videoRef.current) return;

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          ctx.save();
          if (facing === 'front') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          }

          // Apply zoom crop bounds
          const zoomVal = zoomShared ? zoomShared.value : 0;
          const scale = 1 + zoomVal * 7; // range [1.0x, 8.0x]
          const sWidth = canvas.width / scale;
          const sHeight = canvas.height / scale;
          const sx = (canvas.width - sWidth) / 2;
          const sy = (canvas.height - sHeight) / 2;

          ctx.drawImage(videoRef.current, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
          ctx.restore();

          // Apply lens CSS filter style if supported on canvas
          const cssFilter = getLensCssFilter(lens);
          if (cssFilter !== 'none' && 'filter' in ctx) {
            (ctx as any).filter = cssFilter;
            ctx.drawImage(canvas, 0, 0);
            (ctx as any).filter = 'none';
          }

          recordingCanvasLoopRef.current = requestAnimationFrame(renderFrame);
        };

        requestAnimationFrame(renderFrame);

        // Capture canvas stream at 30 FPS
        const canvasStream = (canvas as any).captureStream(30);
        canvasStreamRef.current = canvasStream;

        // Merge original audio tracks
        stream.getAudioTracks().forEach(track => {
          canvasStream.addTrack(track);
        });

        let options: any = {};
        const candidates = [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm',
          'video/mp4;codecs=h264,aac',
          'video/mp4',
          'video/quicktime'
        ];

        for (const candidate of candidates) {
          if (MediaRecorder.isTypeSupported(candidate)) {
            options = { mimeType: candidate };
            break;
          }
        }

        const recorder = new MediaRecorder(canvasStream, options);
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
            // Cancel canvas draw loop
            if (recordingCanvasLoopRef.current !== null) {
              cancelAnimationFrame(recordingCanvasLoopRef.current);
              recordingCanvasLoopRef.current = null;
            }

            // Stop all canvas tracks
            if (canvasStreamRef.current) {
              canvasStreamRef.current.getTracks().forEach(t => t.stop());
              canvasStreamRef.current = null;
            }

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

    const handleTouchStart = (e: any) => {
      const touches = e.nativeEvent?.touches || e.touches;
      if (touches && touches.length === 2) {
        const dist = Math.hypot(
          touches[0].clientX - touches[1].clientX,
          touches[0].clientY - touches[1].clientY
        );
        startPinchDistRef.current = dist;
        startZoomRef.current = zoomShared ? zoomShared.value : 0;
      }
    };

    const handleTouchMove = (e: any) => {
      const touches = e.nativeEvent?.touches || e.touches;
      if (touches && touches.length === 2 && startPinchDistRef.current > 0) {
        const dist = Math.hypot(
          touches[0].clientX - touches[1].clientX,
          touches[0].clientY - touches[1].clientY
        );
        const factor = dist / startPinchDistRef.current;
        const newZoom = Math.max(0, Math.min(1, startZoomRef.current + (factor - 1) * 0.5));
        if (zoomShared) {
          zoomShared.value = newZoom;
        }
      }
    };

    const handleTouchEnd = () => {
      startPinchDistRef.current = 0;
    };

    if (errorMsg) {
      return (
        <View style={[styles.container, styles.center]}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      );
    }

    const transformStyle = {
      transform: `scale(${zoomScale}) scaleX(${facing === 'front' ? -1 : 1})`,
      filter: getLensCssFilter(lens)
    };

    return (
      <View 
        style={styles.container}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
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
            <Text style={styles.stampText}>{locationText}</Text>
          </View>
        )}
        {lens === 'date_location' && locationText && (
          <View style={styles.stampOverlay} pointerEvents="none">
            <Text style={styles.stampText}>
              {locationText}{'\n'}📅 {new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
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
