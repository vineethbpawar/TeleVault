import React from 'react';
import { View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, AppStackParamList } from '../types/navigation';
import { GalleryContainer } from '../gallery/GalleryContainer';
import Screen from '../components/Screen';
import AdBanner from '../components/AdBanner';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'MemoriesTab'>,
  NativeStackScreenProps<AppStackParamList>
>;

export const MemoriesScreen: React.FC<Props> = ({ navigation }) => {
  const isFocused = useIsFocused();

  return (
    <Screen>
      <View style={{ flex: 1 }}>
        <GalleryContainer
          navigation={navigation}
          isFocused={isFocused}
        />
      </View>
    </Screen>
  );
};

export default MemoriesScreen;
