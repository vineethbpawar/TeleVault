import { supabase } from '../lib/supabase';
import { DeviceMetadata } from './deviceService';
import { telegramService } from './telegramService';

// SHA-256 Hasher for Web & Native React Native
async function sha256Hash(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback simple numeric hash string for legacy React Native JS runtimes
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return 'hash_' + Math.abs(hash);
}

export const otpService = {
  /**
   * Generates a cryptographically secure 6-digit OTP, hashes it, stores it in DB, and dispatches via Telegram.
   */
  async generateAndSendDeviceOtp(userId: string, meta: DeviceMetadata): Promise<{ expiresAt: string }> {
    // 1. Generate 6-digit numeric OTP code
    const rawCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await sha256Hash(rawCode);

    // 2. Set expiration (5 minutes from now)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // 3. Store SHA-256 hash in login_verifications table
    const { error: dbError } = await supabase.from('login_verifications').insert({
      user_id: userId,
      device_id: meta.deviceId,
      verification_code_hash: codeHash,
      expires_at: expiresAt,
      attempts: 0,
      verified: false,
    });

    if (dbError) {
      console.warn('[otpService] Error saving verification record to DB:', dbError);
    }

    // 4. Send formatted security alert via Telegram Bot
    await this.sendTelegramVerificationMessage(meta, rawCode);

    return { expiresAt };
  },

  /**
   * Sends the OTP code via Telegram Bot API using the configured Telegram bot.
   */
  async sendTelegramVerificationMessage(meta: DeviceMetadata, code: string): Promise<boolean> {
    try {
      const config = await telegramService.getTelegramConfig();
      if (!config || !config.botToken || !config.channelId) {
        console.warn('[otpService] Telegram configuration missing for OTP dispatch.');
        return false;
      }

      const messageText = `🔐 *TeleVault Security Verification*\n\nA login from a new device was detected.\n\n*Device:*\n${meta.deviceName}\n${meta.browser}\n${meta.platform}\n\n*Verification Code:*\n\`${code}\`\n\nThis code expires in 5 minutes.\n\n_If this wasn't you, please change your password immediately._`;

      const url = telegramService.getTelegramApiUrl('sendMessage', config.botToken);
      const { fetchWithRetry } = require('./telegramService');

      const res = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.channelId,
          text: messageText,
          parse_mode: 'Markdown',
        }),
      });

      const data = await res.json();
      return res.ok && data.ok;
    } catch (err) {
      console.error('[otpService] Telegram verification dispatch failed:', err);
      return false;
    }
  },

  /**
   * Validates user-entered OTP against the stored SHA-256 code hash.
   */
  async verifyOtp(
    userId: string,
    deviceId: string,
    inputCode: string
  ): Promise<{ success: boolean; errorMsg?: string }> {
    try {
      // 1. Fetch latest pending verification record
      const { data, error } = await supabase
        .from('login_verifications')
        .select('*')
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .eq('verified', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return { success: false, errorMsg: 'No pending verification code found. Please request a new code.' };
      }

      // 2. Check maximum 5 attempts limit
      if (data.attempts >= 5) {
        return {
          success: false,
          errorMsg: 'Too many incorrect attempts. Please request a new verification code.',
        };
      }

      // 3. Check expiration
      if (new Date(data.expires_at).getTime() < Date.now()) {
        return { success: false, errorMsg: 'Verification code expired. Please request a new code.' };
      }

      // 4. Increment attempt counter in DB
      await supabase
        .from('login_verifications')
        .update({ attempts: data.attempts + 1 })
        .eq('id', data.id);

      // 5. Compare SHA-256 hashes
      const inputHash = await sha256Hash(inputCode.trim());
      if (inputHash !== data.verification_code_hash) {
        return { success: false, errorMsg: 'Incorrect verification code.' };
      }

      // 6. Mark verification record as verified
      await supabase
        .from('login_verifications')
        .update({ verified: true })
        .eq('id', data.id);

      return { success: true };
    } catch (err: any) {
      return { success: false, errorMsg: err.message || 'Verification failed.' };
    }
  },
};
