import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Play, Camera, Film, Eye, Flame } from 'lucide-react-native';
import { snapService } from '../services/snapService';
import { supabase } from '../lib/supabase';
import VideoPlayer from './VideoPlayer';

interface SnapBubbleProps {
  snap: {
    id: string;
    sender_id?: string;
    media_type: 'image' | 'video';
    is_viewed: boolean;
    expires_at?: string;
    view_once?: boolean;
    telegram_file_id?: string | null;
    caption?: string | null;
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

  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (isSavedInChat) {
      setLoading(true);
      const resolve = async () => {
        let fileId = snap.telegram_file_id;
        let senderId = snap.sender_id;
        if ((!fileId || !senderId) && snap.id) {
          const { data } = await supabase
            .from('snaps')
            .select('telegram_file_id, sender_id')
            .eq('id', snap.id)
            .single();
          if (data) {
            fileId = fileId || data.telegram_file_id;
            senderId = senderId || data.sender_id;
          }
        }

        if (fileId && active) {
          const url = await snapService.resolveTelegramUrl(fileId, senderId);
          if (active) {
            setMediaUrl(url);
            setLoading(false);
          }
        } else if (active) {
          setLoading(false);
        }
      };

      resolve().catch((err) => {
        console.warn('Failed to resolve saved snap URL:', err);
        if (active) setLoading(false);
      });

      return () => {
        active = false;
      };
    } else {
      setMediaUrl(null);
    }
  }, [isSavedInChat, snap.telegram_file_id, snap.id]);

  // Red for photo snaps, purple for video snaps (matching Snapchat aesthetic)
  const snapColor = isVideo ? '#A352FC' : '#FF3B30';

  const subtitleText = isSavedInChat
    ? 'Saved in Chat'
    : (isViewed ? 'Opened' : isMe ? 'Delivered' : 'Tap to View');

  // If saved in chat, render direct media content like Snapchat
  if (isSavedInChat) {
    return (
      <View style={[styles.container, isMe ? styles.myRow : styles.otherRow]}>
        <TouchableOpacity
          onLongPress={onLongPress}
          onPress={onOpen}
          activeOpacity={0.9}
          style={[
            styles.savedBubble,
            isMe ? styles.mySavedBubble : styles.otherSavedBubble,
          ]}
        >
          {loading ? (
            <View style={styles.savedMediaPlaceholder}>
              <ActivityIndicator size="small" color="#FFFC00" />
            </View>
          ) : mediaUrl ? (
            <View style={styles.mediaWrapper}>
              {isVideo ? (
                <View style={styles.videoPreviewWrapper}>
                  <VideoPlayer source={mediaUrl} paused={true} style={styles.savedMedia} />
                  <View style={styles.playOverlay}>
                    <Play size={20} color="#FFFFFF" fill="#FFFFFF" />
                  </View>
                </View>
              ) : (
                <Image source={{ uri: mediaUrl }} style={styles.savedMedia} />
              )}
              {snap.caption ? (
                <View style={styles.savedCaptionContainer}>
                  <Text style={styles.savedCaptionText}>{snap.caption}</Text>
                </View>
              ) : null}
              <View style={styles.savedLabel}>
                <Flame size={11} color="#FFFC00" style={{ marginRight: 4 }} />
                <Text style={styles.savedLabelText}>Saved in Chat</Text>
              </View>
            </View>
          ) : (
            <View style={styles.savedMediaPlaceholder}>
              <Text style={{ color: '#8E8E93', fontSize: 12 }}>Failed to load media</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // Otherwise, render the classic unopened/opened snap block
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
          disabled={isViewed}
        >
          <View
            style={[
              styles.snapSquare,
              {
                borderColor: snapColor,
                backgroundColor: isViewed ? 'transparent' : snapColor,
                borderWidth: isViewed ? 2 : 0,
              }
            ]}
          />

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
  savedBubble: {
    maxWidth: '70%',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 6,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  mySavedBubble: {
    borderBottomRightRadius: 4,
  },
  otherSavedBubble: {
    borderBottomLeftRadius: 4,
  },
  savedMedia: {
    width: 200,
    height: 270,
    borderRadius: 12,
    backgroundColor: '#000000',
  },
  savedMediaPlaceholder: {
    width: 200,
    height: 270,
    borderRadius: 12,
    backgroundColor: '#0F0F10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaWrapper: {
    position: 'relative',
  },
  videoPreviewWrapper: {
    position: 'relative',
    width: 200,
    height: 270,
    borderRadius: 12,
    overflow: 'hidden',
  },
  playOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  savedCaptionContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 6,
    maxWidth: 200,
  },
  savedCaptionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  savedLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    opacity: 0.8,
  },
  savedLabelText: {
    color: '#FFFC00',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  snapSquare: {
    width: 14,
    height: 14,
    borderRadius: 3,
    marginRight: 12,
    marginLeft: 4,
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
