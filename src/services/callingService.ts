/**
 * Calling Service
 *
 * The central orchestrator for all call functionality.
 * Coordinates: WebRTC peer connection, signaling, audio, state, history.
 *
 * Call Flow:
 * Outgoing: initiate → createOffer → sendOffer → waitForAnswer → connected
 * Incoming: receiveRing → showIncomingUI → accept → createAnswer → connected
 */

import { supabase } from '../lib/supabase';
import { webRTCPeerService } from './webrtcPeerService';
import { signalingService } from './signalingService';
import { callStateStore } from './callStateStore';
import { callHistoryService } from './callHistoryService';
import { audioManager } from './audioManager';
import { callPermissionsService } from './callPermissionsService';
import { notificationService } from './notificationService';
import {
  CallType,
  CallScope,
  UserCallProfile,
  SignalingPayload,
  IncomingCallData,
  NetworkQuality,
} from '../types/call';

// Call timeout: 45 seconds
const CALL_TIMEOUT_MS = 45_000;
// Reconnect max attempts
const MAX_RECONNECT_ATTEMPTS = 3;
// ICE restart delay
const ICE_RESTART_DELAY_MS = 2000;

class CallingService {
  private currentUserId: string | null = null;
  private currentUserProfile: UserCallProfile | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private reconnectHandle: ReturnType<typeof setTimeout> | null = null;
  private isInitialized = false;

  // ─── Initialization ────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    this.currentUserId = user.id;

    // Fetch profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id,username,full_name,avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    this.currentUserProfile = profile as UserCallProfile | null;

    // Subscribe to incoming calls on user's personal channel
    signalingService.subscribeToUserCalls(user.id, this.handleSignalingEvent.bind(this));

    // Setup WebRTC peer events
    this.setupPeerEvents();

