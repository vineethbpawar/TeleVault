/**
 * Signaling Service
 *
 * Manages WebRTC signaling via Supabase Realtime channels.
 * Handles offer/answer/ICE candidate exchange, call state broadcasting,
 * and all real-time call events.
 */

import { supabase } from '../lib/supabase';
import {
  SignalingPayload,
  SignalingEventType,
  CallType,
  CallScope,
  UserCallProfile,
  RTCIceCandidateJSON,
} from '../types/call';
import { RealtimeChannel } from '@supabase/supabase-js';

type SignalingEventCallback = (payload: SignalingPayload) => void;

class SignalingService {
  private channels: Map<string, RealtimeChannel> = new Map();
  private listeners: Map<string, Map<SignalingEventType, SignalingEventCallback[]>> =
    new Map();

  // ─── Channel Management ────────────────────────────────────────────────────

  /**
   * Subscribe to a call's signaling channel.
   * Call ID based channels ensure only participants receive events.
   */
  subscribeToCall(
    callId: string,
    userId: string,
    onEvent: (payload: SignalingPayload) => void
  ): void {
    const channelKey = `call:${callId}`;

    if (this.channels.has(channelKey)) {
      return; // already subscribed
    }

    const channel = supabase
      .channel(channelKey, {
        config: {
          broadcast: { self: false, ack: true },
          presence: { key: userId },
        },
      })
      .on('broadcast', { event: 'signaling' }, ({ payload }) => {
        if (payload && payload.receiver_id) {
          if (payload.receiver_id !== userId && payload.receiver_id !== 'all') {
            return; // not for us
          }
        }
        onEvent(payload as SignalingPayload);
      })
      .subscribe((status) => {
        if (__DEV__) {
          console.log(`[Signaling] Channel ${channelKey} status: ${status}`);
        }
      });

    this.channels.set(channelKey, channel);
  }

  /**
   * Subscribe to user-level incoming call notifications.
   * Used to receive incoming calls even without a call ID.
   */
  subscribeToUserCalls(
    userId: string,
    onEvent: (payload: SignalingPayload) => void
  ): void {
    const channelKey = `user_calls:${userId}`;

    if (this.channels.has(channelKey)) {
      return;
    }

    const channel = supabase
      .channel(channelKey, {
        config: { broadcast: { self: false, ack: true } },
      })
      .on('broadcast', { event: 'incoming_call' }, ({ payload }) => {
        onEvent(payload as SignalingPayload);
      })
      .subscribe((status) => {
        if (__DEV__) {
          console.log(`[Signaling] User channel ${channelKey} status: ${status}`);
        }
      });

    this.channels.set(channelKey, channel);
  }

  // ─── Send Events ───────────────────────────────────────────────────────────

  private async sendToCallChannel(
    callId: string,
    payload: SignalingPayload
  ): Promise<void> {
    const channelKey = `call:${callId}`;
    const channel = this.channels.get(channelKey);

    if (!channel) {
      console.warn(`[Signaling] No channel for callId: ${callId}`);
      return;
    }

    await channel.send({
      type: 'broadcast',
      event: 'signaling',
      payload,
    });
  }

