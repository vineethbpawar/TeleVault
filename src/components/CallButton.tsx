/**
 * Call Button Component
 *
 * Reusable call button for voice/video calls.
 * Used in chat headers, user profiles, etc.
 */

import React, { useState } from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Text,
  View,
} from 'react-native';
import { callingService } from '../services/callingService';
import { callStateStore } from '../services/callStateStore';
import { UserCallProfile, CallType } from '../types/call';

interface CallButtonProps {
  targetUserId: string;
  targetProfile: UserCallProfile;
  callType: CallType;
  size?: number;
  style?: any;
  showLabel?: boolean;
}

const CallButton: React.FC<CallButtonProps> = ({
  targetUserId,
  targetProfile,
  callType,
  size = 40,
  style,
  showLabel = false,
}) => {
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    if (callStateStore.isInCall()) {
      Alert.alert('Already in a call', 'Please end the current call first.');
      return;
    }

    setLoading(true);
    try {
      const success = await callingService.initiateCall({
        targetUserId,
        targetProfile,
        callType,
      });

      if (!success) {
        Alert.alert(
          'Call failed',
          'Could not start the call. Please check your microphone permission and try again.'
        );
      }
    } catch (err) {
      console.error('[CallButton] initiateCall error:', err);
      Alert.alert('Error', 'An unexpected error occurred while starting the call.');
    } finally {
      setLoading(false);
    }
  };

  const icon = callType === 'video' ? '📹' : '📞';
  const label = callType === 'video' ? 'Video' : 'Call';

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        style,
      ]}
      onPress={handlePress}
      disabled={loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color="#FFFC00" size="small" />
      ) : (
        <View style={styles.inner}>
          <Text style={[styles.icon, { fontSize: size * 0.45 }]}>{icon}</Text>
          {showLabel && <Text style={styles.label}>{label}</Text>}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'rgba(79, 111, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(79, 111, 255, 0.3)',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    lineHeight: undefined,
  },
  label: {
    color: '#A0A8C0',
    fontSize: 9,
    marginTop: 1,
  },
});

export default CallButton;
