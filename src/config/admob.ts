export const ADMOB_CONFIG = {
  appId: process.env.EXPO_PUBLIC_ADMOB_APP_ID || 'ca-app-pub-5904116027634574~3205339681',
  adUnits: {
    banner: process.env.EXPO_PUBLIC_ADMOB_BANNER_ID || 'ca-app-pub-5904116027634574/4153911114',
    interstitial: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID || 'ca-app-pub-5904116027634574/3529039247',
    rewarded: process.env.EXPO_PUBLIC_ADMOB_REWARDED_ID || 'ca-app-pub-5904116027634574/9837482638',
  },
};
