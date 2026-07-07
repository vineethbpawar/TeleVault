import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { ArrowLeft, Camera, Shield, Phone, Info } from 'lucide-react-native';
import UserAvatar from './UserAvatar';
import OnlineIndicator from './OnlineIndicator';

interface ConversationHeaderProps {
  otherFullName: string | null;
  otherUsername: string;
  avatarUrl?: string | null;
  isOnline: boolean;
  onBack: () => void;
  onProfilePress: () => void;
  onSnapPress: () => void;
}

export const ConversationHeader: React.FC<ConversationHeaderProps> = ({
  otherFullName,
  otherUsername,
  avatarUrl,
  isOnline,
  onBack,
  onProfilePress,
  onSnapPress,
}) => {
  const initials = (otherFullName || otherUsername).substring(0, 1).toUpperCase();

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
        <ArrowLeft size={22} color="#FFFFFF" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.profileContainer}
        onPress={onProfilePress}
        activeOpacity={0.7}
      >
        <View style={styles.avatarWrapper}>
          <UserAvatar
            name={otherFullName || otherUsername}
            avatarUrl={avatarUrl}
            size={40}
          />
          <OnlineIndicator isOnline={isOnline} style={styles.onlineBadge} size={11} />
        </View>

        <View style={styles.details}>
          <Text style={styles.name} numberOfLines={1}>
            {otherFullName || `@${otherUsername}`}
          </Text>
          <Text style={styles.status}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={onSnapPress} activeOpacity={0.7}>
          <Camera size={20} color="#FFFC00" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onProfilePress} activeOpacity={0.7}>
          <Info size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 70,
    backgroundColor: '#0A0A0A',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  backBtn: {
    padding: 8,
    marginRight: 4,
  },
  profileContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrapper: {
    position: 'relative',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  details: {
    marginLeft: 10,
    justifyContent: 'center',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    maxWidth: 180,
  },
  status: {
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    padding: 8,
    marginLeft: 8,
    borderRadius: 999,
    backgroundColor: '#1E1E1E',
  },
});

export default ConversationHeader;
