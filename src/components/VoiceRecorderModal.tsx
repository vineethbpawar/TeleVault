import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Mic, Square, Trash2, Send, Play, Pause } from 'lucide-react-native';
import { Audio } from 'expo-av';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSend: (localUri: string, duration: number) => void;
}

export const VoiceRecorderModal: React.FC<Props> = ({ visible, onClose, onSend }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, []);

  useEffect(() => {
    if (visible) {
      // Reset state on open
      setRecordedUri(null);
      setIsRecording(false);
      setRecordDuration(0);
      setIsPlaying(false);
    } else {
      cleanupResources();
    }
  }, [visible]);

  const cleanupResources = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (_) {}
      recordingRef.current = null;
    }
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch (_) {}
      soundRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Audio recording permission is required to send voice notes.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Unload previous sound if any
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
        setRecordedUri(null);
      }

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordDuration(0);

      timerRef.current = setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to start recording.');
    }
  };

  const stopRecording = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (!recordingRef.current) return;

    try {
      setIsRecording(false);
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      setRecordedUri(uri);
      recordingRef.current = null;
      
      // Reset audio mode to playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to stop recording.');
    }
  };

  const playRecordedAudio = async () => {
    if (!recordedUri) return;

    try {
      if (soundRef.current) {
        if (isPlaying) {
          await soundRef.current.pauseAsync();
          setIsPlaying(false);
        } else {
          await soundRef.current.playAsync();
          setIsPlaying(true);
        }
        return;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: recordedUri },
        { shouldPlay: true },
        (status: any) => {
          if (status.didJustFinish) {
            setIsPlaying(false);
            setPlaybackPosition(0);
          } else if (status.positionMillis) {
            setPlaybackPosition(status.positionMillis);
          }
        }
      );
      soundRef.current = sound;
      setIsPlaying(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Playback failed.');
    }
  };

  const handleDelete = async () => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setRecordedUri(null);
    setRecordDuration(0);
    setIsPlaying(false);
  };

  const handleSend = () => {
    if (!recordedUri) return;
    onSend(recordedUri, recordDuration);
    onClose();
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins}:${remaining < 10 ? '0' : ''}${remaining}`;
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Secure Voice Note</Text>

          {isRecording ? (
            <View style={styles.activeRecordBox}>
              <View style={styles.pulseDot} />
              <Text style={styles.durationText}>{formatTime(recordDuration)}</Text>
              <Text style={styles.helperText}>Recording audio securely...</Text>

              <TouchableOpacity style={styles.stopBtn} onPress={stopRecording}>
                <Square size={24} color="#000000" fill="#000000" />
              </TouchableOpacity>
            </View>
          ) : recordedUri ? (
            <View style={styles.reviewBox}>
              <Text style={styles.durationText}>{formatTime(recordDuration)}</Text>
              <Text style={styles.helperText}>Review your secure voice note</Text>

              <View style={styles.controlsRow}>
                <TouchableOpacity style={styles.iconActionBtn} onPress={handleDelete}>
                  <Trash2 size={22} color="#FF3B30" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.playBtn} onPress={playRecordedAudio}>
                  {isPlaying ? (
                    <Pause size={24} color="#000000" fill="#000000" />
                  ) : (
                    <Play size={24} color="#000000" fill="#000000" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={[styles.iconActionBtn, styles.sendVoiceBtn]} onPress={handleSend}>
                  <Send size={20} color="#000000" />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.idleBox}>
              <Text style={styles.idleHelperText}>Tap the microphone button to start recording.</Text>

              <TouchableOpacity style={styles.micBtn} onPress={startRecording}>
                <Mic size={36} color="#000000" />
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={isRecording}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
  },
  idleBox: {
    alignItems: 'center',
    marginVertical: 20,
  },
  idleHelperText: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  micBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFFC00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  activeRecordBox: {
    alignItems: 'center',
    marginVertical: 20,
  },
  pulseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF3B30',
    marginBottom: 12,
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 1,
  },
  helperText: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 8,
    marginBottom: 24,
  },
  stopBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewBox: {
    alignItems: 'center',
    marginVertical: 20,
    width: '100%',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 12,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconActionBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendVoiceBtn: {
    backgroundColor: '#30D158',
  },
  cancelBtn: {
    marginTop: 20,
    paddingVertical: 8,
  },
  cancelBtnText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default VoiceRecorderModal;
