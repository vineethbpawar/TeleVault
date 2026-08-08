import React, { useEffect } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastBanner } from './src/components/ToastBanner';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ExpoSplash from 'expo-splash-screen';

// Keep the native splash screen visible while auth state loads (Native only).
if (Platform.OS !== 'web') {
  ExpoSplash.preventAutoHideAsync().catch(() => {});
}

export const navigationRef = createNavigationContainerRef();

const linking = {
  prefixes: ['televault://'],
  config: {
    screens: {
      ResetPassword: 'reset-password',
    },
  },
};

export default function App() {
  useEffect(() => {
    // Defer non-critical background initialization to improve PWA startup speed
    const timer = setTimeout(() => {
      // Initialize Google Mobile Ads SDK on native platforms
      if (Platform.OS !== 'web') {
        try {
          const mobileAds = require('react-native-google-mobile-ads').default;
          mobileAds().initialize().then((adapterStatuses: any) => {
            console.log('[ADMOB] SDK initialized successfully:', adapterStatuses);
          }).catch((err: any) => {
            console.warn('[ADMOB] Initialization error:', err);
          });
        } catch (e) {
          console.warn('[ADMOB] Failed to load react-native-google-mobile-ads:', e);
        }
      } else {
        // Load Google AdSense script on Web/PWA dynamically to improve loading speed
        try {
          const script = document.createElement('script');
          script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5904116027634574";
          script.async = true;
          script.crossOrigin = "anonymous";
          document.head.appendChild(script);
          console.log('[ADSENSE] Script injected in background');
        } catch (e) {
          console.warn('[ADSENSE] Failed to inject AdSense script:', e);
        }
      }

      Promise.all([
        import('./src/services/backgroundUploadTask'),
        import('./src/services/uploadQueueService'),
        import('./src/services/autoSyncService')
      ]).then(([{ backgroundUploadService }, { uploadQueueService }, { autoSyncService }]) => {
        // Register background task on startup
        backgroundUploadService.registerBackgroundUploadTask();

        // Start upload queue processing on launch
        uploadQueueService.processUploadQueue();

        // Trigger camera roll auto-sync scan on launch
        autoSyncService.syncCameraRoll();
      }).catch(err => {
        console.warn('[STARTUP_OPTIMIZATION] Failed lazy-loading background services:', err);
      });
    }, 1000);

    // Listen to app status changes
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        console.log('App returned to foreground. Resuming pending uploads...');
        import('./src/services/uploadQueueService').then(({ uploadQueueService }) => {
          uploadQueueService.processUploadQueue();
        }).catch(err => {
          console.warn('[STARTUP_OPTIMIZATION] Failed resuming upload queue:', err);
        });
      }
    });

    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  // Guarantee native splash screen hides after 2.5s even if auth or network is delayed
  useEffect(() => {
    if (Platform.OS !== 'web') {
      const splashTimer = setTimeout(() => {
        ExpoSplash.hideAsync().catch(() => {});
      }, 2500);
      return () => clearTimeout(splashTimer);
    }
  }, []);

  // Custom iOS swipe-to-go-back gesture for Web PWA
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    let startX = 0;
    let startY = 0;
    let isSwipeCandidate = false;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      // Swipe must start near the left edge of the screen
      if (touch.clientX < 35) {
        startX = touch.clientX;
        startY = touch.clientY;
        isSwipeCandidate = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isSwipeCandidate || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = Math.abs(touch.clientY - startY);

      // Disqualify if user moves vertically before swiping horizontally
      if (deltaY > 30 && deltaX < 30) {
        isSwipeCandidate = false;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isSwipeCandidate) return;
      isSwipeCandidate = false;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = Math.abs(touch.clientY - startY);

      // Swipe right threshold: horizontal delta > 80px and direction is horizontal
      if (deltaX > 80 && deltaX > deltaY * 1.5) {
        if (navigationRef.isReady() && navigationRef.canGoBack()) {
          navigationRef.goBack();
        }
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer ref={navigationRef} linking={linking}>
          <AppNavigator />
          <StatusBar style="light" />
          <ToastBanner />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

