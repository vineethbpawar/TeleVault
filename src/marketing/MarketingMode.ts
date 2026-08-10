import { DEMO_MEMORIES, DEMO_DRIVE_FILES } from './demoData';

export const isMarketingMode = (): boolean => {
  return process.env.EXPO_PUBLIC_MARKETING_MODE === 'true';
};

export const getMarketingMemories = (): any[] => {
  return DEMO_MEMORIES;
};

export const getMarketingDriveFiles = (): any[] => {
  return DEMO_DRIVE_FILES;
};
