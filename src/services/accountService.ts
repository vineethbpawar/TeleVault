import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

// Key used by Supabase client to store the active session
// nhsrjmnckdwfdazrlopr is the reference id of this Supabase instance
const SUPABASE_SESSION_KEY = 'sb-nhsrjmnckdwfdazrlopr-auth-token';
const ACCOUNTS_LIST_KEY = 'televault_saved_accounts';

export interface SavedAccount {
  id: string;
  username: string;
  full_name?: string | null;
  avatar_url?: string | null;
}

class AccountService {
  /**
   * Get all currently logged-in accounts on this device.
   */
  async getAccounts(): Promise<SavedAccount[]> {
    try {
      const data = await AsyncStorage.getItem(ACCOUNTS_LIST_KEY);
      return data ? JSON.parse(data) : [];
    } catch (err) {
      console.error('[AccountService] Failed to load accounts:', err);
      return [];
    }
  }

  /**
   * Add or update an account in the saved accounts list.
   */
  async saveCurrentSession(profile: SavedAccount): Promise<void> {
    try {
      const accounts = await this.getAccounts();
      const idx = accounts.findIndex((a) => a.id === profile.id);
      
      if (idx >= 0) {
        accounts[idx] = profile;
      } else {
        accounts.push(profile);
      }
      
      await AsyncStorage.setItem(ACCOUNTS_LIST_KEY, JSON.stringify(accounts));

      // Also save the actual session token for this user
      const rawSession = await AsyncStorage.getItem(SUPABASE_SESSION_KEY);
      if (rawSession) {
        await AsyncStorage.setItem(`televault_session_user_${profile.id}`, rawSession);
      }
    } catch (err) {
      console.error('[AccountService] Failed to save current session:', err);
    }
  }

  /**
   * Switch the active account.
   */
  async switchAccount(targetUserId: string): Promise<boolean> {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      // 1. Cache the current session before swapping
      if (currentSession) {
        const rawSession = await AsyncStorage.getItem(SUPABASE_SESSION_KEY);
        if (rawSession) {
          await AsyncStorage.setItem(`televault_session_user_${currentSession.user.id}`, rawSession);
        }
      }

      // 2. Fetch the target user session
      const targetSessionRaw = await AsyncStorage.getItem(`televault_session_user_${targetUserId}`);
      if (!targetSessionRaw) {
        console.warn(`[AccountService] No session found for user ${targetUserId}`);
        return false;
      }

      const parsedSession = JSON.parse(targetSessionRaw);
      const { access_token, refresh_token } = parsedSession;

      if (!access_token || !refresh_token) {
        console.warn('[AccountService] Invalid session tokens');
        return false;
      }

      // 3. Update the primary Supabase storage key so it persists on restart
      await AsyncStorage.setItem(SUPABASE_SESSION_KEY, targetSessionRaw);

      // 4. Force the Supabase client to load the new session
      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      if (error) {
        console.error('[AccountService] Supabase setSession error:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('[AccountService] Failed to switch account:', err);
      return false;
    }
  }

  /**
   * Prepares to add a new account.
   * Caches current session and clears active session so the user can log in again.
   */
  async prepareAddAccount(): Promise<void> {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      // Cache current session
      if (currentSession) {
        const rawSession = await AsyncStorage.getItem(SUPABASE_SESSION_KEY);
        if (rawSession) {
          await AsyncStorage.setItem(`televault_session_user_${currentSession.user.id}`, rawSession);
        }
      }

      // Clear active session to force login screen
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[AccountService] Failed to prepare add account:', err);
    }
  }

  /**
   * Remove a saved account and sign out if active.
   */
  async removeAccount(userId: string): Promise<void> {
    try {
      // 1. Remove from accounts list
      let accounts = await this.getAccounts();
      accounts = accounts.filter((a) => a.id !== userId);
      await AsyncStorage.setItem(ACCOUNTS_LIST_KEY, JSON.stringify(accounts));

      // 2. Delete cached session token
      await AsyncStorage.removeItem(`televault_session_user_${userId}`);

      // 3. If it was the currently logged-in account, switch to another or log out
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession && currentSession.user.id === userId) {
        if (accounts.length > 0) {
          await this.switchAccount(accounts[0].id);
        } else {
          await supabase.auth.signOut();
        }
      }
    } catch (err) {
      console.error('[AccountService] Failed to remove account:', err);
    }
  }
}

export const accountService = new AccountService();
export default accountService;
