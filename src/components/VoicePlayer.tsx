import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Audio } from 'expo-av';
import { Play, Pause } from 'lucide-react-native';
import { snapService } from '../services/snapService';

interface VoicePlayerProps {
  fileId: string;
  durationMs: number;
  isMe: boolean;
  localUri?: string;
}

export const VoicePlayer: React.FC<VoicePlayerProps> = ({ fileId, durationMs, isMe, localUri }) => {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  
  const textColor = isMe ? '#000000' : '#FFFFFF';
  const iconColor = isMe ? '#000000' : '#FFFFFF';
  const trackColor = isMe ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)';
  const progressColor = isMe ? '#000000' : '#FFFFFF';

  useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync();
        }
      : undefined;
  }, [sound]);

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis);
      setIsPlaying(status.isPlaying);
      if (status.didJustFinish) {
        setPosition(0);
        setIsPlaying(false);
        sound?.setPositionAsync(0);
      }
    }
  };

  const handlePlayPause = async () => {
    if (isLoading) return;

    try {
      if (sound) {
        if (isPlaying) {
          await sound.pauseAsync();
        } else {
          await sound.playAsync();
        }
      } else {
        setIsLoading(true);
        // Load the audio file
        let url = '';
        if (fileId === 'temp') {
          if (localUri) {
            url = localUri;
          } else {
            setIsLoading(false);
            return;
          }
        } else {
          url = await snapService.resolveTelegramUrl(fileId);
        }

        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: true },
          onPlaybackStatusUpdate
        );
        setSound(newSound);
        setIsPlaying(true);
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Failed to play voice note', err);
      setIsLoading(false);
    }
  };

  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const currentDuration = position > 0 ? position : durationMs;
  const progress = durationMs > 0 ? (position / durationMs) * 100 : 0;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.playBtn} onPress={handlePlayPause}>
        {isPlaying ? (
          <Pause size={20} color={iconColor} fill={iconColor} />
        ) : (
          <Play size={20} color={iconColor} fill={iconColor} />
        )}
      </TouchableOpacity>

      <View style={styles.trackContainer}>
        <View style={[styles.track, { backgroundColor: trackColor }]}>
          <View style={[styles.progress, { backgroundColor: progressColor, width: `${progress}%` }]} />
        </View>
        <Text style={[styles.durationText, { color: textColor }]}>
          {formatTime(currentDuration)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 200,
    paddingVertical: 4,
  },
  playBtn: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackContainer: {
    flex: 1,
    marginLeft: 4,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: 2,
    width: '100%',
    overflow: 'hidden',
  },
  progress: {
    height: '100%',
  },
  durationText: {
    fontSize: 11,
    marginTop: 6,
  },
});

export default VoicePlayer;
