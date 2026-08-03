import React from 'react';
import { StyleSheet, View, Text, Image, StyleProp } from 'react-native';

interface UserAvatarProps {
  name?: string | null;
  avatarUrl?: string | null;
  size?: number;
  style?: StyleProp<any>;
}

const UserAvatar: React.FC<UserAvatarProps> = ({ name, avatarUrl, size = 48, style }) => {
  const initial = (name || '?').substring(0, 1).toUpperCase();
  const fontSize = size * 0.4;
  const sizeStyle = { width: size, height: size, borderRadius: size / 2 };

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={[styles.avatarImage, sizeStyle, style]}
      />
    );
  }

  return (
    <View style={[styles.placeholderContainer, sizeStyle, style]}>
      <Text style={[styles.placeholderText, { fontSize }]}>{initial}</Text>
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
    color: '#FFFC00',
    fontWeight: '700',
  },
});

export { UserAvatar };
export default React.memo(UserAvatar);
