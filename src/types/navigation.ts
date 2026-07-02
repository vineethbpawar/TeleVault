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
  ChatTab: undefined;
  SettingsTab: undefined;
};

export type AppStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
  TelegramConnect: { fromSettings?: boolean } | undefined;
  Preview: {
    uri: string;
    type: 'image' | 'video';
    fromGallery?: boolean;
    file_type?: 'image' | 'video';
    mime_type?: string;
    defaultLens?: string;
  };
  FileDetails: { file: TeleVaultFile };
  UsernameSetup: undefined;
  UserSearch: { mode?: 'chat' | 'snap'; mediaUri?: string; mediaType?: 'image' | 'video' } | undefined;
  ChatList: undefined;
  ChatRoom: { conversationId?: string; otherUserId: string; otherUsername: string; otherFullName?: string };
  SnapInbox: undefined;
  Stories: undefined;
  SnapViewer: {
    snapId: string;
    mediaUrl: string;
    mediaType: 'image' | 'video';
    caption?: string;
    senderUsername: string;
    isStory?: boolean;
  };
  Friends: undefined;
  FriendRequests: undefined;
  BlockedUsers: undefined;
  ReportUser: { reportedUserId: string; reportedUsername: string };
  Notifications: undefined;
  Groups: undefined;
  GroupChat: { groupId: string; groupName: string };
  CreateGroup: undefined;
  AdminDashboard: undefined;
  ChunkManager: undefined;
  PrivateDrive: undefined;
  ChatHub: undefined;
  UserProfile: { userId: string; username: string };
  MyProfile: undefined;
  SendTo: {
    mediaUri: string;
    mediaType: 'image' | 'video';
    metadata?: any;
  };
  MemoriesViewer: {
    files: TeleVaultFile[];
    initialIndex: number;
  };
};


