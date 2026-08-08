import { Platform } from 'react-native';
import { ADMOB_CONFIG } from '../config/admob';
import { analyticsService } from './analyticsService';
import { showToast } from '../components/ToastBanner';

let memoryOpenCount = 0;
const INTERSTITIAL_FREQUENCY_THRESHOLD = 15;

type AdListener = (shouldShow: boolean) => void;
const listeners: Set<AdListener> = new Set();

let InterstitialAd: any = null;
let RewardedAd: any = null;
let AdEventType: any = null;
let RewardedAdEventType: any = null;

if (Platform.OS === 'android' || Platform.OS === 'ios') {
  try {
    const mobileAds = require('react-native-google-mobile-ads');
    InterstitialAd = mobileAds.InterstitialAd;
    RewardedAd = mobileAds.RewardedAd;
    AdEventType = mobileAds.AdEventType;
    RewardedAdEventType = mobileAds.RewardedAdEventType;
  } catch (e) {
    console.warn('[AD_SERVICE] react-native-google-mobile-ads not loaded:', e);
  }
}

// Background preloading for Interstitial ads
let interstitialInstance: any = null;
let isInterstitialLoading = false;

const loadNextInterstitial = () => {
  if (!InterstitialAd || !AdEventType) return;
  if (interstitialInstance || isInterstitialLoading) return;

  isInterstitialLoading = true;
  const adUnitId = ADMOB_CONFIG.adUnits.interstitial;

  try {
    console.log('[AD_SERVICE] Preloading Interstitial ad...');
    const ad = InterstitialAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });

    const unsubscribeLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
      interstitialInstance = ad;
      isInterstitialLoading = false;
      console.log('[AD_SERVICE] Interstitial ad preloaded successfully.');
    });

    const unsubscribeError = ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
      console.warn('[AD_SERVICE] Interstitial ad failed to load:', error);
      isInterstitialLoading = false;
      interstitialInstance = null;
      unsubscribeLoaded();
      unsubscribeError();
    });

    ad.load();
  } catch (err) {
    console.warn('[AD_SERVICE] Error creating Interstitial ad request:', err);
    isInterstitialLoading = false;
  }
};

// Initial preload delay to let the app start first
if (Platform.OS !== 'web') {
  setTimeout(() => {
    loadNextInterstitial();
  }, 2000);
}

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

    if (interstitialInstance && AdEventType) {
      try {
        const ad = interstitialInstance;
        const unsubscribeDismissed = ad.addAdEventListener(AdEventType.CLOSED, () => {
          unsubscribeDismissed();
          interstitialInstance = null;
          console.log('[AD_SERVICE] Interstitial ad closed by user.');
          // Preload the next one immediately
          loadNextInterstitial();
        });
        await ad.show();
        return true;
      } catch (err) {
        console.warn('[AD_SERVICE] Failed to show preloaded interstitial ad:', err);
        interstitialInstance = null;
        loadNextInterstitial();
      }
    }

    // Fallback: Show local app interstitial promotion overlay if real ad isn't loaded yet
    console.log('[AD_SERVICE] No preloaded ad available. Falling back to local promo modal.');
    listeners.forEach(l => l(true));
    loadNextInterstitial();
    return true;
  },

  /**
   * Shows a Rewarded Ad (e.g. for unlocking premium storage cleanup or exports)
   */
  async showRewardedAd(onRewarded: () => void): Promise<boolean> {
    console.log('[AD_SERVICE] Triggering Rewarded Ad...');
    analyticsService.trackEvent('ad_impression', { ad_type: 'rewarded' });

    if (RewardedAd && RewardedAdEventType && AdEventType) {
      try {
        showToast('⏳ Loading video ad...');
        const adUnitId = ADMOB_CONFIG.adUnits.rewarded;
        const rewardedAd = RewardedAd.createForAdRequest(adUnitId, {
          requestNonPersonalizedAdsOnly: true,
        });

        return new Promise<boolean>((resolve) => {
          let rewardEarned = false;

          const unsubscribeLoaded = rewardedAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
            rewardedAd.show().catch((err: any) => {
              console.warn('[AD_SERVICE] Failed to show rewarded ad:', err);
              // Fallback if show fails (grant benefit anyway so user has a good experience)
              analyticsService.trackEvent('ad_click', { ad_type: 'rewarded' });
              onRewarded();
              resolve(true);
            });
          });

          const unsubscribeReward = rewardedAd.addAdEventListener(
            RewardedAdEventType.EARNED_REWARD,
            () => {
              rewardEarned = true;
            }
          );

          const unsubscribeClosed = rewardedAd.addAdEventListener(AdEventType.CLOSED, () => {
            unsubscribeLoaded();
            unsubscribeReward();
            unsubscribeClosed();
            unsubscribeError();

            if (rewardEarned) {
              analyticsService.trackEvent('ad_click', { ad_type: 'rewarded' });
              showToast('🏆 Rewarded Ad completed! Feature unlocked.');
              onRewarded();
            } else {
              showToast('⚠️ Ad closed before completion. Reward not earned.');
            }
            resolve(true);
          });

          const unsubscribeError = rewardedAd.addAdEventListener(AdEventType.ERROR, (error: any) => {
            console.warn('[AD_SERVICE] Rewarded ad error:', error);
            unsubscribeLoaded();
            unsubscribeReward();
            unsubscribeClosed();
            unsubscribeError();
            // Fallback: Unlock anyway if ad fails to load so user is never stuck
            showToast('🏆 Ad failed to load. Feature unlocked anyway!');
            analyticsService.trackEvent('ad_click', { ad_type: 'rewarded' });
            onRewarded();
            resolve(true);
          });

          rewardedAd.load();
        });
      } catch (err) {
        console.warn('[AD_SERVICE] Rewarded ad exception:', err);
      }
    }

    // Web / fallback simulation
    showToast('🏆 Rewarded Ad completed! Feature unlocked.');
    analyticsService.trackEvent('ad_click', { ad_type: 'rewarded' });
    onRewarded();
    return true;
  }
};

export default adService;
