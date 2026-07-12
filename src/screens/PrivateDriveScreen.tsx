import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { DriveContainer } from '../drive/DriveContainer';
import Screen from '../components/Screen';

type Props = NativeStackScreenProps<AppStackParamList, 'PrivateDrive'>;

export const PrivateDriveScreen: React.FC<Props> = ({ navigation }) => {
  const isFocused = useIsFocused();

  return (
    <Screen>
      <DriveContainer
        navigation={navigation}
        isFocused={isFocused}
        isPrivateMode={true}
      />
    </Screen>
  );
};

export default PrivateDriveScreen;
