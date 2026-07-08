import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

interface VideoPlayerProps {
  source: string;
  style?: any;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ source, style }) => {
  if (Platform.OS === 'web') {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
      if (videoRef.current) {
        videoRef.current.src = source;
        videoRef.current.load();
        
        // Attempt to autoplay with audio first
        videoRef.current.muted = false;
        const playPromise = videoRef.current.play();
        
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.log("Autoplay with audio was blocked, trying muted autoplay:", err);
            // Fallback to muted autoplay if browser blocks audio
            if (videoRef.current) {
              videoRef.current.muted = true;
              videoRef.current.play().catch((err2) => {
                console.error("Muted autoplay also blocked:", err2);
              });
            }
          });
        }
      }
    }, [source]);

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
    playerInstance.play();
  });

  return (
    <View style={[styles.container, style]}>
      <VideoView
        style={styles.video}
        player={player}
        nativeControls={false}
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
