import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { FileImage, FileVideo, FileText, Play, File, AlertTriangle } from 'lucide-react-native';
import { TeleVaultFile } from '../types/file';
import { previewCacheService } from '../services/previewCacheService';
import { telegramService } from '../services/telegramService';

interface FilePreviewCardProps {
  file: TeleVaultFile;
  size?: number;
  variant: 'grid' | 'row' | 'recent';
  onPress?: () => void;
}

export const FilePreviewCard: React.FC<FilePreviewCardProps> = ({
  file,
  size,
  variant,
  onPress,
}) => {
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [configReady, setConfigReady] = useState<boolean | null>(telegramService.configReady);

  useEffect(() => {
    const unsubscribe = telegramService.subscribeConfigReady(() => {
      setConfigReady(telegramService.configReady);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let active = true;

    if (configReady === null) {
      return;
    }

    if (configReady === false) {
      setError(true);
      return;
    }

    // Only load preview for image
    if (file.file_type === 'image') {
      setLoading(true);
      setError(false);
      previewCacheService.resolveFilePreview({
        id: file.id,
        file_name: file.file_name,
        file_type: file.file_type,
        mime_type: file.mime_type,
        local_thumbnail_uri: file.local_thumbnail_uri,
        telegram_file_id: file.telegram_file_id,
      }).then(result => {
        if (active) {
          if (result.previewUri && !result.error) {
            setResolvedUri(result.previewUri);
            setError(false);
          } else {
            setError(true);
          }
          setLoading(false);
        }
      }).catch(err => {
        if (__DEV__) {
          console.log(`[DEV_PREVIEW_ERR] fileId=${file.id} name=${file.file_name} type=${file.file_type} err:`, err);
        }
        if (active) {
          setError(true);
          setLoading(false);
        }
      });
    } else {
      // For video and document, no loading needed in preview card
      setLoading(false);
    }
    return () => {
      active = false;
    };
  }, [file.id, file.local_thumbnail_uri, file.telegram_file_id, file.file_type, configReady, file.file_name, file.mime_type]);

  useEffect(() => {
    if (__DEV__ && !loading) {
      console.log(`[DEV_PREVIEW_LOG] fileId=${file.id} name=${file.file_name} type=${file.file_type} mime=${file.mime_type} hasFileId=${!!file.telegram_file_id} resolved=${!!resolvedUri} hasErr=${error}`);
    }
  }, [loading, resolvedUri, error]);

  const formatSize = (bytes: number | null | undefined): string => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const renderContent = () => {
    if (configReady === null || loading) {
      return (
        <View style={[styles.center, styles.skeletonBg]}>
          <ActivityIndicator size="small" color="#FFFC00" />
          {file.file_type === 'video' ? (
            <FileVideo size={16} color="#FFFC00" style={{ marginTop: 4 }} />
          ) : file.file_type === 'image' ? (
            <FileImage size={16} color="#FFFC00" style={{ marginTop: 4 }} />
          ) : (
            <File size={16} color="#FFFC00" style={{ marginTop: 4 }} />
          )}
        </View>
      );
    }

    if (file.file_type === 'video') {
      return (
        <View style={[styles.center, styles.videoBg]}>
          <FileVideo size={variant === 'row' ? 24 : 32} color="#FFFC00" />
          {variant !== 'grid' && (
            <>
              <Text style={[styles.fallbackText, { color: '#FFFC00' }]} numberOfLines={1}>
                {file.file_name}
              </Text>
              <Text style={styles.fallbackSubText} numberOfLines={1}>
                {formatSize(file.file_size)}
              </Text>
            </>
          )}
          <View style={styles.playBadge}>
            <Play size={variant === 'grid' ? 12 : 16} color="#000000" fill="#000000" />
          </View>
        </View>
      );
    }

    if (file.file_type === 'image') {
      if (resolvedUri && !error) {
        return (
          <Image
            source={{ uri: resolvedUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => {
              // Immediately fallback to icon if image fails to load
              setError(true);
            }}
          />
        );
      }
      
      const errorMsg = configReady === false ? 'No connection' : 'Failed preview';
      return (
        <View style={[styles.center, styles.errorBg]}>
          <FileImage size={variant === 'row' ? 24 : 32} color="#8E8E93" />
          {variant !== 'grid' && (
            <>
              <Text style={styles.fallbackText} numberOfLines={1}>{file.file_name}</Text>
              <Text style={[styles.fallbackSubText, { color: '#FF453A' }]} numberOfLines={1}>
                {errorMsg}
              </Text>
            </>
          )}
        </View>
      );
    }

    // Document fallback
    return (
      <View style={[styles.center, styles.docBg]}>
        {file.mime_type && file.mime_type.includes('pdf') ? (
          <FileText size={variant === 'row' ? 24 : 32} color="#FF9500" />
        ) : (
          <File size={variant === 'row' ? 24 : 32} color="#007AFF" />
        )}
        {variant !== 'grid' && (
          <Text style={styles.fallbackText} numberOfLines={1}>{file.file_name}</Text>
        )}
      </View>
    );
  };

  const getContainerStyle = () => {
    switch (variant) {
      case 'grid':
        return [styles.gridContainer, size ? { width: size, height: size } : null];
      case 'recent':
        return styles.recentContainer;
      case 'row':
      default:
        return styles.rowContainer;
    }
  };

  if (!onPress) {
    return (
      <View style={getContainerStyle()}>
        {renderContent()}
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={getContainerStyle()}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {renderContent()}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  gridContainer: {
    aspectRatio: 1,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  recentContainer: {
    width: 100,
    height: 120,
    backgroundColor: '#0F1123',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1F2444',
  },
  rowContainer: {
    width: 48,
    height: 48,
    backgroundColor: '#121212',
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  skeletonBg: {
    backgroundColor: '#1E1E1E',
  },
  errorBg: {
    backgroundColor: '#1C1C1E',
  },
  videoBg: {
    backgroundColor: '#151724',
    borderWidth: 1,
    borderColor: '#1F2444',
  },
  docBg: {
    backgroundColor: '#121212',
  },
  fallbackText: {
    color: '#8E8E93',
    fontSize: 9,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '600',
  },
  fallbackSubText: {
    color: '#8E8E93',
    fontSize: 8,
    marginTop: 2,
    textAlign: 'center',
    fontWeight: '500',
  },
  playBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFC00',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
  },
});

export default FilePreviewCard;
