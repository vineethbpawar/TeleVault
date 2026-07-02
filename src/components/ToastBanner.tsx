import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, Animated, View } from 'react-native';

interface ToastOptions {
  message: string;
  duration?: number;
}

let showToastCallback: ((options: ToastOptions) => void) | null = null;

export const showToast = (message: string, duration = 3000) => {
  if (showToastCallback) {
    showToastCallback({ message, duration });
  } else {
    console.log('Toast fallback:', message);
  }
};

export const ToastBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<any>(null);

  useEffect(() => {
    showToastCallback = (options: ToastOptions) => {
      // Clear previous timeout if any
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      setMessage(options.message);
      setVisible(true);
      
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        timeoutRef.current = setTimeout(() => {
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (finished) {
              setVisible(false);
            }
          });
        }, options.duration || 2000);
      });
    };

    return () => {
      showToastCallback = null;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [fadeAnim]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]} pointerEvents="none">
      <View style={styles.toast}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 120, // Sit nicely above tabs
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 99999,
  },
  toast: {
    backgroundColor: '#1E1E1E',
    borderWidth: 1.5,
    borderColor: '#FFFC00', // TeleVault Yellow
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default ToastBanner;
