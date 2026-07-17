import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { ArrowLeft, Database, Trash2, Play, AlertCircle, RefreshCw, X, Shield, Eye, CheckCircle2 } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import { AppStackParamList } from '../types/navigation';
import { largeFileService } from '../services/largeFileService';
import { LargeFile, LargeFileChunk } from '../types/largeFile';
import { useIsFocused } from '@react-navigation/native';

type Props = NativeStackScreenProps<AppStackParamList, 'ChunkManager'>;

export const ChunkManagerScreen: React.FC<Props> = ({ navigation }) => {
  const isFocused = useIsFocused();
  const [largeFiles, setLargeFiles] = useState<LargeFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ active: 0, failed: 0, completed: 0 });

  // Modal states for View Chunks
  const [selectedFile, setSelectedFile] = useState<LargeFile | null>(null);
  const [chunks, setChunks] = useState<LargeFileChunk[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchStatsAndFiles = async () => {
    try {
      const allFiles = await largeFileService.getLargeFiles();
      setLargeFiles(allFiles);
      const allStats = await largeFileService.getLargeFileStats();
      setStats(allStats);
    } catch (err: any) {
      console.error('Fetch Large Files error:', err);
      Alert.alert('Error', err.message || 'Failed to fetch chunked files metadata.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchStatsAndFiles();
    }
  }, [isFocused]);

  // Refetch chunks for selected file
  const fetchChunksForSelected = async (fileId: string) => {
    setChunksLoading(true);
    try {
      const fileChunks = await largeFileService.getLargeFileChunks(fileId);
      setChunks(fileChunks);
    } catch (err: any) {
      Alert.alert('Error', 'Failed to fetch chunk details: ' + err.message);
    } finally {
      setChunksLoading(false);
    }
  };

  const handleOpenChunks = async (file: LargeFile) => {
    setSelectedFile(file);
    setModalVisible(true);
    await fetchChunksForSelected(file.id);
  };

  const handleResume = async (fileId: string) => {
    try {
      await largeFileService.resumeLargeFileUploadNoUri(fileId);
      Alert.alert('Success', 'Resuming large file upload in the background.');
      fetchStatsAndFiles();
    } catch (err: any) {
      Alert.alert('Resume Failed', err.message || 'Make sure the file is still in the active upload queue.');
    }
  };

  const handleRetryFailed = async (fileId: string) => {
    try {
      await largeFileService.retryFailedChunks(fileId);
      Alert.alert('Success', 'Retrying failed chunks in the background.');
      fetchStatsAndFiles();
    } catch (err: any) {
      Alert.alert('Retry Failed', err.message || 'Make sure the file is still in the active upload queue.');
    }
  };

  const handleCancel = async (fileId: string) => {
    Alert.alert(
      'Cancel Upload',
      'Are you sure you want to cancel this large file upload?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          onPress: async () => {
            try {
              await largeFileService.cancelLargeFileUpload(fileId);
              Alert.alert('Cancelled', 'Upload cancelled.');
              fetchStatsAndFiles();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel upload.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteMetadata = async (fileId: string) => {
    Alert.alert(
      'Delete Metadata',
      'Are you sure you want to delete this large file metadata? This does NOT delete files already sent to Telegram, but wipes chunk history from the device.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await largeFileService.deleteLargeFileMetadata(fileId);
              fetchStatsAndFiles();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete metadata.');
            }
          },
        },
      ]
    );
  };

  const handleRetrySingleChunk = async (chunk: LargeFileChunk) => {
    if (!selectedFile) return;
    try {
      await largeFileService.retrySingleChunk(selectedFile.id, chunk.chunk_index);
      Alert.alert('Success', `Retrying chunk part ${chunk.chunk_index + 1} in the background.`);
      fetchChunksForSelected(selectedFile.id);
      fetchStatsAndFiles();
    } catch (err: any) {
      Alert.alert('Retry Failed', err.message || 'Make sure the file is still in the active upload queue.');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#30D158';
      case 'uploading': return '#FFFC00';
      case 'failed': return '#FF453A';
      case 'cancelled': return '#FF9500';
      default: return '#8E8E93';
    }
  };

  const renderLargeFileItem = ({ item }: { item: LargeFile }) => {
    // Calculate stats from DB chunks if possible or use basic state
    const isCompleted = item.status === 'completed';
    const isUploading = item.status === 'uploading' || item.status === 'pending';
    const isFailed = item.status === 'failed' || item.status === 'cancelled';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.fileName} numberOfLines={1}>{item.original_file_name}</Text>
          <View style={styles.privacyBadge}>
            {item.is_private ? (
              <Shield size={12} color="#FF9500" />
            ) : (
              <Eye size={12} color="#30D158" />
            )}
            <Text style={[styles.privacyText, { color: item.is_private ? '#FF9500' : '#30D158' }]}>
              {item.is_private ? 'Private' : 'Public'}
            </Text>
          </View>
        </View>

        <Text style={styles.cardSub}>
          {formatSize(item.total_size)} • {item.destination.toUpperCase()}
        </Text>

        <View style={styles.statusRow}>
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>
          <Text style={styles.chunksLabel}>
            Chunks: {item.total_chunks} parts
          </Text>
        </View>

        {/* Progress Fill */}
        {item.total_chunks > 0 && (
          <View style={styles.progressContainer}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Upload Progress</Text>
              <Text style={styles.progressPercent}>
                {isCompleted ? '100%' : item.status === 'pending' ? '0%' : 'In Queue'}
              </Text>
            </View>
            {item.status === 'completed' && (
              <View style={styles.progressBar}>
                <View style={[styles.progressBarFill, { width: '100%', backgroundColor: '#30D158' }]} />
              </View>
            )}
            {item.status !== 'completed' && (
              <View style={styles.progressBar}>
                <View style={[styles.progressBarFill, { width: item.status === 'pending' ? '0%' : '50%' }]} />
              </View>
            )}
          </View>
        )}

        <Text style={styles.dateText}>
          Created: {new Date(item.created_at).toLocaleString()}
        </Text>

        {/* Action Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity 
            style={[styles.btn, styles.btnOutline]} 
            onPress={() => handleOpenChunks(item)}
            activeOpacity={0.8}
          >
            <Text style={styles.btnTextOutline}>View Chunks</Text>
          </TouchableOpacity>

          {isUploading && (
            <TouchableOpacity 
              style={[styles.btn, styles.btnDanger]} 
              onPress={() => handleCancel(item.id)}
              activeOpacity={0.8}
            >
              <Text style={styles.btnText}>Cancel</Text>
            </TouchableOpacity>
          )}

          {isFailed && (
            <>
              <TouchableOpacity 
                style={[styles.btn, styles.btnAccent]} 
                onPress={() => handleResume(item.id)}
                activeOpacity={0.8}
              >
                <Play size={12} color="#000000" style={{ marginRight: 4 }} />
                <Text style={[styles.btnText, { color: '#000000' }]}>Resume</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.btn, styles.btnOutlineDanger]} 
                onPress={() => handleRetryFailed(item.id)}
                activeOpacity={0.8}
              >
                <RefreshCw size={12} color="#FF453A" style={{ marginRight: 4 }} />
                <Text style={[styles.btnText, { color: '#FF453A' }]}>Retry Failed</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity 
            style={[styles.btn, styles.btnTrash]} 
            onPress={() => handleDeleteMetadata(item.id)}
            activeOpacity={0.8}
          >
            <Trash2 size={16} color="#FF453A" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Large File Manager</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Stats Summary */}
      <View style={styles.statsCard}>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{stats.active}</Text>
          <Text style={styles.statLbl}>Active</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statVal, { color: '#FF453A' }]}>{stats.failed}</Text>
          <Text style={styles.statLbl}>Failed</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statVal, { color: '#30D158' }]}>{stats.completed}</Text>
          <Text style={styles.statLbl}>Completed</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : (
        <FlatList
          data={largeFiles}
          keyExtractor={(item) => item.id}
          renderItem={renderLargeFileItem}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Database size={64} color="#2C2C2E" style={{ marginBottom: 16 }} />
              <Text style={styles.emptyTitle}>No large uploads recorded</Text>
              <Text style={styles.emptySubtitle}>
                Chunked uploads (files between 50 MB and 500 MB) will appear here.
              </Text>
            </View>
          }
        />
      )}

      {/* View Chunks Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                Chunks for: {selectedFile?.original_file_name}
              </Text>
              <TouchableOpacity 
                style={styles.modalClose} 
                onPress={() => {
                  setModalVisible(false);
                  setSelectedFile(null);
                  setChunks([]);
                }}
              >
                <X size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {chunksLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color="#FFFC00" />
              </View>
            ) : (
              <FlatList
                data={chunks}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.chunksList}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyTitle}>No chunk records found.</Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const isChunkFailed = item.status === 'failed';
                  return (
                    <View style={styles.chunkRow}>
                      <View style={styles.chunkMeta}>
                        <Text style={styles.chunkIndex}>
                          Part {item.chunk_index + 1} of {selectedFile?.total_chunks}
                        </Text>
                        <Text style={styles.chunkSize}>
                          Size: {formatSize(item.chunk_size)} • Retries: {item.retry_count}
                        </Text>
                        {item.telegram_message_id && (
                          <Text style={styles.chunkTg}>
                            Telegram Msg ID: {item.telegram_message_id}
                          </Text>
                        )}
                        {item.error_message && (
                          <Text style={styles.chunkError}>
                            Err: {item.error_message}
                          </Text>
                        )}
                        {item.uploaded_at && (
                          <Text style={styles.chunkTime}>
                            Uploaded: {new Date(item.uploaded_at).toLocaleTimeString()}
                          </Text>
                        )}
                      </View>

                      <View style={styles.chunkActions}>
                        <View style={[styles.chunkStatusBadge, { backgroundColor: getStatusColor(item.status) + '1E' }]}>
                          <Text style={[styles.chunkStatusText, { color: getStatusColor(item.status) }]}>
                            {item.status}
                          </Text>
                        </View>
                        {isChunkFailed && (
                          <TouchableOpacity 
                            style={styles.chunkRetryBtn} 
                            onPress={() => handleRetrySingleChunk(item)}
                          >
                            <RefreshCw size={12} color="#000000" />
                            <Text style={styles.chunkRetryText}>Retry</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                }}
              />
            )}
            
            <TouchableOpacity 
              style={styles.closeBtn} 
              onPress={() => {
                setModalVisible(false);
                setSelectedFile(null);
                setChunks([]);
              }}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 1,
    borderColor: '#1E1E1E',
  },
  backBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#1E1E1E',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#141414',
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statVal: {
    color: '#FFFC00',
    fontSize: 22,
    fontWeight: '800',
  },
  statLbl: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fileName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 10,
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  privacyText: {
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 4,
  },
  cardSub: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 4,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  chunksLabel: {
    color: '#8E8E93',
    fontSize: 12,
  },
  progressContainer: {
    marginTop: 14,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressLabel: {
    color: '#8E8E93',
    fontSize: 11,
  },
  progressPercent: {
    color: '#FFFC00',
    fontSize: 11,
    fontWeight: '700',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#2C2C2E',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFFC00',
    borderRadius: 3,
  },
  dateText: {
    color: '#666',
    fontSize: 11,
    marginTop: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    flexWrap: 'wrap',
  },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: '#FFFC00',
  },
  btnTextOutline: {
    color: '#FFFC00',
    fontSize: 12,
    fontWeight: '700',
  },
  btnDanger: {
    backgroundColor: '#FF453A',
  },
  btnOutlineDanger: {
    borderWidth: 1,
    borderColor: '#FF453A',
  },
  btnAccent: {
    backgroundColor: '#FFFC00',
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  btnTrash: {
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#8E8E93',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    paddingBottom: 30,
    borderWidth: 1,
    borderColor: '#222',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#222',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  modalClose: {
    padding: 6,
  },
  modalLoading: {
    padding: 40,
    alignItems: 'center',
  },
  chunksList: {
    padding: 16,
  },
  chunkRow: {
    flexDirection: 'row',
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#222',
  },
  chunkMeta: {
    flex: 1,
    marginRight: 10,
  },
  chunkIndex: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  chunkSize: {
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 2,
  },
  chunkTg: {
    color: '#666',
    fontSize: 10,
    marginTop: 2,
  },
  chunkError: {
    color: '#FF453A',
    fontSize: 10,
    marginTop: 2,
  },
  chunkTime: {
    color: '#666',
    fontSize: 10,
    marginTop: 2,
  },
  chunkActions: {
    alignItems: 'flex-end',
  },
  chunkStatusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  chunkStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  chunkRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFC00',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginTop: 6,
  },
  chunkRetryText: {
    color: '#000000',
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 4,
  },
  closeBtn: {
    backgroundColor: '#FFFC00',
    marginHorizontal: 16,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  closeBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default ChunkManagerScreen;
