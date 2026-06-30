export interface TeleVaultFolder {
  id: string;
  user_id: string;
  name: string;
  parent_folder_id: string | null;
  is_private: boolean;
  created_at: string;
}

export interface TeleVaultFile {
  id: string;
  user_id: string;
  folder_id: string | null;
  file_name: string;
  file_type: 'image' | 'video' | 'document';
  mime_type: string | null;
  file_size: number | null;
  is_private: boolean;
  is_drive_file: boolean;
  telegram_message_id: string | null;
  telegram_file_id: string | null;
  telegram_file_unique_id: string | null;
  local_thumbnail_uri: string | null;
  uploaded_at: string;
  created_at: string;
}
