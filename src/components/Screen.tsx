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
  edges = ['top', 'bottom', 'left', 'right'],
}) => {
  const insets = useSafeAreaInsets();

  const includeTop = edges.includes('top');
  const includeBottom = edges.includes('bottom');
  const includeLeft = edges.includes('left');
  const includeRight = edges.includes('right');

  const paddingStyle = Platform.OS === 'web' ? ({
    paddingTop: includeTop ? 'max(env(safe-area-inset-top), 12px)' : 0,
    paddingBottom: includeBottom ? 'max(env(safe-area-inset-bottom), 12px)' : 0,
    paddingLeft: includeLeft ? 'max(env(safe-area-inset-left), 12px)' : 0,
    paddingRight: includeRight ? 'max(env(safe-area-inset-right), 12px)' : 0,
  } as any) : {
    paddingTop: includeTop ? (insets.top > 0 ? insets.top : 12) : 0,
    paddingBottom: includeBottom ? (insets.bottom > 0 ? insets.bottom : 12) : 0,
    paddingLeft: includeLeft ? insets.left : 0,
    paddingRight: includeRight ? insets.right : 0,
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
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.scrollContent, paddingStyle]}>
            {children}
          </View>
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
