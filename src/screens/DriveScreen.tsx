import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, AppStackParamList } from '../types/navigation';
import { DriveContainer } from '../drive/DriveContainer';
import Screen from '../components/Screen';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'DriveTab'>,
  NativeStackScreenProps<AppStackParamList>
>;

export const DriveScreen: React.FC<Props> = ({ navigation }) => {
  const isFocused = useIsFocused();

  return (
    <Screen>
      <DriveContainer
        navigation={navigation}
        isFocused={isFocused}
        isPrivateMode={false}
      />
    </Screen>
  );
};

export default DriveScreen;
