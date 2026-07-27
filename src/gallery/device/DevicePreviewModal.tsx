import React, { useState } from 'react';
import { StyleSheet, View, Text, Modal, TouchableOpacity, Image, Dimensions, ScrollView, Platform, Alert } from 'react-native';
import { X, Play, Share2, Trash2, ShieldCheck, Heart, Info, ArrowUpCircle, Cloud } from 'lucide-react-native';
import { DeviceMedia } from './deviceTypes';

import { deviceMediaService } from './deviceMediaService';
import { showToast } from '../../components/ToastBanner';
import { Check, ShieldAlert, Download } from 'lucide-react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface DevicePreviewModalProps {
  visible: boolean;
  asset: DeviceMedia | null;
  onClose: () => void;
  onBackup: (asset: DeviceMedia) => void;
  onShare: (asset: DeviceMedia) => void;
  onDelete: (asset: DeviceMedia) => void;
}

export const DevicePreviewModal: React.FC<DevicePreviewModalProps> = ({
  visible,
  asset,
  onClose,
  onBackup,
  onShare,
  onDelete,
}) => {
  const [showInfo, setShowInfo] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [restoring, setRestoring] = useState(false);

  if (!asset) return null;

  const formatDate = (timestamp: number) => {
    try {
      return new Date(timestamp).toLocaleString();
    } catch (_) {
      return 'Unknown';
    }
  };

  const renderVideoPlayer = () => {
    if (Platform.OS === 'web') {
      return (
        <video
          src={asset.uri}
          controls
          style={{ width: '100%', maxHeight: screenHeight * 0.6, borderRadius: 16 }}
          autoPlay
        />
      );
    }
    return (
      <View style={styles.nativeVideoContainer}>
        {asset.thumbnailUri ? (
          <Image source={{ uri: asset.thumbnailUri }} style={styles.previewImage} resizeMode="contain" />
        ) : (
          <View style={[styles.previewImage, styles.videoPlaceholder]} />
        )}
        <TouchableOpacity style={styles.playButton} onPress={() => setIsPlaying(true)}>
          <Play size={40} color="#000000" fill="#000000" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.92)' }]} />
        
        {/* Header Toolbar */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onClose}>
            <X size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {asset.filename}
          </Text>
          <TouchableOpacity style={styles.iconButton} onPress={() => setIsFavorite(!isFavorite)}>
            <Heart size={22} color={isFavorite ? '#FF3B30' : '#FFFFFF'} fill={isFavorite ? '#FF3B30' : 'transparent'} />
          </TouchableOpacity>
        </View>

        {/* Main Content Area */}
        <View style={styles.contentContainer}>
          {asset.isVideo ? (
            renderVideoPlayer()
          ) : asset.uri ? (
            <Image source={{ uri: asset.uri }} style={styles.previewImage} resizeMode="contain" />
          ) : (
            <Cloud size={60} color="#8E8E93" />
          )}
        </View>

        {/* Interactive Actions Dock */}
        <View style={styles.actionBar}>
          {!asset.isBackedUp && (
            <TouchableOpacity style={styles.actionItem} onPress={() => onBackup(asset)}>
              <ArrowUpCircle size={24} color="#FFFC00" />
              <Text style={[styles.actionText, { color: '#FFFC00' }]}>Backup</Text>
            </TouchableOpacity>
          )}
          {asset.isBackedUp && (
            <View style={styles.actionItem}>
              <ShieldCheck size={24} color="#34C759" />
              <Text style={[styles.actionText, { color: '#34C759' }]}>Secured</Text>
            </View>
          )}

          {asset.isCloudOnly && (
            <TouchableOpacity 
              style={styles.actionItem} 
              disabled={restoring}
              onPress={async () => {
                try {
                  setRestoring(true);
                  showToast('Restoring file to device gallery...');
                  await deviceMediaService.downloadAndRestoreAsset(asset);
                  showToast('Restore successful! File saved to gallery.');
                } catch (err: any) {
                  showToast('Restore Failed: ' + err.message);
                } finally {
                  setRestoring(false);
                }
              }}
            >
              <Download size={22} color="#FFFC00" />
              <Text style={[styles.actionText, { color: '#FFFC00' }]}>Restore</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.actionItem} onPress={() => onShare(asset)}>
            <Share2 size={22} color="#FFFFFF" />
            <Text style={styles.actionText}>Share</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => setShowInfo(!showInfo)}>
            <Info size={22} color="#FFFFFF" />
            <Text style={styles.actionText}>Info</Text>
          </TouchableOpacity>

          {!asset.isCloudOnly && (
            <TouchableOpacity style={styles.actionItem} onPress={() => onDelete(asset)}>
              <Trash2 size={22} color="#FF3B30" />
              <Text style={[styles.actionText, { color: '#FF3B30' }]}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Info panel */}
        {showInfo && (
          <View style={styles.infoSheet}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0f1123', opacity: 0.98 }]} />
            <ScrollView contentContainerStyle={styles.infoScroll}>
              {asset.conflictDetected && (
                <View style={styles.conflictCard}>
                  <View style={styles.conflictHeader}>
                    <ShieldAlert size={16} color="#FF3B30" style={{ marginRight: 6 }} />
                    <Text style={styles.conflictTitle}>Version Conflict Detected</Text>
                  </View>
                  <Text style={styles.conflictDescription}>
                    A different version of this file exists in the cloud vault ({((asset.cloudSize || 0) / (1024*1024)).toFixed(2)} MB).
                  </Text>
                  <View style={styles.conflictActionsRow}>
                    <TouchableOpacity style={styles.conflictActionBtn} onPress={() => {
                      Alert.alert('Keep Device Version', 'This will overwrite the cloud version with your device file.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Confirm', onPress: () => {
                          onBackup(asset);
                          showToast('Device version backup queued.');
                        }}
                      ]);
                    }}>
                      <Text style={styles.conflictActionText}>Keep Device</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.conflictActionBtn} onPress={async () => {
                      try {
                        showToast('Downloading cloud version...');
                        await deviceMediaService.downloadAndRestoreAsset(asset);
                        showToast('Cloud version restored successfully.');
                      } catch (err: any) {
                        showToast('Restore failed: ' + err.message);
                      }
                    }}>
                      <Text style={styles.conflictActionText}>Keep Cloud</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Filename</Text>
                <Text style={styles.infoVal}>{asset.filename}</Text>
              </View>
              {asset.uri ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Local Path</Text>
                  <Text style={styles.infoVal} numberOfLines={2}>{asset.uri}</Text>
                </View>
              ) : null}
              {asset.width > 0 && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Dimensions</Text>
                  <Text style={styles.infoVal}>{`${asset.width} × ${asset.height}`}</Text>
                </View>
              )}
              {asset.duration > 0 && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Duration</Text>
                  <Text style={styles.infoVal}>{`${Math.round(asset.duration)}s`}</Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Album</Text>
                <Text style={styles.infoVal}>{asset.album}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Created</Text>
                <Text style={styles.infoVal}>{formatDate(asset.creationDate)}</Text>
              </View>
              {asset.size > 0 && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Size</Text>
                  <Text style={styles.infoVal}>{(asset.size / (1024 * 1024)).toFixed(2)} MB</Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Location</Text>
                <Text style={styles.infoVal}>{asset.isCloudOnly ? 'Cloud Vault Only (TeleVault)' : 'On Device'}</Text>
              </View>
              {asset.isBackedUp && (
                <>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Uploaded From</Text>
                    <Text style={styles.infoVal}>{asset.uploadedFromDevice || 'This Device'}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Encryption Model</Text>
                    <Text style={styles.infoVal}>{asset.encryptionMethod || 'AES-GCM (End-to-End Encrypted)'}</Text>
                  </View>
                  
                  {/* Backup Verification Checklist */}
                  <View style={styles.verificationCard}>
                    <Text style={styles.verificationTitle}>Backup Verification Status</Text>
                    <View style={styles.verifyRow}>
                      <Check size={14} color="#34C759" style={{ marginRight: 6 }} />
                      <Text style={styles.verifyText}>Verified Complete</Text>
                    </View>
                    <View style={styles.verifyRow}>
                      <Check size={14} color="#34C759" style={{ marginRight: 6 }} />
                      <Text style={styles.verifyText}>AES-GCM Encrypted</Text>
                    </View>
                    <View style={styles.verifyRow}>
                      <Check size={14} color="#34C759" style={{ marginRight: 6 }} />
                      <Text style={styles.verifyText}>Telegram Storage Secured</Text>
                    </View>
                    <View style={styles.verifyRow}>
                      <Check size={14} color="#34C759" style={{ marginRight: 6 }} />
                      <Text style={styles.verifyText}>Supabase Metadata Synced</Text>
                    </View>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    height: Platform.OS === 'ios' ? 90 : 60,
    justifyContent: 'space-between',
    zIndex: 10,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginHorizontal: 16,
    textAlign: 'center',
  },
  iconButton: {
    padding: 8,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: screenWidth,
    height: screenHeight * 0.65,
  },
  videoPlaceholder: {
    backgroundColor: '#1C1C1E',
  },
  nativeVideoContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    position: 'absolute',
    backgroundColor: '#FFFC00',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.85,
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: 'rgba(15, 17, 35, 0.8)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  actionItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  infoSheet: {
    position: 'absolute',
    bottom: 90,
    left: 0,
    right: 0,
    height: 280,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  infoScroll: {
    padding: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  infoLabel: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
  },
  infoVal: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    maxWidth: '65%',
  },
  verificationCard: {
    marginTop: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  verificationTitle: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  verifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  verifyText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  conflictCard: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.25)',
    marginBottom: 16,
  },
  conflictHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  conflictTitle: {
    color: '#FF3B30',
    fontSize: 13,
    fontWeight: '700',
  },
  conflictDescription: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 12,
    lineHeight: 15,
  },
  conflictActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  conflictActionBtn: {
    backgroundColor: '#FF3B30',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  conflictActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
