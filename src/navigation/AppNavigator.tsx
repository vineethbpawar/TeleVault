import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import { AppStackParamList } from '../types/navigation';
import AuthNavigator from './AuthNavigator';
import MainTabs from './MainTabs';
import TelegramConnectScreen from '../screens/TelegramConnectScreen';
import PreviewScreen from '../screens/PreviewScreen';
import FileDetailsScreen from '../screens/FileDetailsScreen';
import SplashScreen from '../screens/SplashScreen';
import { Session } from '@supabase/supabase-js';

const Stack = createNativeStackNavigator<AppStackParamList>();

export const AppNavigator: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <SplashScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {session ? (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="TelegramConnect" component={TelegramConnectScreen} />
          <Stack.Screen name="Preview" component={PreviewScreen} />
          <Stack.Screen name="FileDetails" component={FileDetailsScreen} />
        </>
      ) : (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      )}
    </Stack.Navigator>
  );
};

export default AppNavigator;
