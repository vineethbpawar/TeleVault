import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Check, CheckCheck, Clock } from 'lucide-react-native';
import { ChatMessageStatus } from '../types/chat';

interface MessageStatusProps {
  status: ChatMessageStatus | 'sending' | 'failed';
  size?: number;
}

export const MessageStatus: React.FC<MessageStatusProps> = ({
  status,
  size = 14,
}) => {
  if (status === 'sending') {
    return <Clock size={size} color="#8E8E93" />;
  }

  if (status === 'failed') {
    return (
      <View style={[styles.failedDot, { width: size - 4, height: size - 4 }]} />
    );
  }

  if (status === 'read') {
    // Read: double yellow checkmark (TeleVault accent)
    return <CheckCheck size={size} color="#FFFC00" />;
  }

  if (status === 'delivered') {
    return <CheckCheck size={size} color="#8E8E93" />;
  }

  // Sent: single grey checkmark
  return <Check size={size} color="#8E8E93" />;
};

const styles = StyleSheet.create({
  failedDot: {
    backgroundColor: '#FF3B30',
    borderRadius: 999,
  },
});

export default MessageStatus;
