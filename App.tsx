import React, { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastBanner } from './src/components/ToastBanner';

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

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AppNavigator />
        <StatusBar style="light" />
        <ToastBanner />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

