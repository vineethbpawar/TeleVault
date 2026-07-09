import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, SafeAreaView, ScrollView, Platform, AppState, AppStateStatus } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { CompositeScreenProps, useIsFocused } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, AppStackParamList } from '../types/navigation';
import CameraControls from '../components/CameraControls';
import LoadingScreen from '../components/LoadingScreen';
import AppButton from '../components/AppButton';
import { settingsService } from '../services/settingsService';
import { CameraLensType, UploadDestination } from '../types/camera';
import { Settings } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import UserAvatar from '../components/UserAvatar';
import { showToast } from '../components/ToastBanner';
import { locationService } from '../services/locationService';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'CameraTab'>,
  NativeStackScreenProps<AppStackParamList>
>;

const LENSES = [
  { type: 'original', label: 'Original', icon: '🚫' },
  { type: 'warm', label: 'Warm', icon: '🔥' },
  { type: 'cool', label: 'Cool', icon: '❄️' },
  { type: 'bw', label: 'B/W', icon: '🏁' },
  { type: 'soft', label: 'Soft', icon: '🌸' },
  { type: 'night', label: 'Night', icon: '🌙' },
  { type: 'time', label: 'Time', icon: '🕒' },
  { type: 'date', label: 'Date', icon: '📅' },
  { type: 'vault', label: 'Vault', icon: '🏛️' },
  { type: 'private', label: 'Private', icon: '🔒' },
] as const;

