import React from 'react';
import { StyleSheet, View, TouchableOpacity, Text } from 'react-native';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface ReactionBarProps {
  onReact: (emoji: string) => void;
}

export const ReactionBar: React.FC<ReactionBarProps> = ({ onReact }) => {
  return (
    <View style={styles.container}>
      {REACTION_EMOJIS.map((emoji) => (
        <TouchableOpacity
          key={emoji}
          style={styles.emojiBtn}
          onPress={() => onReact(emoji)}
          activeOpacity={0.7}
        >
          <Text style={styles.emojiText}>{emoji}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  emojiBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  emojiText: {
    fontSize: 22,
  },
});

export default ReactionBar;
