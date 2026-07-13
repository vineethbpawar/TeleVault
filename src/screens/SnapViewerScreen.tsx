import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Play, Video, MessageSquare } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { snapService } from '../services/snapService';
import { securityService } from '../services/securityService';

import VideoPlayer from '../components/VideoPlayer';

type Props = NativeStackScreenProps<AppStackParamList, 'SnapViewer'>;

export const SnapViewerScreen: React.FC<Props> = ({ navigation, route }) => {
  const { snapId, mediaUrl, mediaType, caption, senderUsername, isStory, telegramFileId } = route.params;

  const [currentMediaUrl, setCurrentMediaUrl] = useState<string | null>(mediaUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    // 1. Mark snap/story viewed on load
    const markViewed = async () => {
      try {
        if (isStory) {
          await snapService.markStoryViewed(snapId);
        } else {
          await snapService.markSnapViewed(snapId);
        }
      } catch (err) {
        console.warn('Failed to mark media as viewed:', err);
      }
    };

    markViewed();
  }, [snapId, isStory]);

  const handlePlayVideo = () => {
    if (currentMediaUrl) {
      securityService.setTemporaryIgnoreLock(true);
      Linking.openURL(currentMediaUrl);
    } else {
      Alert.alert('Unavailable', 'Video link not resolved yet.');
    }
  };

  const handleClose = () => {
    navigation.goBack();
  };

  const handleLoadError = async () => {
    if (!telegramFileId) {
      setError(true);
      return;
    }

    if (retryAttempt < 3) {
      setLoading(true);
      setError(false);
      const nextAttempt = retryAttempt + 1;
      setRetryAttempt(nextAttempt);
      const backoffMs = Math.pow(2, nextAttempt) * 1000;
      console.warn(`[SnapViewer] Media failed to load. Retrying resolve URL (attempt ${nextAttempt}/3) in ${backoffMs}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      
      try {
        const freshUrl = await snapService.resolveTelegramUrl(telegramFileId);
        setCurrentMediaUrl(freshUrl);
        setLoading(false);
        setError(false);
      } catch (err) {
        console.error('[SnapViewer] Retry resolve failed:', err);
        setLoading(false);
        setError(true);
      }
    } else {
      setError(true);
    }
  };

  const handleManualRetry = async () => {
    setRetryAttempt(0);
    setLoading(true);
    setError(false);
    try {
      const freshUrl = await snapService.resolveTelegramUrl(telegramFileId || '');
      setCurrentMediaUrl(freshUrl);
      setLoading(false);
      setError(false);
    } catch (err: any) {
      setLoading(false);
      setError(true);
      Alert.alert('Retry Failed', err.message || 'Unable to load snap. Please check your connection.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.senderInfo}>
          <Text style={styles.senderText}>@{senderUsername}</Text>
          <Text style={styles.typeText}>{isStory ? 'Story' : 'Direct Snap'}</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
          <X size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      <View style={styles.mediaContainer}>
        {loading ? (
          <View style={styles.videoContainer}>
            <ActivityIndicator size="large" color="#FFFC00" />
            <Text style={[styles.videoTitle, { marginTop: 12 }]}>Refreshing Snap...</Text>
          </View>
        ) : error ? (
          <View style={styles.videoContainer}>
            <Text style={styles.videoTitle}>Failed to Load Snap</Text>
            <Text style={styles.videoSub}>The Telegram link expired or could not be reached.</Text>
            {telegramFileId && (
              <TouchableOpacity style={styles.playBtn} onPress={handleManualRetry}>
                <Text style={styles.playBtnText}>Tap to Retry</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : mediaType === 'image' && currentMediaUrl ? (
          <Image
            source={{ uri: currentMediaUrl }}
            style={styles.media}
            resizeMode="contain"
            onError={handleLoadError}
          />
        ) : mediaType === 'video' && currentMediaUrl ? (
          <VideoPlayer
            source={currentMediaUrl}
            style={styles.media}
            onError={handleLoadError}
          />
        ) : (
          <View style={styles.videoContainer}>
            <ActivityIndicator size="large" color="#FFFC00" />
            <Text style={[styles.videoTitle, { marginTop: 12 }]}>Loading Video Snap...</Text>
          </View>
        )}
      </View>

      {/* Caption Overlay */}
      {caption ? (
        <View style={styles.captionContainer}>
          <Text style={styles.captionText}>{caption}</Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {isStory 
            ? 'Expires 24 hours after post' 
            : 'View-once snap. Hidden in-app after you close.'}
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    zIndex: 10,
  },
  senderInfo: {
    flex: 1,
  },
  senderText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  typeText: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  videoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E1E1E',
    width: '85%',
    height: 320,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    padding: 24,
  },
  iconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 252, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 252, 0, 0.2)',
  },
  videoTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  videoSub: {
    color: '#8E8E93',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFC00',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
  },
  playBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  captionContainer: {
    position: 'absolute',
    bottom: 80,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  captionText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    color: '#8E8E93',
    fontSize: 12,
    textAlign: 'center',
  },
});

export default SnapViewerScreen;
