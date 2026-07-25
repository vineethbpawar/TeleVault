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
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSend: (localUri: string, duration: number) => void;
}

export const VoiceRecorderModal: React.FC<Props> = ({ visible, onClose, onSend }) => {
  const [recordDuration, setRecordDuration] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const player = useAudioPlayer(recordedUri || '');
  const playerStatus = useAudioPlayerStatus(player);

  const isRecording = recorderState.isRecording;
  const isPlaying = playerStatus.playing;

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
      setRecordDuration(0);
    } else {
      cleanupResources();
    }
  }, [visible]);

  const cleanupResources = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  };

  const startRecording = async () => {
    try {
      const { status } = await requestRecordingPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Audio recording permission is required to send voice notes.');
        return;
      }

      player.replace('');
      setRecordedUri(null);

      await recorder.prepareToRecordAsync();
      recorder.record();
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

    try {
      await recorder.stop();
      const uri = recorder.uri;
      setRecordedUri(uri);
      if (uri) {
        player.replace(uri);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to stop recording.');
    }
  };

  const playRecordedAudio = async () => {
    if (!recordedUri) return;

    try {
      if (isPlaying) {
        player.pause();
      } else {
        player.play();
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Playback failed.');
    }
  };

  const handleDelete = async () => {
    player.replace('');
    setRecordedUri(null);
    setRecordDuration(0);
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
