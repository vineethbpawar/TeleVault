/**
 * Mini Floating Call Window (PiP)
 *
 * A compact draggable floating window displayed when the user navigates
 * away from the call screen during an active call.
 * Tapping it returns to the full call screen.
 */

import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  Platform,
  Dimensions,
} from 'react-native';
import { ActiveCallState } from '../types/call';
import { callingService } from '../services/callingService';
import { callStateStore } from '../services/callStateStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const MINI_WIDTH = 180;
const MINI_HEIGHT = 60;

interface MiniCallWindowProps {
  callState: ActiveCallState;
  onExpand: () => void;
}

const MiniCallWindow: React.FC<MiniCallWindowProps> = ({ callState, onExpand }) => {
  const position = useRef(
    new Animated.ValueXY({
      x: SCREEN_WIDTH - MINI_WIDTH - 16,
      y: SCREEN_HEIGHT - MINI_HEIGHT - 100,
    })
  ).current;

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      position.setOffset({
        x: (position.x as any)._value,
        y: (position.y as any)._value,
      });
      position.setValue({ x: 0, y: 0 });
    },
    onPanResponderMove: Animated.event(
      [null, { dx: position.x, dy: position.y }],
      { useNativeDriver: false }
    ),
    onPanResponderRelease: (_, gesture) => {
      position.flattenOffset();

      // Snap to edge
      const currentX = (position.x as any)._value;
      const currentY = (position.y as any)._value;

      const targetX = currentX < SCREEN_WIDTH / 2 ? 16 : SCREEN_WIDTH - MINI_WIDTH - 16;
      const targetY = Math.max(80, Math.min(SCREEN_HEIGHT - MINI_HEIGHT - 80, currentY));

      Animated.spring(position, {
        toValue: { x: targetX, y: targetY },
        useNativeDriver: false,
        tension: 100,
        friction: 15,
      }).start();
    },
  });

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const remoteName =
    callState.remoteProfile?.username || 'Call';

  return (
    <Animated.View
      style={[
        styles.container,
        position.getLayout(),
      ]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity
        style={styles.inner}
        onPress={onExpand}
        activeOpacity={0.9}
      >
        {/* Call type icon */}
        <View style={styles.iconContainer}>
          <Text style={styles.callIcon}>
            {callState.callType === 'video' ? '📹' : '📞'}
          </Text>
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {remoteName}
          </Text>
          <Text style={styles.duration}>
            {callState.status === 'connected'
              ? formatDuration(callState.durationSeconds)
              : callState.status === 'reconnecting'
              ? 'Reconnecting...'
              : callState.status === 'ringing'
              ? 'Ringing...'
              : 'Connecting...'}
          </Text>
        </View>

        {/* End call */}
        <TouchableOpacity
          style={styles.endButton}
          onPress={() => callingService.endCall('hangup')}
          activeOpacity={0.85}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.endIcon}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: MINI_WIDTH,
    height: MINI_HEIGHT,
    zIndex: 9997,
  },
  inner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1F38',
    borderRadius: 30,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 12,
    borderWidth: 1,
    borderColor: '#2A3060',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#34C759',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callIcon: {
    fontSize: 18,
  },
  info: {
    flex: 1,
    marginLeft: 10,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  duration: {
    color: '#A0A8C0',
    fontSize: 11,
    fontVariant: ['tabular-nums'] as any,
  },
  endButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  endIcon: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default MiniCallWindow;
