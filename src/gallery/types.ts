import { TeleVaultFile } from '../types/file';

export type GalleryItem = TeleVaultFile;

export type FilterType = 'all' | 'image' | 'video' | 'favorites' | 'private';

export interface MemoryGridProps {
  items: GalleryItem[];
  onPressItem: (item: GalleryItem) => void;
  onLongPressItem: (item: GalleryItem) => void;
  selectedIds: Set<string>;
  isSelectionMode: boolean;
  onRefresh?: () => Promise<void>;
  refreshing?: boolean;
}
