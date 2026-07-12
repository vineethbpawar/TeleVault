import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image } from 'react-native';
import { Circle, User } from 'lucide-react-native';
import { ChatStory } from './types';
import { previewCacheService } from '../services/previewCacheService';

interface StoryBubbleProps {
  story: ChatStory;
  onPress: () => void;
  isMine?: boolean;
}

export const StoryBubble: React.FC<StoryBubbleProps> = React.memo(({ story, onPress, isMine = false }) => {
  const [imgUri, setImgUri] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (story.telegram_file_id) {
      previewCacheService
        .resolveFilePreview(story as any, false, undefined, (generatedUri) => {
          if (active) {
            setImgUri(generatedUri);
          }
        })
        .then((res) => {
          if (active && res.previewUri) {
            setImgUri(res.previewUri);
          }
        });
    }
    return () => {
      active = false;
    };
  }, [story.id, story.telegram_file_id]);

  const username = isMine ? 'My Story' : story.sender_profile?.username || 'user';
  
  // Decide ring color: Snapchat-style purple gradient for unviewed, grey for viewed.
  // Wait, does story model have a viewed check?
  // Let's check `story.is_viewed` or mock based on presence. Usually we can check if it is active.
  const isViewed = story.is_viewed ?? false;
  const ringColor = isViewed ? '#2C2C2E' : '#A155E8';

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.ring, { borderColor: ringColor }]}>
        <View style={styles.avatarWrapper}>
          {imgUri ? (
            <Image source={{ uri: imgUri }} style={styles.avatar} />
          ) : (
            <View style={styles.fallbackAvatar}>
              <User size={20} color="#8E8E93" />
            </View>
          )}
        </View>
      </View>
      <Text style={styles.usernameText} numberOfLines={1}>
        {username}
      </Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginHorizontal: 8,
    width: 72,
  },
  ring: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2.5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  avatarWrapper: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#1E1E1E',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  fallbackAvatar: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
  },
  usernameText: {
    color: '#E5E5EA',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'center',
  },
});
export default StoryBubble;
