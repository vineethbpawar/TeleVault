import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

interface OnlineIndicatorProps {
  isOnline: boolean;
  size?: number;
  style?: ViewStyle;
}

export const OnlineIndicator: React.FC<OnlineIndicatorProps> = ({
  isOnline,
  size = 10,
  style,
}) => {
  if (!isOnline) return null;

  return (
    <View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  dot: {
    backgroundColor: '#34C759', // Premium green
    borderWidth: 1.5,
    borderColor: '#0A0A0A',
  },
});

export default OnlineIndicator;
