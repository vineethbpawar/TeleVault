import { UploadQueueItem, UploadDestination, UploadStatus } from '../types/camera';

export type { UploadQueueItem, UploadDestination, UploadStatus };
export type QueueStage =
  | 'Queued'
  | 'Optimizing'
  | 'Encrypting'
  | 'Uploading'
  | 'Processing'
  | 'Completed'
  | 'Failed'
  | 'Paused'
  | 'Recovered';
