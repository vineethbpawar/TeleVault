/**
 * Active Call Screen
 *
 * The main call UI displayed during an active voice or video call.
 * Features:
 * - Video tiles (local + remote)
 * - Voice call UI with avatar
 * - Call controls (mute, speaker, camera, flip, end)
 * - Network quality indicator
 * - Duration timer
 * - Picture-in-Picture mode
 * - Animated connection states
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
import { ActiveCallState, NetworkQuality } from '../types/call';
import { UserAvatar } from '../components/UserAvatar';
import { callingService } from '../services/callingService';
import { webRTCPeerService } from '../services/webrtcPeerService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Conditionally import RTCView
let RTCView: any = null;

if (Platform.OS !== 'web') {
  try {
    RTCView = require('react-native-webrtc').RTCView;
  } catch (_) {}
}

// Web RTCView substitute
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
      muted={mirror} // local video is muted
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
  const connectingAnim = useRef(new Animated.Value(0)).current;

  // PiP position
  const pipPosition = useRef(new Animated.ValueXY({ x: SCREEN_WIDTH - 130, y: 80 })).current;

  useEffect(() => {
    // Get streams from peer service
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

  // Connecting animation
  useEffect(() => {
    if (callState.status === 'connecting' || callState.status === 'ringing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(connectingAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(connectingAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      connectingAnim.setValue(1);
    }
  }, [callState.status]);

  // Auto-hide controls for video calls
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
    }, 4000);
  }, [callState.callType, callState.status]);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    };
  }, []);

  // PiP pan responder
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

  // ─── Duration Formatting ──────────────────────────────────────────────────

  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // ─── Network Quality Display ──────────────────────────────────────────────

  const getNetworkQualityColor = (quality: NetworkQuality): string => {
    switch (quality) {
      case 'excellent': return '#34C759';
      case 'good': return '#30D158';
      case 'fair': return '#FF9F0A';
      case 'poor': return '#FF3B30';
      default: return '#A0A8C0';
    }
  };

  const getNetworkQualityBars = (quality: NetworkQuality): number => {
    switch (quality) {
      case 'excellent': return 4;
      case 'good': return 3;
      case 'fair': return 2;
      case 'poor': return 1;
      default: return 0;
    }
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
    'Unknown';

  const isVideoCall = callState.callType === 'video';
  const isConnected = callState.status === 'connected';

  // ─── Render Video Call ───────────────────────────────────────────────────

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

  // ─── Controls ────────────────────────────────────────────────────────────

  const renderControls = () => (
    <Animated.View
      style={[
        styles.controls,
        {
          paddingBottom: insets.bottom + 20,
          opacity: isVideoCall ? controlsOpacity : 1,
        },
      ]}
    >
      {/* Row 1: Secondary controls */}
      <View style={styles.controlRow}>
        {/* Speaker */}
        <ControlButton
          icon={callState.speakerEnabled ? '🔊' : '🔈'}
          label={callState.speakerEnabled ? 'Speaker' : 'Earpiece'}
          active={callState.speakerEnabled}
          onPress={() => callingService.toggleSpeaker()}
        />

        {/* Camera flip (video only) */}
        {isVideoCall && (
          <ControlButton
            icon="🔄"
            label="Flip"
            onPress={() => callingService.switchCamera()}
          />
        )}

        {/* Video toggle (video only) */}
        {isVideoCall && (
          <ControlButton
            icon={callState.localVideoEnabled ? '📹' : '📷'}
            label={callState.localVideoEnabled ? 'Camera on' : 'Camera off'}
            active={!callState.localVideoEnabled}
            onPress={() => callingService.toggleVideo()}
          />
        )}
      </View>

      {/* Row 2: Main controls */}
      <View style={styles.controlRow}>
        {/* Mute */}
        <ControlButton
          icon={callState.localMuted ? '🎙️' : '🎤'}
          label={callState.localMuted ? 'Unmute' : 'Mute'}
          active={callState.localMuted}
          onPress={() => callingService.toggleMute()}
        />

        {/* End call */}
        <TouchableOpacity
          style={styles.endCallButton}
          onPress={() => callingService.endCall('hangup')}
          activeOpacity={0.85}
        >
          <Text style={styles.endCallIcon}>📵</Text>
        </TouchableOpacity>

        {/* PiP mode */}
        <ControlButton
          icon="⊞"
          label="Mini"
          onPress={() => callingService.setPipMode(true)}
        />
      </View>
    </Animated.View>
  );

  // ─── Main Render ─────────────────────────────────────────────────────────

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

        {/* Remote video (full screen) */}
        <View style={StyleSheet.absoluteFill}>
          {remoteStream ? (
            renderVideoStream(remoteStream, false, StyleSheet.absoluteFill)
          ) : (
            <View style={styles.noVideoBackground}>
              <UserAvatar
                name={remoteName}
                avatarUrl={callState.remoteProfile?.avatar_url}
                size={120}
              />
            </View>
          )}
        </View>

        {/* Top overlay */}
        {showControls && (
          <Animated.View
            style={[styles.topOverlay, { paddingTop: insets.top + 12, opacity: controlsOpacity }]}
          >
            <Text style={styles.remoteNameVideo}>{remoteName}</Text>
            <View style={styles.statusRow}>
              {callState.isReconnecting && (
                <Text style={styles.reconnectingText}>🔄 Reconnecting...</Text>
              )}
              <Animated.Text
                style={[styles.statusTextVideo, { opacity: connectingAnim }]}
              >
                {getStatusText()}
              </Animated.Text>
              <NetworkQualityIcon
                quality={callState.networkQuality}
                color={getNetworkQualityColor(callState.networkQuality)}
                bars={getNetworkQualityBars(callState.networkQuality)}
              />
            </View>
          </Animated.View>
        )}

        {/* Local video (PiP tile) */}
        {localStream && (
          <Animated.View
            style={[styles.localVideoTile, pipPosition.getLayout()]}
            {...pipPanResponder.panHandlers}
          >
            {renderVideoStream(localStream, true, styles.localVideoInner)}
          </Animated.View>
        )}

        {/* Controls overlay */}
        {showControls && renderControls()}
      </TouchableOpacity>
    );
  }

  // ─── Voice Call UI ────────────────────────────────────────────────────────

  return (
    <View style={styles.voiceContainer}>
      {Platform.OS !== 'web' && (
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      )}

      <View
        style={[styles.voiceContent, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
      >
        {/* Remote info */}
        <View style={styles.voiceAvatarSection}>
          <UserAvatar
            name={remoteName}
            avatarUrl={callState.remoteProfile?.avatar_url}
            size={128}
            style={styles.voiceAvatar}
          />
          <Text style={styles.voiceRemoteName}>{remoteName}</Text>
          <Text style={styles.voiceRemoteUsername}>
            @{callState.remoteProfile?.username}
          </Text>

          {/* Status / timer */}
          <View style={styles.statusRow}>
            {callState.isReconnecting && (
              <Text style={styles.reconnectingText}>🔄 </Text>
            )}
            <Animated.Text
              style={[
                styles.voiceStatusText,
                isConnected
                  ? styles.connectedStatus
                  : { opacity: connectingAnim },
              ]}
            >
              {getStatusText()}
            </Animated.Text>
          </View>

          {/* Network quality */}
          {isConnected && (
            <View style={styles.networkRow}>
              <NetworkQualityIcon
                quality={callState.networkQuality}
                color={getNetworkQualityColor(callState.networkQuality)}
                bars={getNetworkQualityBars(callState.networkQuality)}
              />
              <Text
                style={[
                  styles.networkLabel,
                  { color: getNetworkQualityColor(callState.networkQuality) },
                ]}
              >
                {callState.networkQuality !== 'unknown' ? callState.networkQuality : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Controls */}
        {renderControls()}
      </View>
    </View>
  );
};

// ─── Sub-components ────────────────────────────────────────────────────────

interface ControlButtonProps {
  icon: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}

const ControlButton: React.FC<ControlButtonProps> = ({
  icon,
  label,
  onPress,
  active = false,
  disabled = false,
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.9, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[styles.controlButton, active && styles.controlButtonActive]}
        onPress={handlePress}
        disabled={disabled}
        activeOpacity={0.85}
      >
        <Text style={styles.controlIcon}>{icon}</Text>
        <Text style={[styles.controlLabel, active && styles.controlLabelActive]}>
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

interface NetworkQualityIconProps {
  quality: NetworkQuality;
  color: string;
  bars: number;
}

const NetworkQualityIcon: React.FC<NetworkQualityIconProps> = ({ bars, color }) => {
  if (bars === 0) return null;
  return (
    <View style={styles.networkBars}>
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={[
            styles.networkBar,
            {
              height: 4 + i * 3,
              backgroundColor: i <= bars ? color : '#333',
              opacity: i <= bars ? 1 : 0.3,
            },
          ]}
        />
      ))}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Video call
  videoContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
    backgroundColor: '#000',
  },
  noVideoBackground: {
    flex: 1,
    backgroundColor: '#0A0D1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  remoteNameVideo: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  statusTextVideo: {
    color: '#E0E0E0',
    fontSize: 14,
    marginTop: 4,
  },
  localVideoTile: {
    position: 'absolute',
    width: 110,
    height: 165,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFFFFF40',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  localVideoInner: {
    flex: 1,
  },

  // Voice call
  voiceContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
    backgroundColor: '#0A0D1F',
  },
  voiceContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voiceAvatarSection: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    gap: 12,
  },
  voiceAvatar: {
    borderWidth: 3,
    borderColor: '#4F6FFF',
  },
  voiceRemoteName: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  voiceRemoteUsername: {
    color: '#A0A8C0',
    fontSize: 15,
  },
  voiceStatusText: {
    color: '#8891B0',
    fontSize: 16,
    letterSpacing: 1,
  },
  connectedStatus: {
    color: '#FFFC00',
    fontWeight: '600',
    fontVariant: ['tabular-nums'] as any,
    fontSize: 22,
    letterSpacing: 2,
  },

  // Shared
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reconnectingText: {
    color: '#FF9F0A',
    fontSize: 14,
  },
  networkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  networkLabel: {
    fontSize: 12,
    textTransform: 'capitalize',
  },
  networkBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  networkBar: {
    width: 3,
    borderRadius: 1,
  },

  // Controls
  controls: {
    width: '100%',
    paddingHorizontal: 24,
    gap: 16,
    alignItems: 'center',
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    width: '100%',
  },
  controlButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  controlButtonActive: {
    backgroundColor: 'rgba(255, 252, 0, 0.18)',
    borderWidth: 1,
    borderColor: '#FFFC00',
  },
  controlIcon: {
    fontSize: 24,
  },
  controlLabel: {
    color: '#A0A8C0',
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
  },
  controlLabelActive: {
    color: '#FFFC00',
  },
  endCallButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  endCallIcon: {
    fontSize: 32,
  },
});

export default ActiveCallScreen;
