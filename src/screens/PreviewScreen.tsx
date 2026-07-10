import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Alert,
  Dimensions,
  ActivityIndicator,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { ArrowLeft, Send, Sparkles, X, Type, Edit3, RotateCw, EyeOff, Music, CloudSun, BarChart2, HelpCircle, MapPin, Clock, DownloadCloud, Lock, HardDrive, Mic, Smile, Paperclip, MoreHorizontal } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { telegramService } from '../services/telegramService';
import { uploadQueueService } from '../services/uploadQueueService';
import { fileService } from '../services/fileService';
import { locationService } from '../services/locationService';
import { snapService } from '../services/snapService';
import UploadProgress from '../components/UploadProgress';
import VideoPlayer from '../components/VideoPlayer';
import { MediaOverlayItem } from '../types/camera';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showToast } from '../components/ToastBanner';


type Props = NativeStackScreenProps<AppStackParamList, 'Preview'>;

const { width, height } = Dimensions.get('window');

const FILTERS = [
  { name: 'Normal', color: 'transparent' },
  { name: 'Warm', color: 'rgba(255, 160, 0, 0.12)' },
  { name: 'Cool', color: 'rgba(0, 120, 255, 0.12)' },
  { name: 'Bright', color: 'rgba(255, 255, 255, 0.12)' },
  { name: 'Vintage', color: 'rgba(139, 69, 19, 0.15)' },
  { name: 'Moody', color: 'rgba(0, 0, 0, 0.3)' },
];

const EMOJIS = ['😎', '😂', '❤️', '🔥', '✨', '🎉', '😍', '😭', '👍', '👑', '⭐', '💯', '📍', '⏰'];
const OVERLAY_COLORS = ['#FFFFFF', '#000000', '#FFFC00', '#FF453A', '#30D158', '#0A84FF', '#BF5AF2'];

const DESTINATIONS = [
  { id: 'memories', name: 'Memories', icon: DownloadCloud, desc: 'Save securely to cloud Memories' },
  { id: 'drive', name: 'Drive', icon: HardDrive, desc: 'Upload to your TeleVault Drive' },
  { id: 'private_drive', name: 'Private Drive', icon: Lock, desc: 'Zero-knowledge encrypted folder' },
  { id: 'story', name: 'Story', icon: Sparkles, desc: 'Share with friends for 24 hours' },
  { id: 'snap', name: 'Snap', icon: Send, desc: 'Send as disappearing media' },
  { id: 'download', name: 'Download', icon: DownloadCloud, desc: 'Save local copy to gallery' },
];

