import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { useCameraPermissions as useExpoCameraPermissions, useMicrophonePermissions as useExpoMicrophonePermissions } from 'expo-camera';

export function useCameraPermissions() {
  const [cameraPermission, requestCameraPermission] = useExpoCameraPermissions();
  const [micPermission, requestMicPermission] = useExpoMicrophonePermissions();
  const [webPermissions, setWebPermissions] = useState<{ camera: boolean | null; microphone: boolean | null }>(() => {
    if (Platform.OS === 'web') {
      const persisted = localStorage.getItem('web_camera_permissions_granted') === 'true';
      return {
        camera: persisted ? true : null,
        microphone: persisted ? true : null,
      };
    }
    return { camera: null, microphone: null };
  });

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Check if navigator.permissions is available
      if (navigator.permissions && navigator.permissions.query) {
        Promise.all([
          navigator.permissions.query({ name: 'camera' as any }).catch(() => null),
          navigator.permissions.query({ name: 'microphone' as any }).catch(() => null),
        ]).then(([camStatus, micStatus]) => {
          const camGranted = camStatus ? camStatus.state === 'granted' : null;
          const micGranted = micStatus ? micStatus.state === 'granted' : null;

          const persisted = localStorage.getItem('web_camera_permissions_granted') === 'true';
          setWebPermissions({
            camera: camGranted !== null ? camGranted : (persisted ? true : null),
            microphone: micGranted !== null ? micGranted : (persisted ? true : null),
          });

          if (camStatus) {
            camStatus.onchange = () => {
              const granted = camStatus.state === 'granted';
              setWebPermissions(prev => ({ ...prev, camera: granted }));
              if (granted) localStorage.setItem('web_camera_permissions_granted', 'true');
            };
          }
          if (micStatus) {
            micStatus.onchange = () => {
              const granted = micStatus.state === 'granted';
              setWebPermissions(prev => ({ ...prev, microphone: granted }));
              if (granted) localStorage.setItem('web_camera_permissions_granted', 'true');
            };
          }
        }).catch(() => {
          const persisted = localStorage.getItem('web_camera_permissions_granted') === 'true';
          setWebPermissions({
            camera: persisted ? true : null,
            microphone: persisted ? true : null,
          });
        });
      } else {
        // Fallback for browsers that don't support query (like iOS Safari)
        const persisted = localStorage.getItem('web_camera_permissions_granted') === 'true';
        setWebPermissions({
          camera: persisted ? true : null,
          microphone: persisted ? true : null,
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
        localStorage.setItem('web_camera_permissions_granted', 'true');
        return true;
      } catch (err) {
        console.warn('Web media permission request failed:', err);
        setWebPermissions({ camera: false, microphone: false });
        localStorage.setItem('web_camera_permissions_granted', 'false');
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
