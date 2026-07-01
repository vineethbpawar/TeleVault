import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Modal, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { RotateCw, Trash2, X, CloudUpload, CheckCircle, AlertCircle, Clock } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { uploadQueueService } from '../services/uploadQueueService';
import { UploadQueueItem } from '../types/camera';

interface UploadProgressProps {
  visible: boolean;
  onClose: () => void;
}

export const UploadProgress: React.FC<UploadProgressProps> = ({ visible, onClose }) => {
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const navigation = useNavigation<any>();

  useEffect(() => {
    if (!visible) return;
    
    // Subscribe to changes in the upload queue
    const unsubscribe = uploadQueueService.subscribeToQueue((updatedQueue) => {
      setQueue(updatedQueue);
    });

    return () => {
      unsubscribe();
    };
  }, [visible]);

  const handleRetry = (id: string) => {
    uploadQueueService.retryFailedUpload(id);
  };

  const handleRemove = (id: string) => {
    uploadQueueService.removeUploadQueueItem(id);
  };

  const handleCancel = async (item: UploadQueueItem) => {
    if (item.large_file_id) {
      try {
        const { largeFileService } = require('../services/largeFileService');
        await largeFileService.cancelLargeFileUpload(item.large_file_id);
      } catch (err) {
        console.error('Error cancelling large file upload:', err);
      }
    }
    await uploadQueueService.updateUploadQueueItem(item.id, {
      status: 'failed',
      error_message: 'Upload cancelled by user',
    });
  };

  const handleClearCompleted = () => {
    uploadQueueService.clearCompletedUploads();
  };

  const getStatusIcon = (status: UploadQueueItem['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={18} color="#30D158" />;
      case 'failed':
        return <AlertCircle size={18} color="#FF453A" />;
      case 'uploading':
        return <ActivityIndicator size="small" color="#FFFC00" />;
      default:
        return <Clock size={18} color="#8E8E93" />;
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getStatusText = (item: UploadQueueItem) => {
    if (item.status === 'uploading') {
      if (item.stage) {
        return `${item.stage} (${item.progress}%)`;
      }
      if (item.upload_mode === 'chunked' && item.chunk_progress) {
        return `Uploading (${item.chunk_progress} - ${item.progress}%)`;
      }
      return `Uploading (${item.progress}%)`;
    }
    if (item.status === 'failed') {
      return item.error_message || 'Failed';
    }
    if (item.status === 'pending') {
      return item.stage || 'Queued';
    }
    return item.status.charAt(0).toUpperCase() + item.status.slice(1);
  };

  const totalCount = queue.length;
  const activeCount = queue.filter((i) => i.status === 'uploading' || i.status === 'pending').length;
  const hasChunkedUpload = queue.some((i) => i.upload_mode === 'chunked');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.card}>
          {/* Modal Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <CloudUpload size={22} color="#FFFC00" style={{ marginRight: 8 }} />
              <Text style={styles.headerTitle}>Upload Queue</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.8}>
              <X size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Subtitle / Actions */}
          {totalCount > 0 && (
            <View style={styles.subHeader}>
              <Text style={styles.subHeaderText}>
                {activeCount > 0 ? `${activeCount} active uploads remaining` : 'All uploads completed'}
              </Text>
              <TouchableOpacity onPress={handleClearCompleted} activeOpacity={0.7}>
                <Text style={styles.clearCompletedText}>Clear Done</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Queue List */}
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {totalCount === 0 ? (
              <View style={styles.emptyContainer}>
                <CloudUpload size={48} color="#2C2C2E" style={{ marginBottom: 12 }} />
                <Text style={styles.emptyTitle}>Queue is empty</Text>
                <Text style={styles.emptySubtitle}>Any media captures or uploads will appear here</Text>
              </View>
            ) : (
              queue.map((item) => {
                const isUploading = item.status === 'uploading';
                const isFailed = item.status === 'failed';
                const isPending = item.status === 'pending';

                return (
                  <View key={item.id} style={styles.itemRow}>
                    <View style={styles.itemMeta}>
                      <View style={styles.itemTitleRow}>
                        {getStatusIcon(item.status)}
                        <Text style={styles.itemFilename} numberOfLines={1}>
                          {item.file_name}
                        </Text>
                      </View>
                      
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 26, marginBottom: 4 }}>
                        <Text style={styles.itemSizeText}>
                          {formatSize(item.file_size)}
                        </Text>
                        {item.upload_mode === 'chunked' && (
                          <View style={styles.chunkBadge}>
                            <Text style={styles.chunkBadgeText}>Large File</Text>
                          </View>
                        )}
                      </View>

                      {item.file_type === 'video' && (
                        <Text style={[styles.warningText, { marginLeft: 26, marginBottom: 4 }]}>
                          Large videos may take longer depending on network.
                        </Text>
                      )}

                      {item.file_type === 'document' && (
                        <Text style={[styles.modeText, { marginLeft: 26, marginBottom: 4 }]}>
                          Mode: {item.upload_mode === 'chunked' ? 'Chunked Upload' : 'Normal Upload'}
                        </Text>
                      )}
                      
                      <Text style={[
                        styles.itemStatusText,
                        isUploading && { color: '#FFFC00' },
                        isFailed && { color: '#FF453A' },
                        isPending && { color: '#8E8E93' }
                      ]} numberOfLines={1}>
                        {getStatusText(item)}
                      </Text>

                      {/* Progress Bar */}
                      {isUploading && (
                        <View style={styles.progressBarContainer}>
                          <View style={[styles.progressBarFill, { width: `${item.progress}%` }]} />
                        </View>
                      )}
                    </View>

                    <View style={styles.itemActions}>
                      {isUploading && item.upload_mode === 'chunked' && (
                        <TouchableOpacity
                          style={styles.cancelBtn}
                          onPress={() => handleCancel(item)}
                          activeOpacity={0.7}
                        >
                          <X size={14} color="#FF9500" />
                          <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                      )}

                      {isFailed && (
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnRetry]}
                          onPress={() => handleRetry(item.id)}
                          activeOpacity={0.7}
                        >
                          <RotateCw size={14} color="#000000" />
                          <Text style={styles.actionBtnTextRetry}>
                            {item.upload_mode === 'chunked' ? 'Resume' : 'Retry'}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {(isFailed || isPending) && (
                        <TouchableOpacity
                          style={styles.trashBtn}
                          onPress={() => handleRemove(item.id)}
                          activeOpacity={0.7}
                        >
                          <Trash2 size={16} color="#FF453A" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Manage Large Uploads Button if chunked upload exists */}
          {hasChunkedUpload && (
            <TouchableOpacity
              style={styles.manageLargeBtn}
              onPress={() => {
                onClose();
                navigation.navigate('ChunkManager');
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.manageLargeBtnText}>Manage Large Uploads</Text>
            </TouchableOpacity>
          )}

          {/* Close Button / Bottom Info */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Uploads run securely in background
            </Text>
            <TouchableOpacity style={styles.dismissButton} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.dismissButtonText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end', // Slide up from bottom
  },
  card: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    maxHeight: '80%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: '#2C2C2E',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  subHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#151515',
  },
  subHeaderText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
  },
  clearCompletedText: {
    color: '#FFFC00',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySubtitle: {
    color: '#8E8E93',
    fontSize: 13,
    textAlign: 'center',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#151515',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  itemMeta: {
    flex: 1,
    marginRight: 12,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemFilename: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
  itemStatusText: {
    color: '#8E8E93',
    fontSize: 12,
    marginLeft: 26,
  },
  itemSizeText: {
    color: '#8E8E93',
    fontSize: 11,
  },
  chunkBadge: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    marginLeft: 8,
  },
  chunkBadgeText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: '800',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: 'rgba(255, 149, 0, 0.1)',
  },
  cancelBtnText: {
    color: '#FF9500',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: '#2C2C2E',
    borderRadius: 2,
    marginTop: 8,
    marginLeft: 26,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFFC00',
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginRight: 8,
  },
  actionBtnRetry: {
    backgroundColor: '#FFFC00',
  },
  actionBtnTextRetry: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  trashBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    borderRadius: 16,
  },
  footer: {
    paddingHorizontal: 20,
    marginTop: 12,
    alignItems: 'center',
  },
  footerText: {
    color: '#8E8E93',
    fontSize: 11,
    marginBottom: 12,
  },
  dismissButton: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissButtonText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '700',
  },
  manageLargeBtn: {
    backgroundColor: 'rgba(255, 252, 0, 0.1)',
    borderWidth: 1,
    borderColor: '#FFFC00',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginBottom: 12,
  },
  manageLargeBtnText: {
    color: '#FFFC00',
    fontWeight: '700',
    fontSize: 13,
  },
  warningText: {
    color: '#FF9500',
    fontSize: 10,
    fontWeight: '600',
  },
  modeText: {
    color: '#8E8E93',
    fontSize: 10,
  },
});

export default UploadProgress;
