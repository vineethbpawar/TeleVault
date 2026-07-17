import React from 'react';
import { StyleSheet, View, ScrollView, Platform, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Edge = 'top' | 'bottom' | 'left' | 'right';

interface ScreenProps {
  children: React.ReactNode;
  backgroundColor?: string;
  scroll?: boolean;
  edges?: Edge[];
  /** When true, wraps content in a KeyboardAvoidingView (useful for forms) */
  keyboardAvoiding?: boolean;
}

/**
 * Screen - the canonical full-screen wrapper that handles safe area insets
 * correctly on iOS, Android and Web (PWA) for all four edges.
 *
 * Web: uses CSS `env(safe-area-inset-*)` so the layout adjusts for notches /
 *      rounded corners on mobile browsers running as a PWA.
 * Native: uses `useSafeAreaInsets()` values with a sensible fallback minimum.
 */
export const Screen: React.FC<ScreenProps> = ({
  children,
  backgroundColor = '#000000',
  scroll = false,
  edges = ['top', 'bottom', 'left', 'right'],
  keyboardAvoiding = false,
}) => {
  const insets = useSafeAreaInsets();

  const includeTop    = edges.includes('top');
  const includeBottom = edges.includes('bottom');
  const includeLeft   = edges.includes('left');
  const includeRight  = edges.includes('right');

  // Web uses CSS custom env() vars so browsers (incl. PWA on iPhone notch) pick
  // up the real safe area without needing JS.
  const paddingStyle = Platform.OS === 'web'
    ? ({
        paddingTop:    includeTop    ? 'max(env(safe-area-inset-top), 0px)'    : 0,
        paddingBottom: includeBottom ? 'max(env(safe-area-inset-bottom), 0px)' : 0,
        paddingLeft:   includeLeft   ? 'max(env(safe-area-inset-left), 0px)'   : 0,
        paddingRight:  includeRight  ? 'max(env(safe-area-inset-right), 0px)'  : 0,
      } as any)
    : {
        paddingTop:    includeTop    ? Math.max(insets.top, 0)    : 0,
        paddingBottom: includeBottom ? Math.max(insets.bottom, 0) : 0,
        paddingLeft:   includeLeft   ? Math.max(insets.left, 0)   : 0,
        paddingRight:  includeRight  ? Math.max(insets.right, 0)  : 0,
      };

  const outerStyle = [styles.outer, { backgroundColor }];

  const content = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.scrollContent, paddingStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, paddingStyle]}>
      {children}
    </View>
  );

  if (keyboardAvoiding) {
    return (
      <View style={outerStyle}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {content}
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <View style={outerStyle}>
      {content}
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});

export default Screen;
