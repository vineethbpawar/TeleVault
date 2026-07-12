import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, AppStackParamList } from '../types/navigation';
import { ChatListContainer } from '../chat/ChatListContainer';
import Screen from '../components/Screen';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'ChatTab'>,
  NativeStackScreenProps<AppStackParamList>
>;

export const ChatHubScreen: React.FC<Props> = ({ navigation }) => {
  const isFocused = useIsFocused();

  return (
    <Screen>
      <ChatListContainer
        navigation={navigation}
        isFocused={isFocused}
      />
    </Screen>
  );
};

export default ChatHubScreen;
