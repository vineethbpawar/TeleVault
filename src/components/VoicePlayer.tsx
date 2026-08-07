import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Play, Pause } from 'lucide-react-native';
import { snapService } from '../services/snapService';

interface VoicePlayerProps {
  fileId: string;
  durationMs: number;
  isMe: boolean;
  localUri?: string;
}

export const VoicePlayer: React.FC<VoicePlayerProps> = ({ fileId, durationMs, isMe, localUri }) => {
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const player = useAudioPlayer(audioUri ? { uri: audioUri } : null);
  const status = useAudioPlayerStatus(player);

  const textColor = isMe ? '#000000' : '#FFFFFF';
  const iconColor = isMe ? '#000000' : '#FFFFFF';
  const trackColor = isMe ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)';
  const progressColor = isMe ? '#000000' : '#FFFFFF';

  const isPlaying = status.playing ?? false;
  const positionMs = (status.currentTime ?? 0) * 1000;
  const progress = durationMs > 0 ? (positionMs / durationMs) * 100 : 0;
  const currentDuration = positionMs > 0 ? positionMs : durationMs;

  const handlePlayPause = async () => {
    if (isLoading) return;

    try {
      if (!audioUri) {
        setIsLoading(true);
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
        setAudioUri(url);
        setIsLoading(false);
        // player will auto-load once audioUri is set
        setTimeout(() => player.play(), 300);
      } else {
        if (isPlaying) {
          player.pause();
        } else {
          player.play();
        }
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
