import { supabase } from '../lib/supabase';
import { TeleVaultFile, TeleVaultFolder } from '../types/file';

export const fileService = {
  async saveFileMetadata(metadata: {
    folder_id: string | null;
    file_name: string;
    file_type: 'image' | 'video' | 'document';
    mime_type: string | null;
    file_size: number | null;
    is_private: boolean;
    is_drive_file: boolean;
    telegram_message_id: string;
    telegram_file_id: string;
    telegram_file_unique_id: string;
    local_thumbnail_uri: string | null;
    overlay_metadata?: any;
  }): Promise<TeleVaultFile> {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('User session not found.');
    }

    const { data, error } = await supabase
      .from('files')
      .insert({
        user_id: user.id,
        folder_id: metadata.folder_id,
        file_name: metadata.file_name,
        file_type: metadata.file_type,
        mime_type: metadata.mime_type,
        file_size: metadata.file_size,
        is_private: metadata.is_private,
        is_drive_file: metadata.is_drive_file,
        telegram_message_id: metadata.telegram_message_id,
        telegram_file_id: metadata.telegram_file_id,
        telegram_file_unique_id: metadata.telegram_file_unique_id,
        local_thumbnail_uri: metadata.local_thumbnail_uri,
        overlay_metadata: metadata.overlay_metadata || [],
      })
      .select()
      .single();

    if (error) {
      console.error('Save File Metadata Error:', error);
      throw new Error(error.message || 'Failed to save file metadata.');
    }

    return data as TeleVaultFile;
  },

  async fetchMemories(): Promise<TeleVaultFile[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in.');

    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_private', false)
      .eq('is_drive_file', false)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message || 'Failed to fetch memories.');
    }

    return (data || []) as TeleVaultFile[];
  },

  async fetchDriveFiles(folderId: string | null): Promise<TeleVaultFile[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in.');

    let query = supabase
      .from('files')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_private', false)
      .eq('is_drive_file', true);

    if (folderId === null) {
      query = query.is('folder_id', null);
    } else {
      query = query.eq('folder_id', folderId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message || 'Failed to fetch drive files.');
    }

    return (data || []) as TeleVaultFile[];
  },

  async fetchDriveFolders(parentFolderId: string | null): Promise<TeleVaultFolder[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in.');

    let query = supabase
      .from('folders')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_private', false);

    if (parentFolderId === null) {
      query = query.is('parent_folder_id', null);
    } else {
      query = query.eq('parent_folder_id', parentFolderId);
    }

    const { data, error } = await query.order('name', { ascending: true });

    if (error) {
      throw new Error(error.message || 'Failed to fetch drive folders.');
    }

    return (data || []) as TeleVaultFolder[];
  },

  async fetchPrivateDriveFiles(folderId: string | null): Promise<TeleVaultFile[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in.');

    let query = supabase
      .from('files')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_private', true)
      .eq('is_drive_file', true);

    if (folderId === null) {
      query = query.is('folder_id', null);
    } else {
      query = query.eq('folder_id', folderId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message || 'Failed to fetch private drive files.');
    }

    return (data || []) as TeleVaultFile[];
  },

  async fetchPrivateDriveFolders(parentFolderId: string | null): Promise<TeleVaultFolder[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in.');

    let query = supabase
      .from('folders')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_private', true);

    if (parentFolderId === null) {
      query = query.is('parent_folder_id', null);
    } else {
      query = query.eq('parent_folder_id', parentFolderId);
    }

    const { data, error } = await query.order('name', { ascending: true });

    if (error) {
      throw new Error(error.message || 'Failed to fetch private drive folders.');
    }

    return (data || []) as TeleVaultFolder[];
  },

  async createFolder(name: string, parentFolderId: string | null, isPrivate: boolean): Promise<TeleVaultFolder> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in.');

    const { data, error } = await supabase
      .from('folders')
      .insert({
        user_id: user.id,
        name: name,
        parent_folder_id: parentFolderId,
        is_private: isPrivate,
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message || 'Failed to create folder.');
    }

    return data as TeleVaultFolder;
  },

  async renameFolder(id: string, newName: string): Promise<TeleVaultFolder> {
    const { data, error } = await supabase
      .from('folders')
      .update({ name: newName })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message || 'Failed to rename folder.');
    }

    return data as TeleVaultFolder;
  },

  async deleteFolder(id: string): Promise<void> {
    const { error } = await supabase
      .from('folders')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(error.message || 'Failed to delete folder.');
    }
  },

  async renameFile(id: string, newName: string): Promise<TeleVaultFile> {
    const { data, error } = await supabase
      .from('files')
      .update({ file_name: newName })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message || 'Failed to rename file.');
    }

    return data as TeleVaultFile;
  },

  async deleteFileMetadata(id: string): Promise<void> {
    const { error } = await supabase
      .from('files')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(error.message || 'Failed to delete file.');
    }
  },

  async toggleFavoriteFile(id: string, isFavorite: boolean): Promise<TeleVaultFile> {
    const { data, error } = await supabase
      .from('files')
      .update({ is_favorite: isFavorite })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message || 'Failed to toggle favorite status.');
    }
    return data as TeleVaultFile;
  },

  async moveFile(id: string, targetFolderId: string | null): Promise<TeleVaultFile> {
    const { data, error } = await supabase
      .from('files')
      .update({ folder_id: targetFolderId })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message || 'Failed to move file.');
    }
    return data as TeleVaultFile;
  },

  async updateFileCaption(id: string, caption: string): Promise<TeleVaultFile> {
    const { data, error } = await supabase
      .from('files')
      .update({ caption: caption })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message || 'Failed to update file caption.');
    }
    return data as TeleVaultFile;
  },

  async shareFile(file: TeleVaultFile, targetUserId: string): Promise<TeleVaultFile> {
    const { data, error } = await supabase
      .from('files')
      .insert({
        user_id: targetUserId,
        file_name: file.file_name,
        file_type: file.file_type,
        mime_type: file.mime_type,
        file_size: file.file_size,
        is_private: false,
        is_drive_file: true,
        telegram_message_id: file.telegram_message_id,
        telegram_file_id: file.telegram_file_id,
        telegram_file_unique_id: file.telegram_file_unique_id,
        local_thumbnail_uri: file.local_thumbnail_uri,
        caption: file.caption,
        overlay_metadata: file.overlay_metadata || [],
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message || 'Failed to share file metadata.');
    }
    return data as TeleVaultFile;
  },

  async fetchFavorites(): Promise<TeleVaultFile[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in.');

    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_favorite', true)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message || 'Failed to fetch favorite files.');
    }
    return (data || []) as TeleVaultFile[];
  },

  async fetchRecentDriveFiles(): Promise<TeleVaultFile[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in.');

    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_drive_file', true)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      throw new Error(error.message || 'Failed to fetch recent files.');
    }
    return (data || []) as TeleVaultFile[];
  },

  async getStorageUsage(): Promise<{ totalSize: number; filesCount: number }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in.');

    const { data, error } = await supabase
      .from('files')
      .select('file_size')
      .eq('user_id', user.id);

    if (error) {
      throw new Error(error.message || 'Failed to calculate storage.');
    }

    const filesCount = data?.length || 0;
    const totalSize = (data || []).reduce((acc, curr) => acc + Number(curr.file_size || 0), 0);

    return { totalSize, filesCount };
  },
};


export default fileService;
