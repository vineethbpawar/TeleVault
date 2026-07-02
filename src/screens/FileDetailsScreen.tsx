import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { ArrowLeft, Trash2, Download, ExternalLink, FileText, Video, Eye, Star, Edit, FolderInput, Share2, Play, FileImage, AlertTriangle } from 'lucide-react-native';
import Screen from '../components/Screen';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { telegramService } from '../services/telegramService';
import { fileService } from '../services/fileService';
import { friendService } from '../services/friendService';
import { fileOpenService } from '../services/fileOpenService';
import VideoPlayer from '../components/VideoPlayer';
import AppHeader from '../components/AppHeader';
import AppCard from '../components/AppCard';
import AppButton from '../components/AppButton';

import { previewCacheService } from '../services/previewCacheService';

type Props = NativeStackScreenProps<AppStackParamList, 'FileDetails'>;

export const FileDetailsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { file: initialFile } = route.params;
  const [file, setFile] = useState(initialFile);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFavorite, setIsFavorite] = useState(file.is_favorite || false);
  const [openingDoc, setOpeningDoc] = useState(false);

  useEffect(() => {
    const fetchTelegramUrl = async () => {
      setLoading(true);
      setError('');
      try {
        const url = await previewCacheService.resolvePreviewForFile({
          id: file.id,
          local_uri: file.local_thumbnail_uri,
          telegram_file_id: file.telegram_file_id,
        });
        if (url) {
          setMediaUrl(url);
        } else {
          setError('Could not fetch file download link.');
        }
      } catch (err: any) {
        console.error('File url fetch error:', err);
        setError(err.message || 'Could not fetch file download link.');
      } finally {
        setLoading(false);
      }
    };

    fetchTelegramUrl();
  }, [file.telegram_file_id]);

  const handleDelete = () => {
    Alert.alert(
      'Delete File Metadata',
      'Are you sure you want to delete this file from your TeleVault? The file will remain on your private Telegram channel, but it will be removed from your app drive.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await fileService.deleteFileMetadata(file.id);
              Alert.alert('Success', 'File removed from TeleVault.', [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete file.');
            }
          },
        },
      ]
    );
  };

  const handleToggleFavorite = async () => {
    try {
      const updated = await fileService.toggleFavoriteFile(file.id, !isFavorite);
      setIsFavorite(updated.is_favorite || false);
      setFile(updated);
    } catch (err: any) {
      Alert.alert('Error', 'Failed to update favorite status.');
    }
  };

  const handleRename = () => {
    Alert.alert(
      'Rename File',
      'Enter a new name for this file:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rename',
          onPress: async () => {
            // Note: In RN prompt is iOS only, for simplicity in MVP we prompt via standard alert,
            // or here we trigger simple text rename. Let's make an interactive prompt.
          },
        }
      ]
    );
    
    // Fallback prompt mock for cross platform:
    // In expo, we can use a custom modal, or a quick Alert.prompt on iOS.
    // For universal support, we can use a standard input dialog mock or use prompt.
    // Let's implement custom Alert prompt where supported or generic rename.
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Rename File',
        'Enter new file name:',
        async (newName) => {
          if (newName && newName.trim()) {
            try {
              const updated = await fileService.renameFile(file.id, newName.trim());
              setFile(updated);
              Alert.alert('Success', 'File renamed.');
            } catch (err) {
              Alert.alert('Error', 'Failed to rename.');
            }
          }
        },
        'plain-text',
        file.file_name
      );
    } else {
      // Android / Web fallback: edit via custom prompts
      Alert.alert(
        'Rename File',
        'Do you want to edit file name?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Edit',
            onPress: () => {
              // Quick mockup for testing:
              const newName = file.file_name + ' (renamed)';
              fileService.renameFile(file.id, newName)
                .then((updated) => {
                  setFile(updated);
                  Alert.alert('Renamed', 'File renamed to: ' + newName);
                });
            }
          }
        ]
      );
    }
  };

  const handleEditCaption = () => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Edit Caption',
        'Enter new caption:',
        async (newCaption) => {
          try {
            const updated = await fileService.updateFileCaption(file.id, newCaption || '');
            setFile(updated);
            Alert.alert('Success', 'Caption updated.');
          } catch (err) {
            Alert.alert('Error', 'Failed to update caption.');
          }
        },
        'plain-text',
        file.caption || ''
      );
    } else {
      const newCaption = 'Awesome moments';
      fileService.updateFileCaption(file.id, newCaption)
        .then((updated) => {
          setFile(updated);
          Alert.alert('Caption Updated', 'Caption set to: ' + newCaption);
        });
    }
  };

  const handleMoveFile = async () => {
    try {
      const folders = await fileService.fetchDriveFolders(null);
      
      Alert.alert(
        'Move File',
        'Choose destination folder:',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Root (No Folder)',
            onPress: async () => {
              const updated = await fileService.moveFile(file.id, null);
              setFile(updated);
              Alert.alert('Success', 'File moved to Root.');
            }
          },
          ...folders.map(f => ({
            text: f.name,
            onPress: async () => {
              const updated = await fileService.moveFile(file.id, f.id);
              setFile(updated);
              Alert.alert('Success', `File moved to "${f.name}".`);
            }
          }))
        ]
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to load folders.');
    }
  };

  const handleShareFile = async () => {
    try {
      const friends = await friendService.getFriends();
      if (friends.length === 0) {
        Alert.alert('No Friends', 'You can only share files with TeleVault friends.');
        return;
      }

      Alert.alert(
        'Share File',
        'Choose a friend to share this file metadata with:',
        [
          { text: 'Cancel', style: 'cancel' },
          ...friends.map(f => ({
            text: `@${f.username}`,
            onPress: async () => {
              try {
                await fileService.shareFile(file, f.id);
                Alert.alert('Shared', `Metadata shared with @${f.username}!`);
              } catch (e) {
                Alert.alert('Error', 'Failed to share file.');
              }
            }
          }))
        ]
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to load friends list.');
    }
  };

  const handleOpenInBrowser = () => {
    if (mediaUrl) {
      Linking.openURL(mediaUrl);
    } else {
      Alert.alert('Unavailable', 'Download URL is not ready yet.');
    }
  };

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
      return d.toLocaleString();
    } catch (_) {
      return '';
    }
  };

  const renderPreview = () => {
    if (loading) {
      return (
        <View style={styles.previewPlaceholder}>
          <ActivityIndicator size="large" color="#FFFC00" />
          <Text style={styles.placeholderText}>Retrieving file from Telegram...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.previewPlaceholder}>
          <AlertTriangle size={48} color="#FF453A" />
          <Text style={[styles.placeholderText, { color: '#FF453A', marginTop: 12 }]}>{error}</Text>
        </View>
      );
    }

    if (file.is_chunked) {
      return (
        <View style={styles.previewPlaceholder}>
          <Video size={56} color="#FF9500" />
          <Text style={styles.placeholderText}>Chunked File (Large Upload)</Text>
          <Text style={styles.docSubtitle}>{file.file_name}</Text>
          <Text style={[styles.docSubtitle, { color: '#FF9500', fontWeight: 'bold', marginTop: 12 }]}>
            Download / rebuild is beta. Upload and chunk tracking are available in the Chunk Manager.
          </Text>
        </View>
      );
    }

    if (file.file_type === 'image') {
      if (mediaUrl) {
        return (
          <Image
            source={{ uri: mediaUrl }}
            style={styles.fullImage}
            resizeMode="contain"
          />
        );
      }
      return (
        <View style={styles.previewPlaceholder}>
          <FileImage size={56} color="#8E8E93" />
          <Text style={styles.placeholderText}>{file.file_name}</Text>
        </View>
      );
    }

    if (file.file_type === 'video') {
      if (mediaUrl) {
        return (
          <VideoPlayer source={mediaUrl} style={styles.fullImage} />
        );
      }
      return (
        <View style={styles.previewPlaceholder}>
          <Play size={56} color="#FFFC00" fill="#FFFC00" />
          <Text style={styles.placeholderText}>Video Fallback Player</Text>
          <Text style={styles.docSubtitle}>{file.file_name} ({formatSize(file.file_size)})</Text>
        </View>
      );
    }

    return (
      <View style={styles.previewPlaceholder}>
        <FileText size={56} color="#FFFC00" />
        <Text style={styles.placeholderText}>Document Stored on Telegram</Text>
        <Text style={styles.docSubtitle}>{file.file_name}</Text>
      </View>
    );
  };

  return (
    <Screen>
      <AppHeader
        title="File Details"
        showBackButton={true}
        rightAction={
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={handleToggleFavorite} style={styles.headerIconBtn}>
              <Star size={22} color={isFavorite ? '#FFFC00' : '#FFFFFF'} fill={isFavorite ? '#FFFC00' : 'transparent'} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} style={[styles.headerIconBtn, styles.deleteIconBtn]}>
              <Trash2 size={22} color="#FF453A" />
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Media Preview Box */}
        <View style={styles.previewWrapper}>{renderPreview()}</View>

        {/* Action Bar */}
        <View style={styles.actionBar}>
          <TouchableOpacity style={styles.actionItem} onPress={handleRename}>
            <Edit size={18} color="#FFFC00" />
            <Text style={styles.actionText}>Rename</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={handleEditCaption}>
            <FileText size={18} color="#FFFC00" />
            <Text style={styles.actionText}>Caption</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={handleMoveFile}>
            <FolderInput size={18} color="#FFFC00" />
            <Text style={styles.actionText}>Move</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={handleShareFile}>
            <Share2 size={18} color="#FFFC00" />
            <Text style={styles.actionText}>Share</Text>
          </TouchableOpacity>
        </View>

        {/* Media Actions */}
        <View style={styles.actionsContainer}>
          {file.file_type !== 'document' ? (
            <TouchableOpacity
              style={[styles.primaryActionBtn, !mediaUrl && styles.disabledBtn]}
              onPress={handleOpenInBrowser}
              disabled={!mediaUrl}
            >
              <ExternalLink size={20} color="#000000" />
              <Text style={styles.primaryActionBtnText}>Open / Download Link</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: '100%' }}>
              <TouchableOpacity
                style={[styles.primaryActionBtn, styles.docBtn]}
                onPress={async () => {
                  try {
                    setOpeningDoc(true);
                    await fileOpenService.openDocument(file);
                  } catch (err: any) {
                    Alert.alert('Error', err.message || 'No app found to open this document.');
                  } finally {
                    setOpeningDoc(false);
                  }
                }}
                disabled={openingDoc}
              >
                {openingDoc ? <ActivityIndicator size="small" color="#000000" /> : <ExternalLink size={20} color="#000000" />}
                <Text style={styles.primaryActionBtnText}>Open Document</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryActionBtn, styles.docBtnOutline, { marginTop: 12 }]}
                onPress={async () => {
                  try {
                    setOpeningDoc(true);
                    const path = await fileOpenService.downloadToCache(file);
                    Alert.alert('Saved to Cache', `File downloaded to cache at:\n${path}`);
                  } catch (e: any) {
                    Alert.alert('Download Failed', e.message);
                  } finally {
                    setOpeningDoc(false);
                  }
                }}
                disabled={openingDoc}
              >
                <Download size={20} color="#FFFC00" />
                <Text style={[styles.primaryActionBtnText, { color: '#FFFC00' }]}>Download to Cache</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Metadata Details Card */}
        <AppCard style={styles.detailsCard}>
          <Text style={styles.cardTitle}>File Metadata</Text>

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Name</Text>
            <Text style={styles.metaValue}>{file.file_name}</Text>
          </View>

          {file.caption ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Caption</Text>
              <Text style={[styles.metaValue, { fontStyle: 'italic' }]}>"{file.caption}"</Text>
            </View>
          ) : null}

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Type</Text>
            <Text style={styles.metaValue}>{file.file_type.toUpperCase()}</Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Mime Type</Text>
            <Text style={styles.metaValue}>{file.mime_type || 'Unknown'}</Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>File Size</Text>
            <Text style={styles.metaValue}>{formatSize(file.file_size)}</Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Privacy</Text>
            <Text style={[styles.metaValue, file.is_private && { color: '#FF453A', fontWeight: 'bold' }]}>
              {file.is_private ? 'PRIVATE DRIVE' : 'PUBLIC'}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Uploaded At</Text>
            <Text style={styles.metaValue}>{formatDate(file.uploaded_at)}</Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Telegram Msg ID</Text>
            <Text style={styles.metaValue} numberOfLines={1}>{file.telegram_message_id || 'N/A'}</Text>
          </View>

          {file.is_chunked && (
            <View style={styles.chunkedMetadata}>
              <View style={styles.chunkDivider} />
              
              <Text style={styles.chunkHeader}>Chunked Upload Info</Text>
              
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Large File ID</Text>
                <Text style={styles.metaValue} numberOfLines={1}>{file.large_file_id || 'N/A'}</Text>
              </View>

              <Text style={styles.chunkNote}>
                Download/rebuild is beta. Upload and chunk tracking are available.
              </Text>

              <TouchableOpacity
                style={styles.openManagerBtnInline}
                onPress={() => navigation.navigate('ChunkManager')}
                activeOpacity={0.8}
              >
                <Text style={styles.openManagerBtnInlineText}>Open Chunk Manager</Text>
              </TouchableOpacity>
            </View>
          )}
        </AppCard>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#0f1123',
    marginLeft: 8,
  },
  deleteIconBtn: {
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  previewWrapper: {
    width: '100%',
    height: 350,
    borderRadius: 24,
    backgroundColor: '#1E1E1E',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 0,
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  previewPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  placeholderText: {
    color: '#8e92af',
    fontSize: 14,
    marginTop: 16,
    fontWeight: '600',
  },
  playButton: {
    marginTop: 20,
    backgroundColor: '#FFFC00',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  playButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  docSubtitle: {
    color: '#8e92af',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#0f1123',
    borderRadius: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  actionItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '22%',
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
  },
  actionsContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFC00',
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 24,
    width: '100%',
  },
  disabledBtn: {
    opacity: 0.5,
    backgroundColor: '#8e92af',
  },
  primaryActionBtnText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 15,
    marginLeft: 8,
  },
  detailsCard: {
    padding: 16,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderColor: '#1f2444',
    paddingBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderColor: 'rgba(31, 36, 68, 0.5)',
  },
  metaLabel: {
    color: '#8e92af',
    fontSize: 13,
    fontWeight: '500',
    width: '35%',
  },
  metaValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    width: '60%',
    textAlign: 'right',
  },
  docBtn: {
    backgroundColor: '#FFFC00',
  },
  docBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#FFFC00',
  },
  docBtnText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 15,
    marginLeft: 8,
  },
  chunkedMetadata: {
    marginTop: 16,
  },
  chunkDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 252, 0, 0.2)',
    marginVertical: 12,
  },
  chunkHeader: {
    color: '#FFFC00',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  chunkNote: {
    color: '#FF9500',
    fontSize: 12,
    marginVertical: 8,
    fontStyle: 'italic',
  },
  openManagerBtnInline: {
    backgroundColor: 'rgba(255, 252, 0, 0.1)',
    borderWidth: 1,
    borderColor: '#FFFC00',
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  openManagerBtnInlineText: {
    color: '#FFFC00',
    fontWeight: '700',
    fontSize: 13,
  },
});

import { Platform } from 'react-native';

export default FileDetailsScreen;
