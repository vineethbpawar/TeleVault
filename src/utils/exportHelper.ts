import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';

export const exportHelper = {
  /**
   * Export all chat messages as a formatted TXT file.
   */
  async exportChatsAsTXT(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in.');

      // Fetch conversations
      const { data: convs, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`);

      if (convError || !convs) throw new Error('Failed to retrieve chat logs.');

      let txtContent = `TeleVault Chat Logs Export - ${new Date().toLocaleDateString()}\n`;
      txtContent += `========================================================\n\n`;

      for (const conv of convs) {
        const otherId = conv.participant_a === user.id ? conv.participant_b : conv.participant_a;
        const { data: profile } = await supabase.from('profiles').select('username, full_name').eq('id', otherId).single();
        const otherName = profile ? `${profile.full_name || 'No Name'} (@${profile.username})` : `User ${otherId}`;

        txtContent += `Chat with: ${otherName}\n`;
        txtContent += `--------------------------------------------------------\n`;

        const { data: messages } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: true });

        if (messages && messages.length > 0) {
          for (const msg of messages) {
            const timeStr = new Date(msg.created_at).toLocaleString();
            const sender = msg.sender_id === user.id ? 'Me' : `@${profile?.username || 'other'}`;
            txtContent += `[${timeStr}] ${sender}: ${msg.message_type === 'snap' ? '[Photo/Video Snap]' : msg.message_text}\n`;
          }
        } else {
          txtContent += 'No messages recorded in this chat.\n';
        }
        txtContent += `\n========================================================\n\n`;
      }

      const fileUri = `${FileSystem.documentDirectory}televault_chats_backup.txt`;
      await FileSystem.writeAsStringAsync(fileUri, txtContent, { encoding: FileSystem.EncodingType.UTF8 });
      await this.shareFile(fileUri, 'Export Chats TXT');
    } catch (error: any) {
      Alert.alert('Export Failed', error.message || 'An error occurred during chat export.');
    }
  },

  /**
   * Export all chat messages as JSON.
   */
  async exportChatsAsJSON(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in.');

      const { data: messages, error } = await supabase
        .from('chat_messages')
        .select('*')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const fileUri = `${FileSystem.documentDirectory}televault_chats_backup.json`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(messages, null, 2));
      await this.shareFile(fileUri, 'Export Chats JSON');
    } catch (error: any) {
      Alert.alert('Export Failed', error.message || 'An error occurred.');
    }
  },

  /**
   * Export all cloud drive files list metadata.
   */
  async exportFileListAsJSON(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in.');

      const { data: files, error } = await supabase
        .from('files')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_drive_file', true);

      if (error) throw error;

      // Filter out raw sensitive data (if any existed, but here we just export safe columns)
      const cleanFiles = (files || []).map(f => ({
        id: f.id,
        file_name: f.file_name,
        file_type: f.file_type,
        mime_type: f.mime_type,
        file_size: f.file_size,
        is_private: f.is_private,
        uploaded_at: f.uploaded_at,
        telegram_message_id: f.telegram_message_id,
        telegram_file_id: f.telegram_file_id,
      }));

      const fileUri = `${FileSystem.documentDirectory}televault_drive_files_list.json`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(cleanFiles, null, 2));
      await this.shareFile(fileUri, 'Export Drive Files');
    } catch (error: any) {
      Alert.alert('Export Failed', error.message || 'An error occurred.');
    }
  },

  /**
   * Export all memories metadata.
   */
  async exportMemoriesAsJSON(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in.');

      const { data: memories, error } = await supabase
        .from('files')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_drive_file', false);

      if (error) throw error;

      const cleanMemories = (memories || []).map(m => ({
        id: m.id,
        file_name: m.file_name,
        file_type: m.file_type,
        is_favorite: m.is_favorite,
        caption: m.caption,
        created_at: m.created_at,
        telegram_file_id: m.telegram_file_id,
      }));

      const fileUri = `${FileSystem.documentDirectory}televault_memories_list.json`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(cleanMemories, null, 2));
      await this.shareFile(fileUri, 'Export Memories List');
    } catch (error: any) {
      Alert.alert('Export Failed', error.message || 'An error occurred.');
    }
  },

  /**
   * Export basic account stats and profile info.
   */
  async exportAccountMetadata(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in.');

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      const metadata = {
        profile: {
          username: profile.username,
          full_name: profile.full_name,
          email: profile.email,
          created_at: profile.created_at,
        },
        export_time: new Date().toISOString(),
        system: 'TeleVault Expo React Native',
      };

      const fileUri = `${FileSystem.documentDirectory}televault_account_metadata.json`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(metadata, null, 2));
      await this.shareFile(fileUri, 'Export Account Metadata');
    } catch (error: any) {
      Alert.alert('Export Failed', error.message || 'An error occurred.');
    }
  },

  /**
   * Sharing helper using expo-sharing.
   */
  async shareFile(fileUri: string, dialogTitle: string): Promise<void> {
    const isSharingAvailable = await Sharing.isAvailableAsync();
    if (isSharingAvailable) {
      await Sharing.shareAsync(fileUri, { dialogTitle });
    } else {
      Alert.alert('Success', `Backup file created locally at:\n${fileUri}`);
    }
  }
};

export default exportHelper;
