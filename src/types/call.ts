// ─── Call Type Definitions ───────────────────────────────────────────────────

export type CallType = 'voice' | 'video';
export type CallDirection = 'incoming' | 'outgoing';
export type CallScope = 'one_to_one' | 'group';

export type CallStatus =
  | 'idle'
  | 'initiating'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'ended'
  | 'missed'
  | 'rejected'
  | 'busy'
  | 'failed'
  | 'cancelled'
  | 'timeout';

export type SignalingEventType =
  | 'offer'
  | 'answer'
  | 'ice_candidate'
  | 'call_ring'
  | 'call_accept'
  | 'call_reject'
  | 'call_busy'
  | 'call_hangup'
  | 'call_timeout'
  | 'call_reconnect'
  | 'participant_join'
  | 'participant_leave'
  | 'mute_state'
  | 'video_state';

export type NetworkQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';

// ─── Database row types ──────────────────────────────────────────────────────

export interface CallRecord {
  id: string;
  call_type: CallType;
  call_scope: CallScope;
  status: CallStatus;
  caller_id: string;
  group_id?: string | null;
  offer_sdp?: string | null;
  answer_sdp?: string | null;
  started_at?: string | null;
  connected_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  created_at: string;
}

export interface CallParticipant {
  id: string;
  call_id: string;
  user_id: string;
  joined_at?: string | null;
  left_at?: string | null;
  is_muted: boolean;
  is_video_enabled: boolean;
  is_screen_sharing: boolean;
  created_at: string;
  // Joined
  profile?: UserCallProfile;
}

export interface CallIceCandidate {
  id: string;
  call_id: string;
  sender_id: string;
  receiver_id: string;
  candidate_json: string;
  created_at: string;
}

export interface CallHistoryEntry {
  id: string;
  call_id: string;
  user_id: string;
  other_user_id?: string | null;
  group_id?: string | null;
  call_type: CallType;
  call_scope: CallScope;
  direction: CallDirection;
  status: CallStatus;
  duration_seconds: number;
  started_at?: string | null;
  ended_at?: string | null;
  created_at: string;
  // Joined
  other_user?: UserCallProfile;
  call?: CallRecord;
}

export interface CallDevice {
  id: string;
  user_id: string;
  device_id: string;
  platform: 'android' | 'ios' | 'web';
  push_token?: string | null;
  last_seen_at: string;
  created_at: string;
}

export interface UserCallProfile {
  id: string;
  username: string;
  full_name?: string | null;
  avatar_url?: string | null;
}

// ─── Signaling payloads ──────────────────────────────────────────────────────

export interface SignalingPayload {
  event: SignalingEventType;
  call_id: string;
  sender_id: string;
  receiver_id?: string;
  call_type?: CallType;
  call_scope?: CallScope;
  sdp?: string;
  candidate?: RTCIceCandidateJSON;
  is_muted?: boolean;
  is_video_enabled?: boolean;
  group_id?: string;
  caller_profile?: UserCallProfile;
  participants?: string[];
  timestamp: number;
}

export interface RTCIceCandidateJSON {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment?: string | null;
}

// ─── In-app call state ───────────────────────────────────────────────────────

export interface ActiveCallState {
  callId: string;
  callType: CallType;
  callScope: CallScope;
  direction: CallDirection;
  status: CallStatus;
  remoteUserId?: string;
  remoteProfile?: UserCallProfile;
  groupId?: string;
  groupParticipants: CallParticipant[];
  localMuted: boolean;
  localVideoEnabled: boolean;
  speakerEnabled: boolean;
  cameraFacing: 'front' | 'back';
  networkQuality: NetworkQuality;
  durationSeconds: number;
  startedAt?: number;
  connectedAt?: number;
  isReconnecting: boolean;
  pipMode: boolean;
}

export interface IncomingCallData {
  callId: string;
  callType: CallType;
  callScope: CallScope;
  callerId: string;
  callerProfile: UserCallProfile;
  groupId?: string;
  offerSdp?: string;
  timestamp: number;
}

// ─── WebRTC config ────────────────────────────────────────────────────────────

export interface WebRTCConfig {
  iceServers: RTCIceServer[];
}

export interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}
