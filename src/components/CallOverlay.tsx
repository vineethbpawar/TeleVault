/**
 * Call Overlay
 *
 * Global overlay component that sits on top of everything in the app.
 * Displays:
 * - Incoming call screen (modal)
 * - Active call screen (full screen)
 * - Mini floating call window (PiP)
 *
 * This should be rendered in App.tsx or AppNavigator at the root level.
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useCallState } from '../hooks/useCallState';
import { callingService } from '../services/callingService';
import IncomingCallScreen from '../screens/IncomingCallScreen';
import ActiveCallScreen from '../screens/ActiveCallScreen';
import MiniCallWindow from './MiniCallWindow';

const CallOverlay: React.FC = () => {
  const { callState, incomingCall } = useCallState();
  const [showFullCall, setShowFullCall] = useState(true);

  // Initialize calling service
  useEffect(() => {
    callingService.initialize().catch((err) => {
      console.error('[CallOverlay] callingService.initialize error:', err);
    });

    return () => {
      // Do not cleanup on unmount since the overlay lives for the app lifetime
    };
  }, []);

  // Show full call screen when call starts or PiP mode disabled
  useEffect(() => {
    if (callState) {
      if (!callState.pipMode) {
        setShowFullCall(true);
      }
    }
  }, [callState?.callId, callState?.pipMode]);

  const handleExpandFromPip = () => {
    callingService.setPipMode(false);
    setShowFullCall(true);
  };

  // Determine what to render
  const showIncoming = !!incomingCall && !callState;
  const showActiveCall = !!callState && !callState.pipMode &&
    callState.status !== 'idle' && callState.status !== 'ended' &&
    callState.status !== 'failed' && callState.status !== 'cancelled' &&
    callState.status !== 'rejected' && callState.status !== 'missed' &&
    callState.status !== 'busy' && callState.status !== 'timeout';
  const showMini = !!callState && callState.pipMode &&
    callState.status !== 'idle' && callState.status !== 'ended' &&
    callState.status !== 'failed';

  return (
    <>
      {showIncoming && incomingCall && (
        <IncomingCallScreen incomingCall={incomingCall} />
      )}

      {showActiveCall && callState && (
        <ActiveCallScreen callState={callState} />
      )}

      {showMini && callState && (
        <MiniCallWindow
          callState={callState}
          onExpand={handleExpandFromPip}
        />
      )}
    </>
  );
};

export default CallOverlay;