export const CameraScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { sendToUserId, sendToUsername, conversationId } = (route.params || {}) as any;
  
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [cameraMode, setCameraMode] = useState<'picture' | 'video'>('picture');
  
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [maxDuration, setMaxDuration] = useState(30);
  
  const [timerOption, setTimerOption] = useState<'off' | '3s' | '5s' | '10s'>('off');
  const [countdown, setCountdown] = useState<number | null>(null);
  
  const [selectedLens, setSelectedLens] = useState<CameraLensType>('original');
  const [zoom, setZoom] = useState(0);
  const [defaultDestination, setDefaultDestination] = useState<UploadDestination>('memories');
  const getZoomDisplay = () => {
    const val = zoom * 7 + 1;
    if (val === 1) return '1x';
    return `${val.toFixed(1)}x`;
  };
  
  const [cameraReady, setCameraReady] = useState(false);
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  const [showToolsPanel, setShowToolsPanel] = useState(false);
  const [profile, setProfile] = useState<{ username?: string; avatar_url?: string; full_name?: string } | null>(null);
  const [locationText, setLocationText] = useState('📍 Fetching Location...');
  const [hasNativeZoom, setHasNativeZoom] = useState(Platform.OS !== 'web');
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const [webPermissionGranted, setWebPermissionGranted] = useState<boolean | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  const cameraRef = useRef<any>(null);
  const webMediaRecorderRef = useRef<any>(null);
  const webAudioStreamRef = useRef<any>(null);
  const webChunksRef = useRef<any[]>([]);
  const webStreamRef = useRef<any>(null);
  const webVideoRef = useRef<any>(null);
  const isFocused = useIsFocused();

  const recordingIntervalRef = useRef<any>(null);
  const recordingTimeoutRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);
  const webCanvasIntervalRef = useRef<any>(null);

  // Two-Finger Pinch Zoom Refs
  const initialPinchDistRef = useRef<number | null>(null);
  const initialPinchZoomRef = useRef<number>(0);
  const lastPinchZoomTimeRef = useRef<number>(0);

  // Web getUserMedia setup effect with AppState listener
  useEffect(() => {
    if (Platform.OS === 'web' && isFocused) {
      let active = true;
      let streamInstance: MediaStream | null = null;

      const startCamera = () => {
        // Resume existing active stream when possible to minimize prompts
        const isStreamActive = webStreamRef.current && webStreamRef.current.getVideoTracks().some((t: any) => t.readyState === 'live');
        if (isStreamActive) {
          setCameraStream(webStreamRef.current);
          setCameraReady(true);
          setWebPermissionGranted(true);
          return;
        }

        setCameraReady(false);
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing === 'back' ? 'environment' : 'user' },
          audio: true
        }).catch(() => {
          // Fallback to video-only if audio is denied or not available
          return navigator.mediaDevices.getUserMedia({
            video: { facingMode: facing === 'back' ? 'environment' : 'user' }
          });
        }).then(stream => {
          if (active) {
            streamInstance = stream;
            webStreamRef.current = stream;
            setCameraStream(stream);
            
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
              const caps = videoTrack.getCapabilities() as any;
              setHasNativeZoom(!!caps.zoom);
            } else {
              setHasNativeZoom(false);
            }
            setCameraReady(true);
            setWebPermissionGranted(true);
          } else {
            stream.getTracks().forEach(t => t.stop());
          }
        }).catch(err => {
          console.error('Failed to get getUserMedia stream on Web:', err);
          setWebPermissionGranted(false);
        });
      };

      const stopCamera = () => {
        setCameraReady(false);
        setCameraStream(null);
        if (webStreamRef.current) {
          webStreamRef.current.getTracks().forEach((t: any) => t.stop());
          webStreamRef.current = null;
        }
        if (streamInstance) {
          streamInstance.getTracks().forEach(t => t.stop());
          streamInstance = null;
        }
      };

      startCamera();

      // Pause/resume camera tracks on App background/foreground changes
      const handleAppStateChange = (nextAppState: AppStateStatus) => {
        if (nextAppState === 'active') {
          startCamera();
        } else {
          stopCamera();
        }
      };

      const subscription = AppState.addEventListener('change', handleAppStateChange);

      return () => {
        active = false;
        subscription.remove();
        stopCamera();
      };
    }
  }, [isFocused, facing]);

  // Web Video Stream Binding Effect
  useEffect(() => {
    if (Platform.OS === 'web' && webVideoRef.current) {
      if (webVideoRef.current.srcObject !== cameraStream) {
        webVideoRef.current.srcObject = cameraStream;
        if (cameraStream) {
          webVideoRef.current.load();
          webVideoRef.current.play().catch((e: any) => console.warn('[VIDEO_PLAY_WARN] Auto-play was prevented:', e));
        }
      }
    }
  }, [cameraStream, webVideoRef.current]);

  // Web native hardware zoom constraint application
  useEffect(() => {
    if (Platform.OS === 'web' && webStreamRef.current && hasNativeZoom) {
      const videoTrack = webStreamRef.current.getVideoTracks()[0];
      if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
        try {
          const caps = videoTrack.getCapabilities() as any;
          if (caps.zoom) {
            const min = caps.zoom.min || 1;
            const max = caps.zoom.max || 1;
            const targetZoom = min + zoom * (max - min);
            videoTrack.applyConstraints({
              advanced: [{ zoom: targetZoom }]
            } as any).catch((err: any) => {
              console.warn('[ZOOM_WARN] Failed to apply native zoom constraint:', err);
            });
          }
        } catch (err) {
          console.warn('[ZOOM_WARN] Capabilities query failed:', err);
        }
      }
    }
  }, [zoom, hasNativeZoom]);

  // Fetch Supabase User Profile
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from('profiles')
            .select('username, avatar_url, full_name')
            .eq('id', user.id)
            .single();
          if (!error && data) {
            setProfile(data);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch user profile:', err);
      }
    };
    fetchProfile();
  }, []);

  // Fetch Location when Location Lens is Selected
  useEffect(() => {
    if (selectedLens === 'location') {
      setLocationText('📍 Locating...');
      locationService.getCityLocation().then((loc) => {
        if (loc) {
          setLocationText(`📍 ${loc.text}`);
        } else {
          setLocationText('📍 Unknown Location');
        }
      }).catch((err) => {
        console.warn('Location lookup failed:', err);
        setLocationText('📍 Location Denied');
      });
    }
  }, [selectedLens]);

  // Load defaults from settings on focus and Reset Zoom
  useEffect(() => {
    if (isFocused) {
      setZoom(0); // Reset zoom on return / focus!
      settingsService.getSettings().then((settings) => {
        setTimerOption(settings.defaultTimer);
        setMaxDuration(settings.maxVideoDuration);
        
        // Handle fallback to original
        const defaultLensName = settings.defaultLens === 'none' ? 'original' : settings.defaultLens;
        setSelectedLens((defaultLensName || 'original') as CameraLensType);
        
        const mode = settings.defaultCameraMode === 'Video' ? 'video' : 'picture';
        setCameraMode(mode);
      });
    } else {
      cancelCountdown();
      if (isRecording) {
        stopRecording();
      }
    }
  }, [isFocused]);

  const isPermissionPending = Platform.OS === 'web'
    ? webPermissionGranted === null
    : (!permission || !micPermission);

  const isPermissionGranted = Platform.OS === 'web'
    ? webPermissionGranted === true
    : (permission?.granted && micPermission?.granted);

  if (isPermissionPending) {
    return <LoadingScreen message="Requesting camera and mic access..." />;
  }

  if (!isPermissionGranted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <View style={styles.permissionContent}>
          <Text style={styles.permissionTitle}>Permissions Required</Text>
          <Text style={styles.permissionDesc}>
            TeleVault needs access to your camera and microphone so you can take photos and record videos directly.
          </Text>
          <AppButton
            title="Grant Permissions"
            onPress={async () => {
              if (Platform.OS === 'web') {
                setWebPermissionGranted(null);
                navigator.mediaDevices.getUserMedia({
                  video: { facingMode: facing === 'back' ? 'environment' : 'user' },
                  audio: true
                }).then(stream => {
                  webStreamRef.current = stream;
                  setCameraStream(stream);
                  setWebPermissionGranted(true);
                  setCameraReady(true);
                }).catch(err => {
                  console.error('Permission request failed:', err);
                  setWebPermissionGranted(false);
                });
              } else {
                await requestPermission();
                await requestMicPermission();
              }
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Two-Finger Pinch Zoom Helpers
  const calcDistance = (touches: any[]) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleCameraTouchStart = (e: any) => {
    const touches = e.nativeEvent.touches;
    if (touches && touches.length === 2) {
      if (Platform.OS === 'web') {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (e.nativeEvent && typeof e.nativeEvent.preventDefault === 'function') e.nativeEvent.preventDefault();
      }
      const dist = calcDistance(touches);
      initialPinchDistRef.current = dist;
      initialPinchZoomRef.current = zoom;
    }
  };

  const handleCameraTouchMove = (e: any) => {
    const touches = e.nativeEvent.touches;
    if (touches && touches.length === 2 && initialPinchDistRef.current) {
      if (Platform.OS === 'web') {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (e.nativeEvent && typeof e.nativeEvent.preventDefault === 'function') e.nativeEvent.preventDefault();
      }
      const currentDist = calcDistance(touches);
      const ratio = currentDist / initialPinchDistRef.current;
      const zoomFactor = 0.8; // slightly higher factor for more natural responsiveness
      const newZoom = Math.max(0, Math.min(1, initialPinchZoomRef.current + (ratio - 1) * zoomFactor));
      
      const now = Date.now();
      if (now - lastPinchZoomTimeRef.current > 33 || newZoom === 0 || newZoom === 1) {
        setZoom(newZoom);
        lastPinchZoomTimeRef.current = now;
      }
    }
  };

  const handleCameraTouchEnd = (e: any) => {
    const touches = e.nativeEvent.touches;
    if (!touches || touches.length < 2) {
      initialPinchDistRef.current = null;
    }
  };

  const startCountdown = (seconds: number, callback: () => void) => {
    setCountdown(seconds);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          setCountdown(null);
          callback();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelCountdown = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  };

  const handleCameraReady = async () => {
    setCameraReady(true);
    if (cameraRef.current && Platform.OS !== 'web') {
      try {
        const sizes = await cameraRef.current.getAvailablePictureSizesAsync();
        if (sizes && sizes.length > 0) {
          let maxPixels = 0;
          let bestSize = sizes[0];
          for (const size of sizes) {
            const [w, h] = size.split('x').map(Number);
            if (!isNaN(w) && !isNaN(h)) {
              const pixels = w * h;
              // Cap at 16 Megapixels to prevent out-of-memory errors on high-end device sensors (4000x3000 is ~12MP)
              if (pixels > maxPixels && pixels <= 16000000) {
                maxPixels = pixels;
                bestSize = size;
              }
            }
          }
          if (__DEV__) {
            console.log('[CameraScreen] Selected native picture size:', bestSize);
          }
          setPictureSize(bestSize);
        }
      } catch (err) {
        console.warn('Failed to query camera picture sizes:', err);
      }
    }
  };

  const executePhotoCapture = async () => {
    if (!cameraReady) {
      Alert.alert('Camera Not Ready', 'Please wait for the camera to initialize.');
      return;
    }

    if (Platform.OS === 'web') {
      try {
        console.log('[RECORD_TRACE] Web photo capture initiated.');
        if (webVideoRef.current) {
          const video = webVideoRef.current;
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            if (!hasNativeZoom && zoom > 0) {
              // Simulate zoom by center-cropping the video frame
              const scale = 1 + zoom * 7; // maps [0, 1] to [1, 8]
              const sWidth = video.videoWidth / scale;
              const sHeight = video.videoHeight / scale;
              const sx = (video.videoWidth - sWidth) / 2;
              const sy = (video.videoHeight - sHeight) / 2;
              ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
            } else {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            }
            const dataUri = canvas.toDataURL('image/jpeg', 0.9);
            console.log('[RECORD_TRACE] Captured Web photo data URI length:', dataUri.length);
            navigation.navigate('Preview', {
              uri: dataUri,
              type: 'image',
              fromGallery: false,
              file_type: 'image',
              mime_type: 'image/jpeg',
              defaultLens: selectedLens,
              locationText: selectedLens === 'location' ? locationText : undefined,
              defaultDestination,
              sendToUserId,
              sendToUsername,
              conversationId,
            } as any);
            setZoom(0);
          } else {
            throw new Error('Failed to get canvas 2D context');
          }
        } else {
          throw new Error('Web video element not available');
        }
      } catch (error: any) {
        console.error('Capture error:', error);
        Alert.alert('Error', error.message || 'An error occurred during photo capture.');
      }
      return;
    }

    if (cameraRef.current) {
      try {
        const options = { quality: 0.8, skipProcessing: false };
        const photo = await cameraRef.current.takePictureAsync(options);
        if (photo && photo.uri) {
          navigation.navigate('Preview', {
            uri: photo.uri,
            type: 'image',
            fromGallery: false,
            file_type: 'image',
            mime_type: 'image/jpeg',
            defaultLens: selectedLens,
            locationText: selectedLens === 'location' ? locationText : undefined,
            defaultDestination,
            sendToUserId,
            sendToUsername,
            conversationId,
          } as any);
          setZoom(0); // Reset zoom!
        } else {
          Alert.alert('Error', 'Failed to capture image');
        }
      } catch (error: any) {
        console.error('Capture error:', error);
        Alert.alert('Error', error.message || 'An error occurred during photo capture.');
      }
    }
  };

  const handleCapture = () => {
    if (countdown !== null) return;
    if (timerOption === 'off') {
      executePhotoCapture();
    } else {
      startCountdown(parseInt(timerOption), executePhotoCapture);
    }
  };

  const executeVideoRecording = async () => {
    if (isRecording || isStartingRecording) {
      return;
    }

    if (!cameraReady) {
      Alert.alert('Camera Not Ready', 'Please wait for the camera to initialize.');
      return;
    }

    if (Platform.OS !== 'web' && (!micPermission || !micPermission.granted)) {
      try {
        const status = await requestMicPermission();
        if (!status.granted) {
          Alert.alert('Permission Required', 'Microphone permission is required to record video.');
          return;
        }
      } catch (err) {
        console.warn('Muted recording fallback:', err);
      }
    }

    setIsStartingRecording(true);
    setRecordingDuration(0);

    // Swap mode to video if needed
    if (Platform.OS !== 'web' && cameraMode !== 'video') {
      setCameraMode('video');
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    if (Platform.OS === 'web') {
      try {
        console.log('[RECORD_TRACE] Web video recording start triggered.');
        if (!webStreamRef.current) {
          throw new Error('No active Web MediaStream available.');
        }

        // Dynamically request microphone permission only if not already available in the stream
        const hasAudioTrack = webStreamRef.current.getAudioTracks().length > 0;
        if (!hasAudioTrack) {
          try {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioTrack = audioStream.getAudioTracks()[0];
            if (audioTrack && webStreamRef.current) {
              webAudioStreamRef.current = audioStream;
              webStreamRef.current.addTrack(audioTrack);
            }
          } catch (audioErr) {
            console.warn('Audio capture failed or denied, recording video-only:', audioErr);
          }
        }

        console.log('[RECORD_TRACE] 1. Hold gesture start detected.');
        webChunksRef.current = [];
        let recorder: MediaRecorder;
        
        let mimeType = '';
        if (typeof MediaRecorder.isTypeSupported === 'function') {
          const types = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4;codecs=h264',
            'video/mp4',
            'video/quicktime'
          ];
          for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
              mimeType = type;
              break;
            }
          }
        }

        let recordStream = webStreamRef.current;
        if (!hasNativeZoom && zoom > 0 && webVideoRef.current) {
          console.log('[RECORD_TRACE] Simulating zoom for recording via canvas stream.');
          const video = webVideoRef.current;
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
          const ctx = canvas.getContext('2d');
          
          const drawFrame = () => {
            if (ctx && video && !video.paused && !video.ended) {
              const scale = 1 + zoom * 7;
              const sWidth = canvas.width / scale;
              const sHeight = canvas.height / scale;
              const sx = (canvas.width - sWidth) / 2;
              const sy = (canvas.height - sHeight) / 2;
              
              ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
            }
          };

          drawFrame();
          const interval = setInterval(drawFrame, 1000 / 30);
          webCanvasIntervalRef.current = interval;

          if (typeof (canvas as any).captureStream === 'function') {
            const canvasStream = (canvas as any).captureStream(30);
            // Append audio tracks
            webStreamRef.current.getAudioTracks().forEach((track: any) => {
              canvasStream.addTrack(track.clone());
            });
            recordStream = canvasStream;
          }
        }

        const options = mimeType ? { mimeType } : undefined;
        console.log('[RECORD_TRACE] 2. Creating MediaRecorder with MIME type:', mimeType || 'Default');
        recorder = new MediaRecorder(recordStream, options);
        webMediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event: BlobEvent) => {
          if (event.data && event.data.size > 0) {
            console.log('[RECORD_TRACE] 4. dataavailable event fired. Chunk size:', event.data.size);
            webChunksRef.current.push(event.data);
          }
        };

        recorder.onstop = async () => {
          console.log('[RECORD_TRACE] 6. MediaRecorder.onstop fired. Chunks collected:', webChunksRef.current.length);
          const blob = new Blob(webChunksRef.current, { type: mimeType || 'video/webm' });
          console.log('[RECORD_TRACE] 7. Blob created. Size:', blob.size, 'Type:', blob.type);
          
          const fileUri = URL.createObjectURL(blob);
          console.log('[RECORD_TRACE] 8. URL.createObjectURL generated URI:', fileUri);

          console.log('[RECORD_TRACE] 9. Navigating PreviewScreen with URI:', fileUri);
          navigation.navigate('Preview', {
            uri: fileUri,
            type: 'video',
            fromGallery: false,
            file_type: 'video',
            mime_type: mimeType || 'video/webm',
            defaultLens: selectedLens,
            locationText: selectedLens === 'location' ? locationText : undefined,
            defaultDestination,
            sendToUserId,
            sendToUsername,
            conversationId,
          } as any);
          setZoom(0); // Reset zoom
        };

        console.log('[RECORD_TRACE] 3. Calling MediaRecorder.start().');
        recorder.start(100);

        setIsRecording(true);
        setIsStartingRecording(false);

        // Duration timer
        recordingIntervalRef.current = setInterval(() => {
          setRecordingDuration((prev) => {
            const next = prev + 1;
            if (next >= maxDuration) {
              stopRecording();
            }
            return next;
          });
        }, 1000);

      } catch (err: any) {
        console.error('Web recording start failed:', err);
        cleanupRecordingState();
        Alert.alert('Recording Failed', err.message || 'Could not start web recording.');
      }
    } else {
      if (!cameraRef.current) {
        setIsStartingRecording(false);
        return;
      }

      try {
        setIsRecording(true);
        setIsStartingRecording(false);

        // Duration timer
        recordingIntervalRef.current = setInterval(() => {
          setRecordingDuration((prev) => {
            const next = prev + 1;
            if (next >= maxDuration) {
              stopRecording();
            }
            return next;
          });
        }, 1000);

        const video = await cameraRef.current.recordAsync({
          quality: '1080p',
          maxDuration: maxDuration,
        });

        if (video && video.uri) {
          // Wait 300ms to ensure the file is completely written and unlocked by the encoder
          await new Promise((resolve) => setTimeout(resolve, 300));
          navigation.navigate('Preview', {
            uri: video.uri,
            type: 'video',
            fromGallery: false,
            file_type: 'video',
            mime_type: 'video/mp4',
            defaultLens: selectedLens,
            locationText: selectedLens === 'location' ? locationText : undefined,
            defaultDestination,
            sendToUserId,
            sendToUsername,
            conversationId,
          } as any);
          setZoom(0); // Reset zoom!
        }
      } catch (error: any) {
        if (__DEV__) {
          console.error('Video recording failed in recordAsync:', error);
        }
        cleanupRecordingState();
        const userMsg = error.message || 'Could not start recording. Please try again.';
        Alert.alert('Recording Failed', userMsg);
      }
    }
  };

  const handleStartRecording = () => {
    if (countdown !== null || isRecording) return;
    if (timerOption === 'off') {
      executeVideoRecording();
    } else {
      startCountdown(parseInt(timerOption), executeVideoRecording);
    }
  };

  const stopRecording = () => {
    if (isStartingRecording) {
      setIsStartingRecording(false);
      cleanupRecordingState();
      return;
    }

    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    if (Platform.OS === 'web') {
      console.log('[RECORD_TRACE] 5. stopRecording called. Stopping Web MediaRecorder.');
      if (webCanvasIntervalRef.current) {
        clearInterval(webCanvasIntervalRef.current);
        webCanvasIntervalRef.current = null;
      }
      if (webMediaRecorderRef.current && webMediaRecorderRef.current.state !== 'inactive') {
        webMediaRecorderRef.current.stop();
      }
      if (webAudioStreamRef.current) {
        webAudioStreamRef.current.getTracks().forEach((track: any) => {
          track.stop();
          if (webStreamRef.current) {
            webStreamRef.current.removeTrack(track);
          }
        });
        webAudioStreamRef.current = null;
      }
    } else {
      if (cameraRef.current && isRecording) {
        try {
          cameraRef.current.stopRecording();
        } catch (err) {
          console.warn('stopRecording failed:', err);
        }
      }
    }
    cleanupRecordingState();
  };

  const cleanupRecordingState = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (webCanvasIntervalRef.current) {
      clearInterval(webCanvasIntervalRef.current);
      webCanvasIntervalRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
    setZoom(0); // Reset zoom!
    settingsService.getSettings().then((settings) => {
      if (Platform.OS !== 'web') {
        setCameraMode(settings.defaultCameraMode === 'Video' ? 'video' : 'picture');
      }
    });
  };

  const handleStopRecording = () => {
    if (isRecording || isStartingRecording) {
      stopRecording();
    }
  };

  const handleFlip = () => {
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
    setZoom(0); // Reset zoom!
  };

  const handleFlashToggle = () => {
    setFlash((prev) => (prev === 'off' ? 'on' : 'off'));
  };

  const handleTimerToggle = () => {
    setTimerOption((prev) => {
      const options: ('off' | '3s' | '5s' | '10s')[] = ['off', '3s', '5s', '10s'];
      const nextIndex = (options.indexOf(prev) + 1) % options.length;
      return options[nextIndex];
    });
  };

  const handleGalleryPress = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'TeleVault needs gallery access to upload media.');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: false,
        quality: 0.9,
      });

      if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
        const asset = pickerResult.assets[0];
        const type = asset.type === 'video' ? 'video' : 'image';
        navigation.navigate('Preview', {
          uri: asset.uri,
          type,
          fromGallery: true,
          file_type: type,
          mime_type: asset.mimeType || (type === 'video' ? 'video/mp4' : 'image/jpeg'),
          defaultLens: 'none',
          defaultDestination,
          sendToUserId,
          sendToUsername,
          conversationId,
        } as any);
        setZoom(0); // Reset zoom!
      }
    } catch (error: any) {
      console.error('Gallery pick error:', error);
      Alert.alert('Error', 'Failed to select media from gallery.');
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const renderLiveOverlay = () => {
    if (selectedLens === 'none' || selectedLens === 'original') return null;

    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateString = now.toLocaleDateString();

    return (
      <View style={styles.liveOverlayContainer} pointerEvents="none">
        {/* Color Tints */}
        {selectedLens === 'warm' && <View style={styles.warmOverlay} />}
        {selectedLens === 'cool' && <View style={styles.coolOverlay} />}
        {selectedLens === 'bw' && <View style={styles.bwOverlay} />}
        {selectedLens === 'soft' && <View style={styles.softOverlay} />}
        {selectedLens === 'night' && <View style={styles.nightOverlay} />}
        
        {/* Stamp / Text Overlays */}
        {selectedLens === 'time' && (
          <View style={styles.textOverlayWrapper}>
            <Text style={styles.liveOverlayStampText}>{timeString}</Text>
          </View>
        )}
        {selectedLens === 'date' && (
          <View style={styles.textOverlayWrapper}>
            <Text style={styles.liveOverlayStampText}>{dateString}</Text>
          </View>
        )}
        {selectedLens === 'location' && (
          <View style={styles.textOverlayWrapper}>
            <Text style={styles.liveOverlayStampText}>{locationText}</Text>
          </View>
        )}
        {selectedLens === 'vault' && (
          <View style={styles.stampOverlayWrapper}>
            <Text style={styles.stampOverlayText}>TELEVAULT SECURE</Text>
          </View>
        )}
        {selectedLens === 'private' && (
          <View style={styles.stampOverlayWrapper}>
            <Text style={[styles.stampOverlayText, { borderColor: '#FF453A', color: '#FF453A' }]}>PRIVATE LOCK</Text>
          </View>
        )}
      </View>
    );
  };

  const renderToolsPanel = () => {
    if (!showToolsPanel) return null;

    return (
      <View style={[styles.toolsPanelContainer, { top: insets.top > 0 ? insets.top + 50 : 70 }]}>
        <View style={styles.toolsPanelHeader}>
          <Text style={styles.toolsPanelTitle}>Quick Tools</Text>
          <TouchableOpacity onPress={() => setShowToolsPanel(false)}>
            <Text style={styles.toolsCloseBtn}>Close</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={styles.toolRow} 
          onPress={() => {
            handleFlashToggle();
            showToast(`Flash: ${flash === 'on' ? 'ON' : 'OFF'}`);
          }}
        >
          <Text style={styles.toolLabel}>Flash Mode</Text>
          <Text style={[styles.toolValue, flash === 'on' && styles.toolValueActive]}>
            {flash === 'on' ? 'ON' : 'OFF'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.toolRow} 
          onPress={() => {
            handleFlip();
            showToast(`Camera: ${facing === 'back' ? 'FRONT' : 'BACK'}`);
          }}
        >
          <Text style={styles.toolLabel}>Flip Camera</Text>
          <Text style={styles.toolValue}>{facing === 'back' ? 'Back' : 'Front'}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.toolRow} 
          onPress={() => {
            handleTimerToggle();
          }}
        >
          <Text style={styles.toolLabel}>Countdown Timer</Text>
          <Text style={[styles.toolValue, timerOption !== 'off' && styles.toolValueActive]}>
            {timerOption === 'off' ? 'Off' : timerOption}
          </Text>
        </TouchableOpacity>

        <View style={styles.toolRowGroup}>
          <Text style={styles.toolLabelGroup}>Destination</Text>
          <View style={styles.toolButtonGroup}>
            {(['memories', 'drive', 'private'] as const).map((dest) => (
              <TouchableOpacity
                key={dest}
                style={[
                  styles.toolBtn,
                  defaultDestination === dest && styles.toolBtnActive,
                ]}
                onPress={() => setDefaultDestination(dest)}
              >
                <Text
                  style={[
                    styles.toolBtnText,
                    defaultDestination === dest && styles.toolBtnTextActive,
                  ]}
                >
                  {dest.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity 
          style={styles.toolRow} 
          onPress={() => {
            setShowToolsPanel(false);
            navigation.navigate('SettingsTab');
          }}
        >
          <Text style={styles.toolLabel}>Upload Queue</Text>
          <Text style={styles.toolValue}>Open</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.toolRow, { borderBottomWidth: 0 }]} 
          onPress={() => {
            setShowToolsPanel(false);
            navigation.navigate('SettingsTab');
          }}
        >
          <Text style={styles.toolLabel}>App Settings</Text>
          <Text style={styles.toolValue}>Configure</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderFilterTray = () => {
    if (isRecording) return null;

    const bottomNavHeight = 64 + insets.bottom;

    return (
      <View style={[styles.filterTrayContainer, { bottom: bottomNavHeight + 130 }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {LENSES.map((lens) => {
            const isSelected = selectedLens === lens.type;
            return (
              <TouchableOpacity
                key={lens.type}
                style={[styles.filterItem, isSelected && styles.filterItemActive]}
                onPress={() => {
                  setSelectedLens(lens.type);
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.filterIconCircle, isSelected && styles.filterIconCircleActive]}>
                  <Text style={styles.filterIconText}>{lens.icon}</Text>
                </View>
                {isSelected && (
                  <Text style={styles.filterLabelActive}>
                    {lens.label}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const bottomNavHeight = 64 + insets.bottom;

  return (
    <View style={[styles.container, Platform.OS === 'web' ? {
      userSelect: 'none',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
      WebkitTapHighlightColor: 'transparent',
      touchAction: 'none',
    } as any : {}]}>
      {isFocused ? (
        <View 
          style={[StyleSheet.absoluteFill, Platform.OS === 'web' ? {
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'none',
          } as any : {}]}
          onTouchStart={handleCameraTouchStart}
          onTouchMove={handleCameraTouchMove}
          onTouchEnd={handleCameraTouchEnd}
        >
          {Platform.OS === 'web' ? (
            <View style={[StyleSheet.absoluteFill, { 
              overflow: 'hidden',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none',
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'none',
            } as any]}>
              <video
                ref={webVideoRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  right: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: hasNativeZoom ? 'scale(1)' : `scale(${1 + zoom * 7})`,
                  transition: 'transform 0.08s ease-out',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  WebkitTouchCallout: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  touchAction: 'none',
                } as any}
                playsInline
                muted
                autoPlay
              />
              {renderLiveOverlay()}

              {/* Upper Safe Overlay (Avatar, Pill, Settings) */}
              <View style={[styles.newTopBar, { top: (Platform.OS === 'web' ? 'calc(10px + env(safe-area-inset-top))' : (insets.top > 0 ? insets.top + 10 : 20)) as any }]}>
                <TouchableOpacity
                  style={styles.profileShortcut}
                  onPress={() => navigation.navigate('MyProfile')}
                  activeOpacity={0.8}
                >
                  <UserAvatar
                    name={profile?.full_name || profile?.username || 'User'}
                    avatarUrl={profile?.avatar_url}
                    size={36}
                  />
                </TouchableOpacity>

                <View style={styles.modePill}>
                  <Text style={styles.modePillText}>
                    {defaultDestination === 'memories' ? 'Memories' : defaultDestination === 'drive' ? 'Drive' : 'Vault'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.toolsTriggerButton, showToolsPanel && styles.toolsTriggerButtonActive]}
                  onPress={() => setShowToolsPanel((prev) => !prev)}
                  activeOpacity={0.8}
                >
                  <Settings size={20} color={showToolsPanel ? '#000000' : '#FFFFFF'} />
                </TouchableOpacity>
              </View>

              {/* Tools Quick Panel Dropdown */}
              {renderToolsPanel()}

              {/* Timer Countdown Visual */}
              {countdown !== null && (
                <View style={styles.countdownContainer}>
                  <Text style={styles.countdownText}>{countdown}</Text>
                </View>
              )}

              {/* Recording Indicator */}
              {isRecording && (
                <View style={[styles.recordingIndicator, { top: (Platform.OS === 'web' ? 'calc(60px + env(safe-area-inset-top))' : (insets.top > 0 ? insets.top + 60 : 80)) as any }]}>
                  <View style={styles.recordingRedDot} />
                  <Text style={styles.recordingTimerText}>{formatDuration(recordingDuration)}</Text>
                </View>
              )}

              {/* Selected Lens/Filter indicator label */}
              {selectedLens !== 'original' && !isRecording && (
                <View style={[styles.activeFilterPill, { bottom: (Platform.OS === 'web' ? 'calc(64px + env(safe-area-inset-bottom) + 185px)' : bottomNavHeight + 185) as any }]}>
                  <Text style={styles.activeFilterPillText}>{selectedLens.toUpperCase()}</Text>
                </View>
              )}

              {/* Live Filter Tray */}
              {renderFilterTray()}

              {/* Zoom Indicator Pill */}
              <View style={[styles.zoomPill, { bottom: (Platform.OS === 'web' ? 'calc(64px + env(safe-area-inset-bottom) + 105px)' : bottomNavHeight + 105) as any }]}>
                <Text style={styles.zoomPillText}>{getZoomDisplay()}</Text>
              </View>

              {/* Bottom Controls */}
              <CameraControls
                onCapture={handleCapture}
                onStartRecording={handleStartRecording}
                onStopRecording={handleStopRecording}
                isRecording={isRecording}
                onGalleryPress={handleGalleryPress}
                onMemoriesPress={() => navigation.navigate('MemoriesTab')}
                zoom={zoom}
                onZoomChange={setZoom}
              />
            </View>
          ) : (
            <View style={StyleSheet.absoluteFill}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing={facing}
                flash={flash}
                mode={cameraMode}
                zoom={zoom}
                pictureSize={pictureSize}
                ref={cameraRef}
                onCameraReady={handleCameraReady}
                onTouchStart={handleCameraTouchStart}
                onTouchMove={handleCameraTouchMove}
                onTouchEnd={handleCameraTouchEnd}
              />

              {renderLiveOverlay()}

              {/* Upper Safe Overlay (Avatar, Pill, Settings) */}
              <View style={[styles.newTopBar, { top: insets.top > 0 ? insets.top + 10 : 20 }]}>
                <TouchableOpacity
                  style={styles.profileShortcut}
                  onPress={() => navigation.navigate('MyProfile')}
                  activeOpacity={0.8}
                >
                  <UserAvatar
                    name={profile?.full_name || profile?.username || 'User'}
                    avatarUrl={profile?.avatar_url}
                    size={36}
                  />
                </TouchableOpacity>

                <View style={styles.modePill}>
                  <Text style={styles.modePillText}>
                    {defaultDestination === 'memories' ? 'Memories' : defaultDestination === 'drive' ? 'Drive' : 'Vault'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.toolsTriggerButton, showToolsPanel && styles.toolsTriggerButtonActive]}
                  onPress={() => setShowToolsPanel((prev) => !prev)}
                  activeOpacity={0.8}
                >
                  <Settings size={20} color={showToolsPanel ? '#000000' : '#FFFFFF'} />
                </TouchableOpacity>
              </View>

              {/* Tools Quick Panel Dropdown */}
              {renderToolsPanel()}

              {/* Timer Countdown Visual */}
              {countdown !== null && (
                <View style={styles.countdownContainer}>
                  <Text style={styles.countdownText}>{countdown}</Text>
                </View>
              )}

              {/* Recording Indicator */}
              {isRecording && (
                <View style={[styles.recordingIndicator, { top: insets.top > 0 ? insets.top + 60 : 80 }]}>
                  <View style={styles.recordingRedDot} />
                  <Text style={styles.recordingTimerText}>{formatDuration(recordingDuration)}</Text>
                </View>
              )}

              {/* Selected Lens/Filter indicator label */}
              {selectedLens !== 'original' && !isRecording && (
                <View style={[styles.activeFilterPill, { bottom: 64 + insets.bottom + 185 }]}>
                  <Text style={styles.activeFilterPillText}>{selectedLens.toUpperCase()}</Text>
                </View>
              )}

              {/* Live Filter Tray */}
              {renderFilterTray()}

              {/* Zoom Indicator Pill */}
              <View style={[styles.zoomPill, { bottom: bottomNavHeight + 105 }]}>
                <Text style={styles.zoomPillText}>{getZoomDisplay()}</Text>
              </View>

              {/* Bottom Controls */}
              <CameraControls
                onCapture={handleCapture}
                onStartRecording={handleStartRecording}
                onStopRecording={handleStopRecording}
                isRecording={isRecording}
                onGalleryPress={handleGalleryPress}
                onMemoriesPress={() => navigation.navigate('MemoriesTab')}
                zoom={zoom}
                onZoomChange={setZoom}
              />
            </View>
          )}
        </View>
      ) : (
        <View style={styles.inactiveBackground} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  inactiveBackground: {
    flex: 1,
    backgroundColor: '#000000',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  permissionContent: {
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  permissionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  permissionDesc: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  countdownContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 25,
  },
  countdownText: {
    color: '#FFFC00',
    fontSize: 120,
    fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -2, height: 2 },
    textShadowRadius: 10,
  },
  recordingIndicator: {
    position: 'absolute',
    left: '50%',
    transform: [{ translateX: -40 }],
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    zIndex: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  recordingRedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF453A',
    marginRight: 8,
  },
  recordingTimerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  liveOverlayContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  liveOverlayTextTime: {
    fontSize: 72,
    fontWeight: '900',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  liveOverlayTextDate: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    marginTop: 8,
  },
  liveOverlayTimeDate: {
    alignItems: 'center',
  },
  liveOverlayTextLocation: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  liveOverlayEmoji: {
    fontSize: 120,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
  },
  glowOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255, 252, 0, 0.15)',
  },
  vintageOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(138, 90, 25, 0.2)',
  },
  vignetteOverlay: {
    ...StyleSheet.absoluteFill,
    borderWidth: 40,
    borderColor: 'rgba(0,0,0,0.5)',
    borderRadius: 200,
  },
  beautyLightOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  warmOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255, 160, 0, 0.12)',
  },
  coolOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 120, 255, 0.12)',
  },
  bwOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  softOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  nightOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 15, 45, 0.35)',
  },
  textOverlayWrapper: {
    position: 'absolute',
    bottom: 240,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  liveOverlayStampText: {
    color: '#FFFC00',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  stampOverlayWrapper: {
    position: 'absolute',
    top: 100,
    right: 20,
    transform: [{ rotate: '-12deg' }],
  },
  stampOverlayText: {
    color: '#FFFC00',
    fontSize: 11,
    fontWeight: '900',
    borderWidth: 1.5,
    borderColor: '#FFFC00',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    letterSpacing: 2,
  },
  newTopBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 15,
  },
  profileShortcut: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modePill: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modePillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  toolsTriggerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolsTriggerButtonActive: {
    backgroundColor: '#FFFC00',
    borderColor: '#FFFC00',
  },
  toolsPanelContainer: {
    position: 'absolute',
    right: 20,
    width: 250,
    backgroundColor: 'rgba(15, 17, 35, 0.95)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    padding: 16,
    zIndex: 40,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
  },
  toolsPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    paddingBottom: 6,
  },
  toolsPanelTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  toolsCloseBtn: {
    color: '#FFFC00',
    fontSize: 12,
    fontWeight: '600',
  },
  toolRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  toolLabel: {
    color: '#D0D2E2',
    fontSize: 12,
    fontWeight: '600',
  },
  toolValue: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  toolValueActive: {
    color: '#FFFC00',
  },
  toolRowGroup: {
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  toolLabelGroup: {
    color: '#D0D2E2',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  toolButtonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  toolBtn: {
    flex: 1,
    marginHorizontal: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  toolBtnActive: {
    backgroundColor: '#FFFC00',
    borderColor: '#FFFC00',
  },
  toolBtnText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  toolBtnTextActive: {
    color: '#000000',
  },
  filterTrayContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
  },
  filterScrollContent: {
    paddingHorizontal: 16,
  },
  filterItem: {
    alignItems: 'center',
    marginHorizontal: 6,
    width: 50,
  },
  filterItemActive: {
    transform: [{ scale: 1.05 }],
  },
  filterIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterIconCircleActive: {
    borderColor: '#FFFC00',
    borderWidth: 2,
    backgroundColor: 'rgba(255, 252, 0, 0.15)',
    shadowColor: '#FFFC00',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  filterIconText: {
    fontSize: 14,
  },
  filterLabel: {
    color: '#8E8E93',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
  },
  filterLabelActive: {
    color: '#FFFC00',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  activeFilterPill: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 252, 0, 0.2)',
    borderWidth: 1,
    borderColor: '#FFFC00',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    zIndex: 10,
  },
  activeFilterPillText: {
    color: '#FFFC00',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  zoomPill: {
    position: 'absolute',
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 6,
    zIndex: 10,
  },
  zoomPillText: {
    color: '#FFFC00',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default CameraScreen;
