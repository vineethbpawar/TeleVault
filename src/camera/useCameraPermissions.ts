import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { useCameraPermissions as useExpoCameraPermissions, useMicrophonePermissions as useExpoMicrophonePermissions } from 'expo-camera';

export function useCameraPermissions() {
  const [cameraPermission, requestCameraPermission] = useExpoCameraPermissions();
  const [micPermission, requestMicPermission] = useExpoMicrophonePermissions();
  const [webPermissions, setWebPermissions] = useState<{ camera: boolean | null; microphone: boolean | null }>({
    camera: null,
    microphone: null,
  });

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Check if navigator.permissions is available
      if (navigator.permissions && navigator.permissions.query) {
        Promise.all([
          navigator.permissions.query({ name: 'camera' as any }).catch(() => null),
          navigator.permissions.query({ name: 'microphone' as any }).catch(() => null),
        ]).then(([camStatus, micStatus]) => {
          setWebPermissions({
            camera: camStatus ? camStatus.state === 'granted' : null,
            microphone: micStatus ? micStatus.state === 'granted' : null,
          });

          if (camStatus) {
            camStatus.onchange = () => {
              setWebPermissions(prev => ({ ...prev, camera: camStatus.state === 'granted' }));
            };
          }
          if (micStatus) {
            micStatus.onchange = () => {
              setWebPermissions(prev => ({ ...prev, microphone: micStatus.state === 'granted' }));
            };
          }
        });
      }
    }
  }, []);

  const hasCameraPermission = Platform.OS === 'web'
    ? webPermissions.camera
    : cameraPermission?.granted;

  const hasMicPermission = Platform.OS === 'web'
    ? webPermissions.microphone
    : micPermission?.granted;

  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach(t => t.stop());
        setWebPermissions({ camera: true, microphone: true });
        return true;
      } catch (err) {
        console.warn('Web media permission request failed:', err);
        setWebPermissions({ camera: false, microphone: false });
        return false;
      }
    } else {
      const camRes = await requestCameraPermission();
      const micRes = await requestMicPermission();
      return camRes.granted && micRes.granted;
    }
  };

  return {
    hasCameraPermission,
    hasMicPermission,
    requestPermissions,
    isCameraPermissionLoading: Platform.OS === 'web' ? webPermissions.camera === null : !cameraPermission,
  };
}
