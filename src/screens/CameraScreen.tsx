import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, SafeAreaView } from 'react-native';
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
import LensPicker from '../components/LensPicker';
import { CameraLensType } from '../types/camera';
import { Sparkles } from 'lucide-react-native';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'CameraTab'>,
  NativeStackScreenProps<AppStackParamList>
>;

export const CameraScreen: React.FC<Props> = ({ navigation, route }) => {
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
  
  const [selectedLens, setSelectedLens] = useState<CameraLensType>('none');
  const [showLensPicker, setShowLensPicker] = useState(false);

  const cameraRef = useRef<any>(null);
  const isFocused = useIsFocused();

  const recordingIntervalRef = useRef<any>(null);
  const recordingTimeoutRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);

  // Load defaults from settings on focus
  useEffect(() => {
    if (isFocused) {
      settingsService.getSettings().then((settings) => {
        setTimerOption(settings.defaultTimer);
        setMaxDuration(settings.maxVideoDuration);
        setSelectedLens(settings.defaultLens as CameraLensType);
        
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

  if (!permission || !micPermission) {
    return <LoadingScreen message="Requesting camera and mic access..." />;
  }

  if (!permission.granted || !micPermission.granted) {
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
              await requestPermission();
              await requestMicPermission();
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

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
    setCountdown(null);
  };

  const executePhotoCapture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          skipProcessing: false,
        });
        if (photo && photo.uri) {
          navigation.navigate('Preview', {
            uri: photo.uri,
            type: 'image',
            fromGallery: false,
            // Custom extension properties for navigation
            file_type: 'image',
            mime_type: 'image/jpeg',
            defaultLens: selectedLens,
            sendToUserId,
            sendToUsername,
            conversationId,
          } as any);
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
    if (!micPermission.granted) {
      const status = await requestMicPermission();
      if (!status.granted) {
        Alert.alert('Permission Required', 'Microphone permission is required to record video.');
        return;
      }
    }

    setIsRecording(true);
    setRecordingDuration(0);
    setCameraMode('video');

    // Give a short delay to switch mode to video if it was picture
    const switchDelay = cameraMode === 'picture' ? 600 : 0;

    recordingTimeoutRef.current = setTimeout(async () => {
      if (cameraRef.current) {
        try {
          // Duration indicator timer
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
            quality: '720p',
            maxDuration: maxDuration,
          });

          if (video && video.uri) {
            navigation.navigate('Preview', {
              uri: video.uri,
              type: 'video',
              fromGallery: false,
              // Custom extension properties for navigation
              file_type: 'video',
              mime_type: 'video/mp4',
              defaultLens: selectedLens,
              sendToUserId,
              sendToUsername,
              conversationId,
            } as any);
          }
        } catch (error: any) {
          console.error('Video recording failed:', error);
          cleanupRecordingState();
          Alert.alert('Error', error.message || 'An error occurred during video recording.');
        }
      }
    }, switchDelay);
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
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    if (cameraRef.current && isRecording) {
      try {
        cameraRef.current.stopRecording();
      } catch (err) {
        console.warn('stopRecording failed:', err);
      }
    }
    cleanupRecordingState();
  };

  const cleanupRecordingState = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
    // Restore default camera mode
    settingsService.getSettings().then((settings) => {
      setCameraMode(settings.defaultCameraMode === 'Video' ? 'video' : 'picture');
    });
  };

  const handleStopRecording = () => {
    if (isRecording) {
      stopRecording();
    }
  };

  const handleFlip = () => {
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
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
          sendToUserId,
          sendToUsername,
          conversationId,
        } as any);
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

  return (
    <View style={styles.container}>
      {isFocused ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
          mode={cameraMode}
          ref={cameraRef}
        >
          {/* Floating Sparkles Button to select Lens before capture */}
          <TouchableOpacity
            style={styles.floatingLensButton}
            onPress={() => setShowLensPicker((prev) => !prev)}
            activeOpacity={0.8}
          >
            <Sparkles size={24} color={selectedLens !== 'none' ? '#FFFC00' : '#FFFFFF'} />
          </TouchableOpacity>

          {/* Timer Countdown Visual */}
          {countdown !== null && (
            <View style={styles.countdownContainer}>
              <Text style={styles.countdownText}>{countdown}</Text>
            </View>
          )}

          {/* Recording Indicator */}
          {isRecording && (
            <View style={styles.recordingIndicator}>
              <View style={styles.recordingRedDot} />
              <Text style={styles.recordingTimerText}>{formatDuration(recordingDuration)}</Text>
            </View>
          )}

          {/* Slide-up Lens Picker */}
          {showLensPicker && (
            <View style={styles.lensPickerOverlay}>
              <LensPicker selectedLens={selectedLens} onSelectLens={setSelectedLens} />
            </View>
          )}

          <CameraControls
            onCapture={handleCapture}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            isRecording={isRecording}
            timerOption={timerOption}
            onTimerToggle={handleTimerToggle}
            onFlip={handleFlip}
            onFlashToggle={handleFlashToggle}
            flashMode={flash}
            onGalleryPress={handleGalleryPress}
            onMemoriesPress={() => navigation.navigate('MemoriesTab')}
            onSettingsPress={() => navigation.navigate('SettingsTab')}
            onChatPress={() => navigation.navigate('ChatList')}
            onStoriesPress={() => navigation.navigate('Stories')}
            onInboxPress={() => navigation.navigate('SnapInbox')}
          />
        </CameraView>
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
  floatingLensButton: {
    position: 'absolute',
    right: 20,
    top: 120,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 20,
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
    top: 120,
    left: '50%',
    transform: [{ translateX: -50 }],
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    zIndex: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  recordingRedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF453A',
    marginRight: 8,
  },
  recordingTimerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  lensPickerOverlay: {
    position: 'absolute',
    bottom: 140, // Sits above the CameraControls bottom bar
    left: 0,
    right: 0,
    zIndex: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
});

export default CameraScreen;
