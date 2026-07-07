import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import { AppStackParamList } from '../types/navigation';
import AuthNavigator from './AuthNavigator';
import MainTabs from './MainTabs';
import TelegramConnectScreen from '../screens/TelegramConnectScreen';
import PreviewScreen from '../screens/PreviewScreen';
import FileDetailsScreen from '../screens/FileDetailsScreen';
import MemoriesViewerScreen from '../screens/MemoriesViewerScreen';
import SplashScreen from '../screens/SplashScreen';
import UsernameSetupScreen from '../screens/UsernameSetupScreen';
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
import { Session } from '@supabase/supabase-js';
import { authEvents } from '../utils/authEvent';
import { telegramService } from '../services/telegramService';
import { Alert } from 'react-native';

const Stack = createNativeStackNavigator<AppStackParamList>();

export const AppNavigator: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasUsername, setHasUsername] = useState<boolean | null>(null);
  const [restoringConfig, setRestoringConfig] = useState(false);

  const checkUsername = async (userId: string, email?: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .maybeSingle();

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

        // Defer Telegram initialization to the background to speed up startup
        telegramService.initConfig().then(async () => {
          const config = await telegramService.getTelegramConfig();
          if (!config.botToken || !config.channelId) {
            console.warn('Telegram storage not configured.');
          }
        }).catch(err => {
          console.error('Failed restoring Telegram config:', err);
        });
      } else {
        setHasUsername(null);
        setLoading(false);
      }
    };

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
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
            <Stack.Screen name="MemoriesViewer" component={MemoriesViewerScreen} />
          </>
        )
      ) : (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      )}
    </Stack.Navigator>
  );
};

export default AppNavigator;
