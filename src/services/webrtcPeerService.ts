/**
 * WebRTC Peer Service
 *
 * Manages RTCPeerConnection lifecycle, SDP negotiation, ICE candidates,
 * media streams, and network quality monitoring.
 *
 * Works on Android (native) and Web (browser WebRTC API).
 * On web, uses the browser's built-in RTCPeerConnection.
 * On native, uses react-native-webrtc.
 */

import { Platform } from 'react-native';
import {
  RTCIceCandidateJSON,
  WebRTCConfig,
  NetworkQuality,
} from '../types/call';

// ─── Platform shim ────────────────────────────────────────────────────────────
// react-native-webrtc provides RTCPeerConnection, RTCSessionDescription,
// RTCIceCandidate, MediaStream, etc. on native.
// On web, the browser provides them globally.

let NativeRTC: {
  RTCPeerConnection: typeof RTCPeerConnection;
  RTCSessionDescription: typeof RTCSessionDescription;
  RTCIceCandidate: typeof RTCIceCandidate;
  mediaDevices: typeof navigator.mediaDevices;
};

if (Platform.OS === 'web') {
  NativeRTC = {
    RTCPeerConnection: window.RTCPeerConnection,
    RTCSessionDescription: window.RTCSessionDescription,
    RTCIceCandidate: window.RTCIceCandidate,
    mediaDevices: navigator.mediaDevices,
  };
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const webrtc = require('react-native-webrtc');
  NativeRTC = {
    RTCPeerConnection: webrtc.RTCPeerConnection,
    RTCSessionDescription: webrtc.RTCSessionDescription,
    RTCIceCandidate: webrtc.RTCIceCandidate,
    mediaDevices: webrtc.mediaDevices,
  };
}

// ─── ICE / STUN / TURN Configuration ─────────────────────────────────────────

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  // Free TURN from Metered (credentials loaded from env or config)
  {
    urls: 'turn:relay.metered.ca:80',
    username: process.env.EXPO_PUBLIC_TURN_USERNAME || 'televault',
    credential: process.env.EXPO_PUBLIC_TURN_CREDENTIAL || 'televault2025',
  },
  {
    urls: 'turn:relay.metered.ca:443',
    username: process.env.EXPO_PUBLIC_TURN_USERNAME || 'televault',
    credential: process.env.EXPO_PUBLIC_TURN_CREDENTIAL || 'televault2025',
  },
  {
    urls: 'turn:relay.metered.ca:443?transport=tcp',
    username: process.env.EXPO_PUBLIC_TURN_USERNAME || 'televault',
    credential: process.env.EXPO_PUBLIC_TURN_CREDENTIAL || 'televault2025',
  },
];

export type PeerEventType =
  | 'iceCandidate'
  | 'localStream'
  | 'remoteStream'
  | 'connectionStateChange'
  | 'iceConnectionStateChange'
  | 'negotiationNeeded'
  | 'error';

export type PeerEventListener = {
  iceCandidate: (candidate: RTCIceCandidateJSON) => void;
  localStream: (stream: MediaStream) => void;
  remoteStream: (stream: MediaStream) => void;
  connectionStateChange: (state: RTCPeerConnectionState) => void;
  iceConnectionStateChange: (state: RTCIceConnectionState) => void;
  negotiationNeeded: () => void;
  error: (error: Error) => void;
};

