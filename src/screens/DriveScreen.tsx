import React from 'react';
import { ScrollView } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, AppStackParamList } from '../types/navigation';
import { DriveContainer } from '../drive/DriveContainer';
import Screen from '../components/Screen';
import AdBanner from '../components/AdBanner';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'DriveTab'>,
  NativeStackScreenProps<AppStackParamList>
>;

export const DriveScreen: React.FC<Props> = ({ navigation }) => {
  const isFocused = useIsFocused();

  return (
    <Screen>
      <ScrollView>
        <DriveContainer
          navigation={navigation}
          isFocused={isFocused}
          isPrivateMode={false}
        />
        {/* AdMob Banner Placement */}
        <AdBanner style={{ marginHorizontal: 16, marginTop: 12 }} />
      </ScrollView>
    </Screen>
  );
};

export default DriveScreen;
