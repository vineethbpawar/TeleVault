import React, { useState, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, SafeAreaView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { CompositeScreenProps, useIsFocused } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, AppStackParamList } from '../types/navigation';
import CameraControls from '../components/CameraControls';
import LoadingScreen from '../components/LoadingScreen';
import AppButton from '../components/AppButton';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'CameraTab'>,
  NativeStackScreenProps<AppStackParamList>
>;

export const CameraScreen: React.FC<Props> = ({ navigation }) => {
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const isFocused = useIsFocused(); // Pause camera preview when screen is not focused

  if (!permission) {
    return <LoadingScreen message="Requesting camera access..." />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <View style={styles.permissionContent}>
          <Text style={styles.permissionTitle}>Camera Permission Required</Text>
          <Text style={styles.permissionDesc}>
            TeleVault needs access to your camera so you can take photos and save them directly to your drive.
          </Text>
          <AppButton title="Grant Camera Permission" onPress={requestPermission} />
        </View>
      </SafeAreaView>
    );
  }

  const handleCapture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          skipProcessing: false,
        });
        if (photo && photo.uri) {
          navigation.navigate('Preview', { uri: photo.uri, type: 'image' });
        } else {
          Alert.alert('Error', 'Failed to capture image');
        }
      } catch (error: any) {
        console.error('Capture error:', error);
        Alert.alert('Error', error.message || 'An error occurred during photo capture.');
      }
    }
  };

  const handleFlip = () => {
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  };

  const handleFlashToggle = () => {
    setFlash((prev) => (prev === 'off' ? 'on' : 'off'));
  };

  const handleGalleryPress = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'TeleVault needs gallery access to upload photos.');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: false,
        quality: 0.9,
      });

      if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
        const asset = pickerResult.assets[0];
        const type = asset.type === 'video' ? 'video' : 'image';
        navigation.navigate('Preview', { uri: asset.uri, type, fromGallery: true });
      }
    } catch (error: any) {
      console.error('Gallery pick error:', error);
      Alert.alert('Error', error.message || 'Failed to select media from gallery.');
    }
  };

  return (
    <View style={styles.container}>
      {isFocused ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
          ref={cameraRef}
        >
          <CameraControls
            onCapture={handleCapture}
            onFlip={handleFlip}
            onFlashToggle={handleFlashToggle}
            flashMode={flash}
            onGalleryPress={handleGalleryPress}
            onMemoriesPress={() => navigation.navigate('MemoriesTab')}
            onSettingsPress={() => navigation.navigate('SettingsTab')}
          />
        </CameraView>
      ) : (
        <View style={styles.inactiveBackground} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  inactiveBackground: {
    flex: 1,
    backgroundColor: '#000000',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  permissionContent: {
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  permissionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  permissionDesc: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
});

export default CameraScreen;
