import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useIsFocused } from '@react-navigation/native';

interface VideoPlayerProps {
  source: string;
  style?: any;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ source, style }) => {
  const isFocused = useIsFocused();

  if (Platform.OS === 'web') {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      if (isFocused) {
        video.src = source;
        video.load();
        
        // Attempt to autoplay with audio first
        video.muted = false;
        const playPromise = video.play();
        
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.log("Autoplay with audio was blocked, trying muted autoplay:", err);
            // Fallback to muted autoplay if browser blocks audio
            video.muted = true;
            video.play().catch((err2) => {
              console.error("Muted autoplay also blocked:", err2);
            });
          });
        }
      } else {
        video.pause();
      }

      return () => {
        try {
          video.pause();
          video.src = "";
          video.load();
        } catch (_) {}
      };
    }, [source, isFocused]);

    return (
      <View style={[styles.container, style]}>
        <video
          ref={videoRef}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
          loop
          playsInline
          controls={false}
          onContextMenu={(e) => e.preventDefault()}
        />
      </View>
    );
  }

  // Native iOS/Android implementation using expo-video
  const player = useVideoPlayer(source, (playerInstance) => {
    playerInstance.loop = true;
    playerInstance.bufferOptions = {
      preferredForwardBufferDuration: 2,
      minBufferForPlayback: 0.5,
    };
  });

  useEffect(() => {
    if (!player) return;

    player.loop = true;
    player.bufferOptions = {
      preferredForwardBufferDuration: 2,
      minBufferForPlayback: 0.5,
    };

    if (isFocused) {
      player.play();
    } else {
      player.pause();
    }

    const subscription = player.addListener('statusChange', (statusPayload: any) => {
      const status = typeof statusPayload === 'string' ? statusPayload : statusPayload?.status;
      if (status === 'readyToPlay' && isFocused) {
        player.play();
      }
    });

    return () => {
      subscription.remove();
      try {
        player.pause();
      } catch (_) {}
    };
  }, [player, source, isFocused]);

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
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});

export default VideoPlayer;
