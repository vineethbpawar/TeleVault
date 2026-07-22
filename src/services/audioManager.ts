/**
 * Audio Manager
 *
 * Manages audio routing for calls:
 * - Speaker / Earpiece switching
 * - Bluetooth audio
 * - Ringtone playback
 * - Audio focus / interruption handling
 *
 * Cross-platform: handles web audio context, Android InCallManager.
 */

import { Platform } from 'react-native';

// Conditionally import InCallManager only on native
let InCallManager: any = null;

if (Platform.OS !== 'web') {
  try {
    InCallManager = require('react-native-incall-manager').default;
  } catch (err) {
    console.warn('[AudioManager] react-native-incall-manager not available:', err);
  }
}

export type AudioRoute = 'earpiece' | 'speaker' | 'bluetooth' | 'headset' | 'default';

class AudioManager {
  private currentRoute: AudioRoute = 'default';
  private isCallActive = false;

  // ─── Call Audio Session ────────────────────────────────────────────────────

  startCallAudio(isVideo: boolean): void {
    this.isCallActive = true;

    if (Platform.OS === 'web') {
      // Web handles audio routing automatically
      return;
    }

    if (InCallManager) {
      try {
        InCallManager.start({ media: isVideo ? 'video' : 'audio' });
        // Default to earpiece for voice calls, speaker for video
        if (isVideo) {
          InCallManager.setForceSpeakerphoneOn(true);
          InCallManager.chooseAudioRoute('SPEAKER');
          this.currentRoute = 'speaker';
        } else {
          InCallManager.setForceSpeakerphoneOn(false);
          InCallManager.chooseAudioRoute('EARPIECE');
          this.currentRoute = 'earpiece';
        }

        // Force the route again after a short delay (500ms) to ensure it overrides
        // any OS-level transitions or delayed ringtone release locks.
        setTimeout(() => {
          if (this.isCallActive) {
            try {
              if (this.currentRoute === 'speaker') {
                InCallManager.setForceSpeakerphoneOn(true);
                InCallManager.chooseAudioRoute('SPEAKER');
              } else if (this.currentRoute === 'earpiece') {
                InCallManager.setForceSpeakerphoneOn(false);
                InCallManager.chooseAudioRoute('EARPIECE');
              }
            } catch (err) {
              console.warn('[AudioManager] startCallAudio deferred route error:', err);
            }
          }
        }, 500);
      } catch (err) {
        console.warn('[AudioManager] startCallAudio error:', err);
      }
    }
  }

  stopCallAudio(): void {
    this.isCallActive = false;

    if (Platform.OS === 'web') return;

    if (InCallManager) {
      try {
        InCallManager.stop();
        this.currentRoute = 'default';
      } catch (err) {
        console.warn('[AudioManager] stopCallAudio error:', err);
      }
    }
  }

  // ─── Speaker Control ───────────────────────────────────────────────────────

  setSpeakerOn(on: boolean): void {
    this.currentRoute = on ? 'speaker' : 'earpiece';

    if (Platform.OS === 'web') {
      // Web audio output is controlled by the browser
      return;
    }

    if (InCallManager) {
      try {
        InCallManager.setForceSpeakerphoneOn(on);
        InCallManager.chooseAudioRoute(on ? 'SPEAKER' : 'EARPIECE');
      } catch (err) {
        console.warn('[AudioManager] setSpeakerOn error:', err);
      }
    }
  }

  // ─── Ringtone ─────────────────────────────────────────────────────────────

  startRingtone(ringback = false): void {
    if (Platform.OS === 'web') {
      this.startWebRingtone(ringback);
      return;
    }

    if (InCallManager) {
      try {
        if (ringback) {
          InCallManager.startRingback('_DTMF_');
        } else {
          InCallManager.startRingtone('_DEFAULT_');
        }
      } catch (err) {
        console.warn('[AudioManager] startRingtone error:', err);
      }
    }
  }

  stopRingtone(): void {
    if (Platform.OS === 'web') {
      this.stopWebRingtone();
      return;
    }

    if (InCallManager) {
      try {
        InCallManager.stopRingtone();
        InCallManager.stopRingback();
      } catch (err) {
        console.warn('[AudioManager] stopRingtone error:', err);
      }
    }
  }

  // ─── Web Ringtone ─────────────────────────────────────────────────────────

  private webAudioContext: AudioContext | null = null;
  private webOscillator: OscillatorNode | null = null;
  private webRingtoneInterval: ReturnType<typeof setInterval> | null = null;

  private startWebRingtone(ringback: boolean): void {
    if (typeof window === 'undefined' || !window.AudioContext) return;

    try {
      this.stopWebRingtone();

      const playTone = () => {
        const ctx = new AudioContext();
        this.webAudioContext = ctx;

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = ringback ? 440 : 480;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.3;

        oscillator.start();
        this.webOscillator = oscillator;

        setTimeout(() => {
          try {
            oscillator.stop();
            ctx.close();
          } catch (_) {}
        }, 800);
      };

      // Ring pattern: 800ms on, 1200ms off
      playTone();
      this.webRingtoneInterval = setInterval(playTone, 2000);
    } catch (err) {
      console.warn('[AudioManager] startWebRingtone error:', err);
    }
  }

  private stopWebRingtone(): void {
    if (this.webRingtoneInterval) {
      clearInterval(this.webRingtoneInterval);
      this.webRingtoneInterval = null;
    }

    try {
      this.webOscillator?.stop();
      this.webAudioContext?.close();
    } catch (_) {}

    this.webOscillator = null;
    this.webAudioContext = null;
  }

  // ─── Vibration ────────────────────────────────────────────────────────────

  startVibration(): void {
    if (Platform.OS === 'web') {
      if (navigator.vibrate) {
        // Vibrate pattern: 400ms on, 200ms off, repeat
        const pattern = [400, 200, 400, 200, 400];

        const vibrate = () => navigator.vibrate(pattern);
        vibrate();
        (this as any)._vibrationInterval = setInterval(vibrate, 2000);
      }
      return;
    }

    // On native, InCallManager handles vibration with ringtone
  }

  stopVibration(): void {
    if (Platform.OS === 'web') {
      if (navigator.vibrate) navigator.vibrate(0);
      if ((this as any)._vibrationInterval) {
        clearInterval((this as any)._vibrationInterval);
        (this as any)._vibrationInterval = null;
      }
    }
  }

  // ─── Current State ─────────────────────────────────────────────────────────

  getCurrentRoute(): AudioRoute {
    return this.currentRoute;
  }

  isActive(): boolean {
    return this.isCallActive;
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  cleanup(): void {
    this.stopRingtone();
    this.stopVibration();
    this.stopCallAudio();
  }
}

export const audioManager = new AudioManager();
export default audioManager;
