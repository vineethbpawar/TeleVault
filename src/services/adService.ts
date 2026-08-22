import { analyticsService } from './analyticsService';
import { showToast } from '../components/ToastBanner';

export const adService = {
  subscribe(listener: (shouldShow: boolean) => void) {
    return () => {};
  },

  registerMemoryOpen() {
    // No-op
  },

  async showInterstitialAd(): Promise<boolean> {
    return true;
  },

  async showRewardedAd(onRewarded: () => void): Promise<boolean> {
    // Automatically grant the reward without showing any ad
    onRewarded();
    return true;
  }
};

export default adService;
