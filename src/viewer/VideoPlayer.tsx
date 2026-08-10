import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useIsFocused } from '@react-navigation/native';

interface VideoPlayerProps {
  source: string;
  style?: any;
  onError?: (error: any) => void;
  paused?: boolean;
  controls?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  source,
  style,
  onError,
  paused = false,
  controls = false,
}) => {
  const isFocused = useIsFocused();

  // Web HTML5 Video Implementation
  if (Platform.OS === 'web') {
    const videoRef = useRef<HTMLVideoElement>(null);

    // 1. Source loading & cleanup effect (runs only when source changes)
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const handleError = (e: any) => {
        if (onError) onError(e);
      };

      video.addEventListener('error', handleError);

      if (video.src !== source) {
        video.src = source;
        video.load();
      }

      return () => {
        video.removeEventListener('error', handleError);
        try {
          video.pause();
          video.src = '';
          video.load();
        } catch (_) {}
      };
    }, [source]);

    // 2. Play / pause control effect (runs when isFocused or paused changes)
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      if (isFocused && !paused) {
        video.muted = false;
        video.play().catch(() => {
          // Auto-fallback to muted if blocked
          video.muted = true;
          video.play().catch(() => {});
        });
      } else {
        video.pause();
      }
    }, [isFocused, paused]);

    return (
      <View style={[styles.container, style]}>
        <video
          ref={videoRef}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            pointerEvents: controls ? 'auto' : 'none'
          }}
          loop
          playsInline
          controls={controls}
        />
      </View>
    );
  }

  // Native AVPlayer / ExoPlayer (Expo Video) Implementation
  const player = useVideoPlayer(source, (playerInstance) => {
    playerInstance.loop = true;
  });

  // 1. Play / pause control effect (runs when player instance, isFocused, or paused changes)
  useEffect(() => {
    if (!player) return;

    if (isFocused && !paused) {
      player.play();
    } else {
      player.pause();
    }
  }, [player, isFocused, paused]);

  // 2. Cleanup / unload stream on unmount or when source changes
  useEffect(() => {
    return () => {
      if (player) {
        try {
          player.pause();
          player.muted = true;
          player.replace(null); // Unload stream resources instantly
        } catch (_) {}
      }
    };
  }, [player, source]);

  return (
    <View style={[styles.container, style]}>
      <VideoView
        style={styles.video}
        player={player}
        nativeControls={controls}
        contentFit="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});
export default VideoPlayer;
