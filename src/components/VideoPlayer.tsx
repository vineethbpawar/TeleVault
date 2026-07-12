import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useIsFocused } from '@react-navigation/native';

interface VideoPlayerProps {
  source: string;
  style?: any;
  onError?: (error: any) => void;
  paused?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  source,
  style,
  onError,
  paused = false,
}) => {
  const isFocused = useIsFocused();

  // Web Implementation
  if (Platform.OS === 'web') {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const handleError = (e: any) => {
        if (onError) onError(e);
      };

      video.addEventListener('error', handleError);

      if (isFocused && !paused) {
        if (video.src !== source) {
          video.src = source;
          video.load();
        }
        video.muted = false;
        video.play().catch(() => {
          // Fallback to muted autoplay if browser blocks audio
          video.muted = true;
          video.play().catch(() => {});
        });
      } else {
        video.pause();
      }

      return () => {
        video.removeEventListener('error', handleError);
        try {
          video.pause();
          video.src = '';
          video.load();
        } catch (_) {}
      };
    }, [source, isFocused, paused]);

    return (
      <View style={[styles.container, style]}>
        <video
          ref={videoRef}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          loop
          playsInline
          controls={false}
        />
      </View>
    );
  }

  // Native iOS/Android Implementation
  const player = useVideoPlayer(source, (playerInstance) => {
    playerInstance.loop = true;
  });

  useEffect(() => {
    if (!player) return;

    if (isFocused && !paused) {
      player.play();
    } else {
      player.pause();
    }

    return () => {
      try {
        player.pause();
        player.muted = true;
        player.replace(null); // Instantly unload video source to release ExoPlayer/AVPlayer
      } catch (_) {}
    };
  }, [player, source, isFocused, paused]);

  return (
    <View style={[styles.container, style]}>
      <VideoView
        style={styles.video}
        player={player}
        nativeControls={false}
        contentFit="cover"
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
