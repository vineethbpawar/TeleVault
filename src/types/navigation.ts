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
  StorageAnalytics: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
  TelegramConnect: { fromSettings?: boolean } | undefined;
  Preview: {
    uri: string;
    type: 'image' | 'video';
    fromGallery?: boolean;
    file_type?: 'image' | 'video';
    mime_type?: string;
    defaultLens?: string;
    locationText?: string;
    defaultDestination?: string;
    sendToUserId?: string;
    sendToUsername?: string;
    conversationId?: string | null;
    fromChatCamera?: boolean;
  };
  ChatCamera: {
    sendToUserId: string;
    sendToUsername: string;
    conversationId: string | null;
  };
  FileDetails: { file: TeleVaultFile };
  UsernameSetup: undefined;
  UserSearch: { mode?: 'chat' | 'snap'; mediaUri?: string; mediaType?: 'image' | 'video' } | undefined;
  ChatList: undefined;
  ChatRoom: { 
    conversationId?: string; 
    otherUserId?: string; 
    otherUsername?: string; 
    otherFullName?: string;
    friendId?: string;
    friendUsername?: string;
  };
  SnapInbox: undefined;
  Stories: undefined;
  SnapViewer: {
    snapId: string;
    mediaUrl: string;
    mediaType: 'image' | 'video';
    caption?: string;
    senderUsername: string;
    isStory?: boolean;
    telegramFileId?: string;
    senderId?: string;
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
    mediaUri?: string;
    mediaType?: 'image' | 'video';
    metadata?: any;
    fileId?: string;
    fileName?: string;
    fileType?: 'image' | 'video';
    telegramFileId?: string | null;
    sendToUserId?: string | null;
    sendToUsername?: string | null;
    conversationId?: string | null;
    saveDirectlyTo?: 'memories' | 'drive' | 'private_drive' | 'story' | 'snap' | 'download' | null;
  };
  MemoriesViewer: {
    files: TeleVaultFile[];
    initialIndex: number;
  };
  CallHistory: undefined;
};



