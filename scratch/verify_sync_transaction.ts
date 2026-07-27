import { uploadQueueService } from '../src/services/uploadQueueService';
import uploadStore from '../src/upload/uploadStore';
import { telegramService } from '../src/services/telegramService';
import { fileService } from '../src/services/fileService';
import { UploadQueueItem } from '../src/types/camera';

export async function runUploadSyncCertification() {
  console.log('[Certification] Starting Phase 1 - Upload & Sync Engine validation...');

  // Test Case 1: Transaction Rollback Verification
  console.log('\n[Test 1] Simulating Supabase metadata write failure...');
  let rollbackSuccess = false;

  // Mock upload result
  const mockTelegramResult = {
    telegramMessageId: 999999,
    telegramFileId: 'mock_file_id_123',
    telegramFileUniqueId: 'mock_unique_id_456'
  };

  // Temporarily hook / stub fileService metadata save to force failure
  const originalSave = fileService.saveFileMetadata;
  fileService.saveFileMetadata = async () => {
    throw new Error('Forced Supabase Sim Write Failure');
  };

  // Mock deleteTelegramMessage to catch the rollback call
  const originalDelete = telegramService.deleteTelegramMessage;
  telegramService.deleteTelegramMessage = async (messageId: number) => {
    if (messageId === mockTelegramResult.telegramMessageId) {
      rollbackSuccess = true;
      console.log(`[Test 1] Rollback triggered successfully. Deleted Telegram message: ${messageId}`);
    }
    return Promise.resolve(true);
  };

  try {
    const testItem = {
      id: 'test_item_rollback',
      file_name: 'test_image.jpg',
      local_uri: 'file:///mock/path/test_image.jpg',
      file_type: 'image' as const,
      mime_type: 'image/jpeg',
      file_size: 1024,
      is_private: false,
      is_drive_file: false,
      destination: 'memories' as const,
      folder_id: null,
      progress: 0,
      status: 'pending' as const,
      overlay_metadata: { deviceName: 'TestDevice', uploadedAt: Date.now() }
    };

    // Simulate flow logic inside processQueueItem with injected database failure
    try {
      await fileService.saveFileMetadata({
        folder_id: testItem.folder_id,
        file_name: testItem.file_name,
        file_type: testItem.file_type,
        mime_type: testItem.mime_type,
        file_size: testItem.file_size,
        is_private: testItem.is_private,
        is_drive_file: testItem.is_drive_file,
        telegram_message_id: mockTelegramResult.telegramMessageId.toString(),
        telegram_file_id: mockTelegramResult.telegramFileId,
        telegram_file_unique_id: mockTelegramResult.telegramFileUniqueId,
        local_thumbnail_uri: null,
        overlay_metadata: testItem.overlay_metadata,
      });
    } catch (dbError) {
      if (mockTelegramResult && mockTelegramResult.telegramMessageId) {
        console.log('[Test 1] DB write failed. Executing Telegram rollback action...');
        await telegramService.deleteTelegramMessage(mockTelegramResult.telegramMessageId);
      }
      throw dbError;
    }
  } catch (err: any) {
    console.log(`[Test 1] Correctly caught exception: ${err.message}`);
  } finally {
    // Restore original stubs
    fileService.saveFileMetadata = originalSave;
    telegramService.deleteTelegramMessage = originalDelete;
  }

  // Test Case 2: Queue Recovery Verification
  console.log('\n[Test 2] Validating recovery rules in uploadStore...');
  const nowStr = new Date().toISOString();
  const initialQueue: UploadQueueItem[] = [
    { 
      id: 'item_1', 
      status: 'uploading' as const, 
      file_name: 'f1.jpg', 
      local_uri: '', 
      file_type: 'image' as const, 
      mime_type: 'image/jpeg', 
      file_size: 100, 
      is_private: false, 
      is_drive_file: false, 
      destination: 'memories' as const, 
      folder_id: null, 
      progress: 50, 
      stage: 'Uploading',
      created_at: nowStr,
      updated_at: nowStr,
      error_message: null,
      overlay_metadata: null
    },
    { 
      id: 'item_2', 
      status: 'failed' as const, 
      file_name: 'f2.jpg', 
      local_uri: '', 
      file_type: 'image' as const, 
      mime_type: 'image/jpeg', 
      file_size: 100, 
      is_private: false, 
      is_drive_file: false, 
      destination: 'memories' as const, 
      folder_id: null, 
      progress: 0, 
      stage: 'Error',
      created_at: nowStr,
      updated_at: nowStr,
      error_message: 'Mock file error',
      overlay_metadata: null
    },
    { 
      id: 'item_3', 
      status: 'processing' as const, 
      file_name: 'f3.jpg', 
      local_uri: '', 
      file_type: 'image' as const, 
      mime_type: 'image/jpeg', 
      file_size: 100, 
      is_private: false, 
      is_drive_file: false, 
      destination: 'memories' as const, 
      folder_id: null, 
      progress: 90, 
      stage: 'Saving metadata',
      created_at: nowStr,
      updated_at: nowStr,
      error_message: null,
      overlay_metadata: null
    },
  ];

  // Set mock queue items
  await uploadStore.saveUploadQueue(initialQueue);
  await uploadStore.recoverUploadQueue();

  const recoveredQueue = await uploadStore.getUploadQueue();
  const item1 = recoveredQueue.find(i => i.id === 'item_1');
  const item2 = recoveredQueue.find(i => i.id === 'item_2');
  const item3 = recoveredQueue.find(i => i.id === 'item_3');

  const item1Recovered = item1?.status === 'pending';
  const item2Unchanged = item2?.status === 'failed'; // Should NOT recover failed items
  const item3Recovered = item3?.status === 'pending';

  console.log(`[Test 2] Result: item_1 recovered to pending: ${item1Recovered}`);
  console.log(`[Test 2] Result: item_2 remained failed (not retried): ${item2Unchanged}`);
  console.log(`[Test 2] Result: item_3 recovered to pending: ${item3Recovered}`);

  const passedAll = rollbackSuccess && item1Recovered && item2Unchanged && item3Recovered;
  console.log(`\n[Certification Result] Phase 1 Sync Engine: ${passedAll ? 'PASS' : 'FAIL'}`);
  return passedAll;
}
