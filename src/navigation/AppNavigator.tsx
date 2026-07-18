import React, { useEffect, useState, useCallback } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import { AppStackParamList } from '../types/navigation';
import * as ExpoSplash from 'expo-splash-screen';
import AuthNavigator from './AuthNavigator';
import MainTabs from './MainTabs';
import TelegramConnectScreen from '../screens/TelegramConnectScreen';
import PreviewScreen from '../screens/PreviewScreen';
import FileDetailsScreen from '../screens/FileDetailsScreen';
import MemoriesViewerScreen from '../screens/MemoriesViewerScreen';
import SplashScreen from '../screens/SplashScreen';
import UsernameSetupScreen from '../screens/UsernameSetupScreen';
import { StorageAnalyticsScreen } from '../screens/StorageAnalyticsScreen';
import UserSearchScreen from '../screens/UserSearchScreen';
import ChatListScreen from '../screens/ChatListScreen';
import ChatRoomScreen from '../screens/ChatRoomScreen';
import SnapInboxScreen from '../screens/SnapInboxScreen';
import StoriesScreen from '../screens/StoriesScreen';
import SnapViewerScreen from '../screens/SnapViewerScreen';
import FriendsScreen from '../screens/FriendsScreen';
import FriendRequestsScreen from '../screens/FriendRequestsScreen';
import BlockedUsersScreen from '../screens/BlockedUsersScreen';
import ReportUserScreen from '../screens/ReportUserScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import GroupsScreen from '../screens/GroupsScreen';
import GroupChatScreen from '../screens/GroupChatScreen';
import CreateGroupScreen from '../screens/CreateGroupScreen';
import AdminDashboardScreen from '../screens/AdminDashboardScreen';
import ChunkManagerScreen from '../screens/ChunkManagerScreen';
import PrivateDriveScreen from '../screens/PrivateDriveScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import MyProfileScreen from '../screens/MyProfileScreen';
import SendToScreen from '../screens/SendToScreen';
import ChatCameraScreen from '../screens/ChatCameraScreen';
import CallHistoryScreen from '../screens/CallHistoryScreen';
import CallOverlay from '../components/CallOverlay';
import { Session } from '@supabase/supabase-js';
import { authEvents } from '../utils/authEvent';
import { telegramService } from '../services/telegramService';
import { Alert, AppState, AppStateStatus, Platform, View, Text, StyleSheet } from 'react-native';
import { securityService } from '../services/securityService';
import { PinLockModal } from '../components/PinLockModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { networkService } from '../services/networkService';

const Stack = createNativeStackNavigator<AppStackParamList>();

