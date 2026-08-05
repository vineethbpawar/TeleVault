import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { MoreVertical } from 'lucide-react-native';
import { TeleVaultFile } from '../types/file';
import FilePreviewCard from './FilePreviewCard';

interface FileCardProps {
  file: TeleVaultFile;
  onPress: () => void;
  onMorePress?: () => void;
}

export const FileCard: React.FC<FileCardProps> = ({
  file,
  onPress,
  onMorePress,
}) => {
  const formatSize = (bytes: number | null): string => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch (_) {
      return '';
    }
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.leftContainer}>
        <FilePreviewCard file={file} variant="row" />
        <View style={styles.infoContainer}>
          <Text style={styles.name} numberOfLines={1}>
            {file.file_name}
          </Text>
          <Text style={styles.meta}>
            {formatSize(file.file_size)} • {formatDate(file.uploaded_at)}
          </Text>
        </View>
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
    height: 60,
    backgroundColor: '#000000',
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginVertical: 0,
  },
  leftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  infoContainer: {
    flex: 1,
    paddingLeft: 16,
    paddingRight: 8,
  },
  name: {
    color: '#E3E3E3',
    fontSize: 14,
    fontWeight: '400',
    marginBottom: 2,
  },
  meta: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '400',
  },
  moreButton: {
    padding: 4,
  },
});

export default React.memo(FileCard);
