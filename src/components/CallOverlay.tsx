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
import * as Notifications from 'expo-notifications';
import { useCallState } from '../hooks/useCallState';
import { callingService } from '../services/callingService';
import { callStateStore } from '../services/callStateStore';
import IncomingCallScreen from '../screens/IncomingCallScreen';
import ActiveCallScreen from '../screens/ActiveCallScreen';
import MiniCallWindow from './MiniCallWindow';
import { CallType, CallScope, UserCallProfile, IncomingCallData } from '../types/call';

const CallOverlay: React.FC = () => {
  const { callState, incomingCall } = useCallState();
  const [showFullCall, setShowFullCall] = useState(true);

  // Initialize calling service and notification listeners
  useEffect(() => {
    callingService.initialize().catch((err) => {
      console.error('[CallOverlay] callingService.initialize error:', err);
    });

    // Check if the app was launched by a notification click (cold start)
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationResponse(response);
      }
    });

    // Listen for incoming call notifications received in foreground
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as any;
      if (data && data.type === 'incoming_call') {
        if (!callStateStore.isInCall()) {
          const incomingData: IncomingCallData = {
            callId: data.callId as string,
            callType: data.callType as CallType,
            callScope: (data.callScope || 'one_to_one') as CallScope,
            callerId: data.callerId as string,
            callerProfile: (data.callerProfile || {
              id: data.callerId,
              username: data.callerName || 'Unknown Caller',
            }) as UserCallProfile,
            groupId: data.groupId as string | undefined,
            offerSdp: data.offerSdp as string | undefined,
            timestamp: Date.now(),
          };
          callStateStore.setIncomingCall(incomingData);
        }
      }
    });

    // Listen for notification responses (clicks / actions)
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationResponse(response);
    });

    function handleNotificationResponse(response: Notifications.NotificationResponse) {
      const data = response.notification.request.content.data as any;
      if (data && data.type === 'incoming_call') {
        const incomingData: IncomingCallData = {
          callId: data.callId as string,
          callType: data.callType as CallType,
          callScope: (data.callScope || 'one_to_one') as CallScope,
          callerId: data.callerId as string,
          callerProfile: (data.callerProfile || {
            id: data.callerId,
            username: data.callerName || 'Unknown Caller',
          }) as UserCallProfile,
          groupId: data.groupId as string | undefined,
          offerSdp: data.offerSdp as string | undefined,
          timestamp: Date.now(),
        };

        const actionId = response.actionIdentifier;
        if (actionId === 'answer') {
          // Immediately accept the call!
          callingService.acceptCall(incomingData);
        } else if (actionId === 'decline') {
          // Reject the call
          callingService.rejectCall(incomingData);
        } else {
          // Regular tap on notification: open call screen
          callStateStore.setIncomingCall(incomingData);
        }
      }
    }

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
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
