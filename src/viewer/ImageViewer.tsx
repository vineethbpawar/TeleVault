import React from 'react';
import { StyleSheet, Dimensions, Platform } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface ImageViewerProps {
  source: string;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ source }) => {
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const baseScale = useSharedValue(1);
  const baseTranslateX = useSharedValue(0);
  const baseTranslateY = useSharedValue(0);

  // 1. Pinch to Zoom Gesture
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      'worklet';
      baseScale.value = scale.value;
    })
    .onUpdate((event) => {
      'worklet';
      const newScale = baseScale.value * event.scale;
      // Constraint: Zoom between 1.0x and 4.0x
      scale.value = Math.max(1, Math.min(4, newScale));
    })
    .onEnd(() => {
      'worklet';
      if (scale.value < 1) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
      }
    });

  // 2. Pan to Drag Gesture (Only when zoomed in)
  const panGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      baseTranslateX.value = translateX.value;
      baseTranslateY.value = translateY.value;
    })
    .onUpdate((event) => {
      'worklet';
      if (scale.value > 1) {
        const boundX = (screenWidth * (scale.value - 1)) / 2;
        const boundY = (screenHeight * (scale.value - 1)) / 2;

        const nextX = baseTranslateX.value + event.translationX;
        const nextY = baseTranslateY.value + event.translationY;

        // Apply bounds constraints
        translateX.value = Math.max(-boundX, Math.min(boundX, nextX));
        translateY.value = Math.max(-boundY, Math.min(boundY, nextY));
      }
    });

  // 3. Double Tap to Zoom Reset
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      if (scale.value > 1) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      } else {
        scale.value = withSpring(2.2);
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  const composedGestures = Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);

  if (Platform.OS === 'web') {
    // Zoom/pan on Web via responsive CSS transform rules
    return (
      <GestureDetector gesture={composedGestures}>
        <Animated.Image
          source={{ uri: source }}
          style={[styles.imageWeb, animatedStyle] as any}
          resizeMode="contain"
        />
      </GestureDetector>
    );
  }

  return (
    <GestureDetector gesture={composedGestures}>
      <Animated.Image
        source={{ uri: source }}
        style={[styles.image, animatedStyle] as any}
        resizeMode="contain"
      />
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  image: {
    width: screenWidth,
    height: screenHeight,
    backgroundColor: '#000000',
  },
  imageWeb: {
    width: screenWidth,
    height: screenHeight,
    backgroundColor: '#000000',
    userSelect: 'none',
    touchAction: 'none',
  } as any,
});
export default ImageViewer;
