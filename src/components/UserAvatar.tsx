import React from 'react';
import { StyleSheet, View, Text, Image, ViewStyle, TextStyle, StyleProp } from 'react-native';

interface UserAvatarProps {
  name?: string | null;
  avatarUrl?: string | null;
  size?: number;
  style?: StyleProp<any>;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({ name, avatarUrl, size = 48, style }) => {
  const initial = (name || '?').substring(0, 1).toUpperCase();
  const fontSize = size * 0.4;

  const containerStyle = StyleSheet.flatten([
    {
      width: size,
      height: size,
      borderRadius: size / 2,
    },
    style
  ]);

  const textStyle: TextStyle = {
    fontSize,
  };

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={[styles.avatarImage, containerStyle]}
      />
    );
  }

  return (
    <View style={[styles.placeholderContainer, containerStyle]}>
      <Text style={[styles.placeholderText, textStyle]}>{initial}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  avatarImage: {
    resizeMode: 'cover',
  },
  placeholderContainer: {
    backgroundColor: '#151728',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#242745',
  },
  placeholderText: {
    color: '#FFFC00', // yellow accent
    fontWeight: '700',
  },
});

export default UserAvatar;
