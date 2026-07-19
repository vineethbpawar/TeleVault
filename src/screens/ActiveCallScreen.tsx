/**
 * Active Call Screen
 *
 * Premium call interface for active voice and video calls in TeleVault.
 * Features:
 * - Glassmorphic overlay & ambient glow aesthetics
 * - Full Lucide vector icon suite
 * - Smooth dynamic duration timer & status badges
 * - Responsive layout & PiP mode support
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  StatusBar,
  Dimensions,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Video,
  VideoOff,
  PhoneOff,
  RefreshCw,
  Minimize2,
  Wifi,
} from 'lucide-react-native';
import { ActiveCallState, NetworkQuality } from '../types/call';
import { UserAvatar } from '../components/UserAvatar';
import { callingService } from '../services/callingService';
import { webRTCPeerService } from '../services/webrtcPeerService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Conditionally import RTCView for native platforms
let RTCView: any = null;
if (Platform.OS !== 'web') {
  try {
    RTCView = require('react-native-webrtc').RTCView;
  } catch (_) {}
}

// Web Video Component
const WebVideoView: React.FC<{
  stream: MediaStream | null;
  style?: any;
  mirror?: boolean;
  objectFit?: string;
}> = ({ stream, style, mirror, objectFit }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={mirror}
      style={{
        width: '100%',
        height: '100%',
        objectFit: objectFit || 'cover',
        transform: mirror ? 'scaleX(-1)' : 'none',
        ...style,
      }}
    />
  ) as any;
};

interface ActiveCallScreenProps {
  callState: ActiveCallState;
}

const ActiveCallScreen: React.FC<ActiveCallScreenProps> = ({ callState }) => {
  const insets = useSafeAreaInsets();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const connectingAnim = useRef(new Animated.Value(0.4)).current;

  // Draggable PiP position for local video tile
  const pipPosition = useRef(new Animated.ValueXY({ x: SCREEN_WIDTH - 130, y: 80 })).current;

  useEffect(() => {
    const updateStreams = () => {
      setLocalStream(webRTCPeerService.getLocalStream());
      setRemoteStream(webRTCPeerService.getRemoteStream());
    };

    webRTCPeerService.on('localStream', () => updateStreams());
    webRTCPeerService.on('remoteStream', () => updateStreams());

    updateStreams();

    return () => {
      webRTCPeerService.off('localStream');
      webRTCPeerService.off('remoteStream');
    };
  }, []);

  // Pulse effect for connecting/ringing status
  useEffect(() => {
    if (callState.status === 'connecting' || callState.status === 'ringing' || callState.status === 'initiating') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(connectingAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(connectingAnim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      connectingAnim.setValue(1);
    }
  }, [callState.status]);

  // Auto-hide controls overlay for video calls
  const resetControlsTimer = useCallback(() => {
    if (callState.callType !== 'video') return;
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    setShowControls(true);
    Animated.timing(controlsOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();

    controlsTimeout.current = setTimeout(() => {
      if (callState.status === 'connected') {
        Animated.timing(controlsOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
          setShowControls(false);
        });
      }
    }, 4500);
  }, [callState.callType, callState.status]);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    };
  }, []);

  // PiP pan responder for dragging local video tile
  const pipPanResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: Animated.event(
      [null, { dx: pipPosition.x, dy: pipPosition.y }],
      { useNativeDriver: false }
    ),
    onPanResponderRelease: () => {
      pipPosition.extractOffset();
    },
  });

  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const getStatusText = (): string => {
    switch (callState.status) {
      case 'initiating': return 'Initiating...';
      case 'ringing': return 'Ringing...';
      case 'connecting': return 'Connecting...';
      case 'connected': return formatDuration(callState.durationSeconds);
      case 'reconnecting': return 'Reconnecting...';
      case 'ended': return 'Call ended';
      case 'failed': return 'Call failed';
      case 'rejected': return 'Declined';
      case 'cancelled': return 'Cancelled';
      case 'missed': return 'Missed';
      case 'busy': return 'User is busy';
      case 'timeout': return 'No answer';
      default: return '';
    }
  };

  const remoteName =
    callState.remoteProfile?.full_name ||
    callState.remoteProfile?.username ||
    'Unknown User';

  const isVideoCall = callState.callType === 'video';
  const isConnected = callState.status === 'connected';

  const renderVideoStream = (stream: MediaStream | null, mirror: boolean, style: any) => {
    if (!stream) return null;

    if (Platform.OS === 'web') {
      return <WebVideoView stream={stream} mirror={mirror} style={style} />;
    }

    if (RTCView && (stream as any).toURL) {
      return (
        <RTCView
          streamURL={(stream as any).toURL()}
          style={style}
          mirror={mirror}
          objectFit="cover"
        />
      );
    }

    return null;
  };

  // Modern Control Dock
  const renderControls = () => (
    <Animated.View
      style={[
        styles.controlsDock,
        {
          paddingBottom: insets.bottom > 0 ? insets.bottom + 12 : 20,
          opacity: isVideoCall ? controlsOpacity : 1,
        },
      ]}
    >
      <View style={styles.dockBar}>
        {/* Mute Toggle */}
        <TouchableOpacity
          style={[styles.dockButton, callState.localMuted && styles.dockButtonActive]}
          onPress={() => callingService.toggleMute()}
          activeOpacity={0.8}
        >
          {callState.localMuted ? (
            <MicOff size={22} color="#FF3B30" />
          ) : (
            <Mic size={22} color="#FFFFFF" />
          )}
          <Text style={[styles.dockLabel, callState.localMuted && { color: '#FF3B30' }]}>
            {callState.localMuted ? 'Muted' : 'Mute'}
          </Text>
        </TouchableOpacity>

        {/* Video Toggle (Video Calls) */}
        {isVideoCall && (
          <TouchableOpacity
            style={[styles.dockButton, !callState.localVideoEnabled && styles.dockButtonActive]}
            onPress={() => callingService.toggleVideo()}
            activeOpacity={0.8}
          >
            {callState.localVideoEnabled ? (
              <Video size={22} color="#FFFFFF" />
            ) : (
              <VideoOff size={22} color="#FF3B30" />
            )}
            <Text style={[styles.dockLabel, !callState.localVideoEnabled && { color: '#FF3B30' }]}>
              {callState.localVideoEnabled ? 'Camera' : 'Off'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Camera Flip (Video Calls) */}
        {isVideoCall && (
          <TouchableOpacity
            style={styles.dockButton}
            onPress={() => callingService.switchCamera()}
            activeOpacity={0.8}
          >
            <RefreshCw size={22} color="#FFFFFF" />
            <Text style={styles.dockLabel}>Flip</Text>
          </TouchableOpacity>
        )}

        {/* Speaker Toggle */}
        <TouchableOpacity
          style={[styles.dockButton, callState.speakerEnabled && styles.dockButtonHighlight]}
          onPress={() => callingService.toggleSpeaker()}
          activeOpacity={0.8}
        >
          {callState.speakerEnabled ? (
            <Volume2 size={22} color="#FFFC00" />
          ) : (
            <VolumeX size={22} color="#8E98B7" />
          )}
          <Text style={[styles.dockLabel, callState.speakerEnabled && { color: '#FFFC00' }]}>
            {callState.speakerEnabled ? 'Speaker' : 'Speaker'}
          </Text>
        </TouchableOpacity>

        {/* Mini PiP Window Toggle */}
        <TouchableOpacity
          style={styles.dockButton}
          onPress={() => callingService.setPipMode(true)}
          activeOpacity={0.8}
        >
          <Minimize2 size={22} color="#FFFFFF" />
          <Text style={styles.dockLabel}>Mini</Text>
        </TouchableOpacity>

        {/* End Call Button */}
        <TouchableOpacity
          style={styles.endCallButton}
          onPress={() => callingService.endCall('hangup')}
          activeOpacity={0.85}
        >
          <PhoneOff size={26} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  // Video Call Mode
  if (isVideoCall) {
    return (
      <TouchableOpacity
        style={styles.videoContainer}
        activeOpacity={1}
        onPress={resetControlsTimer}
      >
        {Platform.OS !== 'web' && (
          <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        )}

        {/* Remote Fullscreen Video Stream */}
        <View style={StyleSheet.absoluteFill}>
          {remoteStream ? (
            renderVideoStream(remoteStream, false, StyleSheet.absoluteFill)
          ) : (
            <View style={styles.noVideoBackground}>
              <UserAvatar
                name={remoteName}
                avatarUrl={callState.remoteProfile?.avatar_url}
                size={110}
              />
              <Text style={styles.noVideoName}>{remoteName}</Text>
            </View>
          )}
        </View>

        {/* Top Floating Overlay */}
        {showControls && (
          <Animated.View
            style={[
              styles.topVideoOverlay,
              { paddingTop: insets.top > 0 ? insets.top + 12 : 20, opacity: controlsOpacity },
            ]}
          >
            <View style={styles.topOverlayContent}>
              <View>
                <Text style={styles.remoteNameVideo}>{remoteName}</Text>
                <Animated.Text style={[styles.statusTextVideo, { opacity: connectingAnim }]}>
                  {getStatusText()}
                </Animated.Text>
              </View>

              {isConnected && (
                <View style={styles.networkBadge}>
                  <Wifi size={14} color="#34C759" />
                  <Text style={styles.networkBadgeText}>{callState.networkQuality}</Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {/* Local Video PiP Tile */}
        {localStream && (
          <Animated.View
            style={[styles.localVideoTile, pipPosition.getLayout()]}
            {...pipPanResponder.panHandlers}
          >
            {renderVideoStream(localStream, true, styles.localVideoInner)}
          </Animated.View>
        )}

        {/* Bottom Control Dock */}
        {showControls && renderControls()}
      </TouchableOpacity>
    );
  }

  // Voice Call Mode
  return (
    <View style={styles.voiceContainer}>
      {Platform.OS !== 'web' && (
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      )}

      {/* Ambient Radial Glow */}
      <View style={styles.ambientGlow} />

      <View
        style={[
          styles.voiceContent,
          { paddingTop: insets.top > 0 ? insets.top + 28 : 40, paddingBottom: insets.bottom > 0 ? insets.bottom + 20 : 28 },
        ]}
      >
        {/* Remote User Profile Info */}
        <View style={styles.profileSection}>
          <View style={styles.avatarGlowWrapper}>
            <UserAvatar
              name={remoteName}
              avatarUrl={callState.remoteProfile?.avatar_url}
              size={128}
              style={styles.voiceAvatar}
            />
          </View>

          <Text style={styles.voiceRemoteName}>{remoteName}</Text>
          <Text style={styles.voiceRemoteUsername}>
            @{callState.remoteProfile?.username}
          </Text>

          {/* Status & Duration */}
          <View style={styles.statusBadgeRow}>
            {isConnected ? (
              <View style={styles.connectedBadge}>
                <View style={styles.livePulseDot} />
                <Text style={styles.connectedDurationText}>{getStatusText()}</Text>
              </View>
            ) : (
              <Animated.Text style={[styles.voiceStatusText, { opacity: connectingAnim }]}>
                {getStatusText()}
              </Animated.Text>
            )}
          </View>
        </View>

        {/* Bottom Dock Controls */}
        {renderControls()}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Video Mode
  videoContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
    backgroundColor: '#000000',
  },
  noVideoBackground: {
    flex: 1,
    backgroundColor: '#090B15',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  noVideoName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  topVideoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: 'rgba(9, 11, 21, 0.65)',
  },
  topOverlayContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  remoteNameVideo: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  statusTextVideo: {
    color: '#FFFC00',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.3)',
  },
  networkBadgeText: {
    color: '#34C759',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  localVideoTile: {
    position: 'absolute',
    width: 110,
    height: 160,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 252, 0, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  localVideoInner: {
    flex: 1,
  },

  // Voice Mode
  voiceContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
    backgroundColor: '#090B15',
  },
  ambientGlow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#090B15',
  },
  voiceContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  profileSection: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 60,
  },
  avatarGlowWrapper: {
    padding: 6,
    borderRadius: 74,
    borderWidth: 3,
    borderColor: '#FFFC00',
    shadowColor: '#FFFC00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  voiceAvatar: {
    borderRadius: 64,
  },
  voiceRemoteName: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 8,
  },
  voiceRemoteUsername: {
    color: '#8E98B7',
    fontSize: 15,
    fontWeight: '600',
  },
  statusBadgeRow: {
    marginTop: 12,
  },
  voiceStatusText: {
    color: '#FFFC00',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 252, 0, 0.12)',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 252, 0, 0.3)',
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
  },
  connectedDurationText: {
    color: '#FFFC00',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1.5,
    fontVariant: ['tabular-nums'] as any,
  },

  // Dock Controls
  controlsDock: {
    width: '100%',
    alignItems: 'center',
  },
  dockBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(25, 28, 50, 0.92)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  dockButton: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  dockButtonActive: {
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
  },
  dockButtonHighlight: {
    backgroundColor: 'rgba(255, 252, 0, 0.12)',
  },
  dockLabel: {
    color: '#8E98B7',
    fontSize: 10,
    fontWeight: '600',
  },
  endCallButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
    marginLeft: 6,
  },
});

export default ActiveCallScreen;