    this.isInitialized = true;
  }

  private setupPeerEvents(): void {
    webRTCPeerService.on('localStream', () => {
      // Local stream available - no-op here, UI handles streams
    });

    webRTCPeerService.on('remoteStream', () => {
      // Remote stream available
    });

    webRTCPeerService.on('connectionStateChange', (state: RTCPeerConnectionState) => {
      this.handleConnectionStateChange(state);
    });

    webRTCPeerService.on('iceConnectionStateChange', (state: RTCIceConnectionState) => {
      this.handleIceConnectionStateChange(state);
    });

    webRTCPeerService.on('iceCandidate', (candidate) => {
      const callState = callStateStore.getState();
      if (!callState || !this.currentUserId) return;

      const remoteId = callState.remoteUserId;
      if (!remoteId) return;

      // Send ICE candidate via signaling
      signalingService.sendIceCandidate({
        callId: callState.callId,
        senderId: this.currentUserId,
        receiverId: remoteId,
        candidate,
      });

      // Also persist to Supabase as fallback
      callHistoryService.storeIceCandidate({
        callId: callState.callId,
        senderId: this.currentUserId,
        receiverId: remoteId,
        candidate,
      });
    });

    webRTCPeerService.onNetworkQualityChange((quality: NetworkQuality) => {
      callStateStore.setNetworkQuality(quality);
    });
  }

  // ─── Outgoing Call ─────────────────────────────────────────────────────────

  async initiateCall(params: {
    targetUserId: string;
    targetProfile: UserCallProfile;
    callType: CallType;
    callScope?: CallScope;
    groupId?: string;
  }): Promise<boolean> {
    if (!this.currentUserId || !this.currentUserProfile) {
      await this.initialize();
      if (!this.currentUserId) return false;
    }

    // Check if already in a call
    if (callStateStore.isInCall()) {
      console.warn('[CallingService] Already in a call');
      return false;
    }

    const callType = params.callType;
    const callScope = params.callScope || 'one_to_one';

    // 1. Check permissions
    const perms = await callPermissionsService.requestCallPermissions(callType === 'video');
    if (!perms.microphone) {
      console.error('[CallingService] Microphone permission denied');
      return false;
    }

    // 2. Generate call ID
    const callId = this.generateCallId();

    // 3. Initialize call state
    callStateStore.initOutgoingCall({
      callId,
      callType,
      callScope,
      remoteUserId: params.targetUserId,
      remoteProfile: params.targetProfile,
      groupId: params.groupId,
    });

    // 4. Create call record in DB
    await callHistoryService.createCall({
      callId,
      callType,
      callScope,
      callerId: this.currentUserId,
      groupId: params.groupId,
    });

    // 5. Add self as participant
    await callHistoryService.addParticipant({
      callId,
      userId: this.currentUserId,
      isVideoEnabled: callType === 'video',
    });

    try {
      // 6. Get local media
      await webRTCPeerService.getUserMedia(callType === 'video', true);

      // 7. Create peer connection
      webRTCPeerService.createPeerConnection();

      // 8. Subscribe to call channel to receive answer
      signalingService.subscribeToCall(callId, this.currentUserId!, this.handleSignalingEvent.bind(this));

      // 9. Create offer
      const offer = await webRTCPeerService.createOffer();

      // 10. Update call record with offer SDP
      await callHistoryService.updateCallOfferSdp(callId, offer.sdp!);
      await callHistoryService.updateCallStatus(callId, 'ringing', {
        started_at: new Date().toISOString(),
      });

      // 11. Send ring notification + offer via signaling
      await signalingService.sendOffer({
        callId,
        senderId: this.currentUserId!,
        receiverId: params.targetUserId,
        callType,
        callScope,
        sdp: offer.sdp!,
        callerProfile: this.currentUserProfile!,
        groupId: params.groupId,
      });

      // 12. Start ringback tone
      audioManager.startRingtone(true);

      // 13. Update status to ringing
      callStateStore.setStatus('ringing');

      // 14. Set call timeout
      this.startCallTimeout(callId, params.targetUserId);

      // 15. Send push notification to target user
      await notificationService.sendNotification(
        params.targetUserId,
        `Incoming ${callType} call`,
        `${this.currentUserProfile!.username} is calling you`,
        'message' as any,
        {
          type: 'incoming_call',
          callId,
          callType,
          callerId: this.currentUserId,
          callerName: this.currentUserProfile!.username,
        }
      );

      return true;
    } catch (error) {
      console.error('[CallingService] initiateCall error:', error);
      await this.endCall('failed');
      return false;
    }
  }

  // ─── Incoming Call ─────────────────────────────────────────────────────────

  async acceptCall(incomingData: IncomingCallData): Promise<boolean> {
    if (!this.currentUserId || !this.currentUserProfile) {
      await this.initialize();
      if (!this.currentUserId) return false;
    }

    const { callId, callType, callScope, callerId, callerProfile, groupId, offerSdp } = incomingData;

    // Stop ringtone
    audioManager.stopRingtone();
    audioManager.stopVibration();

    // Check permissions
    const perms = await callPermissionsService.requestCallPermissions(callType === 'video');
    if (!perms.microphone) {
      console.error('[CallingService] Microphone permission denied on accept');
      await this.rejectCall(incomingData);
      return false;
    }

    // Initialize incoming call state
    callStateStore.initIncomingCall({
      callId,
      callType,
      callScope,
      remoteUserId: callerId,
      remoteProfile: callerProfile,
      groupId,
    });

    callStateStore.setStatus('connecting');

    // Add self as participant
    await callHistoryService.addParticipant({
      callId,
      userId: this.currentUserId,
      isVideoEnabled: callType === 'video',
    });

    try {
      // Get local media
      await webRTCPeerService.getUserMedia(callType === 'video', true);

      // Create peer connection
      webRTCPeerService.createPeerConnection();

      // Subscribe to call channel
      signalingService.subscribeToCall(callId, this.currentUserId!, this.handleSignalingEvent.bind(this));

      // Send accept signal
      await signalingService.sendAccept({
        callId,
        senderId: this.currentUserId!,
        receiverId: callerId,
      });

      // Create answer from offer
      if (offerSdp) {
        const answer = await webRTCPeerService.createAnswer(offerSdp);

        // Update DB
        await callHistoryService.updateCallAnswerSdp(callId, answer.sdp!);

        // Send answer
        await signalingService.sendAnswer({
          callId,
          senderId: this.currentUserId!,
          receiverId: callerId,
          sdp: answer.sdp!,
        });
      }

      // Fetch any buffered ICE candidates from DB
      const storedCandidates = await callHistoryService.getStoredCandidates(
        callId,
        callerId,
        this.currentUserId!
      );

      for (const candidate of storedCandidates) {
        await webRTCPeerService.addIceCandidate(candidate);
      }

      // Start call audio
      audioManager.startCallAudio(callType === 'video');

      return true;
    } catch (error) {
      console.error('[CallingService] acceptCall error:', error);
      await this.endCall('failed');
      return false;
    }
  }

  async rejectCall(incomingData: IncomingCallData): Promise<void> {
    if (!this.currentUserId) return;

    audioManager.stopRingtone();
    audioManager.stopVibration();
    callStateStore.setIncomingCall(null);

    await signalingService.sendReject({
      callId: incomingData.callId,
      senderId: this.currentUserId,
      receiverId: incomingData.callerId,
    });

    await callHistoryService.updateCallStatus(incomingData.callId, 'rejected');

    // Record history
    await callHistoryService.recordCallHistory({
      callId: incomingData.callId,
      userId: this.currentUserId,
      otherUserId: incomingData.callerId,
      callType: incomingData.callType,
      callScope: incomingData.callScope,
      direction: 'incoming',
      status: 'rejected',
      durationSeconds: 0,
    });
  }

  // ─── Call Controls ─────────────────────────────────────────────────────────

  toggleMute(): void {
    const state = callStateStore.getState();
    if (!state) return;

    const newMuted = !state.localMuted;
    webRTCPeerService.setMuted(newMuted);
    callStateStore.setMuted(newMuted);

    if (state.callId && this.currentUserId) {
      signalingService.sendMuteState({
        callId: state.callId,
        senderId: this.currentUserId,
        isMuted: newMuted,
      });

      callHistoryService.updateParticipantState(state.callId, this.currentUserId, {
        is_muted: newMuted,
      });
    }
  }

  toggleVideo(): void {
    const state = callStateStore.getState();
    if (!state) return;

    const newEnabled = !state.localVideoEnabled;
    webRTCPeerService.setVideoEnabled(newEnabled);
    callStateStore.setVideoEnabled(newEnabled);

    if (state.callId && this.currentUserId) {
      signalingService.sendVideoState({
        callId: state.callId,
        senderId: this.currentUserId,
        isVideoEnabled: newEnabled,
      });

      callHistoryService.updateParticipantState(state.callId, this.currentUserId, {
        is_video_enabled: newEnabled,
      });
    }
  }

  toggleSpeaker(): void {
    const state = callStateStore.getState();
    if (!state) return;

    const newSpeaker = !state.speakerEnabled;
    audioManager.setSpeakerOn(newSpeaker);
    callStateStore.setSpeaker(newSpeaker);
  }

  async switchCamera(): Promise<void> {
    const state = callStateStore.getState();
    if (!state) return;

    await webRTCPeerService.switchCamera();
    callStateStore.setCameraFacing(
      state.cameraFacing === 'front' ? 'back' : 'front'
    );
  }

  setTorch(on: boolean): void {
    webRTCPeerService.setTorch(on);
  }

  setPipMode(pip: boolean): void {
    callStateStore.setPipMode(pip);
  }

  // ─── End Call ─────────────────────────────────────────────────────────────

  async endCall(reason: 'hangup' | 'rejected' | 'failed' | 'cancelled' | 'missed' | 'busy' | 'timeout' = 'hangup'): Promise<void> {
    const state = callStateStore.getState();
    if (!state && reason !== 'missed') return;

    this.clearCallTimeout();
    this.clearReconnectTimer();

    const callId = state?.callId;
    const remoteId = state?.remoteUserId;
    const direction = state?.direction || 'outgoing';
    const callType = state?.callType || 'voice';
    const callScope = state?.callScope || 'one_to_one';
    const groupId = state?.groupId;
    const durationSeconds = state?.durationSeconds || 0;
    const startedAt = state?.startedAt ? new Date(state.startedAt).toISOString() : undefined;

    // Stop audio
    audioManager.stopRingtone();
    audioManager.stopVibration();
    audioManager.stopCallAudio();

    // Close WebRTC
    webRTCPeerService.close();

    // Send hangup via signaling
    if (callId && this.currentUserId && remoteId) {
      const signalingEvent =
        reason === 'hangup' ? signalingService.sendHangup.bind(signalingService) :
        reason === 'rejected' ? signalingService.sendReject.bind(signalingService) :
        reason === 'busy' ? signalingService.sendBusy.bind(signalingService) :
        reason === 'timeout' ? signalingService.sendTimeout.bind(signalingService) :
        signalingService.sendHangup.bind(signalingService);

      try {
        await signalingEvent({
          callId,
          senderId: this.currentUserId,
          receiverId: remoteId,
        });
      } catch (err) {
        console.warn('[CallingService] endCall signaling error:', err);
      }
    }

    // Update DB
    if (callId) {
      const endedAt = new Date().toISOString();
      const finalStatus =
        reason === 'rejected' ? 'rejected' :
        reason === 'cancelled' ? 'cancelled' :
        reason === 'missed' ? 'missed' :
        reason === 'busy' ? 'busy' :
        reason === 'timeout' ? 'timeout' :
        reason === 'failed' ? 'failed' :
        'ended';

      await callHistoryService.updateCallStatus(callId, finalStatus as any, {
        ended_at: endedAt,
        duration_seconds: durationSeconds,
      });

      // Update participant left time
      if (this.currentUserId) {
        await callHistoryService.updateParticipantState(callId, this.currentUserId, {
          left_at: endedAt,
        });
      }

      // Record in history for both parties
      if (this.currentUserId) {
        await callHistoryService.recordCallHistory({
          callId,
          userId: this.currentUserId,
          otherUserId: remoteId,
          groupId,
          callType,
          callScope,
          direction,
          status: finalStatus as any,
          durationSeconds,
          startedAt,
          endedAt,
        });
      }

      // Cleanup candidates
      await callHistoryService.clearCandidates(callId);

      // Unsubscribe from call channel
      signalingService.unsubscribeFromCall(callId);
    }

    // Clear state
    const finalStatusForState =
      reason === 'rejected' ? 'rejected' :
      reason === 'cancelled' ? 'cancelled' :
      reason === 'missed' ? 'missed' :
      reason === 'busy' ? 'busy' :
      reason === 'timeout' ? 'timeout' :
      reason === 'failed' ? 'failed' :
      'ended';

    callStateStore.setStatus(finalStatusForState as any);

    // Short delay before full reset to let UI show end state
    setTimeout(() => {
      callStateStore.reset();
      this.reconnectAttempts = 0;
    }, 2000);
  }

  // ─── Reconnection ─────────────────────────────────────────────────────────

  private async attemptReconnect(): Promise<void> {
    const state = callStateStore.getState();
    if (!state || !this.currentUserId) return;

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[CallingService] Max reconnect attempts reached');
      await this.endCall('failed');
      return;
    }

    this.reconnectAttempts++;
    callStateStore.setReconnecting(true);
    callStateStore.setStatus('reconnecting');

    console.log(`[CallingService] Reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

    this.reconnectHandle = setTimeout(async () => {
      try {
        // Attempt ICE restart
        const offer = await webRTCPeerService.restartIce();
        if (offer && state.remoteUserId) {
          await signalingService.sendReconnect({
            callId: state.callId,
            senderId: this.currentUserId!,
            receiverId: state.remoteUserId,
            sdp: offer.sdp,
          });
        }
      } catch (err) {
        console.error('[CallingService] Reconnect attempt failed:', err);
        this.attemptReconnect();
      }
    }, ICE_RESTART_DELAY_MS * this.reconnectAttempts);
  }

  // ─── Connection State Handlers ─────────────────────────────────────────────

  private handleConnectionStateChange(state: RTCPeerConnectionState): void {
    switch (state) {
      case 'connected':
        this.reconnectAttempts = 0;
        callStateStore.setReconnecting(false);
        callStateStore.setStatus('connected');
        audioManager.stopRingtone();
        const callState = callStateStore.getState();
        if (callState) {
          audioManager.startCallAudio(callState.callType === 'video');
          // Update DB
          callHistoryService.updateCallStatus(callState.callId, 'connected', {
            connected_at: new Date().toISOString(),
          });
        }
        break;

      case 'disconnected':
        callStateStore.setStatus('reconnecting');
        this.attemptReconnect();
        break;

      case 'failed':
        if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          this.attemptReconnect();
        } else {
          this.endCall('failed');
        }
        break;

      case 'closed':
        break;
    }
  }

  private handleIceConnectionStateChange(state: RTCIceConnectionState): void {
    if (state === 'disconnected') {
      callStateStore.setStatus('reconnecting');
      this.attemptReconnect();
    } else if (state === 'failed') {
      this.attemptReconnect();
    } else if (state === 'connected' || state === 'completed') {
      this.reconnectAttempts = 0;
      callStateStore.setReconnecting(false);
    }
  }

  // ─── Signaling Event Handler ───────────────────────────────────────────────

  private handleSignalingEvent(payload: SignalingPayload): void {
    if (!this.currentUserId) return;

    switch (payload.event) {
      case 'call_ring':
        this.handleIncomingRing(payload);
        break;

      case 'offer':
        this.handleOffer(payload);
        break;

      case 'answer':
        this.handleAnswer(payload);
        break;

      case 'ice_candidate':
        this.handleRemoteIceCandidate(payload);
        break;

      case 'call_accept':
        // The caller receives this when receiver accepts
        break;

      case 'call_reject':
        this.handleCallRejected(payload);
        break;

      case 'call_busy':
        this.handleCallBusy(payload);
        break;

      case 'call_hangup':
        this.handleCallHangup(payload);
        break;

      case 'call_timeout':
        this.handleCallTimeout(payload);
        break;

      case 'call_reconnect':
        this.handleReconnectSignal(payload);
        break;

      case 'mute_state':
        this.handleRemoteMuteState(payload);
        break;

      case 'video_state':
        this.handleRemoteVideoState(payload);
        break;
    }
  }

  private handleIncomingRing(payload: SignalingPayload): void {
    if (!payload.caller_profile) return;

    // Check if already in a call
    if (callStateStore.isInCall()) {
      // Send busy
      if (this.currentUserId) {
        signalingService.sendBusy({
          callId: payload.call_id,
          senderId: this.currentUserId,
          receiverId: payload.sender_id,
        });
      }
      return;
    }

    const incomingData: IncomingCallData = {
      callId: payload.call_id,
      callType: payload.call_type || 'voice',
      callScope: payload.call_scope || 'one_to_one',
      callerId: payload.sender_id,
      callerProfile: payload.caller_profile,
      groupId: payload.group_id,
      offerSdp: payload.sdp,
      timestamp: payload.timestamp,
    };

    callStateStore.setIncomingCall(incomingData);
    audioManager.startRingtone(false);
    audioManager.startVibration();
  }

  private async handleOffer(payload: SignalingPayload): Promise<void> {
    // This is handled via acceptCall when user explicitly accepts
    // Update the stored offer SDP in incoming call data
    const incoming = callStateStore.getIncomingCall();
    if (incoming && incoming.callId === payload.call_id && payload.sdp) {
      callStateStore.setIncomingCall({ ...incoming, offerSdp: payload.sdp });
    }
  }

  private async handleAnswer(payload: SignalingPayload): Promise<void> {
    const callState = callStateStore.getState();
    if (!callState || callState.callId !== payload.call_id) return;
    if (!payload.sdp) return;

    try {
      await webRTCPeerService.setRemoteAnswer(payload.sdp);
      await callHistoryService.updateCallAnswerSdp(payload.call_id, payload.sdp);

      // Fetch any buffered candidates
      if (this.currentUserId && callState.remoteUserId) {
        const stored = await callHistoryService.getStoredCandidates(
          payload.call_id,
          callState.remoteUserId,
          this.currentUserId
        );
        for (const c of stored) {
          await webRTCPeerService.addIceCandidate(c);
        }
      }
    } catch (err) {
      console.error('[CallingService] handleAnswer error:', err);
    }
  }

  private async handleRemoteIceCandidate(payload: SignalingPayload): Promise<void> {
    if (!payload.candidate) return;
    try {
      await webRTCPeerService.addIceCandidate(payload.candidate);
    } catch (err) {
      console.warn('[CallingService] handleRemoteIceCandidate error:', err);
    }
  }

  private handleCallRejected(payload: SignalingPayload): void {
    const callState = callStateStore.getState();
    if (!callState || callState.callId !== payload.call_id) return;
    this.endCall('rejected');
  }

  private handleCallBusy(payload: SignalingPayload): void {
    const callState = callStateStore.getState();
    if (!callState || callState.callId !== payload.call_id) return;
    this.endCall('busy');
  }

  private handleCallHangup(payload: SignalingPayload): void {
    const callState = callStateStore.getState();
    if (callState && callState.callId === payload.call_id) {
      this.endCall('ended' as any);
      return;
    }

    // Also check if it's the incoming call being cancelled
    const incomingCall = callStateStore.getIncomingCall();
    if (incomingCall && incomingCall.callId === payload.call_id) {
      audioManager.stopRingtone();
      audioManager.stopVibration();
      callStateStore.setIncomingCall(null);
    }
  }

  private handleCallTimeout(payload: SignalingPayload): void {
    const callState = callStateStore.getState();
    if (!callState || callState.callId !== payload.call_id) return;
    this.endCall('timeout');
  }

  private async handleReconnectSignal(payload: SignalingPayload): Promise<void> {
    const callState = callStateStore.getState();
    if (!callState || callState.callId !== payload.call_id) return;

    if (payload.sdp && callState.direction === 'incoming') {
      try {
        const answer = await webRTCPeerService.createAnswer(payload.sdp);
        if (callState.remoteUserId && this.currentUserId) {
          await signalingService.sendAnswer({
            callId: payload.call_id,
            senderId: this.currentUserId,
            receiverId: callState.remoteUserId,
            sdp: answer.sdp!,
          });
        }
      } catch (err) {
        console.error('[CallingService] handleReconnectSignal error:', err);
      }
    }
  }

  private handleRemoteMuteState(payload: SignalingPayload): void {
    // In a group call, update participant state
    const callState = callStateStore.getState();
    if (!callState) return;

    const participants = [...callState.groupParticipants];
    const idx = participants.findIndex((p) => p.user_id === payload.sender_id);
    if (idx >= 0) {
      participants[idx] = { ...participants[idx], is_muted: payload.is_muted ?? false };
      callStateStore.updateGroupParticipants(participants);
    }
  }

  private handleRemoteVideoState(payload: SignalingPayload): void {
    const callState = callStateStore.getState();
    if (!callState) return;

    const participants = [...callState.groupParticipants];
    const idx = participants.findIndex((p) => p.user_id === payload.sender_id);
    if (idx >= 0) {
      participants[idx] = { ...participants[idx], is_video_enabled: payload.is_video_enabled ?? false };
      callStateStore.updateGroupParticipants(participants);
    }
  }

  // ─── Timeout Management ───────────────────────────────────────────────────

  private startCallTimeout(callId: string, receiverId: string): void {
    this.clearCallTimeout();
    this.timeoutHandle = setTimeout(async () => {
      const state = callStateStore.getState();
      if (state?.callId === callId && (state.status === 'ringing' || state.status === 'initiating')) {
        if (this.currentUserId) {
          await signalingService.sendTimeout({
            callId,
            senderId: this.currentUserId,
            receiverId,
          });
        }
        await this.endCall('timeout');

        // Record missed call for receiver
        await callHistoryService.recordCallHistory({
          callId,
          userId: receiverId,
          otherUserId: this.currentUserId || undefined,
          callType: state.callType,
          callScope: state.callScope,
          direction: 'incoming',
          status: 'missed',
          durationSeconds: 0,
        });
      }
    }, CALL_TIMEOUT_MS);
  }

  private clearCallTimeout(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectHandle) {
      clearTimeout(this.reconnectHandle);
      this.reconnectHandle = null;
    }
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  private generateCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  getCurrentUserProfile(): UserCallProfile | null {
    return this.currentUserProfile;
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────

  cleanup(): void {
    this.clearCallTimeout();
    this.clearReconnectTimer();
    audioManager.cleanup();
    webRTCPeerService.close();

    if (this.currentUserId) {
      signalingService.unsubscribeFromUserCalls(this.currentUserId);
    }

    callStateStore.reset();
    this.isInitialized = false;
  }
}

export const callingService = new CallingService();
export default callingService;
