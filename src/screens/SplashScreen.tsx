import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Animated } from 'react-native';
import { Shield } from 'lucide-react-native';

export const SplashScreen: React.FC = () => {
  const fadeAnim = new Animated.Value(0);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <View style={styles.logoCircle}>
          <Shield size={48} color="#FFFC00" fill="#FFFC00" fillOpacity={0.1} />
        </View>
        <Text style={styles.title}>TeleVault</Text>
        <Text style={styles.tagline}>Camera. Memories. Drive.</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#2C2C2E',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  tagline: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 1,
  },
});

export default SplashScreen;
