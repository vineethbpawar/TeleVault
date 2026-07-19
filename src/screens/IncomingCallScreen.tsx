/**
 * Incoming Call Screen
 *
 * Displays when someone calls the current user.
 * Features modern glassmorphism aesthetic, Lucide vector icons, and smooth animations.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Phone, PhoneOff, Video } from 'lucide-react-native';
import { IncomingCallData } from '../types/call';
import { UserAvatar } from '../components/UserAvatar';
import { callingService } from '../services/callingService';
import { callStateStore } from '../services/callStateStore';

interface IncomingCallScreenProps {
  incomingCall: IncomingCallData;
}

const IncomingCallScreen: React.FC<IncomingCallScreenProps> = ({ incomingCall }) => {
  const insets = useSafeAreaInsets();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(60)).current;

  useEffect(() => {
    // Fade in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Slide up controls
    Animated.spring(slideAnim, {
      toValue: 0,
      tension: 80,
      friction: 10,
      useNativeDriver: true,
    }).start();

    // Pulse animation for avatar rings
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.18,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    return () => pulse.stop();
  }, []);

  const handleAccept = async () => {
    callStateStore.setIncomingCall(null);
    await callingService.acceptCall(incomingCall);
  };

  const handleDecline = async () => {
    await callingService.rejectCall(incomingCall);
  };

  const isVideo = incomingCall.callType === 'video';
  const callTypeLabel = isVideo ? 'INCOMING VIDEO CALL' : 'INCOMING VOICE CALL';

  const callerName =
    incomingCall.callerProfile.full_name ||
    incomingCall.callerProfile.username ||
    'Unknown User';

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {Platform.OS !== 'web' && (
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      )}

      {/* Ambient glassmorphic backdrop glow */}
      <View style={styles.glowBackdrop} />

      {/* Main Content Card */}
      <View
        style={[
          styles.content,
          { paddingTop: insets.top > 0 ? insets.top + 24 : 40, paddingBottom: insets.bottom > 0 ? insets.bottom + 32 : 40 },
        ]}
      >
        {/* Top Header Badge */}
        <View style={styles.headerBadge}>
          {isVideo ? <Video size={14} color="#FFFC00" /> : <Phone size={14} color="#FFFC00" />}
          <Text style={styles.callTypeLabel}>{callTypeLabel}</Text>
        </View>

        {/* Center Profile Avatar with Pulse Effect */}
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <Animated.View
              style={[
                styles.pulseRingOuter,
                { transform: [{ scale: pulseAnim }] },
              ]}
            />
            <Animated.View
              style={[
                styles.pulseRingInner,
                { transform: [{ scale: pulseAnim }] },
              ]}
            />
            <View style={styles.avatarBorder}>
              <UserAvatar
                name={callerName}
                avatarUrl={incomingCall.callerProfile.avatar_url}
                size={120}
              />
            </View>
          </View>

          {/* Caller Details */}
          <Text style={styles.callerName}>{callerName}</Text>
          <Text style={styles.callerUsername}>@{incomingCall.callerProfile.username}</Text>
          <Text style={styles.statusText}>
            {incomingCall.callScope === 'group' ? 'Group Call' : 'Ringing...'}
          </Text>
        </View>

        {/* Action Controls */}
        <Animated.View
          style={[
            styles.controlsContainer,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Decline Button */}
          <View style={styles.actionItem}>
            <TouchableOpacity
              style={[styles.actionButton, styles.declineButton]}
              onPress={handleDecline}
              activeOpacity={0.82}
            >
              <PhoneOff size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.actionLabel}>Decline</Text>
          </View>

          {/* Accept Button */}
          <View style={styles.actionItem}>
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={handleAccept}
              activeOpacity={0.82}
            >
              {isVideo ? (
                <Video size={28} color="#000000" />
              ) : (
                <Phone size={28} color="#000000" />
              )}
            </TouchableOpacity>
            <Text style={[styles.actionLabel, { color: '#34C759' }]}>Accept</Text>
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    backgroundColor: '#090B15',
  },
  glowBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#090B15',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 252, 0, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 252, 0, 0.25)',
  },
  callTypeLabel: {
    color: '#FFFC00',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  profileSection: {
    alignItems: 'center',
    gap: 8,
  },
  avatarContainer: {
    width: 190,
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  pulseRingOuter: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(79, 111, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(79, 111, 255, 0.3)',
  },
  pulseRingInner: {
    position: 'absolute',
    width: 156,
    height: 156,
    borderRadius: 78,
    backgroundColor: 'rgba(255, 252, 0, 0.12)',
  },
  avatarBorder: {
    width: 126,
    height: 126,
    borderRadius: 63,
    borderWidth: 3,
    borderColor: '#FFFC00',
    overflow: 'hidden',
    shadowColor: '#FFFC00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  callerName: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  callerUsername: {
    color: '#8E98B7',
    fontSize: 15,
    fontWeight: '600',
  },
  statusText: {
    color: '#FFFC00',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 4,
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 48,
    width: '100%',
    paddingBottom: 16,
  },
  actionItem: {
    alignItems: 'center',
    gap: 10,
  },
  actionButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  declineButton: {
    backgroundColor: '#FF3B30',
    shadowColor: '#FF3B30',
  },
  acceptButton: {
    backgroundColor: '#34C759',
    shadowColor: '#34C759',
  },
  actionLabel: {
    color: '#FF3B30',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

export default IncomingCallScreen;
