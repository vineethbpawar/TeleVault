import { NavigatorScreenParams } from '@react-navigation/native';
import { TeleVaultFile } from './file';

export type AuthStackParamList = {
  Splash: undefined;
  Login: undefined;
  Signup: undefined;
};

export type MainTabParamList = {
  CameraTab: undefined;
  MemoriesTab: undefined;
  DriveTab: undefined;
  PrivateDriveTab: undefined;
  SettingsTab: undefined;
};

export type AppStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
  TelegramConnect: { fromSettings?: boolean } | undefined;
  Preview: { uri: string; type: 'image' | 'video'; fromGallery?: boolean };
  FileDetails: { file: TeleVaultFile };
};
