import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, Platform, TouchableOpacity } from 'react-native';
import { Sparkles, ExternalLink } from 'lucide-react-native';
import { analyticsService } from '../services/analyticsService';
import { ADMOB_CONFIG } from '../config/admob';

export interface AdBannerProps {
  unitId?: string;
  style?: any;
}

let BannerAd: any = null;
let BannerAdSize: any = null;

if (Platform.OS === 'android' || Platform.OS === 'ios') {
  try {
    const mobileAds = require('react-native-google-mobile-ads');
    BannerAd = mobileAds.BannerAd;
    BannerAdSize = mobileAds.BannerAdSize;
  } catch (e) {
    // Native module not linked or running on Expo Go
  }
}

/**
 * AdBanner Component
 * Integrates Google AdMob Banner Ads on native Android devices,
 * Google AdSense Banner Ads on Web / PWA (when approved),
 * with an aesthetic fallback card if pending approval or offline.
 */
export const AdBanner: React.FC<AdBannerProps> = ({ unitId = ADMOB_CONFIG.adUnits.banner, style }) => {
  const [adLoaded, setAdLoaded] = useState(false);

  const handleBannerClick = () => {
    analyticsService.trackEvent('ad_click', { ad_type: 'banner' });
  };

  const [adFailed, setAdFailed] = useState(false);

  useEffect(() => {
    analyticsService.trackEvent('ad_impression', { ad_type: 'banner' });

    if (Platform.OS === 'web') {
      try {
        // @ts-ignore
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        setAdLoaded(true);
      } catch (e) {
        console.log('AdSense push error: ', e);
      }
    }
  }, []);

  // 1. Native Mobile (Android/iOS) AdMob Banner
  if (BannerAd && BannerAdSize && !adFailed && (Platform.OS === 'android' || Platform.OS === 'ios')) {
    return (
      <View style={[styles.adWrapper, style]}>
        <BannerAd
          unitId={unitId}
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          requestOptions={{
            requestNonPersonalizedAdsOnly: true,
          }}
          onAdLoaded={() => {
            analyticsService.trackEvent('ad_impression', { ad_type: 'banner' });
          }}
          onAdFailedToLoad={(error: any) => {
            console.log('AdMob banner failed to load: ', error);
            setAdFailed(true);
          }}
        />
      </View>
    );
  }

  // 2. Web / PWA Google AdSense Banner
  if (Platform.OS === 'web' && adLoaded) {
    return (
      <View style={[styles.adWrapper, style]}>
        {/* @ts-ignore */}
        <ins
          className="adsbygoogle"
          style={{ display: 'block', width: '100%', minHeight: 60 }}
          data-ad-client={ADMOB_CONFIG.adsense.client}
          data-ad-slot={ADMOB_CONFIG.adsense.bannerSlot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </View>
    );
  }

  // 3. Fallback Promo Card
  return (
    <TouchableOpacity
      style={[styles.container, style]}
      activeOpacity={0.85}
      onPress={handleBannerClick}
    >
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Ad</Text>
      </View>
      <View style={styles.content}>
        <Sparkles size={16} color="#FFFC00" style={{ marginRight: 6 }} />
        <Text style={styles.adText} numberOfLines={1}>
          TeleVault Premium • Unlimited Telegram Cloud Storage
        </Text>
      </View>
      <ExternalLink size={14} color="#8E8E93" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  adWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
    width: '100%',
    minHeight: 50,
    overflow: 'hidden',
  },
  container: {
    backgroundColor: '#0F1221',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 2,
    height: 40,
  },
  badge: {
    backgroundColor: 'rgba(255, 252, 0, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    marginRight: 6,
  },
  badgeText: {
    color: '#FFFC00',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  adText: {
    color: '#D1D1D6',
    fontSize: 11,
    fontWeight: '500',
  },
});

export default AdBanner;
