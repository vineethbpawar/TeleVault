/**
 * Call Permissions Service
 *
 * Handles requesting and checking microphone/camera permissions
 * across Android and Web.
 */

import { Platform } from 'react-native';

export interface PermissionResult {
  microphone: boolean;
  camera: boolean;
}

class CallPermissionsService {
  // ─── Web Permissions ───────────────────────────────────────────────────────

  private async requestWebPermissions(video: boolean): Promise<PermissionResult> {
    const result: PermissionResult = { microphone: false, camera: false };

    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      result.microphone = stream.getAudioTracks().length > 0;
      result.camera = !video || stream.getVideoTracks().length > 0;

      // Stop tracks immediately - we just needed to check permission
      stream.getTracks().forEach((t) => t.stop());
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        console.warn('[Permissions] Web media permissions denied');
      } else if (err.name === 'NotFoundError') {
        // Device not found, but permission is fine
        result.microphone = true;
        result.camera = false;
      } else {
        console.error('[Permissions] Web getUserMedia error:', err);
      }
    }

    return result;
  }

  // ─── Native Permissions ───────────────────────────────────────────────────

  private async requestNativePermissions(video: boolean): Promise<PermissionResult> {
    const result: PermissionResult = { microphone: false, camera: false };

    try {
      // react-native-webrtc handles permission requests internally
      // when getUserMedia is called. We use a test call here.
      const webrtc = require('react-native-webrtc');
      const stream = await webrtc.mediaDevices.getUserMedia({
        audio: true,
        video,
      });

      result.microphone = stream.getAudioTracks().length > 0;
      result.camera = !video || stream.getVideoTracks().length > 0;

      stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    } catch (err: any) {
      console.warn('[Permissions] Native permission error:', err?.message || err);

      // If error is about permissions (not device missing)
      if (
        err?.message?.includes('Permission') ||
        err?.message?.includes('permission')
      ) {
        result.microphone = false;
        result.camera = false;
      } else {
        // Device issue, assume permission might be granted
        result.microphone = true;
        result.camera = false;
      }
    }

    return result;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  async requestCallPermissions(video: boolean): Promise<PermissionResult> {
    if (Platform.OS === 'web') {
      return this.requestWebPermissions(video);
    }
    return this.requestNativePermissions(video);
  }

  async checkMicrophonePermission(): Promise<boolean> {
    if (Platform.OS === 'web') {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' as any });
        return result.state === 'granted';
      } catch {
        return false;
      }
    }

    try {
      // Check existing permission without prompting
      const webrtc = require('react-native-webrtc');
      const stream = await webrtc.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      return true;
    } catch {
      return false;
    }
  }

  async checkCameraPermission(): Promise<boolean> {
    if (Platform.OS === 'web') {
      try {
        const result = await navigator.permissions.query({ name: 'camera' as any });
        return result.state === 'granted';
      } catch {
        return false;
      }
    }

    try {
      const webrtc = require('react-native-webrtc');
      const stream = await webrtc.mediaDevices.getUserMedia({ audio: false, video: true });
      stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      return true;
    } catch {
      return false;
    }
  }
}

export const callPermissionsService = new CallPermissionsService();
export default callPermissionsService;
