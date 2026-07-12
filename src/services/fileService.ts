import { supabase } from '../lib/supabase';
import { TeleVaultFile, TeleVaultFolder } from '../types/file';
import { storageService } from './storageService';
import { telegramService } from './telegramService';

export const fileService = {
  async saveFileMetadata(metadata: {
    folder_id: string | null;
    file_name: string;
    file_type: 'image' | 'video' | 'document';
    mime_type: string | null;
    file_size: number | null;
    is_private: boolean;
    is_drive_file: boolean;
    telegram_message_id?: string | null;
    telegram_file_id?: string | null;
    telegram_file_unique_id?: string | null;
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
    console.log("FETCHMEMORIES: fetchMemories starting");
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) throw new Error('Not logged in.');

    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_drive_file', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("FETCHMEMORIES error:", error);
      throw new Error(error.message);
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

  async fetchAllDriveFolders(isPrivate: boolean): Promise<TeleVaultFolder[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in.');

    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_private', isPrivate)
      .order('name', { ascending: true });

    if (error) {
      throw new Error(error.message || 'Failed to fetch all drive folders.');
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

  async updateFileMetadata(id: string, updates: Partial<TeleVaultFile>): Promise<TeleVaultFile> {
    const { data, error } = await supabase
      .from('files')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message || 'Failed to update file metadata.');
    }
    return data as TeleVaultFile;
  },

  async updateOverlayMetadata(id: string, keyValues: Record<string, any>): Promise<TeleVaultFile> {
    const { data: currentFile, error: fetchError } = await supabase
      .from('files')
      .select('overlay_metadata')
      .eq('id', id)
      .single();

    if (fetchError || !currentFile) {
      throw new Error('File not found to update overlay metadata.');
    }

    const currentMeta = (currentFile.overlay_metadata && typeof currentFile.overlay_metadata === 'object' && !Array.isArray(currentFile.overlay_metadata))
      ? currentFile.overlay_metadata
      : {};

    const updatedMeta = {
      ...currentMeta,
      ...keyValues,
    };

    return await this.updateFileMetadata(id, { overlay_metadata: updatedMeta });
  },

  async archiveFile(id: string, archive: boolean): Promise<TeleVaultFile> {
    return await this.updateOverlayMetadata(id, { is_archived: archive });
  },

  async hideFile(id: string, hide: boolean): Promise<TeleVaultFile> {
    return await this.updateOverlayMetadata(id, { is_hidden: hide });
  },

  async softDeleteFile(id: string): Promise<TeleVaultFile> {
    return await this.updateOverlayMetadata(id, { deleted_at: new Date().toISOString() });
  },

  async restoreFile(id: string): Promise<TeleVaultFile> {
    return await this.updateOverlayMetadata(id, { deleted_at: null });
  },

  async addFileToAlbum(id: string, albumName: string): Promise<TeleVaultFile> {
    const { data: file, error: fetchError } = await supabase
      .from('files')
      .select('overlay_metadata')
      .eq('id', id)
      .single();

    if (fetchError || !file) {
      throw new Error('File not found.');
    }

    const meta = file.overlay_metadata || {};
    let albums: string[] = Array.isArray(meta.albums) ? [...meta.albums] : [];
    if (!albums.includes(albumName)) {
      albums.push(albumName);
    }

    return await this.updateOverlayMetadata(id, { albums });
  },

  async removeFileFromAlbum(id: string, albumName: string): Promise<TeleVaultFile> {
    const { data: file, error: fetchError } = await supabase
      .from('files')
      .select('overlay_metadata')
      .eq('id', id)
      .single();

    if (fetchError || !file) {
      throw new Error('File not found.');
    }

    const meta = file.overlay_metadata || {};
    let albums: string[] = Array.isArray(meta.albums) ? meta.albums.filter((a: string) => a !== albumName) : [];

    return await this.updateOverlayMetadata(id, { albums });
  },

  async addTagsToFile(id: string, tagsList: string[]): Promise<TeleVaultFile> {
    const { data: file, error: fetchError } = await supabase
      .from('files')
      .select('overlay_metadata')
      .eq('id', id)
      .single();

    if (fetchError || !file) {
      throw new Error('File not found.');
    }

    const meta = file.overlay_metadata || {};
    let tags: string[] = Array.isArray(meta.tags) ? [...meta.tags] : [];
    tagsList.forEach(t => {
      const clean = t.trim();
      if (clean && !tags.includes(clean)) {
        tags.push(clean);
      }
    });

    return await this.updateOverlayMetadata(id, { tags });
  },

  async removeTagFromFile(id: string, tag: string): Promise<TeleVaultFile> {
    const { data: file, error: fetchError } = await supabase
      .from('files')
      .select('overlay_metadata')
      .eq('id', id)
      .single();

    if (fetchError || !file) {
      throw new Error('File not found.');
    }

    const meta = file.overlay_metadata || {};
    let tags: string[] = Array.isArray(meta.tags) ? meta.tags.filter((t: string) => t !== tag) : [];

    return await this.updateOverlayMetadata(id, { tags });
  },

  async duplicateFile(fileId: string): Promise<TeleVaultFile> {
    const { data: file, error: fetchError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fetchError || !file) {
      throw new Error('File not found to duplicate.');
    }

    const { data, error } = await supabase
      .from('files')
      .insert({
        user_id: file.user_id,
        folder_id: file.folder_id,
        file_name: `Copy of ${file.file_name}`,
        file_type: file.file_type,
        mime_type: file.mime_type,
        file_size: file.file_size,
        is_private: file.is_private,
        is_drive_file: file.is_drive_file,
        telegram_message_id: file.telegram_message_id,
        telegram_file_id: file.telegram_file_id,
        telegram_file_unique_id: file.telegram_file_unique_id,
        local_thumbnail_uri: file.local_thumbnail_uri,
        caption: file.caption,
        overlay_metadata: file.overlay_metadata,
        is_favorite: file.is_favorite,
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message || 'Failed to duplicate file.');
    }

    return data as TeleVaultFile;
  },

  async bulkUpdateOverlayMetadata(ids: string[], keyValues: Record<string, any>): Promise<void> {
    if (!ids || ids.length === 0) return;
    
    // 1. Fetch current overlay_metadata for all IDs in one select query
    const { data: currentFiles, error: fetchError } = await supabase
      .from('files')
      .select('id, overlay_metadata')
      .in('id', ids);

    if (fetchError || !currentFiles) {
      throw new Error(fetchError?.message || 'Failed to fetch files for bulk update.');
    }

    // 2. Perform updates sequentially to avoid database lock contention and rate limits
    for (const file of currentFiles) {
      const currentMeta = (file.overlay_metadata && typeof file.overlay_metadata === 'object' && !Array.isArray(file.overlay_metadata))
        ? file.overlay_metadata
        : {};
      const updatedMeta = {
        ...currentMeta,
        ...keyValues,
      };

      try {
        const { error } = await supabase
          .from('files')
          .update({ overlay_metadata: updatedMeta })
          .eq('id', file.id);
        if (error) throw error;
      } catch (err) {
        console.error(`Failed to update metadata for file ${file.id}:`, err);
      }
    }
  },

  async bulkArchive(ids: string[], archive: boolean): Promise<void> {
    await this.bulkUpdateOverlayMetadata(ids, { is_archived: archive });
  },

  async bulkHide(ids: string[], hide: boolean): Promise<void> {
    const { error } = await supabase
      .from('files')
      .update({ is_private: hide })
      .in('id', ids);

    if (error) {
      throw new Error(error.message || 'Failed to update private status.');
    }
  },

  async bulkDelete(ids: string[], hardDelete: boolean = true): Promise<void> {
    try {
      // 1. Fetch file info to retrieve telegram_message_ids
      const { data: files, error: fetchErr } = await supabase
        .from('files')
        .select('id, telegram_message_id')
        .in('id', ids);

      if (!fetchErr && files) {
        for (const file of files) {
          if (file.telegram_message_id) {
            telegramService.deleteTelegramMessage(Number(file.telegram_message_id)).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.warn('Failed to delete Telegram media during bulkDelete:', e);
    }

    // 2. Delete permanently from Supabase database
    const { error } = await supabase
      .from('files')
      .delete()
      .in('id', ids);

    if (error) {
      throw new Error(error.message || 'Failed to delete files from database.');
    }
  },

  async bulkRestore(ids: string[]): Promise<void> {
    await this.bulkUpdateOverlayMetadata(ids, { deleted_at: null });
  },

  async bulkMove(ids: string[], targetFolderId: string | null): Promise<void> {
    const { error } = await supabase
      .from('files')
      .update({ folder_id: targetFolderId })
      .in('id', ids);

    if (error) {
      throw new Error(error.message || 'Failed to move files in bulk.');
    }
  },
};

export default fileService;
