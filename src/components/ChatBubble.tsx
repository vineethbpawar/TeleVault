import React, { useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  PanResponder,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { Reply, Smile } from 'lucide-react-native';
import MessageStatus from './MessageStatus';
import UserAvatar from './UserAvatar';
import { ChatMessage } from '../types/chat';

interface ChatBubbleProps {
  message: ChatMessage;
  isMe: boolean;
  showAvatar: boolean;
  senderName: string;
  senderAvatarUrl?: string | null;
  onSwipeToReply?: (message: ChatMessage) => void;
  onLongPress?: (message: ChatMessage) => void;
  replyToMessage?: ChatMessage | null;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  isMe,
  showAvatar,
  senderName,
  senderAvatarUrl,
  onSwipeToReply,
  onLongPress,
  replyToMessage,
}) => {
  const pan = useRef(new Animated.ValueXY()).current;

  // Swipe to Reply gesture setup
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only trigger if swiping horizontally to the left (for own) or right (for other)
        const { dx, dy } = gestureState;
        return Math.abs(dx) > 10 && Math.abs(dy) < 8 && onSwipeToReply !== undefined;
      },
      onPanResponderMove: (_, gestureState) => {
        // Clamp swipe offset
        const maxSwipe = isMe ? -80 : 80;
        const dragOffset = gestureState.dx;
        
        let newX = 0;
        if (isMe) {
          newX = Math.max(maxSwipe, Math.min(0, dragOffset));
        } else {
          newX = Math.min(maxSwipe, Math.max(0, dragOffset));
        }
        pan.setValue({ x: newX, y: 0 });
      },
      onPanResponderRelease: (_, gestureState) => {
        const threshold = isMe ? -40 : 40;
        const reached = isMe ? gestureState.dx < threshold : gestureState.dx > threshold;

        if (reached && onSwipeToReply) {
          onSwipeToReply(message);
        }

        // Animate bubble back to center
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  const formatTime = (timeStr: string) => {
    try {
      const d = new Date(timeStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  };

  // Extract reactions if present in message (e.g. from JSON field or in-memory)
  const messageReactions = (message as any).reactions || [];
  const savedUsers = message.is_saved_by_users || [];
  const isSaved = savedUsers.length > 0;

  if (message.deleted_at) {
    return (
      <View style={[styles.row, isMe ? styles.myRow : styles.otherRow]}>
        {!isMe && (
          <View style={styles.avatarContainer}>
            {showAvatar ? (
              <UserAvatar name={senderName} avatarUrl={senderAvatarUrl} size={32} />
            ) : (
              <View style={styles.avatarSpacer} />
            )}
          </View>
        )}
        <View style={styles.deletedContainer}>
          <Text style={styles.deletedText}>
            {isMe ? 'You deleted a chat' : `${senderName} deleted a chat`}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, isMe ? styles.myRow : styles.otherRow]}>
      {/* Swipe to reply icon indicator */}
      <Animated.View
        style={[
          styles.replyIndicator,
          isMe ? styles.myReplyIndicator : styles.otherReplyIndicator,
          {
            opacity: pan.x.interpolate({
              inputRange: isMe ? [-60, 0] : [0, 60],
              outputRange: [1, 0],
            }),
          },
        ]}
      >
        <Reply size={16} color="#FFFC00" />
      </Animated.View>

      {/* Friend avatar on the left */}
      {!isMe && (
        <View style={styles.avatarContainer}>
          {showAvatar ? (
            <UserAvatar name={senderName} avatarUrl={senderAvatarUrl} size={32} />
          ) : (
            <View style={styles.avatarSpacer} />
          )}
        </View>
      )}

      {/* Message content wrapped in swipe pan view */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.bubbleWrapper,
          { transform: [{ translateX: pan.x }] },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.95}
          onLongPress={() => onLongPress && onLongPress(message)}
          style={[
            isSaved ? styles.savedBubbleBlock : styles.rawBubbleBlock,
            isMe ? styles.myRowAlign : styles.otherRowAlign,
            replyToMessage ? styles.bubbleWithReply : null,
          ]}
        >
          {/* Reply context header inside bubble */}
          {replyToMessage && (
            <View style={styles.replyPreviewHeader}>
              <View style={styles.replyBar} />
              <View style={styles.replyInfo}>
                <Text style={styles.replyUser}>
                  {replyToMessage.sender_id === message.sender_id ? 'You' : senderName}
                </Text>
                <Text style={styles.replyText} numberOfLines={1}>
                  {replyToMessage.message_text}
                </Text>
              </View>
            </View>
          )}

          {/* Actual message text */}
          <Text style={[
            styles.text,
            isSaved ? styles.savedText : (isMe ? styles.myRawText : styles.otherRawText)
          ]}>
            {message.message_text}
          </Text>

          {/* Footer with time and seen status indicator */}
          <View style={styles.footer}>
            <Text style={styles.time}>{formatTime(message.created_at)}</Text>
            {isMe && (
              <View style={styles.status}>
                <MessageStatus status={message.status} size={13} />
              </View>
            )}
          </View>

          {/* Reactions list rendering */}
          {messageReactions.length > 0 && (
            <View style={styles.reactionsList}>
              {messageReactions.map((emoji: string, i: number) => (
                <Text key={i} style={styles.reactionEmoji}>
                  {emoji}
                </Text>
              ))}
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    marginVertical: 3,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: '100%',
    position: 'relative',
  },
  myRow: {
    justifyContent: 'flex-end',
  },
  otherRow: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    marginRight: 8,
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: 32,
    height: 32,
  },
  avatarSpacer: {
    width: 32,
    height: 32,
  },
  bubbleWrapper: {
    maxWidth: '78%',
  },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#1E1E1E',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
    position: 'relative',
  },
  savedBubbleBlock: {
    backgroundColor: '#1E1E1E',
    borderLeftWidth: 3,
    borderLeftColor: '#FFFC00',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    position: 'relative',
  },
  rawBubbleBlock: {
    backgroundColor: 'transparent',
    paddingVertical: 4,
    paddingHorizontal: 8,
    position: 'relative',
  },
  myRowAlign: {
    alignSelf: 'flex-end',
  },
  otherRowAlign: {
    alignSelf: 'flex-start',
  },
  bubbleWithReply: {
    paddingTop: 6,
  },
  myBubble: {
    backgroundColor: '#FFFC00', // TeleVault Yellow for outgoing messages
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#262629', // Dark slate for incoming messages
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 14.5,
    lineHeight: 20,
  },
  myText: {
    color: '#000000',
  },
  otherText: {
    color: '#FFFFFF',
  },
  savedText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    lineHeight: 20,
  },
  myRawText: {
    color: '#FFFC00',
    fontSize: 14.5,
    lineHeight: 20,
  },
  otherRawText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    lineHeight: 20,
  },
  deletedContainer: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginVertical: 2,
  },
  deletedText: {
    fontStyle: 'italic',
    color: '#A0A0A0',
    fontSize: 13,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  time: {
    fontSize: 9.5,
    color: '#8E8E93',
  },
  status: {
    marginLeft: 4,
  },
  replyIndicator: {
    position: 'absolute',
    top: '30%',
    justifyContent: 'center',
    alignItems: 'center',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 252, 0, 0.15)',
  },
  myReplyIndicator: {
    right: -40,
  },
  otherReplyIndicator: {
    left: -40,
  },
  replyPreviewHeader: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    marginBottom: 6,
    alignItems: 'center',
  },
  replyBar: {
    width: 3,
    backgroundColor: '#FFFC00',
    height: '100%',
    borderRadius: 1.5,
  },
  replyInfo: {
    marginLeft: 6,
    flex: 1,
  },
  replyUser: {
    fontWeight: '700',
    fontSize: 11,
    color: '#FFFC00',
  },
  replyText: {
    fontSize: 11,
    color: '#8E8E93',
  },
  reactionsList: {
    position: 'absolute',
    bottom: -10,
    right: 12,
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  reactionEmoji: {
    fontSize: 11,
    marginHorizontal: 1,
  },
});

export default React.memo(ChatBubble);
