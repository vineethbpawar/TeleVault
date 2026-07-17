/**
 * Call State Store
 *
 * Central reactive state management for the active call.
 * Uses a simple pub/sub pattern so any component can subscribe to call state.
 * This is the single source of truth for call state throughout the app.
 */

import {
  ActiveCallState,
  CallStatus,
  CallType,
  CallScope,
  CallDirection,
  NetworkQuality,
  UserCallProfile,
  IncomingCallData,
  CallParticipant,
} from '../types/call';

type StateListener = (state: ActiveCallState | null) => void;
type IncomingCallListener = (data: IncomingCallData | null) => void;

const INITIAL_CALL_STATE: ActiveCallState = {
  callId: '',
  callType: 'voice',
  callScope: 'one_to_one',
  direction: 'outgoing',
  status: 'idle',
  remoteUserId: undefined,
  remoteProfile: undefined,
  groupId: undefined,
  groupParticipants: [],
  localMuted: false,
  localVideoEnabled: true,
  speakerEnabled: false,
  cameraFacing: 'front',
  networkQuality: 'unknown',
  durationSeconds: 0,
  startedAt: undefined,
  connectedAt: undefined,
  isReconnecting: false,
  pipMode: false,
};

class CallStateStore {
  private state: ActiveCallState | null = null;
  private incomingCall: IncomingCallData | null = null;
  private stateListeners: Set<StateListener> = new Set();
  private incomingCallListeners: Set<IncomingCallListener> = new Set();
  private durationTimer: ReturnType<typeof setInterval> | null = null;

  // ─── State Access ──────────────────────────────────────────────────────────

  getState(): ActiveCallState | null {
    return this.state;
  }

  getIncomingCall(): IncomingCallData | null {
    return this.incomingCall;
  }

  isInCall(): boolean {
    return (
      this.state !== null &&
      this.state.status !== 'idle' &&
      this.state.status !== 'ended' &&
      this.state.status !== 'failed' &&
      this.state.status !== 'cancelled'
    );
  }

  // ─── Subscriptions ─────────────────────────────────────────────────────────

  subscribe(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  subscribeToIncomingCall(listener: IncomingCallListener): () => void {
    this.incomingCallListeners.add(listener);
    return () => this.incomingCallListeners.delete(listener);
  }

  // ─── State Mutations ───────────────────────────────────────────────────────

  private notify(): void {
    this.stateListeners.forEach((l) => l(this.state));
  }

  private notifyIncomingCall(): void {
    this.incomingCallListeners.forEach((l) => l(this.incomingCall));
  }

  private update(patch: Partial<ActiveCallState>): void {
    if (!this.state) return;
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  initOutgoingCall(params: {
    callId: string;
    callType: CallType;
    callScope: CallScope;
    remoteUserId: string;
    remoteProfile: UserCallProfile;
    groupId?: string;
  }): void {
    this.state = {
      ...INITIAL_CALL_STATE,
      callId: params.callId,
      callType: params.callType,
      callScope: params.callScope,
      direction: 'outgoing',
      status: 'initiating',
      remoteUserId: params.remoteUserId,
      remoteProfile: params.remoteProfile,
      groupId: params.groupId,
      localVideoEnabled: params.callType === 'video',
      startedAt: Date.now(),
    };
    this.notify();
  }

  initIncomingCall(params: {
    callId: string;
    callType: CallType;
    callScope: CallScope;
    remoteUserId: string;
    remoteProfile: UserCallProfile;
    groupId?: string;
  }): void {
    this.state = {
      ...INITIAL_CALL_STATE,
      callId: params.callId,
      callType: params.callType,
      callScope: params.callScope,
      direction: 'incoming',
      status: 'ringing',
      remoteUserId: params.remoteUserId,
      remoteProfile: params.remoteProfile,
      groupId: params.groupId,
      localVideoEnabled: params.callType === 'video',
      startedAt: Date.now(),
    };
    this.notify();
  }

  setStatus(status: CallStatus): void {
    if (!this.state) return;

    const patch: Partial<ActiveCallState> = { status };

    if (status === 'connected' && !this.state.connectedAt) {
      patch.connectedAt = Date.now();
      this.startDurationTimer();
    }

    if (
      status === 'ended' ||
      status === 'failed' ||
      status === 'rejected' ||
      status === 'cancelled' ||
      status === 'missed' ||
      status === 'busy'
    ) {
      this.stopDurationTimer();
    }

    this.update(patch);
  }

  setMuted(muted: boolean): void {
    this.update({ localMuted: muted });
  }

  setVideoEnabled(enabled: boolean): void {
    this.update({ localVideoEnabled: enabled });
  }

  setSpeaker(enabled: boolean): void {
    this.update({ speakerEnabled: enabled });
  }

  setCameraFacing(facing: 'front' | 'back'): void {
    this.update({ cameraFacing: facing });
  }

  setNetworkQuality(quality: NetworkQuality): void {
    this.update({ networkQuality: quality });
  }

  setReconnecting(reconnecting: boolean): void {
    this.update({ isReconnecting: reconnecting });
  }

  setPipMode(pip: boolean): void {
    this.update({ pipMode: pip });
  }

  updateGroupParticipants(participants: CallParticipant[]): void {
    this.update({ groupParticipants: participants });
  }

  // ─── Incoming Call ─────────────────────────────────────────────────────────

  setIncomingCall(data: IncomingCallData | null): void {
    this.incomingCall = data;
    this.notifyIncomingCall();
  }

  // ─── Duration Timer ────────────────────────────────────────────────────────

  private startDurationTimer(): void {
    this.stopDurationTimer();
    this.durationTimer = setInterval(() => {
      if (this.state?.connectedAt) {
        const seconds = Math.floor((Date.now() - this.state.connectedAt) / 1000);
        this.update({ durationSeconds: seconds });
      }
    }, 1000);
  }

  private stopDurationTimer(): void {
    if (this.durationTimer) {
      clearInterval(this.durationTimer);
      this.durationTimer = null;
    }
  }

  // ─── Reset ─────────────────────────────────────────────────────────────────

  reset(): void {
    this.stopDurationTimer();
    this.state = null;
    this.incomingCall = null;
    this.notify();
    this.notifyIncomingCall();
  }
}

export const callStateStore = new CallStateStore();
export default callStateStore;
