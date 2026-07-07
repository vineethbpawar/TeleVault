import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Play, Pause, RotateCcw } from 'lucide-react-native';

interface VideoPlayerProps {
  source: string;
  style?: any;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ source, style }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);

  const player = useVideoPlayer(source, (playerInstance) => {
    playerInstance.loop = false;
    playerInstance.play();
  });

  // Sync player properties to local React state periodically (every 200ms)
  useEffect(() => {
    const timer = setInterval(() => {
      if (player) {
        setIsPlaying(player.playing);
        setCurrentTime(player.currentTime);
        setDuration(player.duration);
      }
    }, 200);

    return () => clearInterval(timer);
  }, [player]);

  const togglePlayback = () => {
    if (isPlaying) {
      player.pause();
    } else {
      // If at end, seek back to start
      if (currentTime >= duration - 0.2) {
        player.currentTime = 0;
      }
      player.play();
    }
  };

  const handleReplay = () => {
    player.currentTime = 0;
    player.play();
  };

  const handleProgressPress = (e: any) => {
    const touchX = e.nativeEvent.locationX;
    if (trackWidth > 0 && duration > 0) {
      const percentage = Math.max(0, Math.min(1, touchX / trackWidth));
      const targetTime = percentage * duration;
      player.currentTime = targetTime;
      setCurrentTime(targetTime);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <View style={[styles.container, style]}>
      {/* Aspect Ratio Video Container */}
      <View style={styles.videoWrapper}>
        <VideoView
          style={styles.video}
          player={player}
          nativeControls={false} // Disable native controls in favor of premium overlay UI
        />
      </View>

      {/* Control Overlay */}
      <View style={styles.controlsContainer}>
        {/* Play / Pause / Replay Buttons Row */}
        <View style={styles.buttonsRow}>
          <TouchableOpacity style={styles.controlBtn} onPress={togglePlayback} activeOpacity={0.8}>
            {isPlaying ? (
              <Pause size={24} color="#FFFC00" />
            ) : (
              <Play size={24} color="#FFFC00" style={{ marginLeft: 2 }} />
            )}
          </TouchableOpacity>

          <TouchableOpacity style={[styles.controlBtn, { marginLeft: 16 }]} onPress={handleReplay} activeOpacity={0.8}>
            <RotateCcw size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Seekable Progress Bar & Duration Counter */}
        <View style={styles.progressBarRow}>
          <View
            style={styles.progressBarTrack}
            onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
            onTouchStart={handleProgressPress}
          >
            <View
              style={[
                styles.progressBarFill,
                { width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` },
              ]}
            />
          </View>

          <Text style={styles.timeText}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </Text>
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
    position: 'relative',
  },
  videoWrapper: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 90, // Positioned nicely above the bottom action bar in PreviewScreen
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#1E1E1E',
    zIndex: 30,
  },
  buttonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  progressBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
    marginRight: 12,
    position: 'relative',
    overflow: 'hidden',
    cursor: 'pointer',
  } as any,
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFFC00',
    borderRadius: 3,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  timeText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});

export default VideoPlayer;
