import AsyncStorage from '@react-native-async-storage/async-storage';
import { TeleVaultFile } from '../types/file';

const RECENTLY_VIEWED_KEY = 'televault_recently_viewed_ids';
const MAX_RECENTLY_VIEWED = 30;

export interface SearchFilters {
  query?: string;
  fileType?: 'image' | 'video' | 'document' | 'all';
  isFavorite?: boolean;
  isArchived?: boolean;
  isHidden?: boolean;
  isDeleted?: boolean;
  tag?: string;
  album?: string;
  year?: number;
  month?: number; // 0-indexed: 0 = January
  minSizeBytes?: number;
  maxSizeBytes?: number;
  recentlyUploaded?: boolean;
  recentlyViewed?: boolean;
}

export const searchService = {
  /**
   * Performs an instant search/filtering on a list of file metadata.
   */
  filterFiles(files: TeleVaultFile[], filters: SearchFilters, recentlyViewedIds: string[] = []): TeleVaultFile[] {
    return files.filter((file) => {
      const meta = file.overlay_metadata || {};

      // 1. Filter out hidden/archived/deleted files unless explicitly requested
      const showHidden = filters.isHidden === true;
      const fileIsHidden = meta.is_hidden === true;
      if (fileIsHidden !== showHidden) return false;

      const showArchived = filters.isArchived === true;
      const fileIsArchived = meta.is_archived === true;
      if (fileIsArchived !== showArchived) return false;

      const showDeleted = filters.isDeleted === true;
      const fileIsDeleted = !!meta.deleted_at;
      if (fileIsDeleted !== showDeleted) return false;

      // 2. Query text matching (filename, caption, tags)
      if (filters.query) {
        const queryLower = filters.query.toLowerCase().trim();
        const nameMatches = file.file_name.toLowerCase().includes(queryLower);
        const captionMatches = file.caption ? file.caption.toLowerCase().includes(queryLower) : false;
        
        // Match tags inside overlay_metadata
        let tagMatches = false;
        if (Array.isArray(meta.tags)) {
          tagMatches = meta.tags.some((t: string) => t.toLowerCase().includes(queryLower));
        }

        if (!nameMatches && !captionMatches && !tagMatches) {
          return false;
        }
      }

      // 3. File type matching
      if (filters.fileType && filters.fileType !== 'all') {
        if (file.file_type !== filters.fileType) return false;
      }

      // 4. Favorites matching
      if (filters.isFavorite === true) {
        if (!file.is_favorite) return false;
      }

      // 5. Custom Tag matching
      if (filters.tag) {
        if (!Array.isArray(meta.tags) || !meta.tags.includes(filters.tag)) {
          return false;
        }
      }

      // 6. Album matching
      if (filters.album) {
        if (!Array.isArray(meta.albums) || !meta.albums.includes(filters.album)) {
          return false;
        }
      }

      // 7. Date components matching
      if (filters.year !== undefined || filters.month !== undefined) {
        const date = new Date(file.created_at);
        if (filters.year !== undefined && date.getFullYear() !== filters.year) return false;
        if (filters.month !== undefined && date.getMonth() !== filters.month) return false;
      }

      // 8. Size matching
      if (filters.minSizeBytes !== undefined && (file.file_size || 0) < filters.minSizeBytes) return false;
      if (filters.maxSizeBytes !== undefined && (file.file_size || 0) > filters.maxSizeBytes) return false;

      // 9. Recently Viewed matching
      if (filters.recentlyViewed === true) {
        if (!recentlyViewedIds.includes(file.id)) return false;
      }

      return true;
    }).sort((a, b) => {
      // Order recently viewed files by the order of their ID list
      if (filters.recentlyViewed === true) {
        return recentlyViewedIds.indexOf(a.id) - recentlyViewedIds.indexOf(b.id);
      }
      // Otherwise order by created_at descending (recently uploaded first)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  },

  /**
   * Tracks that a file was viewed.
   */
  async trackFileViewed(fileId: string): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
      let list: string[] = stored ? JSON.parse(stored) : [];

      // Remove duplicates
      list = list.filter(id => id !== fileId);
      
      // Prepend to top
      list.unshift(fileId);

      // Cap size
      if (list.length > MAX_RECENTLY_VIEWED) {
        list = list.slice(0, MAX_RECENTLY_VIEWED);
      }

      await AsyncStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(list));
    } catch (err) {
      console.warn('Failed to track viewed file:', err);
    }
  },

  /**
   * Retrieves the list of recently viewed file IDs.
   */
  async getRecentlyViewedIds(): Promise<string[]> {
    try {
      const stored = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (_) {
      return [];
    }
  },

  /**
   * Clears the recently viewed history.
   */
  async clearRecentlyViewed(): Promise<void> {
    await AsyncStorage.removeItem(RECENTLY_VIEWED_KEY);
  }
};

export default searchService;
