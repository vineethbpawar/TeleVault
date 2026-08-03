import { Conversation, UserProfile } from '../types/chat';
import { Group } from '../types/groups';
import { Snap } from '../types/snap';
import { FriendRequest } from '../types/friends';

export type ChatConversation = Conversation;
export type ChatGroup = Group;
export type ChatStory = Snap;
export type ChatRequest = FriendRequest;

export type ChatTabType = 'unread' | 'friends' | 'groups' | 'requests';

export interface ChatListContainerProps {
  navigation: any;
  isFocused: boolean;
}
