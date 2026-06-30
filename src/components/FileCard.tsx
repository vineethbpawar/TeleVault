import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image } from 'react-native';
import { FileImage, FileVideo, FileText, MoreVertical, File } from 'lucide-react-native';
import { TeleVaultFile } from '../types/file';

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

  const renderIcon = () => {
    // If local thumbnail exists, try to display it for images
    if (file.file_type === 'image' && file.local_thumbnail_uri) {
      return (
        <Image
          source={{ uri: file.local_thumbnail_uri }}
          style={styles.thumbnail}
          resizeMode="cover"
        />
      );
    }

    switch (file.file_type) {
      case 'image':
        return <FileImage size={24} color="#FFFC00" />;
      case 'video':
        return <FileVideo size={24} color="#FFFC00" />;
      case 'document':
      default:
        if (file.mime_type && file.mime_type.includes('pdf')) {
          return <FileText size={24} color="#FF9500" />;
        }
        return <File size={24} color="#007AFF" />;
    }
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.leftContainer}>
        <View style={styles.iconContainer}>{renderIcon()}</View>
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
    height: 76,
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
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  infoContainer: {
    flex: 1,
    paddingRight: 8,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  meta: {
    color: '#8E8E93',
    fontSize: 12,
  },
  moreButton: {
    padding: 4,
  },
});

export default FileCard;
