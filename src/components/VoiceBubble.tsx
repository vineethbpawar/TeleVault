import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Play, Pause, Mic } from 'lucide-react-native';
import { Audio } from 'expo-av';
import { telegramService } from '../services/telegramService';
import { encryptionService } from '../services/encryptionService';

interface Props {
  message: any; // ChatMessage or GroupMessage
  isMe: boolean;
  onLongPress: () => void;
}

export const VoiceBubble: React.FC<Props> = ({ message, isMe, onLongPress }) => {
  const snap = message.snap || {};
  const duration = snap.file_size || 0; // we reuse file_size to store the audio duration in seconds!
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [decryptedUri, setDecryptedUri] = useState<string | null>(null);
  const [position, setPosition] = useState(0);

  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const handlePlayPause = async () => {
    if (loading) return;

    try {
      // 1. Decrypt audio if not done yet
      if (!decryptedUri) {
        setLoading(true);
        if (!snap.telegram_file_id) {
          throw new Error('Missing file backup link.');
        }

        // Download encrypted file
        const cachedUri = await telegramService.downloadTelegramFileToCache(
          snap.telegram_file_id,
          'voice_note.m4a.enc'
        );

        // Decrypt
        const cleanUri = await encryptionService.decryptFile(
          cachedUri,
          'voice_note.m4a',
          'audio/m4a'
        );

        setDecryptedUri(cleanUri);
        setLoading(false);

        // Play the newly decrypted file
        await playAudio(cleanUri);
        return;
      }

      // 2. Already decrypted, toggle play state
      if (soundRef.current) {
        if (isPlaying) {
          await soundRef.current.pauseAsync();
          setIsPlaying(false);
        } else {
          await soundRef.current.playAsync();
          setIsPlaying(true);
        }
      } else {
        await playAudio(decryptedUri);
      }
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Error', err.message || 'Failed to play voice message.');
    }
  };

  const playAudio = async (uri: string) => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        (status: any) => {
          if (status.didJustFinish) {
            setIsPlaying(false);
            setPosition(0);
          } else if (status.positionMillis) {
            setPosition(status.positionMillis / 1000);
          }
        }
      );
      soundRef.current = sound;
      setIsPlaying(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Audio playback initialization failed.');
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = Math.floor(secs % 60);
    return `${mins}:${remaining < 10 ? '0' : ''}${remaining}`;
  };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onLongPress={onLongPress}
      style={[
        styles.bubble,
        isMe ? styles.myBubble : styles.otherBubble
      ]}
    >
      {!isMe && message.sender && (
        <Text style={styles.senderLabel}>
          {message.sender.full_name || message.sender.username}
        </Text>
      )}

      <View style={styles.contentRow}>
        <TouchableOpacity
          style={[styles.playBtn, isMe ? styles.myPlayBtn : styles.otherPlayBtn]}
          onPress={handlePlayPause}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color={isMe ? '#FFFFFF' : '#FFFC00'} />
          ) : isPlaying ? (
            <Pause size={18} color={isMe ? '#000000' : '#FFFFFF'} fill={isMe ? '#000000' : '#FFFFFF'} />
          ) : (
            <Play size={18} color={isMe ? '#000000' : '#FFFFFF'} fill={isMe ? '#000000' : '#FFFFFF'} />
          )}
        </TouchableOpacity>

        <View style={styles.waveformContainer}>
          <Mic size={16} color={isMe ? '#000000' : '#FFFC00'} style={{ marginRight: 8 }} />
          <View style={styles.waveformBarWrapper}>
            {/* Visual mock waveform blocks */}
            {Array.from({ length: 15 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.waveformBar,
                  {
                    height: 4 + Math.sin(i * 0.8) * 12,
                    backgroundColor: isMe
                      ? i / 15 < position / (duration || 1)
                        ? '#000000'
                        : 'rgba(0, 0, 0, 0.2)'
                      : i / 15 < position / (duration || 1)
                      ? '#FFFC00'
                      : 'rgba(255, 255, 255, 0.2)'
                  }
                ]}
              />
            ))}
          </View>
        </View>

        <Text style={[styles.durationText, isMe ? styles.myText : styles.otherText]}>
          {formatTime(isPlaying ? position : duration)}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  bubble: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginVertical: 4,
    maxWidth: '75%',
    alignSelf: 'flex-start',
  },
  myBubble: {
    backgroundColor: '#FFFC00',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#1E1E1E',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  senderLabel: {
    color: '#FFFC00',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 220,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  myPlayBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  otherPlayBtn: {
    backgroundColor: '#2C2C2E',
  },
  waveformContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  waveformBarWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 20,
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
  },
  durationText: {
    fontSize: 12,
    fontWeight: '600',
  },
  myText: {
    color: '#000000',
  },
  otherText: {
    color: '#8E8E93',
  },
});

export default VoiceBubble;
