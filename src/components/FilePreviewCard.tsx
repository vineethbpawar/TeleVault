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

  const isVideo = file.file_type === 'video' ||
    (file.mime_type && file.mime_type.startsWith('video/')) ||
    (file.file_name && /\.(mp4|mov|mkv|3gp|avi|webm)$/i.test(file.file_name));

  const isVideoUri = (uri: string | null | undefined): boolean => {
    if (!uri) return false;
    return /\.(mp4|mov|mkv|3gp|avi|webm)($|\?)/i.test(uri) || uri.includes('/video/');
  };

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

    // Resolve preview for image or video
    if (file.file_type === 'image' || file.file_type === 'video' || file.local_thumbnail_uri) {
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
            if (isVideoUri(result.previewUri)) {
              setResolvedUri(null); // Don't load mp4 in React Native Image
            } else {
              setResolvedUri(result.previewUri);
            }
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

  const formatDuration = (sec: number | null | undefined): string | null => {
    if (!sec) return null;
    const minutes = Math.floor(sec / 60);
    const seconds = Math.floor(sec % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const renderContent = () => {
    if (configReady === null || loading) {
      return (
        <View style={[styles.center, styles.skeletonBg]}>
          <ActivityIndicator size="small" color="#FFFC00" />
          {isVideo ? (
            <FileVideo size={16} color="#FFFC00" style={{ marginTop: 4 }} />
          ) : file.file_type === 'image' ? (
            <FileImage size={16} color="#FFFC00" style={{ marginTop: 4 }} />
          ) : (
            <File size={16} color="#FFFC00" style={{ marginTop: 4 }} />
          )}
        </View>
      );
    }

    if (isVideo) {
      const durationStr = formatDuration(file.overlay_metadata?.duration);
      if (resolvedUri && !error) {
        return (
          <View style={StyleSheet.absoluteFill}>
            <Image
              source={{ uri: resolvedUri }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              onError={() => setError(true)}
            />
            <View style={styles.thumbnailVideoOverlay}>
              <Play size={variant === 'grid' ? 12 : 16} color="#000000" fill="#000000" />
            </View>
            {durationStr && (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{durationStr}</Text>
              </View>
            )}
          </View>
        );
      }

      return (
        <View style={[styles.center, styles.videoFallbackContainer]}>
          {variant !== 'grid' && (
            <View style={styles.videoHeaderRow}>
              <Text style={styles.videoLabel}>VIDEO</Text>
              {durationStr && (
                <Text style={styles.videoDuration}>{durationStr}</Text>
              )}
            </View>
          )}
          
          <View style={styles.fallbackPlayBtn}>
            <Play size={variant === 'row' ? 14 : 20} color="#000000" fill="#000000" />
          </View>
          
          {variant !== 'grid' && (
            <View style={styles.videoFooter}>
              <Text style={styles.videoTitle} numberOfLines={1}>
                {file.file_name || 'Video'}
              </Text>
              <Text style={styles.videoSize}>
                {formatSize(file.file_size)}
              </Text>
            </View>
          )}
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
    backgroundColor: '#0A0B14',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1F2444',
  },
  recentContainer: {
    width: 100,
    height: 120,
    backgroundColor: '#0A0B14',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1F2444',
  },
  rowContainer: {
    width: 48,
    height: 48,
    backgroundColor: '#0A0B14',
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
    backgroundColor: '#0A0B14',
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
  thumbnailVideoOverlay: {
    position: 'absolute',
    top: '40%',
    left: '40%',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 252, 0, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  durationBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  videoFallbackContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#0A0B14',
  },
  videoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
  },
  videoLabel: {
    color: '#FFFC00',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  videoDuration: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  fallbackPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFC00',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    marginVertical: 4,
  },
  videoFooter: {
    width: '100%',
    alignItems: 'center',
  },
  videoTitle: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
  videoSize: {
    color: '#8E8E93',
    fontSize: 8,
    marginTop: 1,
    fontWeight: '500',
  },
  videoGridTitle: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '500',
    width: '100%',
    textAlign: 'center',
    opacity: 0.8,
  },
});

export default FilePreviewCard;
