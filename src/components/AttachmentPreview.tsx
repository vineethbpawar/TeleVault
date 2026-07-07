import React from 'react';
import { StyleSheet, View, Image, TouchableOpacity, Text, ScrollView } from 'react-native';
import { X, FileText, Film } from 'lucide-react-native';

export interface Attachment {
  uri: string;
  type: 'image' | 'video' | 'file';
  name?: string;
  size?: number;
}

interface AttachmentPreviewProps {
  attachments: Attachment[];
  onRemove: (index: number) => void;
}

export const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({
  attachments,
  onRemove,
}) => {
  if (attachments.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {attachments.map((item, idx) => {
          const isImg = item.type === 'image';
          const isVideo = item.type === 'video';

          return (
            <View key={item.uri} style={styles.card}>
              {isImg ? (
                <Image source={{ uri: item.uri }} style={styles.preview} />
              ) : isVideo ? (
                <View style={styles.placeholder}>
                  <Film size={24} color="#FFFC00" />
                  <Text style={styles.placeholderText} numberOfLines={1}>Video</Text>
                </View>
              ) : (
                <View style={styles.placeholder}>
                  <FileText size={24} color="#8E8E93" />
                  <Text style={styles.placeholderText} numberOfLines={1}>
                    {item.name || 'File'}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => onRemove(idx)}
                activeOpacity={0.8}
              >
                <X size={12} color="#000000" />
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0F0F0F',
    borderTopWidth: 1,
    borderTopColor: '#1E1E1E',
    paddingVertical: 10,
  },
  scrollContent: {
    paddingHorizontal: 16,
    flexDirection: 'row',
  },
  card: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1E1E1E',
    marginRight: 12,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  preview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  placeholderText: {
    color: '#8E8E93',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});

export default AttachmentPreview;
