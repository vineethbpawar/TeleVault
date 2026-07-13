import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { CameraContainer } from '../camera/CameraContainer';

type Props = NativeStackScreenProps<AppStackParamList, 'ChatCamera'>;

export const ChatCameraScreen: React.FC<Props> = ({ navigation, route }) => {
  const isFocused = useIsFocused();

  return (
    <CameraContainer
      navigation={navigation}
      route={route}
      isFocused={isFocused}
    />
  );
};

export default ChatCameraScreen;
