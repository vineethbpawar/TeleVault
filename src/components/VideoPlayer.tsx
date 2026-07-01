import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

interface VideoPlayerProps {
  source: string;
  style?: any;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ source, style }) => {
  const player = useVideoPlayer(source, (playerInstance) => {
    playerInstance.loop = false;
    playerInstance.play();
  });

  return (
    <View style={[styles.container, style]}>
      <VideoView
        style={styles.video}
        player={player}
        nativeControls={true}
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
