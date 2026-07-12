import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { ChatListContainer } from '../chat/ChatListContainer';
import Screen from '../components/Screen';

type Props = NativeStackScreenProps<AppStackParamList, 'Stories'>;

export const StoriesScreen: React.FC<Props> = ({ navigation }) => {
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

export default StoriesScreen;
