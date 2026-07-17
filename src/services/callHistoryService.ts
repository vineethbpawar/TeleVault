/**
 * Call History Service
 *
 * Manages persistent call history in Supabase.
 * Saves call records, participants, ICE candidates, and history entries.
 */

import { supabase } from '../lib/supabase';
import {
  CallRecord,
  CallParticipant,
  CallHistoryEntry,
  CallType,
  CallScope,
  CallStatus,
  CallDirection,
  RTCIceCandidateJSON,
} from '../types/call';

class CallHistoryService {
  // ─── Call Records ─────────────────────────────────────────────────────────

  async createCall(params: {
    callId: string;
    callType: CallType;
    callScope: CallScope;
    callerId: string;
    groupId?: string;
    offerSdp?: string;
  }): Promise<void> {
    const { error } = await supabase.from('calls').insert({
      id: params.callId,
      call_type: params.callType,
      call_scope: params.callScope,
      status: 'initiating',
      caller_id: params.callerId,
      group_id: params.groupId || null,
      offer_sdp: params.offerSdp || null,
    });

    if (error) {
      console.error('[CallHistory] createCall error:', error);
    }
  }

  async updateCallStatus(
    callId: string,
    status: CallStatus,
    extraFields?: { answer_sdp?: string; started_at?: string; connected_at?: string; ended_at?: string; duration_seconds?: number }
  ): Promise<void> {
    const { error } = await supabase
      .from('calls')
      .update({ status, ...extraFields })
      .eq('id', callId);

    if (error) {
      console.error('[CallHistory] updateCallStatus error:', error);
    }
  }

  async updateCallOfferSdp(callId: string, offerSdp: string): Promise<void> {
    await supabase.from('calls').update({ offer_sdp: offerSdp }).eq('id', callId);
  }

  async updateCallAnswerSdp(callId: string, answerSdp: string): Promise<void> {
    await supabase.from('calls').update({ answer_sdp: answerSdp }).eq('id', callId);
  }

  async getCall(callId: string): Promise<CallRecord | null> {
    const { data, error } = await supabase
      .from('calls')
      .select('*')
      .eq('id', callId)
      .maybeSingle();

    if (error) {
      console.error('[CallHistory] getCall error:', error);
    }

    return data as CallRecord | null;
  }

  // ─── Participants ─────────────────────────────────────────────────────────

  async addParticipant(params: {
    callId: string;
    userId: string;
    isVideoEnabled?: boolean;
  }): Promise<void> {
    const { error } = await supabase.from('call_participants').upsert(
      {
        call_id: params.callId,
        user_id: params.userId,
        is_muted: false,
        is_video_enabled: params.isVideoEnabled ?? false,
        is_screen_sharing: false,
        joined_at: new Date().toISOString(),
      },
      { onConflict: 'call_id,user_id' }
    );

    if (error) {
      console.error('[CallHistory] addParticipant error:', error);
    }
  }

  async updateParticipantState(
    callId: string,
    userId: string,
    state: { is_muted?: boolean; is_video_enabled?: boolean; is_screen_sharing?: boolean; left_at?: string }
  ): Promise<void> {
    const { error } = await supabase
      .from('call_participants')
      .update(state)
      .eq('call_id', callId)
      .eq('user_id', userId);

    if (error) {
      console.error('[CallHistory] updateParticipantState error:', error);
    }
  }

  async getParticipants(callId: string): Promise<CallParticipant[]> {
    const { data, error } = await supabase
      .from('call_participants')
      .select('*, profile:profiles!call_participants_user_id_fkey(id,username,full_name,avatar_url)')
      .eq('call_id', callId);

    if (error) {
      console.error('[CallHistory] getParticipants error:', error);
      return [];
    }

    return (data || []) as CallParticipant[];
  }

  // ─── ICE Candidates ───────────────────────────────────────────────────────

  async storeIceCandidate(params: {
    callId: string;
    senderId: string;
    receiverId: string;
    candidate: RTCIceCandidateJSON;
  }): Promise<void> {
    const { error } = await supabase.from('call_candidates').insert({
      call_id: params.callId,
      sender_id: params.senderId,
      receiver_id: params.receiverId,
      candidate_json: JSON.stringify(params.candidate),
    });

    if (error) {
      console.error('[CallHistory] storeIceCandidate error:', error);
    }
  }

  async getStoredCandidates(
    callId: string,
    senderId: string,
    receiverId: string
  ): Promise<RTCIceCandidateJSON[]> {
    const { data, error } = await supabase
      .from('call_candidates')
      .select('candidate_json')
      .eq('call_id', callId)
      .eq('sender_id', senderId)
      .eq('receiver_id', receiverId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[CallHistory] getStoredCandidates error:', error);
      return [];
    }

    return (data || []).map((row: any) => {
      try {
        return JSON.parse(row.candidate_json) as RTCIceCandidateJSON;
      } catch {
        return null;
      }
    }).filter(Boolean) as RTCIceCandidateJSON[];
  }

  async clearCandidates(callId: string): Promise<void> {
    await supabase.from('call_candidates').delete().eq('call_id', callId);
  }

  // ─── Call History ─────────────────────────────────────────────────────────

  async recordCallHistory(params: {
    callId: string;
    userId: string;
    otherUserId?: string;
    groupId?: string;
    callType: CallType;
    callScope: CallScope;
    direction: CallDirection;
    status: CallStatus;
    durationSeconds: number;
    startedAt?: string;
    endedAt?: string;
  }): Promise<void> {
    const { error } = await supabase.from('call_history').insert({
      call_id: params.callId,
      user_id: params.userId,
      other_user_id: params.otherUserId || null,
      group_id: params.groupId || null,
      call_type: params.callType,
      call_scope: params.callScope,
      direction: params.direction,
      status: params.status,
      duration_seconds: params.durationSeconds,
      started_at: params.startedAt || null,
      ended_at: params.endedAt || null,
    });

    if (error) {
      console.error('[CallHistory] recordCallHistory error:', error);
    }
  }

  async getCallHistory(limit = 50, offset = 0): Promise<CallHistoryEntry[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('call_history')
      .select(`
        *,
        other_user:profiles!call_history_other_user_id_fkey(id,username,full_name,avatar_url),
        call:calls!call_history_call_id_fkey(*)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[CallHistory] getCallHistory error:', error);
      return [];
    }

    return (data || []) as CallHistoryEntry[];
  }

  async getMissedCallCount(): Promise<number> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;

    const { count, error } = await supabase
      .from('call_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'missed')
      .eq('direction', 'incoming');

    if (error) return 0;
    return count || 0;
  }

  async clearCallHistory(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('call_history').delete().eq('user_id', user.id);
  }
}

export const callHistoryService = new CallHistoryService();
export default callHistoryService;
