import React, { useState, useRef, useEffect } from 'react';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  Text,
  Animated,
  Platform,
} from 'react-native';
import { Camera, Send, X, Paperclip, Smile, Mic, MapPin, File, Image } from 'lucide-react-native';
import { ChatMessage } from '../types/chat';

interface MessageComposerProps {
  onSend: (text: string) => void;
  onCameraPress: () => void;
  onGalleryPress: () => void;
  onVoiceSend?: (uri: string, durationMs: number) => void;
  onFilePress?: () => void;
  onLocationPress?: () => void;
  replyToMessage?: ChatMessage | null;
  onClearReply?: () => void;
  onTyping?: (isTyping: boolean) => void;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSend,
  onCameraPress,
  onGalleryPress,
  onVoiceSend,
  onFilePress,
  onLocationPress,
  replyToMessage,
  onClearReply,
  onTyping,
}) => {
  const [text, setText] = useState('');
  const [showTools, setShowTools] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recordDuration, setRecordDuration] = useState(0);
  const recordingTimerRef = useRef<any>(null);
  const sendScale = useRef(new Animated.Value(0)).current;
  const toolsAnim = useRef(new Animated.Value(0)).current;
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<any>(null);

  useEffect(() => {
    Animated.spring(sendScale, {
      toValue: text.trim() ? 1 : 0,
      useNativeDriver: true,
      tension: 50,
      friction: 5,
    }).start();
  }, [text, sendScale]);

  const handleTextChange = (val: string) => {
    setText(val);
    
    // Typing notification trigger
    if (onTyping) {
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        onTyping(true);
      }
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        isTypingRef.current = false;
        onTyping(false);
      }, 2000);
    }
  };

  const handleSendPress = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    if (onTyping && isTypingRef.current) {
      isTypingRef.current = false;
      onTyping(false);
    }
  };

  const toggleTools = () => {
    const toValue = showTools ? 0 : 1;
    setShowTools(!showTools);
    Animated.timing(toolsAnim, {
      toValue,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const startRecording = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (permission.granted) {
        await audioRecorder.prepareToRecordAsync();
        audioRecorder.record();
        setIsRecording(true);
        setRecordDuration(0);

        recordingTimerRef.current = setInterval(() => {
          setRecordDuration((prev) => prev + 1);
        }, 1000);
      }
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = async (send: boolean) => {
    try {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      setIsRecording(false);

      const uri = await audioRecorder.stopRecording();

      if (send && uri && onVoiceSend) {
        onVoiceSend(uri, recordDuration * 1000);
      }
      setRecordDuration(0);
    } catch (err) {
      console.error('Failed to stop recording', err);
    }
  };

  return (
    <View style={styles.container}>
      {/* Reply Context Header */}
      {replyToMessage && (
        <View style={styles.replyHeader}>
          <View style={styles.replyIndicator} />
          <View style={styles.replyContent}>
            <Text style={styles.replyTitle}>Replying to message</Text>
            <Text style={styles.replyText} numberOfLines={1}>
              {replyToMessage.message_text}
            </Text>
          </View>
          <TouchableOpacity onPress={onClearReply} style={styles.clearReplyBtn}>
            <X size={16} color="#8E8E93" />
          </TouchableOpacity>
        </View>
      )}

      {/* Floating Tools Quick Drawer */}
      {showTools && (
        <Animated.View
          style={[
            styles.drawer,
            {
              transform: [
                {
                  translateY: toolsAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [50, 0],
                  }),
                },
              ],
              opacity: toolsAnim,
            },
          ]}
        >
          <TouchableOpacity style={styles.drawerItem} onPress={onGalleryPress} activeOpacity={0.8}>
            <View style={[styles.drawerIcon, { backgroundColor: '#FF3B30' }]}>
              <Image size={18} color="#FFFFFF" />
            </View>
            <Text style={styles.drawerLabel}>Gallery</Text>
          </TouchableOpacity>

          {onVoiceSend && (
            <TouchableOpacity style={styles.drawerItem} onPress={startRecording} activeOpacity={0.8}>
              <View style={[styles.drawerIcon, { backgroundColor: '#34C759' }]}>
                <Mic size={18} color="#FFFFFF" />
              </View>
              <Text style={styles.drawerLabel}>Voice</Text>
            </TouchableOpacity>
          )}

          {onFilePress && (
            <TouchableOpacity style={styles.drawerItem} onPress={onFilePress} activeOpacity={0.8}>
              <View style={[styles.drawerIcon, { backgroundColor: '#007AFF' }]}>
                <File size={18} color="#FFFFFF" />
              </View>
              <Text style={styles.drawerLabel}>File</Text>
            </TouchableOpacity>
          )}

          {onLocationPress && (
            <TouchableOpacity style={styles.drawerItem} onPress={onLocationPress} activeOpacity={0.8}>
              <View style={[styles.drawerIcon, { backgroundColor: '#FF9500' }]}>
                <MapPin size={18} color="#FFFFFF" />
              </View>
              <Text style={styles.drawerLabel}>Location</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {/* Composer Row */}
      <View style={styles.composerRow}>
        {isRecording ? (
          <View style={styles.recordingContainer}>
            <View style={styles.recordingIndicator}>
              <View style={styles.redDot} />
              <Text style={styles.recordingText}>
                Recording: {Math.floor(recordDuration / 60)}:{(recordDuration % 60).toString().padStart(2, '0')}
              </Text>
            </View>
            <View style={styles.recordingActions}>
              <TouchableOpacity onPress={() => stopRecording(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => stopRecording(true)} style={styles.sendRecordingBtn}>
                <Send size={16} color="#000000" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <TouchableOpacity style={styles.actionBtn} onPress={onCameraPress} activeOpacity={0.7}>
              <Camera size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Send a chat..."
                placeholderTextColor="#8E8E93"
                value={text}
                onChangeText={handleTextChange}
                multiline
                maxLength={1000}
              />
              <TouchableOpacity style={styles.attachmentBtn} onPress={toggleTools} activeOpacity={0.7}>
                <Paperclip size={18} color={showTools ? '#FFFC00' : '#8E8E93'} />
              </TouchableOpacity>
            </View>

            {text.trim() ? (
              <TouchableOpacity
                style={styles.sendBtn}
                onPress={handleSendPress}
                activeOpacity={0.8}
              >
                <Send size={16} color="#000000" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.actionBtn} onPress={startRecording} activeOpacity={0.7}>
                <Mic size={22} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0A0A0A',
    borderTopWidth: 1,
    borderTopColor: '#1E1E1E',
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    paddingTop: 8,
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  replyIndicator: {
    width: 3,
    height: '100%',
    backgroundColor: '#FFFC00',
    borderRadius: 1.5,
  },
  replyContent: {
    flex: 1,
    marginLeft: 8,
  },
  replyTitle: {
    color: '#FFFC00',
    fontSize: 11,
    fontWeight: '700',
  },
  replyText: {
    color: '#8E8E93',
    fontSize: 11.5,
    marginTop: 1,
  },
  clearReplyBtn: {
    padding: 4,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionBtn: {
    padding: 8,
    marginHorizontal: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    marginHorizontal: 6,
    maxHeight: 120,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14.5,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    lineHeight: 18,
    marginRight: 6,
  },
  attachmentBtn: {
    padding: 4,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  drawer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#161618',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
    marginBottom: 8,
  },
  drawerItem: {
    alignItems: 'center',
    width: 60,
  },
  drawerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  drawerLabel: {
    color: '#8E8E93',
    fontSize: 10.5,
    fontWeight: '500',
  },
  recordingContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    marginHorizontal: 6,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    marginRight: 8,
  },
  recordingText: {
    color: '#FFFFFF',
    fontSize: 14.5,
  },
  recordingActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cancelBtn: {
    marginRight: 16,
  },
  cancelBtnText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '500',
  },
  sendRecordingBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default MessageComposer;