export const PreviewScreen: React.FC<Props> = ({ navigation, route }) => {
  const { uri, type, fromGallery, defaultLens, sendToUserId, sendToUsername, conversationId, isVault, isPrivate } = route.params as any;
  const insets = useSafeAreaInsets();
  
  // Try to default highlight the private save based on camera context
  const isDefaultPrivate = isVault || isPrivate;

  // Set default destination based on params
  const getDefaultDest = () => {
    const defaultDestParam = (route.params as any).defaultDestination;
    if (defaultDestParam) {
      if (defaultDestParam === 'private' || defaultDestParam === 'private_drive') return 'private_drive';
      if (defaultDestParam === 'drive') return 'drive';
      if (defaultDestParam === 'memories') return 'memories';
      if (defaultDestParam === 'story') return 'story';
      if (defaultDestParam === 'snap') return 'snap';
    }
    if (isPrivate || isVault) return 'private_drive';
    return 'memories';
  };

  const [selectedDestination, setSelectedDestination] = useState<'memories' | 'drive' | 'private_drive' | 'story' | 'snap' | 'download'>(getDefaultDest());
  const [destinationPickerVisible, setDestinationPickerVisible] = useState(false);

  const [selectedFilter, setSelectedFilter] = useState(FILTERS[0]);
  const [overlays, setOverlays] = useState<MediaOverlayItem[]>([]);
  const [fileSize, setFileSize] = useState<number | null>(null);

  // Rotate & Blur states
  const [rotation, setRotation] = useState(0);
  const [blurActive, setBlurActive] = useState(false);

  // Custom text input states
  const [textModalVisible, setTextModalVisible] = useState(false);
  const [customText, setCustomText] = useState('');
  const [selectedColor, setSelectedColor] = useState('#FFFFFF');

  // Drawing tool states
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawingLines, setDrawingLines] = useState<Array<{ points: Array<{ x: number; y: number }>; color: string }>>([]);
  const [currentLine, setCurrentLine] = useState<Array<{ x: number; y: number }>>([]);
  const [selectedDrawColor, setSelectedDrawColor] = useState('#FFFC00');

  // Stickers selection modal state
  const [stickersVisible, setStickersVisible] = useState(false);

  // Queue Progress Modal State
  const [queueVisible, setQueueVisible] = useState(false);
  const [storyLoading, setStoryLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);

  // Container layout size to compute coordinates
  const [containerSize, setContainerSize] = useState({ width, height });

  // Touch State for Dragging
  const touchStartRef = useRef({ x: 0, y: 0, overlayX: 0, overlayY: 0 });
  const activeOverlayIdRef = useRef<string | null>(null);

  // Fetch local file info
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (uri.startsWith('blob:')) {
        fetch(uri)
          .then((r) => r.blob())
          .then((blob) => setFileSize(blob.size))
          .catch((err) => {
            console.error('Failed to get blob size:', err);
            setFileSize(0);
          });
      } else if (uri.startsWith('data:')) {
        try {
          const base64Str = uri.split(',')[1];
          const decodedLength = atob(base64Str).length;
          setFileSize(decodedLength);
        } catch (err) {
          console.error('Failed to parse base64 size:', err);
          setFileSize(0);
        }
      } else {
        setFileSize(0);
      }
    } else {
      FileSystem.getInfoAsync(uri).then((info) => {
        if (info.exists) {
          setFileSize(info.size);
        }
      });
    }
  }, [uri]);

  useEffect(() => {
    if (defaultLens === 'location' || defaultLens === 'time') {
      handleAddSticker(defaultLens);
    }
  }, [defaultLens]);

  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleBlurToggle = () => setBlurActive((prev) => !prev);

  const handleTextSubmit = () => {
    if (!customText.trim()) {
      setTextModalVisible(false);
      return;
    }

    const newOverlay: MediaOverlayItem = {
      id: 'text_' + Date.now(),
      type: 'text' as any,
      text: customText.trim(),
      emoji: null,
      x: containerSize.width / 2 - 60,
      y: containerSize.height / 2 - 20,
      scale: 1.3,
      rotation: 0,
      color: selectedColor,
      created_at: new Date().toISOString(),
    };

    setOverlays((prev) => [...prev, newOverlay]);
    setCustomText('');
    setTextModalVisible(false);
  };

  const handleAddSticker = async (stickerType: string) => {
    setStickersVisible(false);
    let newOverlay: MediaOverlayItem = {
      id: 'sticker_' + stickerType + '_' + Date.now(),
      type: stickerType as any,
      text: '',
      emoji: null,
      x: containerSize.width / 2 - 75,
      y: containerSize.height / 2 - 30,
      scale: 1.0,
      rotation: 0,
      color: '#FFFFFF',
      created_at: new Date().toISOString(),
    };

    if (stickerType === 'location') {
      try {
        const loc = await locationService.getCityLocation();
        newOverlay.text = loc ? loc.text : 'My Location';
      } catch (err) {
        newOverlay.text = 'Location Unknown';
      }
    } else if (stickerType === 'time') {
      const d = new Date();
      newOverlay.text = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (stickerType === 'music') {
      newOverlay.text = '🎵 Now Playing: TeleVault Beat';
    } else if (stickerType === 'weather') {
      newOverlay.text = '☀️ 78°F Sunny';
    } else if (stickerType === 'poll') {
      newOverlay.text = '📊 Would you rather? (Yes / No)';
    } else if (stickerType === 'question') {
      newOverlay.text = '❓ Ask me anything...';
    }

    setOverlays((prev) => {
      // Check if this type of sticker already exists to avoid duplicates when defaulting
      if (prev.some(o => o.type === stickerType)) return prev;
      return [...prev, newOverlay];
    });
  };

  const handleAddEmoji = (emoji: string) => {
    setStickersVisible(false);
    const newOverlay: MediaOverlayItem = {
      id: 'emoji_' + Math.random().toString(36).substring(2, 9) + Date.now(),
      type: 'emoji' as any,
      text: null,
      emoji: emoji,
      x: containerSize.width / 2 - 20,
      y: containerSize.height / 2 - 20,
      scale: 1.5,
      rotation: 0,
      color: null,
      created_at: new Date().toISOString(),
    };
    setOverlays((prev) => [...prev, newOverlay]);
  };

  const deleteOverlay = (id: string) => {
    setOverlays((prev) => prev.filter((o) => o.id !== id));
  };

  const handleTouchStart = (id: string, e: any) => {
    if (drawingMode) return;
    const overlay = overlays.find((o) => o.id === id);
    if (!overlay) return;
    const pageX = e.nativeEvent.pageX;
    const pageY = e.nativeEvent.pageY;
    touchStartRef.current = {
      x: pageX,
      y: pageY,
      overlayX: overlay.x,
      overlayY: overlay.y,
    };
    activeOverlayIdRef.current = id;
  };

  const handleTouchMove = (e: any) => {
    if (drawingMode) return;
    const id = activeOverlayIdRef.current;
    if (!id) return;
    const pageX = e.nativeEvent.pageX;
    const pageY = e.nativeEvent.pageY;
    const dx = pageX - touchStartRef.current.x;
    const dy = pageY - touchStartRef.current.y;

    setOverlays((prev) =>
      prev.map((o) => {
        if (o.id === id) {
          return {
            ...o,
            x: touchStartRef.current.overlayX + dx,
            y: touchStartRef.current.overlayY + dy,
          };
        }
        return o;
      })
    );
  };

  const handleTouchEnd = () => {
    activeOverlayIdRef.current = null;
  };

  const handleCanvasTouchStart = (e: any) => {
    if (!drawingMode) return;
    const { locationX, locationY } = e.nativeEvent;
    setCurrentLine([{ x: locationX, y: locationY }]);
  };

  const handleCanvasTouchMove = (e: any) => {
    if (!drawingMode) return;
    const { locationX, locationY } = e.nativeEvent;
    setCurrentLine((prev) => [...prev, { x: locationX, y: locationY }]);
  };

  const handleCanvasTouchEnd = () => {
    if (!drawingMode) return;
    if (currentLine.length > 0) {
      setDrawingLines((prev) => [...prev, { points: currentLine, color: selectedDrawColor }]);
      setCurrentLine([]);
    }
  };

  const clearDrawing = () => setDrawingLines([]);

  const handleLayout = (e: any) => {
    const { width, height } = e.nativeEvent.layout;
    setContainerSize({ width, height });
  };

  const getPackagedMetadata = (thumbUri?: string | null) => ({
    overlays,
    drawing: drawingLines,
    rotation,
    blur: blurActive,
    thumbnailUri: thumbUri || null,
  });

  const handleQueueUpload = async (destination: 'memories' | 'drive' | 'private_drive') => {
    try {
      const config = await telegramService.getTelegramConfig();
      if (!config.botToken || !config.channelId) {
        Alert.alert(
          'Telegram Configuration Required',
          'Sync settings are missing. Please configure your Telegram Bot Details.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Configure Now',
              onPress: () => navigation.navigate('TelegramConnect', { fromSettings: false }),
            },
          ]
        );
        return;
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to retrieve connection parameters.');
      return;
    }

    if (fileSize !== null) {
      if (fileSize > 500 * 1024 * 1024) {
        Alert.alert('Upload Blocked', 'This file is too large. Max supported is 500 MB.');
        return;
      } else if (fileSize > 50 * 1024 * 1024) {
        Alert.alert('Large File Detected', 'This file will be split into chunks and uploaded to Telegram.');
      }
    }

    const timestamp = Date.now();
    const extension = type === 'video' ? 'mp4' : 'jpg';
    const fileName = `TV_${destination.toUpperCase()}_${timestamp}.${extension}`;
    const mimeType = type === 'video' ? 'video/mp4' : 'image/jpeg';

    let localThumbnailUri: string | null = null;
    if (type === 'video') {
      try {
        if (Platform.OS === 'web') {
          localThumbnailUri = await new Promise<string>((resolve, reject) => {
            const video = document.createElement('video');
            video.src = uri;
            video.crossOrigin = 'anonymous';
            video.playsInline = true;
            video.muted = true;
            video.play().catch(() => {});
            video.pause();
            video.onloadeddata = () => {
              video.currentTime = 0.5;
            };
            video.onseeked = () => {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  resolve(canvas.toDataURL('image/jpeg'));
                } else {
                  reject(new Error('Failed to get 2D canvas context'));
                }
              } catch (err) {
                reject(err);
              }
            };
            video.onerror = (err) => reject(err);
          });
        } else {
          const VideoThumbnails = require('expo-video-thumbnails');
          const thumb = await VideoThumbnails.getThumbnailAsync(uri, { time: 500 });
          if (thumb && thumb.uri) {
            localThumbnailUri = thumb.uri;
          }
        }
      } catch (e) {
        console.warn('Failed to pre-generate video thumbnail on save:', e);
      }
    }

    try {
      // 1. Pre-insert the metadata record to Supabase so it shows up instantly in Memories!
      const metaData = getPackagedMetadata(localThumbnailUri);
      const dbRecord = await fileService.saveFileMetadata({
        folder_id: null,
        file_name: fileName,
        file_type: type === 'video' ? 'video' : 'image',
        mime_type: mimeType,
        file_size: fileSize || 0,
        is_private: destination === 'private_drive',
        is_drive_file: destination !== 'memories',
        local_thumbnail_uri: localThumbnailUri || uri, // fallback to uri for fast preview
        overlay_metadata: {
          ...metaData,
          local_uri: uri
        },
        telegram_message_id: null,
        telegram_file_id: null,
        telegram_file_unique_id: null,
      });

      // 2. Add to background upload queue referencing the DB file ID
      await uploadQueueService.addToUploadQueue({
        local_uri: uri,
        file_name: fileName,
        file_type: type === 'video' ? 'video' : 'image',
        mime_type: mimeType,
        file_size: fileSize || 0,
        destination: destination === 'private_drive' ? 'private' : destination,
        folder_id: null,
        is_private: destination === 'private_drive',
        is_drive_file: destination !== 'memories',
        overlay_metadata: metaData,
        local_thumbnail_uri: localThumbnailUri,
        db_file_id: dbRecord.id,
      });

      showToast('Saving to Memories...');
      navigation.navigate('Main', { screen: 'CameraTab' });
    } catch (error: any) {
      console.error('Queue add failed:', error);
      Alert.alert('Queue Error', 'Failed to schedule media upload.');
    }
  };

  const handleSaveToSelectedDestination = async () => {
    if (selectedDestination === 'memories') {
      await handleQueueUpload('memories');
    } else if (selectedDestination === 'drive') {
      await handleQueueUpload('drive');
    } else if (selectedDestination === 'private_drive') {
      await handleQueueUpload('private_drive');
    } else if (selectedDestination === 'story') {
      await handleAddToStory();
    } else if (selectedDestination === 'snap') {
      await handleSendSnap();
    } else if (selectedDestination === 'download') {
      Alert.alert(
        'Media Saved',
        'This action simulated a download/save to your device gallery successfully.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleSendSnap = async () => {
    if (fileSize !== null && fileSize > 50 * 1024 * 1024) return;

    if (sendToUserId) {
      setSendLoading(true);
      try {
        await snapService.sendDirectSnap(
          sendToUserId,
          uri,
          type === 'video' ? 'video' : 'image',
          null, // caption
          getPackagedMetadata(),
          conversationId || null
        );
        Alert.alert('Success', `Snap sent to @${sendToUsername}!`, [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Failed to send snap.');
      } finally {
        setSendLoading(false);
      }
    } else {
      // Direct user to SendToScreen for multiple selection
      navigation.navigate('SendTo', {
        mediaUri: uri,
        mediaType: type === 'video' ? 'video' : 'image',
        metadata: getPackagedMetadata()
      });
    }
  };

  const handleAddToStory = async () => {
    if (fileSize !== null && fileSize > 50 * 1024 * 1024) return;
    setStoryLoading(true);
    try {
      await snapService.addToStory(uri, type === 'video' ? 'video' : 'image', null, getPackagedMetadata());
      Alert.alert('Success', 'Added to story.', [
        { text: 'OK', onPress: () => navigation.replace('Main', { screen: 'CameraTab' }) }
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add to story.');
    } finally {
      setStoryLoading(false);
    }
  };

  const renderLensOverlay = () => {
    if (!defaultLens || defaultLens === 'none' || defaultLens === 'original') return null;

    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateString = now.toLocaleDateString();

    return (
      <View style={styles.liveOverlayContainer} pointerEvents="none">
        {/* Color Tints */}
        {defaultLens === 'warm' && <View style={styles.warmOverlay} />}
        {defaultLens === 'cool' && <View style={styles.coolOverlay} />}
        {defaultLens === 'bw' && <View style={styles.bwOverlay} />}
        {defaultLens === 'soft' && <View style={styles.softOverlay} />}
        {defaultLens === 'night' && <View style={styles.nightOverlay} />}
        
        {/* Stamp / Text Overlays */}
        {defaultLens === 'time' && (
          <View style={styles.textOverlayWrapper}>
            <Text style={styles.liveOverlayStampText}>{timeString}</Text>
          </View>
        )}
        {defaultLens === 'date' && (
          <View style={styles.textOverlayWrapper}>
            <Text style={styles.liveOverlayStampText}>{dateString}</Text>
          </View>
        )}
        {defaultLens === 'vault' && (
          <View style={styles.stampOverlayWrapper}>
            <Text style={styles.stampOverlayText}>TELEVAULT SECURE</Text>
          </View>
        )}
        {defaultLens === 'private' && (
          <View style={styles.stampOverlayWrapper}>
            <Text style={[styles.stampOverlayText, { borderColor: '#FF453A', color: '#FF453A' }]}>PRIVATE LOCK</Text>
          </View>
        )}
      </View>
    );
  };

  const renderOverlays = () => {
    return overlays.map((o) => {
      const isEmoji = o.emoji !== null;
      return (
        <View
          key={o.id}
          style={[styles.overlayItem, { left: o.x, top: o.y }]}
          onTouchStart={(e) => handleTouchStart(o.id, e)}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {isEmoji ? (
            <Text style={{ fontSize: 32 * (o.scale || 1) }}>{o.emoji}</Text>
          ) : o.type === 'text' ? (
            <Text style={[styles.overlayText, { color: o.color || '#FFFFFF', fontSize: 18 * (o.scale || 1) }]}>
              {o.text}
            </Text>
          ) : (
            <View style={styles.stickerCard}>
              {o.type === 'location' && <MapPin size={14} color="#FFFC00" />}
              {o.type === 'time' && <Clock size={14} color="#FFFC00" />}
              {o.type === 'music' && <Music size={14} color="#FFFC00" />}
              {o.type === 'weather' && <CloudSun size={14} color="#FFFC00" />}
              {o.type === 'poll' && <BarChart2 size={14} color="#FFFC00" />}
              {o.type === 'question' && <HelpCircle size={14} color="#FFFC00" />}
              <Text style={styles.stickerCardText}>{o.text}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.deleteOverlayBtn} onPress={() => deleteOverlay(o.id)}>
            <X size={10} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      );
    });
  };

  return (
    <View style={styles.container}>
      <UploadProgress visible={queueVisible} onClose={() => setQueueVisible(false)} />

      {/* Main Preview Container Full Screen */}
      <View
        style={[
          styles.previewContainer,
          type === 'video' ? {} : { transform: [{ rotate: `${rotation}deg` }] }
        ]}
        onLayout={handleLayout}
      >
        {type === 'video' ? (
          <VideoPlayer source={uri} style={styles.previewImage} />
        ) : (
          <Image
            source={{ uri }}
            style={styles.previewImage}
            resizeMode="cover"
            blurRadius={blurActive ? 20 : 0}
          />
        )}

        {/* Filters Overlay */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: selectedFilter.color }]} pointerEvents="none" />

        {/* Live Lens Overlay */}
        {renderLensOverlay()}

        {/* Draggable Overlays */}
        {renderOverlays()}

        {/* Freehand Drawing Canvas */}
        <View
          style={StyleSheet.absoluteFill}
          pointerEvents={drawingMode ? 'auto' : 'none'}
          onTouchStart={handleCanvasTouchStart}
          onTouchMove={handleCanvasTouchMove}
          onTouchEnd={handleCanvasTouchEnd}
        >
          {drawingLines.map((line, lIdx) =>
            line.points.map((p, pIdx) => {
              if (pIdx === 0) return null;
              const prev = line.points[pIdx - 1];
              const dx = p.x - prev.x;
              const dy = p.y - prev.y;
              const distance = Math.sqrt(dx * dx + dy * dy);
              const steps = Math.ceil(distance / 2);
              const points = [];
              for (let i = 0; i <= steps; i++) {
                points.push({
                  x: prev.x + (dx * i) / steps,
                  y: prev.y + (dy * i) / steps,
                });
              }
              return points.map((pt, ptIdx) => (
                <View
                  key={`line-${lIdx}-${pIdx}-${ptIdx}`}
                  style={[
                    styles.drawPoint,
                    {
                      left: pt.x - 3,
                      top: pt.y - 3,
                      backgroundColor: line.color,
                    },
                  ]}
                />
              ));
            })
          )}

          {currentLine.map((p, pIdx) => (
            <View
              key={`curr-pt-${pIdx}`}
              style={[
                styles.drawPoint,
                {
                  left: p.x - 3,
                  top: p.y - 3,
                  backgroundColor: selectedDrawColor,
                },
              ]}
            />
          ))}
        </View>
      </View>

      {/* Top Controls Overlay */}
      <View style={[styles.topOverlay, { paddingTop: (Platform.OS === 'web' ? 'calc(16px + env(safe-area-inset-top))' : Math.max(insets.top, 16)) as any }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <X size={24} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Center Pill */}
        <View style={styles.topPill}>
          <Sparkles size={12} color="#FFFC00" style={{ marginRight: 4 }} />
          <Text style={styles.topPillText}>
            {defaultLens && defaultLens !== 'none' ? `${defaultLens} | ` : ''}
            {selectedDestination === 'memories' && 'Memories'}
            {selectedDestination === 'drive' && 'Drive'}
            {selectedDestination === 'private_drive' && 'Private Drive'}
            {selectedDestination === 'story' && 'Story'}
            {selectedDestination === 'snap' && 'Snap'}
            {selectedDestination === 'download' && 'Download'}
          </Text>
        </View>

        {/* Dummy right spacing */}
        <View style={{ width: 44 }} />
      </View>

      {/* Right Vertical Editor Toolbar */}
      <View style={[styles.rightToolbar, { top: (Platform.OS === 'web' ? 'calc(76px + env(safe-area-inset-top))' : Math.max(insets.top, 16) + 60) as any }]}>
        <TouchableOpacity style={styles.toolbarBtn} onPress={() => setTextModalVisible(true)}>
          <Type size={18} color="#FFFFFF" />
          <Text style={styles.toolbarBtnLabel}>Text</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.toolbarBtn, drawingMode && styles.activeToolbarBtn]} onPress={() => setDrawingMode(!drawingMode)}>
          <Edit3 size={18} color={drawingMode ? '#000000' : '#FFFFFF'} />
          <Text style={[styles.toolbarBtnLabel, drawingMode && { color: '#000000' }]}>Draw</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolbarBtn} onPress={() => setStickersVisible(true)}>
          <Smile size={18} color="#FFFFFF" />
          <Text style={styles.toolbarBtnLabel}>Sticker</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolbarBtn} onPress={handleRotate}>
          <RotateCw size={18} color="#FFFFFF" />
          <Text style={styles.toolbarBtnLabel}>Crop</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolbarBtn} onPress={() => handleAddSticker('music')}>
          <Music size={18} color="#FFFFFF" />
          <Text style={styles.toolbarBtnLabel}>Music</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolbarBtn} onPress={() => Alert.alert('Audio Control', 'Audio unmuted.')}>
          <Mic size={18} color="#FFFFFF" />
          <Text style={styles.toolbarBtnLabel}>Voice</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolbarBtn} onPress={() => Alert.alert('Snap Duration', 'Disappearing timer set to infinite.')}>
          <Clock size={18} color="#FFFFFF" />
          <Text style={styles.toolbarBtnLabel}>Timer</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.toolbarBtn, blurActive && styles.activeToolbarBtn]} onPress={handleBlurToggle}>
          <EyeOff size={18} color={blurActive ? '#000000' : '#FFFFFF'} />
          <Text style={[styles.toolbarBtnLabel, blurActive && { color: '#000000' }]}>Blur</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolbarBtn} onPress={() => handleAddSticker('location')}>
          <MapPin size={18} color="#FFFFFF" />
          <Text style={styles.toolbarBtnLabel}>Loc</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolbarBtn} onPress={() => Alert.alert('Attachment', 'Attach link or file feature is coming soon.')}>
          <Paperclip size={18} color="#FFFFFF" />
          <Text style={styles.toolbarBtnLabel}>Attach</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolbarBtn} onPress={() => Alert.alert('More Options', 'Advanced editor tools coming soon.')}>
          <MoreHorizontal size={18} color="#FFFFFF" />
          <Text style={styles.toolbarBtnLabel}>More</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Controls Overlay */}
      <View style={[styles.bottomOverlay, { paddingBottom: (Platform.OS === 'web' ? 'calc(16px + env(safe-area-inset-bottom))' : Math.max(insets.bottom, 16)) as any }]}>
        {/* Drawing Colors */}
        {drawingMode && (
          <View style={styles.colorsRow}>
            {OVERLAY_COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.colorBubble, { backgroundColor: c }, selectedDrawColor === c && styles.selectedColorBubble]}
                onPress={() => setSelectedDrawColor(c)}
              />
            ))}
            <TouchableOpacity style={styles.clearDrawBtn} onPress={clearDrawing}>
              <Text style={styles.clearDrawText}>Clear</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Save/Send Actions */}
        {!drawingMode && (
          <View style={styles.actionsContainer}>
            <View style={styles.actionButtonsRow}>
              {/* Left: Save Button */}
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveToSelectedDestination}>
                <DownloadCloud size={20} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>

              {/* Center: Destination Selector Pill */}
              <TouchableOpacity
                style={styles.destinationPill}
                onPress={() => setDestinationPickerVisible(true)}
              >
                {selectedDestination === 'private_drive' ? (
                  <Lock size={16} color="#FFFC00" />
                ) : selectedDestination === 'drive' ? (
                  <HardDrive size={16} color="#FFFC00" />
                ) : selectedDestination === 'story' ? (
                  <Sparkles size={16} color="#FFFC00" />
                ) : selectedDestination === 'snap' ? (
                  <Send size={16} color="#FFFC00" />
                ) : (
                  <DownloadCloud size={16} color="#FFFC00" />
                )}
                <Text style={styles.destinationPillText}>
                  {selectedDestination === 'memories' && 'Memories'}
                  {selectedDestination === 'drive' && 'Drive'}
                  {selectedDestination === 'private_drive' && 'Private'}
                  {selectedDestination === 'story' && 'Story'}
                  {selectedDestination === 'snap' && 'Snap'}
                  {selectedDestination === 'download' && 'Download'}
                </Text>
              </TouchableOpacity>

              {/* Right: Send To Button */}
              <TouchableOpacity style={styles.sendBtn} onPress={handleSendSnap} disabled={sendLoading}>
                {sendLoading ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <>
                    <Text style={styles.sendBtnText}>Send To</Text>
                    <View style={styles.sendBtnIconContainer}>
                      <Send size={16} color="#000000" />
                    </View>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Destination Picker Modal */}
      <Modal visible={destinationPickerVisible} transparent animationType="slide">
        <TouchableOpacity 
          style={styles.sheetOverlay} 
          activeOpacity={1} 
          onPress={() => setDestinationPickerVisible(false)}
        >
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderBar} />
              <Text style={styles.sheetTitle}>Choose Save Destination</Text>
            </View>
            
            <View style={styles.destinationsList}>
              {DESTINATIONS.map((dest) => {
                const isSelected = selectedDestination === dest.id;
                const IconComponent = dest.icon;
                return (
                  <TouchableOpacity
                    key={dest.id}
                    style={[
                      styles.destinationItem,
                      isSelected && styles.destinationItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedDestination(dest.id as any);
                      setDestinationPickerVisible(false);
                    }}
                  >
                    <View style={[styles.destIconContainer, isSelected && styles.destIconContainerSelected]}>
                      <IconComponent size={20} color={isSelected ? '#000000' : '#FFFFFF'} />
                    </View>
                    <View style={styles.destInfo}>
                      <Text style={[styles.destName, isSelected && styles.destNameSelected]}>
                        {dest.name}
                      </Text>
                      <Text style={styles.destDesc}>{dest.desc}</Text>
                    </View>
                    {isSelected && (
                      <View style={styles.destCheckmark}>
                        <Text style={{ color: '#FFFC00', fontWeight: '800', fontSize: 16 }}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modals */}
      <Modal visible={textModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.textModalBox}>
            <Text style={styles.modalBoxTitle}>Add Text Overlay</Text>
            <TextInput
              style={styles.textModalInput}
              placeholder="Type something..."
              placeholderTextColor="#8e92af"
              value={customText}
              onChangeText={setCustomText}
              autoFocus
            />
            <View style={styles.colorsSelector}>
              {OVERLAY_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorBubble, { backgroundColor: c }, selectedColor === c && styles.selectedColorBubble]}
                  onPress={() => setSelectedColor(c)}
                />
              ))}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setTextModalVisible(false)}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSubmit]} onPress={handleTextSubmit}>
                <Text style={{ color: '#000000', fontWeight: '700' }}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={stickersVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setStickersVisible(false)}>
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Widgets & Stickers</Text>
            </View>
            <View style={styles.stickersGrid}>
              <TouchableOpacity style={styles.stickerOption} onPress={() => handleAddSticker('location')}>
                <MapPin size={24} color="#FFFC00" />
                <Text style={styles.stickerOptionText}>Location</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stickerOption} onPress={() => handleAddSticker('time')}>
                <Clock size={24} color="#FFFC00" />
                <Text style={styles.stickerOptionText}>Time</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stickerOption} onPress={() => handleAddSticker('music')}>
                <Music size={24} color="#FFFC00" />
                <Text style={styles.stickerOptionText}>Music</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stickerOption} onPress={() => handleAddSticker('weather')}>
                <CloudSun size={24} color="#FFFC00" />
                <Text style={styles.stickerOptionText}>Weather</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stickerOption} onPress={() => handleAddSticker('poll')}>
                <BarChart2 size={24} color="#FFFC00" />
                <Text style={styles.stickerOptionText}>Poll</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stickerOption} onPress={() => handleAddSticker('question')}>
                <HelpCircle size={24} color="#FFFC00" />
                <Text style={styles.stickerOptionText}>Question</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.sheetSubtitle}>EMOJIS</Text>
            <View style={styles.emojisRow}>
              {EMOJIS.map((e) => (
                <TouchableOpacity key={e} onPress={() => handleAddEmoji(e)} style={styles.emojiBtn}>
                  <Text style={{ fontSize: 24 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  previewContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 20,
    pointerEvents: 'box-none',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  topPillText: {
    color: '#FFFC00',
    fontSize: 12,
    fontWeight: '700',
  },
  rightToolbar: {
    position: 'absolute',
    right: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 4,
    zIndex: 25,
  },
  toolbarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  toolbarBtnLabel: {
    fontSize: 8,
    color: '#FFFFFF',
    fontWeight: '600',
    marginTop: 1,
  },
  activeToolbarBtn: {
    backgroundColor: '#FFFC00',
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: 16,
    paddingBottom: 20,
    pointerEvents: 'box-none',
    justifyContent: 'flex-end',
  },
  colorsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 24,
    marginBottom: 16,
  },
  colorBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  selectedColorBubble: {
    borderColor: '#FFFC00',
    borderWidth: 2,
    transform: [{ scale: 1.2 }],
  },
  clearDrawBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FF453A',
    borderRadius: 12,
    marginLeft: 10,
  },
  clearDrawText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  actionsContainer: {
    justifyContent: 'flex-end',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 17, 35, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 24,
    height: 48,
    paddingHorizontal: 16,
    flex: 0.28,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 6,
  },
  destinationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 17, 35, 0.95)',
    borderWidth: 1.5,
    borderColor: '#FFFC00',
    borderRadius: 24,
    height: 48,
    paddingHorizontal: 14,
    flex: 0.38,
    marginHorizontal: 6,
  },
  destinationPillText: {
    color: '#FFFC00',
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 6,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFC00',
    borderRadius: 24,
    height: 48,
    paddingHorizontal: 18,
    flex: 0.34,
  },
  sendBtnText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 15,
  },
  sendBtnIconContainer: {
    backgroundColor: 'rgba(0,0,0,0.1)',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawPoint: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  overlayItem: {
    position: 'absolute',
    zIndex: 10,
    padding: 8,
  },
  overlayText: {
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  stickerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#FFFC00',
  },
  stickerCardText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },
  deleteOverlayBtn: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: 'rgba(255, 69, 58, 0.9)',
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  textModalBox: {
    backgroundColor: '#0f1123',
    borderRadius: 24,
    padding: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  modalBoxTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  textModalInput: {
    backgroundColor: '#151728',
    borderRadius: 12,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#242745',
    marginBottom: 16,
  },
  colorsSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalBtn: {
    width: '48%',
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBtnCancel: {
    backgroundColor: '#242745',
  },
  modalBtnSubmit: {
    backgroundColor: '#FFFC00',
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#0f1123',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  sheetHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetHeaderBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: 12,
  },
  sheetTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  destinationsList: {
    marginBottom: 16,
  },
  destinationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151728',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  destinationItemSelected: {
    borderColor: '#FFFC00',
    backgroundColor: 'rgba(255, 252, 0, 0.04)',
  },
  destIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  destIconContainerSelected: {
    backgroundColor: '#FFFC00',
  },
  destInfo: {
    flex: 1,
    marginLeft: 12,
  },
  destName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  destNameSelected: {
    color: '#FFFC00',
  },
  destDesc: {
    color: '#8e92af',
    fontSize: 12,
    marginTop: 2,
  },
  destCheckmark: {
    marginLeft: 10,
  },
  stickersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  stickerOption: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: '#151728',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#242745',
  },
  stickerOptionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
  },
  sheetSubtitle: {
    color: '#8e92af',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  emojisRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emojiBtn: {
    padding: 8,
    marginRight: 6,
    marginBottom: 6,
    backgroundColor: '#151728',
    borderRadius: 10,
  },
  liveOverlayContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  warmOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255, 160, 0, 0.12)',
  },
  coolOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 120, 255, 0.12)',
  },
  bwOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  softOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  nightOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 15, 45, 0.35)',
  },
  textOverlayWrapper: {
    position: 'absolute',
    bottom: 240,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  liveOverlayStampText: {
    color: '#FFFC00',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  stampOverlayWrapper: {
    position: 'absolute',
    top: 100,
    right: 20,
    transform: [{ rotate: '-12deg' }],
  },
  stampOverlayText: {
    color: '#FFFC00',
    fontSize: 11,
    fontWeight: '900',
    borderWidth: 1.5,
    borderColor: '#FFFC00',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    letterSpacing: 2,
  },
});

export default PreviewScreen;
