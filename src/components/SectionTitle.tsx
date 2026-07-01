import React from 'react';
import { StyleSheet, Text, ViewStyle } from 'react-native';

interface SectionTitleProps {
  title: string;
  style?: ViewStyle;
}

export const SectionTitle: React.FC<SectionTitleProps> = ({ title, style }) => {
  return <Text style={[styles.title, style]}>{title.toUpperCase()}</Text>;
};

const styles = StyleSheet.create({
  title: {
    color: '#8e92af',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 20,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
});

export default SectionTitle;
