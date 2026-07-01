import { Image } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { OptimizedMedia } from '../types/camera';

// Helper to get image dimensions as a Promise
const getImageSize = (uri: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });
};

export const mediaOptimizationService = {
  async optimizeImageForUpload(uri: string, maxWidth = 1600, quality = 0.75): Promise<OptimizedMedia> {
    try {
      // 1. Get original file info
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        throw new Error('Image file does not exist.');
      }
      const originalSize = fileInfo.size;

      // 2. Get image dimensions
      let dimensions;
      try {
        dimensions = await getImageSize(uri);
      } catch (dimErr) {
        console.warn('Could not read image dimensions, proceeding with default manipulation:', dimErr);
      }

      const actions: ImageManipulator.Action[] = [];
      
      // If we got dimensions, resize only if width is greater than maxWidth
      if (dimensions && dimensions.width > maxWidth) {
        actions.push({ resize: { width: maxWidth } });
      } else if (!dimensions) {
        // If we couldn't get dimensions, resize to maxWidth anyway as a safe default
        actions.push({ resize: { width: maxWidth } });
      }

      // 3. Perform image manipulation (resize and compress to quality)
      const result = await ImageManipulator.manipulateAsync(
        uri,
        actions,
        {
          compress: quality,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      // 4. Get optimized file size
      const optimizedFileInfo = await FileSystem.getInfoAsync(result.uri);
      if (optimizedFileInfo.exists) {
        // Only return optimized URI if it's actually smaller or if it was resized
        return {
          uri: result.uri,
          fileSize: optimizedFileInfo.size,
        };
      }

      return {
        uri,
        fileSize: originalSize,
      };
    } catch (error) {
      console.error('Image optimization failed, using original:', error);
      try {
        const fileInfo = await FileSystem.getInfoAsync(uri);
        return {
          uri,
          fileSize: fileInfo.exists ? fileInfo.size : 0,
        };
      } catch (_) {
        return {
          uri,
          fileSize: 0,
        };
      }
    }
  },
};

export default mediaOptimizationService;
