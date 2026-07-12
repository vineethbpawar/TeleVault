import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, AppStackParamList } from '../types/navigation';
import { CameraContainer } from '../camera/CameraContainer';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'CameraTab'>,
  NativeStackScreenProps<AppStackParamList>
>;

export const CameraScreen: React.FC<Props> = ({ navigation, route }) => {
  const isFocused = useIsFocused();

  return (
    <CameraContainer
      navigation={navigation}
      route={route}
      isFocused={isFocused}
    />
  );
};

export default CameraScreen;
