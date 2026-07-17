/**
 * useCallState Hook
 *
 * React hook to subscribe to the active call state store.
 * Returns the current call state and incoming call data.
 */

import { useEffect, useState } from 'react';
import { callStateStore } from '../services/callStateStore';
import { ActiveCallState, IncomingCallData } from '../types/call';

export function useCallState(): {
  callState: ActiveCallState | null;
  incomingCall: IncomingCallData | null;
  isInCall: boolean;
} {
  const [callState, setCallState] = useState<ActiveCallState | null>(
    callStateStore.getState()
  );
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(
    callStateStore.getIncomingCall()
  );

  useEffect(() => {
    const unsubState = callStateStore.subscribe(setCallState);
    const unsubIncoming = callStateStore.subscribeToIncomingCall(setIncomingCall);

    return () => {
      unsubState();
      unsubIncoming();
    };
  }, []);

  return {
    callState,
    incomingCall,
    isInCall: callStateStore.isInCall(),
  };
}

export default useCallState;
