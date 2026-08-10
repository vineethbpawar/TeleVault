import AsyncStorage from '@react-native-async-storage/async-storage';

let runtimeMarketingMode: boolean = false;
let isLoaded = false;

export const initMarketingMode = async (): Promise<void> => {
  try {
    const value = await AsyncStorage.getItem('televault_runtime_marketing_mode');
    runtimeMarketingMode = value === 'true';
  } catch (_) {}
  isLoaded = true;
};

export const isMarketingMode = (): boolean => {
  if (process.env.EXPO_PUBLIC_MARKETING_MODE === 'true') {
    return true;
  }
  return runtimeMarketingMode;
};

export const setRuntimeMarketingMode = async (enabled: boolean): Promise<void> => {
  runtimeMarketingMode = enabled;
  try {
    await AsyncStorage.setItem('televault_runtime_marketing_mode', enabled ? 'true' : 'false');
  } catch (_) {}
};

export const getMarketingMemories = (): any[] => {
  return require('./demoData').DEMO_MEMORIES;
};

export const getMarketingDriveFiles = (): any[] => {
  return require('./demoData').DEMO_DRIVE_FILES;
};
