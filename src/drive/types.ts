import { TeleVaultFile, TeleVaultFolder } from '../types/file';

export type DriveFile = TeleVaultFile;
export type DriveFolder = TeleVaultFolder;

export type SortField = 'name' | 'date' | 'size';
export type SortOrder = 'asc' | 'desc';

export interface Breadcrumb {
  id: string | null;
  name: string;
}

export interface DriveContainerProps {
  navigation: any;
  isFocused: boolean;
  isPrivateMode: boolean;
}