class WebRTCPeerService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private listeners: Partial<PeerEventListener> = {};
  private pendingCandidates: RTCIceCandidate[] = [];
  private localIceCandidates: RTCIceCandidateJSON[] = [];
  private remoteDescSet = false;
  private config: WebRTCConfig = { iceServers: DEFAULT_ICE_SERVERS };
  private networkQualityInterval: ReturnType<typeof setInterval> | null = null;

  // ─── Configuration ─────────────────────────────────────────────────────────

  setConfig(config: Partial<WebRTCConfig>): void {
    if (config.iceServers) {
      this.config.iceServers = config.iceServers;
    }
  }

  // ─── Event Listener Registration ───────────────────────────────────────────

  on<T extends PeerEventType>(event: T, listener: PeerEventListener[T]): void {
    (this.listeners as any)[event] = listener;
  }

  off(event: PeerEventType): void {
    delete (this.listeners as any)[event];
  }

  private emit<T extends PeerEventType>(
    event: T,
    ...args: Parameters<PeerEventListener[T]>
  ): void {
    const listener = (this.listeners as any)[event];
    if (listener) {
      (listener as any)(...args);
    }
  }

  // ─── Local Media ───────────────────────────────────────────────────────────

  async getUserMedia(video: boolean, audio: boolean): Promise<MediaStream> {
    const tryGetUserMedia = async (constraints: any): Promise<MediaStream> => {
      return await NativeRTC.mediaDevices.getUserMedia(constraints);
    };

    try {
      const primaryConstraints = {
        audio: audio
          ? {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          : false,
        video: video
          ? {
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 },
              facingMode: 'user',
            }
          : false,
      };

      const stream = await tryGetUserMedia(primaryConstraints);
      this.localStream = stream;
      this.emit('localStream', stream);
      return stream;
    } catch (primaryErr) {
      console.warn('[WebRTC] Primary getUserMedia constraints failed, trying fallback:', primaryErr);
      try {
        const fallbackConstraints = {
          audio: audio ? true : false,
          video: video ? { facingMode: 'user' } : false,
        };
        const stream = await tryGetUserMedia(fallbackConstraints);
        this.localStream = stream;
        this.emit('localStream', stream);
        return stream;
      } catch (fallbackErr) {
        console.warn('[WebRTC] Secondary getUserMedia constraints failed, trying basic:', fallbackErr);
        try {
          const basicConstraints = {
            audio: audio ? true : false,
            video: video ? true : false,
          };
          const stream = await tryGetUserMedia(basicConstraints);
          this.localStream = stream;
          this.emit('localStream', stream);
          return stream;
        } catch (finalErr) {
          const err = new Error(`Failed to get user media: ${(finalErr as Error).message}`);
          this.emit('error', err);
          throw err;
        }
      }
    }
  }

  async getDisplayMedia(): Promise<MediaStream> {
    try {
      const stream = await (NativeRTC.mediaDevices as any).getDisplayMedia({
        video: true,
        audio: true,
      });
      return stream;
    } catch (error) {
      throw new Error(`Failed to get display media: ${(error as Error).message}`);
    }
  }

  // ─── Peer Connection ───────────────────────────────────────────────────────

  createPeerConnection(): RTCPeerConnection {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    const pcConfig = {
      iceServers: this.config.iceServers,
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle' as RTCBundlePolicy,
      rtcpMuxPolicy: 'require' as RTCRtcpMuxPolicy,
    };

    this.pc = new NativeRTC.RTCPeerConnection(pcConfig as any);
    this.remoteDescSet = false;
    this.pendingCandidates = [];

    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.pc!.addTrack(track, this.localStream!);
      });
    }

    // Handle ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidateJSON: RTCIceCandidateJSON = {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          usernameFragment: event.candidate.usernameFragment,
        };
        this.localIceCandidates.push(candidateJSON);
        this.emit('iceCandidate', candidateJSON);
      }
    };

    // Handle remote stream
    this.pc.ontrack = (event) => {
      console.log('[WebRTC] Received remote track:', event.track.kind, event.track.id);
      let stream = event.streams && event.streams[0];

      if (!stream) {
        if (!this.remoteStream) {
          if (Platform.OS === 'web') {
            this.remoteStream = new window.MediaStream();
          } else {
            const webrtc = require('react-native-webrtc');
            this.remoteStream = new webrtc.MediaStream();
          }
        }
        if (this.remoteStream) {
          this.remoteStream.addTrack(event.track);
          stream = this.remoteStream;
        }
      } else {
        this.remoteStream = stream;
      }

      if (this.remoteStream) {
        if (Platform.OS === 'web') {
          const freshStream = new window.MediaStream(this.remoteStream.getTracks());
          this.remoteStream = freshStream;
          this.emit('remoteStream', freshStream);
        } else {
          this.emit('remoteStream', this.remoteStream);
        }
      }
    };

    // Handle connection state changes
    this.pc.onconnectionstatechange = () => {
      if (this.pc) {
        this.emit('connectionStateChange', this.pc.connectionState);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (this.pc) {
        this.emit('iceConnectionStateChange', this.pc.iceConnectionState);
      }
    };

    this.pc.onnegotiationneeded = () => {
      this.emit('negotiationNeeded');
    };

    this.startNetworkQualityMonitoring();
    return this.pc;
  }

  // ─── SDP Negotiation ───────────────────────────────────────────────────────

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('No peer connection');

    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    } as any);

    await this.pc.setLocalDescription(
      new NativeRTC.RTCSessionDescription(offer as any)
    );

    return offer;
  }

  async createAnswer(offerSdp: string): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('No peer connection');

    const offer = new NativeRTC.RTCSessionDescription({
      type: 'offer',
      sdp: offerSdp,
    } as any);

    await this.pc.setRemoteDescription(offer);
    this.remoteDescSet = true;
    await this.drainPendingCandidates();

    const answer = await this.pc.createAnswer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    } as any);

    await this.pc.setLocalDescription(
      new NativeRTC.RTCSessionDescription(answer as any)
    );

    return answer;
  }

  async setRemoteAnswer(answerSdp: string): Promise<void> {
    if (!this.pc) throw new Error('No peer connection');

    const answer = new NativeRTC.RTCSessionDescription({
      type: 'answer',
      sdp: answerSdp,
    } as any);

    await this.pc.setRemoteDescription(answer);
    this.remoteDescSet = true;
    await this.drainPendingCandidates();
  }

  // ─── ICE Candidates ────────────────────────────────────────────────────────

  async addIceCandidate(candidateJSON: RTCIceCandidateJSON): Promise<void> {
    const candidate = new NativeRTC.RTCIceCandidate(candidateJSON as any);

    if (!this.remoteDescSet) {
      this.pendingCandidates.push(candidate as any);
      return;
    }

    if (this.pc) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn('[WebRTC] addIceCandidate error (non-fatal):', err);
      }
    }
  }

  private async drainPendingCandidates(): Promise<void> {
    if (!this.pc) return;

    const toProcess = [...this.pendingCandidates];
    this.pendingCandidates = [];

    for (const candidate of toProcess) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn('[WebRTC] drainPendingCandidates error:', err);
      }
    }
  }

  // ─── ICE Restart ───────────────────────────────────────────────────────────

  async restartIce(): Promise<RTCSessionDescriptionInit | null> {
    if (!this.pc) return null;

    try {
      const offer = await this.pc.createOffer({ iceRestart: true } as any);
      await this.pc.setLocalDescription(
        new NativeRTC.RTCSessionDescription(offer as any)
      );
      return offer;
    } catch (err) {
      console.error('[WebRTC] ICE restart failed:', err);
      return null;
    }
  }

  // ─── Media Controls ────────────────────────────────────────────────────────

  setMuted(muted: boolean): void {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  setVideoEnabled(enabled: boolean): void {
    if (!this.localStream) return;
    this.localStream.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  async switchCamera(): Promise<void> {
    if (!this.localStream) return;

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    if (Platform.OS !== 'web') {
      try {
        // react-native-webrtc specific API
        await (videoTrack as any)._switchCamera();
      } catch (err) {
        console.warn('[WebRTC] switchCamera error:', err);
      }
    } else {
      // Web: stop current, restart with opposite facing
      const currentFacingMode = (videoTrack.getSettings() as any)?.facingMode || 'user';
      const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

      const newStream = await NativeRTC.mediaDevices.getUserMedia({
        video: { facingMode: newFacingMode },
        audio: false,
      } as any);

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (newVideoTrack && this.pc) {
        const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newVideoTrack);
        }
        videoTrack.stop();
        this.localStream
          .getVideoTracks()
          .forEach((t) => this.localStream!.removeTrack(t));
        this.localStream.addTrack(newVideoTrack);
      }
    }
  }

  setTorch(on: boolean): void {
    if (!this.localStream || Platform.OS === 'web') return;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      try {
        (videoTrack as any).applyConstraints({ advanced: [{ torch: on }] });
      } catch (_) {}
    }
  }

  // ─── Network Quality Monitoring ────────────────────────────────────────────

  private networkQualityCallback?: (q: NetworkQuality) => void;

  onNetworkQualityChange(callback: (q: NetworkQuality) => void): void {
    this.networkQualityCallback = callback;
  }

  private startNetworkQualityMonitoring(): void {
    this.stopNetworkQualityMonitoring();

    this.networkQualityInterval = setInterval(async () => {
      const quality = await this.measureNetworkQuality();
      if (this.networkQualityCallback) {
        this.networkQualityCallback(quality);
      }
    }, 3000);
  }

  private stopNetworkQualityMonitoring(): void {
    if (this.networkQualityInterval) {
      clearInterval(this.networkQualityInterval);
      this.networkQualityInterval = null;
    }
  }

  private async measureNetworkQuality(): Promise<NetworkQuality> {
    if (!this.pc) return 'unknown';

    try {
      const stats = await this.pc.getStats();
      let rtt = -1;
      let packetsLost = 0;
      let packetsSent = 0;

      stats.forEach((report: any) => {
        if (report.type === 'candidate-pair' && report.nominated) {
          rtt = report.currentRoundTripTime * 1000 || -1;
        }
        if (report.type === 'outbound-rtp' && report.kind === 'audio') {
          packetsLost = report.packetsLost || 0;
          packetsSent = report.packetsSent || 1;
        }
      });

      const lossRate = packetsLost / Math.max(packetsSent, 1);

      if (rtt < 0) return 'unknown';
      if (rtt < 100 && lossRate < 0.01) return 'excellent';
      if (rtt < 200 && lossRate < 0.03) return 'good';
      if (rtt < 400 && lossRate < 0.08) return 'fair';
      return 'poor';
    } catch {
      return 'unknown';
    }
  }

  // ─── Getters ───────────────────────────────────────────────────────────────

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getLocalIceCandidates(): RTCIceCandidateJSON[] {
    return this.localIceCandidates;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  getPeerConnection(): RTCPeerConnection | null {
    return this.pc;
  }

  getConnectionState(): RTCPeerConnectionState | 'none' {
    return this.pc?.connectionState ?? 'none';
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  stopLocalStream(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
  }

  close(): void {
    this.stopNetworkQualityMonitoring();
    this.stopLocalStream();

    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.onnegotiationneeded = null;
      this.pc.close();
      this.pc = null;
    }

    this.remoteStream = null;
    this.pendingCandidates = [];
    this.localIceCandidates = [];
    this.remoteDescSet = false;
    this.listeners = {};
    this.networkQualityCallback = undefined;
  }
}

export const webRTCPeerService = new WebRTCPeerService();
export default webRTCPeerService;
