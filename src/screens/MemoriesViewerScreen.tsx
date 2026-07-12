import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { ViewerContainer } from '../viewer/ViewerContainer';
import Screen from '../components/Screen';

type Props = NativeStackScreenProps<AppStackParamList, 'MemoriesViewer'>;

export const MemoriesViewerScreen: React.FC<Props> = ({ route, navigation }) => {
  const { files, initialIndex } = route.params;

  return (
    <Screen>
      <ViewerContainer
        files={files}
        initialIndex={initialIndex}
        navigation={navigation}
      />
    </Screen>
  );
};

export default MemoriesViewerScreen;
