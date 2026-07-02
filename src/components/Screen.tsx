import React from 'react';
import { StyleSheet, View, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenProps {
  children: React.ReactNode;
  backgroundColor?: string;
  scroll?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}

export const Screen: React.FC<ScreenProps> = ({
  children,
  backgroundColor = '#000000',
  scroll = false,
  edges = ['top', 'bottom'],
}) => {
  const insets = useSafeAreaInsets();

  const includeTop = edges.includes('top');
  const includeBottom = edges.includes('bottom');

  const paddingStyle = {
    paddingTop: includeTop ? insets.top : 0,
    paddingBottom: includeBottom ? insets.bottom : 0,
  };

  const contentStyle = [
    styles.container,
    { backgroundColor },
  ];

  if (scroll) {
    return (
      <View style={{ flex: 1, backgroundColor }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollContent, paddingStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[contentStyle, paddingStyle]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});

export default Screen;
