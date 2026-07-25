import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform, Animated, Easing } from 'react-native';
import { Play, Pause, Music, SkipBack, SkipForward } from 'lucide-react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useIsFocused } from '@react-navigation/native';

interface AudioPlayerProps {
  source: string;
  fileName?: string;
  fileSize?: number | null;
  paused?: boolean;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  source,
  fileName = 'Audio File',
  fileSize,
  paused = false,
}) => {
  const isFocused = useIsFocused();
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);

  const isPlaying = status.playing;
  const rawPosition = status.currentTime || 0;
  const rawDuration = status.duration || 0;
  
  // expo-audio status properties (currentTime, duration) are returned in seconds.
  // We keep values consistent with seconds for formatting and visual slider movement.
  // Note: player.seekTo expects milliseconds, so we scale it inside seek operations.
  const duration = rawDuration > 100000 ? rawDuration / 1000 : rawDuration;
  const position = rawDuration > 100000 ? rawPosition / 1000 : rawPosition;

  // Rotation animation for CD/music disc
  const rotationAnim = useRef(new Animated.Value(0)).current;
  const rotationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isPlaying) {
      // Start or resume rotation
      rotationRef.current = Animated.loop(
        Animated.timing(rotationAnim, {
          toValue: 1,
          duration: 8000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      rotationRef.current.start();
    } else {
      // Stop rotation
      if (rotationRef.current) {
        rotationRef.current.stop();
      }
    }

    return () => {
      if (rotationRef.current) {
        rotationRef.current.stop();
      }
    };
  }, [isPlaying, rotationAnim]);

  // Pause/play when screen focus or active slide state changes
  useEffect(() => {
    if (isFocused && !paused) {
      player.play();
    } else {
      player.pause();
    }

    return () => {
      try {
        player.pause();
      } catch (_) {}
    };
  }, [source, isFocused, paused, player]);

  const togglePlay = () => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  const skipForward = () => {
    if (!duration) return;
    const newPos = Math.min(duration, position + 15);
    player.seekTo(newPos * 1000); // expo-audio seekTo expects milliseconds
  };

  const skipBackward = () => {
    const newPos = Math.max(0, position - 15);
    player.seekTo(newPos * 1000); // expo-audio seekTo expects milliseconds
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const [barWidth, setBarWidth] = useState(0);

  const handleProgressBarPress = (e: any) => {
    if (!duration || duration <= 0 || barWidth <= 0) return;
    const clickX = e.nativeEvent.locationX;
    const percentage = Math.max(0, Math.min(1, clickX / barWidth));
    const seekTime = percentage * duration;
    player.seekTo(seekTime * 1000); // expo-audio seekTo expects milliseconds
  };

  const progressPercent = duration > 0 ? (position / duration) * 100 : 0;

  const rotateInterpolate = rotationAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      {/* Vinyl / Disc Visualizer */}
      <View style={styles.discContainer}>
        <Animated.View style={[styles.discOuter, { transform: [{ rotate: rotateInterpolate }] }]}>
          <View style={styles.discInner}>
            <View style={styles.discCenter}>
              <Music size={40} color="#000000" />
            </View>
          </View>
        </Animated.View>
      </View>

      {/* Glassmorphic Player Panel */}
      <View style={styles.playerPanel}>
        <Text style={styles.title} numberOfLines={1}>
          {fileName}
        </Text>
        
        {fileSize ? (
          <Text style={styles.subtitle}>
            {(fileSize / (1024 * 1024)).toFixed(2)} MB
          </Text>
        ) : null}

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <TouchableOpacity
            style={styles.progressBarWrapper}
            onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
            onPress={handleProgressBarPress}
            activeOpacity={1}
          >
            <View style={styles.progressBarBackground}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
              <View style={[styles.progressPin, { left: `${progressPercent}%` }]} />
            </View>
          </TouchableOpacity>

          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </View>

        {/* Playback Controls */}
        <View style={styles.controlsRow}>
          <TouchableOpacity style={styles.controlBtn} onPress={skipBackward}>
            <SkipBack size={24} color="#FFFFFF" fill="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.playBtn} onPress={togglePlay}>
            {isPlaying ? (
              <Pause size={28} color="#000000" fill="#000000" />
            ) : (
              <Play size={28} color="#000000" fill="#000000" style={{ marginLeft: 4 }} />
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.controlBtn} onPress={skipForward}>
            <SkipForward size={24} color="#FFFFFF" fill="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  discContainer: {
    marginBottom: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discOuter: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 8,
    borderColor: '#2C2C2E',
    shadowColor: '#FFFC00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  discInner: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#0A0A0A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3A3A3C',
  },
  discCenter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerPanel: {
    width: '100%',
    backgroundColor: 'rgba(28, 28, 30, 0.75)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
    width: '100%',
  },
  subtitle: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 24,
  },
  progressContainer: {
    width: '100%',
    marginBottom: 24,
  },
  progressBarWrapper: {
    height: 20,
    justifyContent: 'center',
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: '#3A3A3C',
    borderRadius: 2,
    position: 'relative',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFFC00',
    borderRadius: 2,
  },
  progressPin: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFC00',
    position: 'absolute',
    top: -4,
    marginLeft: -6,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  controlBtn: {
    padding: 12,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFFC00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
});
