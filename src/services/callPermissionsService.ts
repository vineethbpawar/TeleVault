/**
 * Call Permissions Service
 *
 * Handles requesting and checking microphone/camera permissions
 * across Android and Web using expo-camera.
 */

import { Platform } from 'react-native';
import { Camera } from 'expo-camera';

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
      // Use expo-camera to request permissions at OS level
      // This prevents locking the camera hardware before the actual call starts
      const micStatus = await Camera.requestMicrophonePermissionsAsync();
      result.microphone = micStatus.granted;

      if (video) {
        const camStatus = await Camera.requestCameraPermissionsAsync();
        result.camera = camStatus.granted;
      } else {
        result.camera = true;
      }
    } catch (err: any) {
      console.warn('[Permissions] Native permission error:', err?.message || err);
      // Fallback in case of unexpected library failure
      result.microphone = true;
      result.camera = true;
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
      const status = await Camera.getMicrophonePermissionsAsync();
      return status.granted;
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
      const status = await Camera.getCameraPermissionsAsync();
      return status.granted;
    } catch {
      return false;
    }
  }
}

export const callPermissionsService = new CallPermissionsService();
export default callPermissionsService;
