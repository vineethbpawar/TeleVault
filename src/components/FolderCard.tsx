import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Folder, MoreVertical } from 'lucide-react-native';
import { TeleVaultFolder } from '../types/file';

interface FolderCardProps {
  folder: TeleVaultFolder;
  onPress: () => void;
  onMorePress?: () => void;
}

export const FolderCard: React.FC<FolderCardProps> = ({
  folder,
  onPress,
  onMorePress,
}) => {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.leftContainer}>
        <View style={styles.iconContainer}>
          <Folder size={24} color="#FFFC00" fill="#FFFC00" fillOpacity={0.2} />
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {folder.name}
        </Text>
      </View>
      {onMorePress && (
        <TouchableOpacity
          style={styles.moreButton}
          onPress={onMorePress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MoreVertical size={20} color="#8E8E93" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 72,
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginVertical: 6,
  },
  leftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 252, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    paddingRight: 8,
  },
  moreButton: {
    padding: 4,
  },
});

export default FolderCard;
