import React from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { CameraLensType } from '../types/camera';

interface LensPickerProps {
  selectedLens: CameraLensType;
  onSelectLens: (lens: CameraLensType) => void;
}

const LENSES: { type: CameraLensType; label: string; icon: string }[] = [
  { type: 'none', label: 'None', icon: '🚫' },
  { type: 'time', label: 'Time', icon: '🕒' },
  { type: 'date', label: 'Date', icon: '📅' },
  { type: 'time_date', label: 'Time & Date', icon: '⏰' },
  { type: 'location', label: 'Location', icon: '📍' },
  { type: 'emoji', label: 'Emoji', icon: '😎' },
  { type: 'crown', label: 'Crown', icon: '👑' },
  { type: 'sunglasses', label: 'Sunglasses', icon: '🕶️' },
  { type: 'heart_eyes', label: 'Heart Eyes', icon: '😍' },
  { type: 'fire', label: 'Fire', icon: '🔥' },
  { type: 'glow', label: 'Glow', icon: '✨' },
  { type: 'vintage', label: 'Vintage', icon: '🎞️' },
  { type: 'vignette', label: 'Vignette', icon: '📷' },
  { type: 'beauty_light', label: 'Beauty', icon: '💡' },
];

export const LensPicker: React.FC<LensPickerProps> = ({ selectedLens, onSelectLens }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Lenses & Filters</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {LENSES.map((lens) => {
          const isSelected = selectedLens === lens.type;
          return (
            <TouchableOpacity
              key={lens.type}
              style={[styles.lensItem, isSelected && styles.lensItemActive]}
              onPress={() => onSelectLens(lens.type)}
              activeOpacity={0.8}
            >
              <View style={[styles.iconCircle, isSelected && styles.iconCircleActive]}>
                <Text style={styles.iconText}>{lens.icon}</Text>
              </View>
              <Text style={[styles.label, isSelected && styles.labelActive]}>
                {lens.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    backgroundColor: '#000000',
  },
  title: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: 12,
  },
  lensItem: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
    width: 72,
  },
  lensItemActive: {
    transform: [{ scale: 1.05 }],
  },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1E1E1E',
    borderWidth: 1.5,
    borderColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  iconCircleActive: {
    backgroundColor: '#1E1E1E',
    borderColor: '#FFFC00', // Yellow accent border
    borderWidth: 2,
    shadowColor: '#FFFC00',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  iconText: {
    fontSize: 22,
  },
  label: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  labelActive: {
    color: '#FFFC00', // Yellow accent text
    fontWeight: '700',
  },
});

export default LensPicker;
