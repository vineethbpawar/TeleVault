import React from 'react';
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
    // Native module not linked or running on Expo Go/Web
  }
}

/**
 * AdBanner Component
 * Integrates Google AdMob Banner Ads on native Android devices,
 * with an aesthetic fallback card for PWA / Web.
 */
export const AdBanner: React.FC<AdBannerProps> = ({ unitId = ADMOB_CONFIG.adUnits.banner, style }) => {
  const handleBannerClick = () => {
    analyticsService.trackEvent('ad_click', { ad_type: 'banner' });
  };

  React.useEffect(() => {
    analyticsService.trackEvent('ad_impression', { ad_type: 'banner' });
  }, []);

  if (BannerAd && BannerAdSize && (Platform.OS === 'android' || Platform.OS === 'ios')) {
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
          }}
        />
      </View>
    );
  }

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
    marginVertical: 8,
  },
  container: {
    backgroundColor: '#0F1221',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  badge: {
    backgroundColor: 'rgba(255, 252, 0, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  badgeText: {
    color: '#FFFC00',
    fontSize: 10,
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
    fontSize: 12,
    fontWeight: '500',
  },
});

export default AdBanner;
