import React from 'react';
import { StyleSheet, View, ViewStyle, TouchableOpacity, StyleProp } from 'react-native';

interface AppCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

export const AppCard: React.FC<AppCardProps> = ({ children, style, onPress }) => {
  if (onPress) {
    return (
      <TouchableOpacity style={[styles.card, style]} onPress={onPress} activeOpacity={0.85}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f1123', // Clean deep navy
    borderRadius: 16,
    padding: 16,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#1f2444',
  },
});

export default AppCard;
