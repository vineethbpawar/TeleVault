import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, AppStackParamList } from '../types/navigation';
import { GalleryContainer } from '../gallery/GalleryContainer';
import Screen from '../components/Screen';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'MemoriesTab'>,
  NativeStackScreenProps<AppStackParamList>
>;

export const MemoriesScreen: React.FC<Props> = ({ navigation }) => {
  const isFocused = useIsFocused();

  return (
    <Screen>
      <GalleryContainer
        navigation={navigation}
        isFocused={isFocused}
      />
    </Screen>
  );
};

export default MemoriesScreen;
