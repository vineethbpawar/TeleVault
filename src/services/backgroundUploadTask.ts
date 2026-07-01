import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { uploadQueueService } from './uploadQueueService';

export const BACKGROUND_UPLOAD_TASK_NAME = 'TELEVAULT_BACKGROUND_UPLOAD_TASK';

// Define the background task globally at the root level of the script
TaskManager.defineTask(BACKGROUND_UPLOAD_TASK_NAME, async () => {
  try {
    console.log('[Background Upload] Periodic background task execution started.');
    await uploadQueueService.processUploadQueue();
    console.log('[Background Upload] Background upload processing completed.');
    return BackgroundTask.BackgroundTaskResult?.Success ?? 2;
  } catch (error) {
    console.error('[Background Upload] Background upload task failed:', error);
    return BackgroundTask.BackgroundTaskResult?.Failed ?? 1;
  }
});

export const backgroundUploadService = {
  async registerBackgroundUploadTask() {
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_UPLOAD_TASK_NAME);
      if (!isRegistered) {
        await BackgroundTask.registerTaskAsync(BACKGROUND_UPLOAD_TASK_NAME, {
          minimumInterval: 15 * 60, // Minimum 15 minutes interval
        });
        console.log('[Background Upload] Background upload task registered.');
      } else {
        console.log('[Background Upload] Background upload task is already registered.');
      }
    } catch (error) {
      console.warn('[Background Upload] Registration of background upload task failed:', error);
    }
  },
};

export default backgroundUploadService;
