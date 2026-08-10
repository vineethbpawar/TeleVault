export const MARKETING_CONFIG = {
  enabled: process.env.EXPO_PUBLIC_MARKETING_MODE === 'true',
  appName: 'TeleVault',
  adDuration: 30, // 30 seconds
  recordingSpecs: {
    resolution: '1080x1920',
    fps: 60,
    device: 'Android / Web PWA'
  }
};
