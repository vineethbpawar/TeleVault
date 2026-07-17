/**
 * Incoming Call Screen
 *
 * Displays when someone calls the current user.
 * Shows caller info, call type, accept/decline buttons.
 * Supports swipe gestures, animations, ringtone.
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
  const slideAnim = useRef(new Animated.Value(100)).current;

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

    // Pulse animation for avatar
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
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

  const callTypeLabel =
    incomingCall.callType === 'video' ? '📹 Incoming Video Call' : '📞 Incoming Voice Call';

  const callerName =
    incomingCall.callerProfile.full_name ||
    incomingCall.callerProfile.username ||
    'Unknown';

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {Platform.OS !== 'web' && <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />}

      {/* Background gradient overlay */}
      <View style={styles.gradient} />

      {/* Content */}
      <View
        style={[
          styles.content,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 },
        ]}
      >
        {/* Call type */}
        <Text style={styles.callTypeLabel}>{callTypeLabel}</Text>

        {/* Avatar with pulse */}
        <View style={styles.avatarSection}>
          <Animated.View
            style={[
              styles.avatarRing3,
              {
                transform: [{ scale: pulseAnim }],
                opacity: 0.12,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.avatarRing2,
              {
                transform: [{ scale: pulseAnim }],
                opacity: 0.2,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.avatarRing1,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <UserAvatar
              name={callerName}
              avatarUrl={incomingCall.callerProfile.avatar_url}
              size={120}
            />
          </Animated.View>
        </View>

        {/* Caller info */}
        <Text style={styles.callerName}>{callerName}</Text>
        <Text style={styles.callerUsername}>@{incomingCall.callerProfile.username}</Text>

        <Text style={styles.statusText}>
          {incomingCall.callScope === 'group' ? 'Group call' : 'Calling you...'}
        </Text>

        {/* Controls */}
        <Animated.View
          style={[
            styles.controls,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Decline */}
          <TouchableOpacity
            style={[styles.actionButton, styles.declineButton]}
            onPress={handleDecline}
            activeOpacity={0.85}
          >
            <Text style={styles.actionIcon}>✕</Text>
          </TouchableOpacity>

          {/* Accept */}
          <TouchableOpacity
            style={[styles.actionButton, styles.acceptButton]}
            onPress={handleAccept}
            activeOpacity={0.85}
          >
            <Text style={styles.actionIcon}>
              {incomingCall.callType === 'video' ? '📹' : '📞'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Hint */}
        <Text style={styles.hint}>Swipe or tap buttons</Text>
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
    backgroundColor: '#0A0D1F',
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0A0D1F',
    opacity: 0.97,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  callTypeLabel: {
    color: '#A0A8C0',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  avatarSection: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 200,
    height: 200,
  },
  avatarRing3: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#4F6FFF',
    opacity: 0.1,
  },
  avatarRing2: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#4F6FFF',
    opacity: 0.2,
  },
  avatarRing1: {
    width: 128,
    height: 128,
    borderRadius: 64,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#4F6FFF',
  },
  callerName: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 16,
    letterSpacing: -0.5,
  },
  callerUsername: {
    color: '#A0A8C0',
    fontSize: 16,
    marginTop: 4,
  },
  statusText: {
    color: '#6B7FCC',
    fontSize: 14,
    marginTop: 8,
    letterSpacing: 1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 60,
    paddingHorizontal: 40,
  },
  actionButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  declineButton: {
    backgroundColor: '#FF3B30',
    shadowColor: '#FF3B30',
  },
  acceptButton: {
    backgroundColor: '#34C759',
    shadowColor: '#34C759',
  },
  actionIcon: {
    fontSize: 28,
  },
  hint: {
    color: '#404868',
    fontSize: 12,
    marginTop: 8,
  },
});

export default IncomingCallScreen;
