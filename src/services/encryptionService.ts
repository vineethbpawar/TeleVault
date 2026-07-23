import { AES, PBKDF2, WordArray, CBC, Pkcs7, Utf8 } from 'crypto-es';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { storageService } from './storageService';

const KEY_SALT = 'televault_e2ee_salt_v1';
const PBKDF2_ITERATIONS = 1000;
const KEY_SIZE_WORDS = 256 / 32; // 256 bits key

let derivedKeyCache: WordArray | null = null;

export const encryptionService = {
  // Derive AES encryption key from the secure app PIN or Zero-Knowledge Vault password
  async getEncryptionKey(isPrivate = false): Promise<WordArray | null> {
    if (isPrivate) {
      const { securityService } = require('./securityService');
      const vaultPass = securityService.getVaultPasswordInMemory();
      if (vaultPass) {
        return this.deriveKeyFromPassword(vaultPass);
      }
    }

    if (derivedKeyCache) {
      return derivedKeyCache;
    }

    const pin = await storageService.getItem('app_pin');
    if (!pin) {
      console.warn('[E2EE] No app PIN set. Encryption/decryption is unavailable.');
      return null;
    }

    try {
      // Derive key from PIN using PBKDF2
      const derived = PBKDF2(pin, KEY_SALT, {
        keySize: KEY_SIZE_WORDS,
        iterations: PBKDF2_ITERATIONS,
      });
      derivedKeyCache = derived;
      return derived;
    } catch (err) {
      console.error('[E2EE] Key derivation failed:', err);
      return null;
    }
  },

  async deriveKeyFromPassword(password: string): Promise<WordArray | null> {
    try {
      return PBKDF2(password, KEY_SALT, {
        keySize: KEY_SIZE_WORDS,
        iterations: PBKDF2_ITERATIONS,
      });
    } catch (err) {
      console.error('[E2EE] deriveKeyFromPassword failed:', err);
      return null;
    }
  },

  // Clear cached key when logging out or locking
  clearCachedKey(): void {
    derivedKeyCache = null;
  },

  // Encrypt file
  async encryptFile(localUri: string, fileName: string, isPrivate = false): Promise<{ uri: string; size: number }> {
    const key = await this.getEncryptionKey(isPrivate);
    if (!key) {
      throw new Error('E2EE requires a secure PIN or Vault Password to be set up. Go to Settings.');
    }

    if (Platform.OS === 'web') {
      try {
        let blob: Blob;
        if (localUri.startsWith('data:')) {
          const arr = localUri.split(',');
          const mime = arr[0].match(/:(.*?);/)![1];
          const bstr = atob(arr[1]);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          blob = new Blob([u8arr], { type: mime });
        } else {
          const res = await fetch(localUri);
          blob = await res.blob();
        }

        // Read blob as binary string or array buffer
        const arrayBuffer = await blob.arrayBuffer();
        const wordArr = WordArray.create(arrayBuffer as any);
        const encrypted = AES.encrypt(wordArr, key, {
          mode: CBC,
          padding: Pkcs7,
        });

        const encryptedStr = encrypted.toString();
        const encryptedBlob = new Blob([encryptedStr as any], { type: 'application/octet-stream' });
        const encryptedUri = URL.createObjectURL(encryptedBlob);

        return {
          uri: encryptedUri,
          size: encryptedBlob.size,
        };
      } catch (err) {
        console.error('[E2EE] Web file encryption failed:', err);
        throw err;
      }
    } else {
      try {
        // Read file as base64 on Native
        const base64Data = await FileSystem.readAsStringAsync(localUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // Encrypt the base64 string
        const encrypted = AES.encrypt(base64Data, key, {
          mode: CBC,
          padding: Pkcs7,
        });

        const encryptedStr = encrypted.toString();
        
        // Write to temp file on Native
        const tempPath = `${FileSystem.cacheDirectory}enc_${Date.now()}_${fileName}`;
        await FileSystem.writeAsStringAsync(tempPath, encryptedStr, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        const fileInfo = await FileSystem.getInfoAsync(tempPath);
        return {
          uri: tempPath,
          size: fileInfo.exists ? fileInfo.size : encryptedStr.length,
        };
      } catch (err) {
        console.error('[E2EE] Native file encryption failed:', err);
        throw err;
      }
    }
  },

  // Decrypt file
  async decryptFile(localUri: string, fileName: string, mimeType?: string | null, isPrivate = false): Promise<string> {
    const key = await this.getEncryptionKey(isPrivate);
    if (!key) {
      throw new Error('E2EE secure key unavailable. Ensure PIN or Vault Password is configured.');
    }

    if (Platform.OS === 'web') {
      try {
        const { fetchWithRetry } = require('./telegramService');
        const res = await fetchWithRetry(localUri);
        const encryptedStr = await res.text();

        const decrypted = AES.decrypt(encryptedStr, key, {
          mode: CBC,
          padding: Pkcs7,
        });

        // Convert decrypted WordArray back to Uint8Array/Blob
        const typedArray = wordArrToUint8Array(decrypted);
        const decryptedBlob = new Blob([typedArray as any], { type: mimeType || 'application/octet-stream' });
        return URL.createObjectURL(decryptedBlob);
      } catch (err) {
        console.error('[E2EE] Web file decryption failed:', err);
        throw err;
      }
    } else {
      try {
        const encryptedStr = await FileSystem.readAsStringAsync(localUri, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        const decrypted = AES.decrypt(encryptedStr, key, {
          mode: CBC,
          padding: Pkcs7,
        });

        // Decrypted content is the original base64 string
        const originalBase64 = decrypted.toString(Utf8);
        if (!originalBase64) {
          throw new Error('Decrypted content is empty or invalid key.');
        }

        // Write decrypted data back as binary file
        const tempPath = `${FileSystem.cacheDirectory}dec_${Date.now()}_${fileName}`;
        await FileSystem.writeAsStringAsync(tempPath, originalBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        return tempPath;
      } catch (err) {
        console.error('[E2EE] Native file decryption failed:', err);
        throw err;
      }
    }
  },
};

// Helper function to convert CryptoJS WordArray to Uint8Array
function wordArrToUint8Array(wordArray: WordArray): Uint8Array {
  const words = wordArray.words;
  const sigBytes = wordArray.sigBytes;
  const u8 = new Uint8Array(sigBytes);
  let dst = 0;
  for (let i = 0; i < sigBytes; i++) {
    const w = words[i >>> 2];
    const b = (w >>> (24 - (i % 4) * 8)) & 0xff;
    u8[dst++] = b;
  }
  return u8;
}

export default encryptionService;
