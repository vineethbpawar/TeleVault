import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Settings, RefreshCw, Zap, Clock, Compass, Shield } from 'lucide-react-native';
import Animated, { useSharedValue, runOnJS, useAnimatedReaction, SharedValue } from 'react-native-reanimated';

import { useCamera } from './useCamera';
import { useCameraPermissions } from './useCameraPermissions';
import { CameraPreview, CameraPreviewRef } from './CameraPreview';
import { LENSES, CameraLensType, UploadDestination } from './types';
import CameraControls from '../components/CameraControls';
import UserAvatar from '../components/UserAvatar';
import { showToast } from '../components/ToastBanner';
import { supabase } from '../lib/supabase';

const Alert = {
  alert: (
    title: string,
    message?: string,
    buttons?: { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[]
  ) => {
    if (Platform.OS === 'web') {
      if (buttons && buttons.length > 1) {
        const confirmBtn = buttons.find(b => b.style !== 'cancel') || buttons[buttons.length - 1];
        const confirmed = window.confirm(`${title}\n\n${message || ''}`);
        if (confirmed && confirmBtn && confirmBtn.onPress) {
          confirmBtn.onPress();
        }
      } else {
        window.alert(`${title}\n\n${message || ''}`);
        if (buttons && buttons[0] && buttons[0].onPress) {
          buttons[0].onPress();
        }
      }
      return;
    }
    const RNAlert = require('react-native').Alert;
    RNAlert.alert(title, message, buttons);
  }
};

// High-performance Zoom Pill display (Zero React state updates per frame)
const ZoomPill = ({ zoomShared, bottom }: { zoomShared: SharedValue<number>; bottom: any }) => {
  const [zoomText, setZoomText] = useState('1.0x');

  useAnimatedReaction(
    () => zoomShared.value,
    (val) => {
      const displayVal = `${(val * 7 + 1).toFixed(1)}x`;
      runOnJS(setZoomText)(displayVal);
    }
  );

  return (
    <View style={[styles.zoomPill, { bottom }]} pointerEvents="none">
      <Text style={styles.zoomPillText}>{zoomText}</Text>
    </View>
  );
};

interface CameraContainerProps {
  navigation: any;
  route: any;
  isFocused: boolean;
}

export const CameraContainer: React.FC<CameraContainerProps> = ({ navigation, route, isFocused }) => {
  const insets = useSafeAreaInsets();
  const { sendToUserId, sendToUsername, conversationId } = (route.params || {}) as any;

  const {
    facing,
    toggleFacing,
    flash,
    toggleFlash,
    selectedLens,
    setSelectedLens,
    defaultDestination,
    setDefaultDestination,
    isRecording,
    setIsRecording,
    recordingDuration,
    setRecordingDuration,
    locationText,
    zoomShared,
  } = useCamera();

  const {
    hasCameraPermission,
    hasMicPermission,
    requestPermissions,
    isCameraPermissionLoading,
  } = useCameraPermissions();

  const [showToolsPanel, setShowToolsPanel] = useState(false);
  const [timerOption, setTimerOption] = useState<'off' | '3s' | '5s' | '10s'>('off');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [profile, setProfile] = useState<{ username?: string; avatar_url?: string; full_name?: string } | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const previewRef = useRef<CameraPreviewRef>(null);
  const recordingIntervalRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);

  // Load User Profile details
  useEffect(() => {
    let active = true;
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && active) {
          const { data } = await supabase
            .from('profiles')
            .select('username, avatar_url, full_name')
            .eq('id', user.id)
            .maybeSingle();
          if (data && active) setProfile(data);
        }
      } catch (_) {}
    };
    fetchProfile();
    return () => {
      active = false;
    };
  }, []);

  // Safe release of recording timers on unmount
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  const handleCapture = async () => {
    if (!previewRef.current) return;
    try {
      const result = await previewRef.current.takePicture();
      navigation.navigate('Preview', {
        uri: result.uri,
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
      });
      zoomShared.value = 0; // Reset zoom
    } catch (err: any) {
      Alert.alert('Capture Error', err.message || 'Failed to capture photo.');
    }
  };

  const handleStartRecording = () => {
    if (countdown !== null || isRecording) return;

    const startRecording = async () => {
      if (!previewRef.current) return;
      try {
        setIsRecording(true);
        setRecordingDuration(0);
        await previewRef.current.startRecording();

        recordingIntervalRef.current = setInterval(() => {
          setRecordingDuration((prev) => {
            const next = prev + 1;
            if (next >= 30) {
              handleStopRecording();
            }
            return next;
          });
        }, 1000);
      } catch (err: any) {
        setIsRecording(false);
        if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
        Alert.alert('Recording Failed', err.message || 'Failed to start video recording.');
      }
    };

    if (timerOption === 'off') {
      startRecording();
    } else {
      const seconds = parseInt(timerOption.replace('s', ''), 10);
      setCountdown(seconds);
      countdownIntervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current);
            setCountdown(null);
            startRecording();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    }
  };

  const handleStopRecording = async () => {
    if (!isRecording || !previewRef.current) return;
    setIsRecording(false);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    try {
      const result = await previewRef.current.stopRecording();
      
      // Native recordAsync resolves inside stopRecording ref wrapper with empty uri 
      // because native handler manages navigations inside recordAsync callback.
      // If we are on Web, we resolve the Blob ObjectURL directly here:
      if (Platform.OS === 'web' && result.uri) {
        navigation.navigate('Preview', {
          uri: result.uri,
          type: 'video',
          fromGallery: false,
          file_type: 'video',
          mime_type: result.mime_type,
          defaultLens: selectedLens,
          locationText: selectedLens === 'location' ? locationText : undefined,
          defaultDestination,
          sendToUserId,
          sendToUsername,
          conversationId,
        });
        zoomShared.value = 0;
      }
    } catch (err: any) {
      Alert.alert('Recording Stop Failed', err.message || 'Failed to stop video recording.');
    }
  };

  const handleTimerToggle = () => {
    const timerList = ['off', '3s', '5s', '10s'] as const;
    const currentIdx = timerList.indexOf(timerOption);
    const nextIdx = (currentIdx + 1) % timerList.length;
    setTimerOption(timerList[nextIdx]);
    showToast(`Timer set to: ${timerList[nextIdx].toUpperCase()}`);
  };

  const handleGalleryPress = () => {
    navigation.navigate('MemoriesTab');
  };

  if (isCameraPermissionLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#FFFC00" />
      </View>
    );
  }

  if (!hasCameraPermission || !hasMicPermission) {
    return (
      <View style={styles.permissionContainer}>
        <View style={styles.permissionContent}>
          <Text style={styles.permissionTitle}>Camera Permissions Required</Text>
          <Text style={styles.permissionDesc}>
            TeleVault needs camera and microphone access so you can capture and secure snaps.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={requestPermissions}>
            <Text style={styles.primaryBtnText}>Grant Access</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isFocused && (
        <CameraPreview
          ref={previewRef}
          facing={facing}
          flash={flash}
          lens={selectedLens}
          zoomShared={zoomShared}
          onReady={() => setCameraReady(true)}
          locationText={locationText}
        />
      )}

      {/* Top Safe Action HUD (Avatar, Mode badge, Settings cog) */}
      <View style={[styles.topBar, { top: insets.top > 0 ? insets.top + 10 : 20 }]}>
        <TouchableOpacity
          style={styles.circleBtn}
          onPress={() => navigation.navigate('MyProfile')}
          activeOpacity={0.8}
        >
          <UserAvatar
            name={profile?.full_name || profile?.username || 'User'}
            avatarUrl={profile?.avatar_url}
            size={36}
          />
        </TouchableOpacity>

        <View style={styles.destinationBadge}>
          <Text style={styles.destinationBadgeText}>
            {defaultDestination.toUpperCase()}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.circleBtn, showToolsPanel && styles.circleBtnActive]}
          onPress={() => setShowToolsPanel(prev => !prev)}
          activeOpacity={0.8}
        >
          <Settings size={20} color={showToolsPanel ? '#000000' : '#FFFFFF'} />
        </TouchableOpacity>
      </View>

      {/* Settings Quick Panel Dropdown */}
      {showToolsPanel && (
        <View style={[styles.toolsPanel, { top: insets.top > 0 ? insets.top + 60 : 70 }]}>
          <TouchableOpacity style={styles.toolsRow} onPress={() => { toggleFlash(); showToast(`Flash: ${flash === 'on' ? 'ON' : 'OFF'}`); }}>
            <Zap size={18} color="#FFFFFF" style={{ marginRight: 10 }} />
            <Text style={styles.toolsText}>Flash: {flash.toUpperCase()}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.toolsRow} onPress={toggleFacing}>
            <RefreshCw size={18} color="#FFFFFF" style={{ marginRight: 10 }} />
            <Text style={styles.toolsText}>Camera: {facing === 'back' ? 'BACK' : 'FRONT'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.toolsRow} onPress={handleTimerToggle}>
            <Clock size={18} color="#FFFFFF" style={{ marginRight: 10 }} />
            <Text style={styles.toolsText}>Self-Timer: {timerOption === 'off' ? 'OFF' : timerOption}</Text>
          </TouchableOpacity>

          <View style={styles.toolsRowGroup}>
            <Compass size={18} color="#FFFFFF" style={{ marginRight: 10 }} />
            <Text style={styles.toolsText}>Destination:</Text>
            <View style={styles.destToggleWrapper}>
              {(['memories', 'drive', 'private'] as const).map((dest) => (
                <TouchableOpacity
                  key={dest}
                  style={[styles.destBtn, defaultDestination === dest && styles.destBtnActive]}
                  onPress={() => setDefaultDestination(dest)}
                >
                  <Text style={[styles.destBtnText, defaultDestination === dest && styles.destBtnTextActive]}>
                    {dest.substring(0, 3).toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity style={[styles.toolsRow, { borderBottomWidth: 0 }]} onPress={() => { setShowToolsPanel(false); navigation.navigate('SettingsTab'); }}>
            <Shield size={18} color="#FFFFFF" style={{ marginRight: 10 }} />
            <Text style={styles.toolsText}>Queue & Private PIN</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Countdown overlay indicator */}
      {countdown !== null && (
        <View style={styles.countdownOverlay}>
          <Text style={styles.countdownText}>{countdown}</Text>
        </View>
      )}

      {/* Duration Counter overlay */}
      {isRecording && (
        <View style={[styles.durationCounter, { top: insets.top > 0 ? insets.top + 60 : 85 }]}>
          <View style={styles.redDot} />
          <Text style={styles.durationText}>00:{recordingDuration < 10 ? `0${recordingDuration}` : recordingDuration}</Text>
        </View>
      )}

      {/* Snapchat-style horizontal Lenses drawer */}
      {!isRecording && (
        <View style={[styles.lensesWrapper, { bottom: 64 + insets.bottom + 90 }]}>
          <Animated.ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.lensesContent}
          >
            {LENSES.map((lens) => (
              <TouchableOpacity
                key={lens.type}
                style={[styles.lensItem, selectedLens === lens.type && styles.lensItemActive]}
                onPress={() => {
                  setSelectedLens(lens.type);
                  showToast(`Lens selected: ${lens.label}`);
                }}
              >
                <Text style={styles.lensIcon}>{lens.icon}</Text>
                <Text style={[styles.lensLabel, selectedLens === lens.type && styles.lensLabelActive]}>
                  {lens.label}
                </Text>
              </TouchableOpacity>
            ))}
          </Animated.ScrollView>
        </View>
      )}

      {/* High Performance Zoom Pill */}
      <ZoomPill zoomShared={zoomShared} bottom={64 + insets.bottom + 185} />

      {/* Capture trigger buttons */}
      <CameraControls
        onCapture={handleCapture}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        isRecording={isRecording}
        onGalleryPress={handleGalleryPress}
        onMemoriesPress={() => navigation.navigate('MemoriesTab')}
        zoomShared={zoomShared}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    userSelect: 'none',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    padding: 24,
  },
  permissionContent: {
    backgroundColor: '#1E1E1E',
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  permissionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
  },
  permissionDesc: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  primaryBtn: {
    backgroundColor: '#FFFC00',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 25,
  },
  primaryBtnText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '800',
  },
  topBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 15,
  },
  circleBtn: {
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  circleBtnActive: {
    backgroundColor: '#FFFC00',
    borderColor: '#FFFC00',
  },
  destinationBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  destinationBadgeText: {
    color: '#FFFC00',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  toolsPanel: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(15, 17, 35, 0.95)',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 16,
    zIndex: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  toolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  toolsRowGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'space-between',
  },
  toolsText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  destToggleWrapper: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 16,
    padding: 2,
  },
  destBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  destBtnActive: {
    backgroundColor: '#FFFC00',
  },
  destBtnText: {
    color: '#8E8E93',
    fontSize: 9,
    fontWeight: '800',
  },
  destBtnTextActive: {
    color: '#000000',
  },
  countdownOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  countdownText: {
    color: '#FFFC00',
    fontSize: 100,
    fontWeight: '900',
  },
  durationCounter: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 15,
    zIndex: 15,
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    marginRight: 6,
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  lensesWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
  },
  lensesContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  lensItem: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  lensItemActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  lensIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  lensLabel: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '700',
  },
  lensLabelActive: {
    color: '#000000',
  },
  zoomPill: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    zIndex: 20,
  },
  zoomPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
export default CameraContainer;
