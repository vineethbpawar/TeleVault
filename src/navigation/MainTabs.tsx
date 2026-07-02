import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../types/navigation';
import { Camera, Grid, HardDrive, MessageSquare, Settings } from 'lucide-react-native';

// Import screens
import CameraScreen from '../screens/CameraScreen';
import MemoriesScreen from '../screens/MemoriesScreen';
import DriveScreen from '../screens/DriveScreen';
import ChatHubScreen from '../screens/ChatHubScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

export const MainTabs: React.FC = () => {
  return (
    <Tab.Navigator
      initialRouteName="CameraTab"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#FFFC00',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: {
          backgroundColor: '#121212',
          borderTopColor: '#2C2C2E',
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
      })}
    >
      <Tab.Screen
        name="CameraTab"
        component={CameraScreen}
        options={{
          tabBarLabel: 'Camera',
          tabBarIcon: ({ color, size }) => <Camera color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="MemoriesTab"
        component={MemoriesScreen}
        options={{
          tabBarLabel: 'Memories',
          tabBarIcon: ({ color, size }) => <Grid color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="DriveTab"
        component={DriveScreen}
        options={{
          tabBarLabel: 'Drive',
          tabBarIcon: ({ color, size }) => <HardDrive color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="ChatTab"
        component={ChatHubScreen}
        options={{
          tabBarLabel: 'Chat',
          tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
};

export default MainTabs;
