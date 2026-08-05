import { analyticsService } from './analyticsService';
import { showToast } from '../components/ToastBanner';

let memoryOpenCount = 0;
const INTERSTITIAL_FREQUENCY_THRESHOLD = 15;

type AdListener = (shouldShow: boolean) => void;
const listeners: Set<AdListener> = new Set();

export const adService = {
  subscribe(listener: AdListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Tracks memory views and triggers Interstitial Ad on the 15th view
   */
  registerMemoryOpen() {
    memoryOpenCount += 1;
    console.log(`[AD_SERVICE] Memory viewed (${memoryOpenCount}/${INTERSTITIAL_FREQUENCY_THRESHOLD})`);

    if (memoryOpenCount >= INTERSTITIAL_FREQUENCY_THRESHOLD) {
      memoryOpenCount = 0;
      this.showInterstitialAd();
    }
  },

  /**
   * Shows an Interstitial Ad
   */
  async showInterstitialAd(): Promise<boolean> {
    console.log('[AD_SERVICE] Triggering Interstitial Ad (Frequency Capped)...');
    analyticsService.trackEvent('ad_impression', { ad_type: 'interstitial' });
    listeners.forEach(l => l(true));
    return true;
  },

  /**
   * Shows a Rewarded Ad (e.g. for unlocking premium storage cleanup or exports)
   */
  async showRewardedAd(onRewarded: () => void): Promise<boolean> {
    console.log('[AD_SERVICE] Triggering Rewarded Ad...');
    analyticsService.trackEvent('ad_impression', { ad_type: 'rewarded' });
    showToast('🏆 Rewarded Ad completed! Feature unlocked.');
    analyticsService.trackEvent('ad_click', { ad_type: 'rewarded' });
    onRewarded();
    return true;
  }
};

export default adService;