  private async sendToUserChannel(
    targetUserId: string,
    payload: SignalingPayload
  ): Promise<void> {
    // For incoming call notifications, we create a temporary channel to the target user
    const channelKey = `user_calls:${targetUserId}`;
    const existingChannel = this.channels.get(channelKey);

    if (existingChannel) {
      await existingChannel.send({
        type: 'broadcast',
        event: 'incoming_call',
        payload,
      });
      return;
    }

    // Temporarily create channel just to send
    const tempChannel = supabase.channel(channelKey, {
      config: { broadcast: { self: true, ack: true } },
    });

    await new Promise<void>((resolve) => {
      tempChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
      });
    });

    await tempChannel.send({
      type: 'broadcast',
      event: 'incoming_call',
      payload,
    });

    // Small delay to ensure delivery before removing
    setTimeout(async () => {
      await supabase.removeChannel(tempChannel);
    }, 2000);
  }

  // ─── Signaling Events ──────────────────────────────────────────────────────

  async sendOffer(params: {
    callId: string;
    senderId: string;
    receiverId: string;
    callType: CallType;
    callScope: CallScope;
    sdp: string;
    callerProfile: UserCallProfile;
    groupId?: string;
  }): Promise<void> {
    const payload: SignalingPayload = {
      event: 'offer',
      call_id: params.callId,
      sender_id: params.senderId,
      receiver_id: params.receiverId,
      call_type: params.callType,
      call_scope: params.callScope,
      sdp: params.sdp,
      caller_profile: params.callerProfile,
      group_id: params.groupId,
      timestamp: Date.now(),
    };

    // Send ring notification to user's personal channel first
    await this.sendRingNotification(
      params.callId,
      params.senderId,
      params.receiverId,
      params.callType,
      params.callScope,
      params.callerProfile,
      params.groupId,
      params.sdp
    );

    // Then send offer to call channel
    await this.sendToCallChannel(params.callId, payload);
  }

  async sendRingNotification(
    callId: string,
    senderId: string,
    receiverId: string,
    callType: CallType,
    callScope: CallScope,
    callerProfile: UserCallProfile,
    groupId?: string,
    sdp?: string
  ): Promise<void> {
    const payload: SignalingPayload = {
      event: 'call_ring',
      call_id: callId,
      sender_id: senderId,
      receiver_id: receiverId,
      call_type: callType,
      call_scope: callScope,
      caller_profile: callerProfile,
      group_id: groupId,
      sdp: sdp,
      timestamp: Date.now(),
    };

    await this.sendToUserChannel(receiverId, payload);
  }

  async sendAnswer(params: {
    callId: string;
    senderId: string;
    receiverId: string;
    sdp: string;
  }): Promise<void> {
    const payload: SignalingPayload = {
      event: 'answer',
      call_id: params.callId,
      sender_id: params.senderId,
      receiver_id: params.receiverId,
      sdp: params.sdp,
      timestamp: Date.now(),
    };

    await this.sendToCallChannel(params.callId, payload);
  }

  async sendAccept(params: {
    callId: string;
    senderId: string;
    receiverId: string;
  }): Promise<void> {
    const payload: SignalingPayload = {
      event: 'call_accept',
      call_id: params.callId,
      sender_id: params.senderId,
      receiver_id: params.receiverId,
      timestamp: Date.now(),
    };

    await this.sendToCallChannel(params.callId, payload);
    await this.sendToUserChannel(params.receiverId, payload);
  }

  async sendIceCandidate(params: {
    callId: string;
    senderId: string;
    receiverId: string;
    candidate: RTCIceCandidateJSON;
  }): Promise<void> {
    const payload: SignalingPayload = {
      event: 'ice_candidate',
      call_id: params.callId,
      sender_id: params.senderId,
      receiver_id: params.receiverId,
      candidate: params.candidate,
      timestamp: Date.now(),
    };

    await this.sendToCallChannel(params.callId, payload);
  }

  async sendHangup(params: {
    callId: string;
    senderId: string;
    receiverId?: string;
  }): Promise<void> {
    const payload: SignalingPayload = {
      event: 'call_hangup',
      call_id: params.callId,
      sender_id: params.senderId,
      receiver_id: params.receiverId || 'all',
      timestamp: Date.now(),
    };

    await this.sendToCallChannel(params.callId, payload);

    if (params.receiverId) {
      await this.sendToUserChannel(params.receiverId, payload);
    }
  }

  async sendReject(params: {
    callId: string;
    senderId: string;
    receiverId: string;
  }): Promise<void> {
    const payload: SignalingPayload = {
      event: 'call_reject',
      call_id: params.callId,
      sender_id: params.senderId,
      receiver_id: params.receiverId,
      timestamp: Date.now(),
    };

    await this.sendToCallChannel(params.callId, payload);
    await this.sendToUserChannel(params.receiverId, payload);
  }

  async sendBusy(params: {
    callId: string;
    senderId: string;
    receiverId: string;
  }): Promise<void> {
    const payload: SignalingPayload = {
      event: 'call_busy',
      call_id: params.callId,
      sender_id: params.senderId,
      receiver_id: params.receiverId,
      timestamp: Date.now(),
    };

    await this.sendToCallChannel(params.callId, payload);
    await this.sendToUserChannel(params.receiverId, payload);
  }

  async sendTimeout(params: {
    callId: string;
    senderId: string;
    receiverId: string;
  }): Promise<void> {
    const payload: SignalingPayload = {
      event: 'call_timeout',
      call_id: params.callId,
      sender_id: params.senderId,
      receiver_id: params.receiverId,
      timestamp: Date.now(),
    };

    await this.sendToCallChannel(params.callId, payload);
    await this.sendToUserChannel(params.receiverId, payload);
  }

  async sendReconnect(params: {
    callId: string;
    senderId: string;
    receiverId: string;
    sdp?: string;
  }): Promise<void> {
    const payload: SignalingPayload = {
      event: 'call_reconnect',
      call_id: params.callId,
      sender_id: params.senderId,
      receiver_id: params.receiverId,
      sdp: params.sdp,
      timestamp: Date.now(),
    };

    await this.sendToCallChannel(params.callId, payload);
  }

  async sendMuteState(params: {
    callId: string;
    senderId: string;
    isMuted: boolean;
  }): Promise<void> {
    const payload: SignalingPayload = {
      event: 'mute_state',
      call_id: params.callId,
      sender_id: params.senderId,
      receiver_id: 'all',
      is_muted: params.isMuted,
      timestamp: Date.now(),
    };

    await this.sendToCallChannel(params.callId, payload);
  }

  async sendVideoState(params: {
    callId: string;
    senderId: string;
    isVideoEnabled: boolean;
  }): Promise<void> {
    const payload: SignalingPayload = {
      event: 'video_state',
      call_id: params.callId,
      sender_id: params.senderId,
      receiver_id: 'all',
      is_video_enabled: params.isVideoEnabled,
      timestamp: Date.now(),
    };

    await this.sendToCallChannel(params.callId, payload);
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  unsubscribeFromCall(callId: string): void {
    const channelKey = `call:${callId}`;
    const channel = this.channels.get(channelKey);
    if (channel) {
      supabase.removeChannel(channel);
      this.channels.delete(channelKey);
    }
  }

  unsubscribeFromUserCalls(userId: string): void {
    const channelKey = `user_calls:${userId}`;
    const channel = this.channels.get(channelKey);
    if (channel) {
      supabase.removeChannel(channel);
      this.channels.delete(channelKey);
    }
  }

  unsubscribeAll(): void {
    this.channels.forEach((channel) => {
      supabase.removeChannel(channel);
    });
    this.channels.clear();
    this.listeners.clear();
  }
}

export const signalingService = new SignalingService();
export default signalingService;