export const AppNavigator: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasUsername, setHasUsername] = useState<boolean | null>(null);
  const [restoringConfig, setRestoringConfig] = useState(false);
  const [appLocked, setAppLocked] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const insets = useSafeAreaInsets();

  // Safety net: always hide the native splash after 5 seconds max,
  // in case auth/network check hangs (e.g. no connectivity on first launch)
  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      ExpoSplash.hideAsync().catch(() => {});
    }, 5000);
    return () => clearTimeout(safetyTimer);
  }, []);

  useEffect(() => {
    // 1. Initial connectivity check
    networkService.isOnline().then(setIsOnline);

    // 2. Periodic background verification check
    const interval = setInterval(async () => {
      const online = await networkService.isOnline();
      setIsOnline(online);
    }, 10000);

    // 3. Web event listeners
    if (Platform.OS === 'web') {
      const handleOnline = () => setIsOnline(true);
      const handleOffline = async () => {
        const online = await networkService.isOnline();
        setIsOnline(online);
      };
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        clearInterval(interval);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isOnline) {
      try {
        const { uploadQueueService } = require('../services/uploadQueueService');
        uploadQueueService.processUploadQueue().catch((err: any) => console.warn('Offline sync failed:', err));
      } catch (_) {}
    }
  }, [isOnline]);

  useEffect(() => {
    const checkInitialLock = async () => {
      const appLockActive = await securityService.isAppLockEnabled();
      if (appLockActive) {
        setAppLocked(true);
      }
      
      if (session) {
        try {
          const { uploadQueueService } = require('../services/uploadQueueService');
          uploadQueueService.processUploadQueue().catch((err: any) => console.warn('Offline sync failed:', err));
        } catch (_) {}
      }
    };
    checkInitialLock();
  }, [session]);

  useEffect(() => {
    let backgroundTime = 0;

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background') {
        backgroundTime = Date.now();
      } else if (nextAppState === 'active') {
        const ignoreLock = securityService.shouldIgnoreLock();
        if (ignoreLock) {
          backgroundTime = 0;
          return;
        }

        const appLockActive = await securityService.isAppLockEnabled();
        if (appLockActive && backgroundTime > 0) {
          const elapsed = (Date.now() - backgroundTime) / 1000;
          if (elapsed > 120) {
            setAppLocked(true);
          }
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  const checkUsername = async (userId: string, email?: string) => {
    try {
      // 4-second safety timeout for profile check to prevent hangs on startup
      const profilePromise = supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .maybeSingle();

      const timeoutPromise = new Promise<any>((resolve) =>
        setTimeout(() => resolve({ data: { username: 'offline_user' }, error: null }), 4000)
      );

      const { data, error } = await Promise.race([profilePromise, timeoutPromise]);

      if (error) {
        console.error('Fetch profile username error:', error);
        setHasUsername(false);
        return;
      }

      if (data && data.username) {
        setHasUsername(true);
      } else {
        // If profile row doesn't exist at all, create it
        if (!data && email) {
          const { error: insertError } = await supabase
            .from('profiles')
            .insert({ id: userId, email });
          
          if (insertError) {
            console.error('Error inserting placeholder profile:', insertError);
          }
        }
        setHasUsername(false);
      }
    } catch (err) {
      console.error('checkUsername catch:', err);
      setHasUsername(false);
    }
  };

  useEffect(() => {
    const checkUserAndSession = async (currSession: Session | null) => {
      if (currSession) {
        setRestoringConfig(true);
        await checkUsername(currSession.user.id, currSession.user.email);
        setRestoringConfig(false);
        setLoading(false);
        // Hide the native splash screen now that auth is resolved
        ExpoSplash.hideAsync().catch(() => {});

        // Defer Telegram initialization to the background to speed up startup
        telegramService.initConfig().then(async () => {
          const config = await telegramService.getTelegramConfig();
          if (!config.botToken || !config.channelId) {
            console.warn('Telegram storage not configured.');
          }
          if (Platform.OS !== 'web') {
            try {
              const { backgroundUploadService } = require('../services/backgroundUploadTask');
              await backgroundUploadService.registerBackgroundUploadTask();
            } catch (_) {}
          }
        }).catch(err => {
          console.error('Failed restoring Telegram config:', err);
        });
      } else {
        setHasUsername(null);
        setLoading(false);
        // Hide the native splash screen for the unauthenticated path too
        ExpoSplash.hideAsync().catch(() => {});
      }
    };

    // Get initial session with 3-second safety timeout
    const sessionPromise = supabase.auth.getSession();
    const sessionTimeout = new Promise<any>((resolve) =>
      setTimeout(() => resolve({ data: { session: null } }), 3000)
    );

    Promise.race([sessionPromise, sessionTimeout]).then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      checkUserAndSession(initialSession);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      checkUserAndSession(currentSession);
    });

    // Listen to profile setup completes
    const unsubscribeAuth = authEvents.subscribe(() => {
      supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
        if (currentSession) {
          checkUsername(currentSession.user.id, currentSession.user.email);
        }
      });
    });

    return () => {
      subscription.unsubscribe();
      unsubscribeAuth();
    };
  }, []);

  if (loading || (session && hasUsername === null)) {
    return <SplashScreen />;
  }

  if (restoringConfig) {
    return <SplashScreen message="Restoring Telegram connection…" />;
  }

  return (
    <View style={navigatorStyles.root}>
      {!isOnline && (
        <View style={[navigatorStyles.offlineBanner, {
          paddingTop: Platform.OS === 'web'
            ? ('calc(8px + env(safe-area-inset-top))' as any)
            : 8 + insets.top,
        }]}>
          <Text style={navigatorStyles.offlineText}>
            ⚠️ Offline Mode — Some features may be unavailable.
          </Text>
        </View>
      )}
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          hasUsername === false ? (
            <Stack.Screen name="UsernameSetup" component={UsernameSetupScreen} />
          ) : (
            <>
              <Stack.Screen name="Main" component={MainTabs} />
              <Stack.Screen name="TelegramConnect" component={TelegramConnectScreen} />
              <Stack.Screen name="Preview" component={PreviewScreen} />
              <Stack.Screen name="FileDetails" component={FileDetailsScreen} />
              <Stack.Screen name="UserSearch" component={UserSearchScreen} />
              <Stack.Screen name="ChatList" component={ChatListScreen} />
              <Stack.Screen name="ChatRoom" component={ChatRoomScreen} />
              <Stack.Screen name="SnapInbox" component={SnapInboxScreen} />
              <Stack.Screen name="Stories" component={StoriesScreen} />
              <Stack.Screen name="SnapViewer" component={SnapViewerScreen} />
              <Stack.Screen name="Friends" component={FriendsScreen} />
              <Stack.Screen name="FriendRequests" component={FriendRequestsScreen} />
              <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
              <Stack.Screen name="ReportUser" component={ReportUserScreen} />
              <Stack.Screen name="Notifications" component={NotificationsScreen} />
              <Stack.Screen name="Groups" component={GroupsScreen} />
              <Stack.Screen name="GroupChat" component={GroupChatScreen} />
              <Stack.Screen name="CreateGroup" component={CreateGroupScreen} />
              <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
              <Stack.Screen name="ChunkManager" component={ChunkManagerScreen} />
              <Stack.Screen name="PrivateDrive" component={PrivateDriveScreen} />
              <Stack.Screen name="UserProfile" component={UserProfileScreen} />
              <Stack.Screen name="MyProfile" component={MyProfileScreen} />
              <Stack.Screen name="SendTo" component={SendToScreen} />
              <Stack.Screen name="ChatCamera" component={ChatCameraScreen} />
              <Stack.Screen name="CallHistory" component={CallHistoryScreen} />
              <Stack.Screen
                name="MemoriesViewer"
                component={MemoriesViewerScreen}
                options={{
                  presentation: 'transparentModal',
                  animation: 'fade',
                  contentStyle: { backgroundColor: 'transparent' }
                }}
              />
              <Stack.Screen name="StorageAnalytics" component={StorageAnalyticsScreen} />
            </>
          )
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>

      {appLocked && (
        <PinLockModal
          visible={appLocked}
          onClose={() => {}}
          onSuccess={() => setAppLocked(false)}
          mode="verify"
          undismissable={true}
        />
      )}

      {/* Global call overlay - handles incoming calls and active call UI */}
      {session && hasUsername && <CallOverlay />}
    </View>
  );
};

const navigatorStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  offlineBanner: {
    backgroundColor: '#FF453A',
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    zIndex: 9999,
    position: 'relative',
  },
  offlineText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});

export default AppNavigator;
