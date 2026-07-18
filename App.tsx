import React, { useEffect } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastBanner } from './src/components/ToastBanner';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ExpoSplash from 'expo-splash-screen';

// Keep the native splash screen visible while auth state loads.
// AppNavigator will call ExpoSplash.hideAsync() once ready.
ExpoSplash.preventAutoHideAsync().catch(() => {
  // Already hidden or error — safe to ignore
});

export const navigationRef = createNavigationContainerRef();

export default function App() {
  useEffect(() => {
    // Defer non-critical background initialization to improve PWA startup speed
    const timer = setTimeout(() => {
      Promise.all([
        import('./src/services/backgroundUploadTask'),
        import('./src/services/uploadQueueService')
      ]).then(([{ backgroundUploadService }, { uploadQueueService }]) => {
        // Register background task on startup
        backgroundUploadService.registerBackgroundUploadTask();

        // Start upload queue processing on launch
        uploadQueueService.processUploadQueue();
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
        <NavigationContainer ref={navigationRef}>
          <AppNavigator />
          <StatusBar style="light" />
          <ToastBanner />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

