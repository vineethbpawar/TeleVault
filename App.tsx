import React, { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { uploadQueueService } from './src/services/uploadQueueService';
import { backgroundUploadService } from './src/services/backgroundUploadTask';
import { ToastBanner } from './src/components/ToastBanner';

export default function App() {
  useEffect(() => {
    // Register background task on startup
    backgroundUploadService.registerBackgroundUploadTask();

    // Start upload queue processing on launch
    uploadQueueService.processUploadQueue();

    // Listen to app status changes
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        console.log('App returned to foreground. Resuming pending uploads...');
        uploadQueueService.processUploadQueue();
      }
    });

    return () => {
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

