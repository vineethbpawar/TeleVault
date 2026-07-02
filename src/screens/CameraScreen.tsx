import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, SafeAreaView, ScrollView } from 'react-native';
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
  
  const [cameraReady, setCameraReady] = useState(false);
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  const [showToolsPanel, setShowToolsPanel] = useState(false);
  const [profile, setProfile] = useState<{ username?: string; avatar_url?: string; full_name?: string } | null>(null);
  const [locationText, setLocationText] = useState('📍 Fetching Location...');

  const cameraRef = useRef<any>(null);
  const isFocused = useIsFocused();

  const recordingIntervalRef = useRef<any>(null);
  const recordingTimeoutRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);

  // Two-Finger Pinch Zoom Refs
  const initialPinchDistRef = useRef<number | null>(null);
  const initialPinchZoomRef = useRef<number>(0);

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
      const dist = calcDistance(touches);
      initialPinchDistRef.current = dist;
      initialPinchZoomRef.current = zoom;
    }
  };

  const handleCameraTouchMove = (e: any) => {
    const touches = e.nativeEvent.touches;
    if (touches && touches.length === 2 && initialPinchDistRef.current) {
      const currentDist = calcDistance(touches);
      const ratio = currentDist / initialPinchDistRef.current;
      const zoomFactor = 0.5; // gentle mapping speed
      const newZoom = Math.max(0, Math.min(1, initialPinchZoomRef.current + (ratio - 1) * zoomFactor));
      setZoom(newZoom);
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

    if (!micPermission.granted) {
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
    if (cameraMode !== 'video') {
      setCameraMode('video');
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

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
        quality: '720p',
        maxDuration: maxDuration,
      });

      if (video && video.uri) {
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
    setZoom(0); // Reset zoom!
    settingsService.getSettings().then((settings) => {
      setCameraMode(settings.defaultCameraMode === 'Video' ? 'video' : 'picture');
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
      <View style={[styles.filterTrayContainer, { bottom: bottomNavHeight + 145 }]}>
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
                <Text style={[styles.filterLabel, isSelected && styles.filterLabelActive]}>
                  {lens.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {isFocused ? (
        <View 
          style={StyleSheet.absoluteFill}
          onTouchStart={handleCameraTouchStart}
          onTouchMove={handleCameraTouchMove}
          onTouchEnd={handleCameraTouchEnd}
        >
          <CameraView
            style={StyleSheet.absoluteFill}
            facing={facing}
            flash={flash}
            mode={cameraMode}
            zoom={zoom}
            ref={cameraRef}
            onCameraReady={() => setCameraReady(true)}
          >
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
              <View style={[styles.activeFilterPill, { bottom: 64 + insets.bottom + 106 }]}>
                <Text style={styles.activeFilterPillText}>{selectedLens.toUpperCase()}</Text>
              </View>
            )}

            {/* Live Filter Tray */}
            {renderFilterTray()}

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
          </CameraView>
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
    bottom: 220,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  liveOverlayStampText: {
    color: '#FFFC00',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  stampOverlayWrapper: {
    position: 'absolute',
    top: 150,
    right: 20,
    transform: [{ rotate: '-12deg' }],
  },
  stampOverlayText: {
    color: '#FFFC00',
    fontSize: 14,
    fontWeight: '900',
    borderWidth: 2,
    borderColor: '#FFFC00',
    paddingHorizontal: 8,
    paddingVertical: 4,
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
    width: 60,
  },
  filterItemActive: {
    transform: [{ scale: 1.05 }],
  },
  filterIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterIconCircleActive: {
    borderColor: '#FFFC00',
    borderWidth: 2,
    backgroundColor: 'rgba(255, 252, 0, 0.15)',
    shadowColor: '#FFFC00',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  filterIconText: {
    fontSize: 18,
  },
  filterLabel: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  filterLabelActive: {
    color: '#FFFC00',
    fontWeight: '700',
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
});

export default CameraScreen;
