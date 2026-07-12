import { useState, useRef, useEffect } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { CameraLensType, UploadDestination } from './types';
import { locationService } from '../services/locationService';

export function useCamera() {
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [cameraMode, setCameraMode] = useState<'picture' | 'video'>('video');
  const [selectedLens, setSelectedLens] = useState<CameraLensType>('original');
  const [defaultDestination, setDefaultDestination] = useState<UploadDestination>('memories');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [locationText, setLocationText] = useState('📍 Fetching Location...');

  const zoomShared = useSharedValue(0);

  // Fetch location information on lens select
  useEffect(() => {
    if (selectedLens === 'location' || selectedLens === 'weather') {
      let active = true;
      locationService.getCityLocation()
        .then((loc) => {
          if (active && loc?.text) {
            setLocationText(`📍 ${loc.text}`);
          }
        })
        .catch(() => {
          if (active) setLocationText('📍 Location Unavailable');
        });
      return () => {
        active = false;
      };
    }
  }, [selectedLens]);

  const toggleFacing = () => {
    setFacing(prev => (prev === 'back' ? 'front' : 'back'));
  };

  const toggleFlash = () => {
    setFlash(prev => (prev === 'off' ? 'on' : 'off'));
  };

  return {
    facing,
    setFacing,
    toggleFacing,
    flash,
    setFlash,
    toggleFlash,
    cameraMode,
    setCameraMode,
    selectedLens,
    setSelectedLens,
    defaultDestination,
    setDefaultDestination,
    isRecording,
    setIsRecording,
    recordingDuration,
    setRecordingDuration,
    locationText,
    zoomShared,
  };
}
