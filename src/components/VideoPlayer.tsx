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

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ source, style, onError, paused = false }) => {
  const isFocused = useIsFocused();

  if (Platform.OS === 'web') {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const handleWebError = (e: any) => {
        console.error("Web video element error:", e);
        if (onError) onError(e);
      };

      video.addEventListener('error', handleWebError);

      if (isFocused && !paused) {
        // Load the source only if it's not already loaded/playing this source
        if (!video.src || video.src.indexOf(source) === -1) {
          video.src = source;
          video.load();
        }
        
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
        video.muted = true;
      }

      return () => {
        video.removeEventListener('error', handleWebError);
        try {
          video.pause();
          video.muted = true;
          video.src = "";
          video.load();
        } catch (_) {}
      };
    }, [source, isFocused, paused]);

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

  // Play/pause based on navigation focus status and paused prop
  useEffect(() => {
    if (!player) return;
    if (isFocused && !paused) {
      player.play();
    } else {
      player.pause();
    }
  }, [player, isFocused, paused]);

  // Setup player options, register status listener, and perform deep cleanup on unmount
  useEffect(() => {
    if (!player) return;

    player.loop = true;
    player.bufferOptions = {
      preferredForwardBufferDuration: 2,
      minBufferForPlayback: 0.5,
    };

    const subscription = player.addListener('statusChange', (statusPayload: any) => {
      const status = typeof statusPayload === 'string' ? statusPayload : statusPayload?.status;
      if (status === 'readyToPlay' && isFocused && !paused) {
        player.play();
      } else if (status === 'error') {
        const err = statusPayload?.error || { message: 'Video playback error' };
        if (onError) onError(err);
      }
    });

    return () => {
      subscription.remove();
      try {
        player.pause();
        player.muted = true;
        player.replace(null); // Instantly unload video source, stop decoder, and silence playback
      } catch (_) {}
    };
  }, [player]);

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
