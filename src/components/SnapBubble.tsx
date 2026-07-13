import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Play, Camera, Film, Eye, Flame } from 'lucide-react-native';

interface SnapBubbleProps {
  snap: {
    id: string;
    media_type: 'image' | 'video';
    is_viewed: boolean;
    expires_at?: string;
    view_once?: boolean;
  };
  isMe: boolean;
  onOpen: () => void;
  onLongPress?: () => void;
  senderName: string;
}

export const SnapBubble: React.FC<SnapBubbleProps> = ({
  snap,
  isMe,
  onOpen,
  onLongPress,
  senderName,
}) => {
  const isVideo = snap.media_type === 'video';
  const isSavedInChat = snap.view_once === false;
  const isViewed = snap.is_viewed && !isSavedInChat;

  // Red for photo snaps, purple for video snaps (matching Snapchat aesthetic)
  const snapColor = isVideo ? '#A352FC' : '#FF3B30';

  const subtitleText = isSavedInChat 
    ? 'Saved in Chat'
    : (isViewed ? 'Opened' : isMe ? 'Delivered' : 'Tap to View');

  return (
    <View style={[styles.container, isMe ? styles.myRow : styles.otherRow]}>
      <View
        style={[
          styles.bubble,
          isMe ? styles.myBubble : styles.otherBubble,
          { borderColor: isViewed ? '#2C2C2E' : snapColor },
        ]}
      >
        <TouchableOpacity
          style={styles.content}
          onPress={onOpen}
          onLongPress={onLongPress}
          activeOpacity={0.8}
          disabled={!isSavedInChat && (isMe || isViewed)}
        >
          {isViewed ? (
            <View style={styles.iconWrapper}>
              <Eye size={20} color="#8E8E93" />
            </View>
          ) : (
            <View style={[styles.iconWrapper, { backgroundColor: snapColor }]}>
              {isVideo ? (
                <Film size={16} color="#FFFFFF" />
              ) : (
                <Camera size={16} color="#FFFFFF" />
              )}
            </View>
          )}

          <View style={styles.info}>
            <Text style={[styles.title, isViewed && styles.titleViewed]}>
              {isMe
                ? `Sent a ${isVideo ? 'Video' : 'Photo'} Snap`
                : `Received a ${isVideo ? 'Video' : 'Photo'} Snap`}
            </Text>
            <Text style={styles.subtitle}>
              {subtitleText}
            </Text>
          </View>

          {!isViewed && !isMe && (
            <View style={[styles.badge, { backgroundColor: snapColor }]} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    width: '100%',
    flexDirection: 'row',
  },
  myRow: {
    justifyContent: 'flex-end',
  },
  otherRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '75%',
    backgroundColor: '#1E1E1E',
    borderWidth: 1.5,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  myBubble: {
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    borderBottomLeftRadius: 4,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  info: {
    justifyContent: 'center',
    marginRight: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  titleViewed: {
    color: '#8E8E93',
  },
  subtitle: {
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 2,
  },
  badge: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

export default SnapBubble;
