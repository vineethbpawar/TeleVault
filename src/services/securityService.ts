import { storageService } from './storageService';

const APP_PIN_KEY = 'app_pin';
const APP_LOCK_ENABLED_KEY = 'app_lock_enabled';
const LOCK_DRIVE_ENABLED_KEY = 'lock_drive_enabled';
const LOCK_PRIVATE_DRIVE_ENABLED_KEY = 'lock_private_drive_enabled';
const BIOMETRICS_ENABLED_KEY = 'biometrics_enabled';
const CHAT_LOCK_ENABLED_KEY = 'chat_lock_enabled'; // Placeholder

let tempIgnoreLock = false;

export const securityService = {
  setTemporaryIgnoreLock(ignore: boolean): void {
    tempIgnoreLock = ignore;
  },

  shouldIgnoreLock(): boolean {
    const val = tempIgnoreLock;
    tempIgnoreLock = false; // Reset on check
    return val;
  },

  async createPin(pin: string): Promise<void> {
    await storageService.setItem(APP_PIN_KEY, pin);
    await storageService.setItem(APP_LOCK_ENABLED_KEY, 'true'); // Default to true when newly created
  },

  async verifyPin(pin: string): Promise<boolean> {
    const savedPin = await storageService.getItem(APP_PIN_KEY);
    return savedPin === pin;
  },

  async changePin(oldPin: string, newPin: string): Promise<boolean> {
    const isCorrect = await this.verifyPin(oldPin);
    if (isCorrect) {
      await storageService.setItem(APP_PIN_KEY, newPin);
      return true;
    }
    return false;
  },

  async disablePin(): Promise<void> {
    await storageService.removeItem(APP_PIN_KEY);
    await storageService.setItem(APP_LOCK_ENABLED_KEY, 'false');
    await storageService.setItem(LOCK_DRIVE_ENABLED_KEY, 'false');
    await storageService.setItem(LOCK_PRIVATE_DRIVE_ENABLED_KEY, 'false');
    await storageService.setItem(BIOMETRICS_ENABLED_KEY, 'false');
    await storageService.setItem(CHAT_LOCK_ENABLED_KEY, 'false');
  },

  async isAppLockEnabled(): Promise<boolean> {
    const enabled = await storageService.getItem(APP_LOCK_ENABLED_KEY);
    return enabled === 'true';
  },

  async setAppLockEnabled(enabled: boolean): Promise<void> {
    await storageService.setItem(APP_LOCK_ENABLED_KEY, enabled ? 'true' : 'false');
  },

  async isDriveLockEnabled(): Promise<boolean> {
    const enabled = await storageService.getItem(LOCK_DRIVE_ENABLED_KEY);
    return enabled === 'true';
  },

  async setDriveLockEnabled(enabled: boolean): Promise<void> {
    await storageService.setItem(LOCK_DRIVE_ENABLED_KEY, enabled ? 'true' : 'false');
  },

  async isPrivateDriveLockEnabled(): Promise<boolean> {
    const enabled = await storageService.getItem(LOCK_PRIVATE_DRIVE_ENABLED_KEY);
    return enabled === 'true';
  },

  async setPrivateDriveLockEnabled(enabled: boolean): Promise<void> {
    await storageService.setItem(LOCK_PRIVATE_DRIVE_ENABLED_KEY, enabled ? 'true' : 'false');
  },

  async isBiometricsEnabled(): Promise<boolean> {
    const enabled = await storageService.getItem(BIOMETRICS_ENABLED_KEY);
    return enabled === 'true';
  },

  async setBiometricsEnabled(enabled: boolean): Promise<void> {
    await storageService.setItem(BIOMETRICS_ENABLED_KEY, enabled ? 'true' : 'false');
  },

  async isChatLockEnabled(): Promise<boolean> {
    const enabled = await storageService.getItem(CHAT_LOCK_ENABLED_KEY);
    return enabled === 'true';
  },

  async setChatLockEnabled(enabled: boolean): Promise<void> {
    await storageService.setItem(CHAT_LOCK_ENABLED_KEY, enabled ? 'true' : 'false');
  },

  async hasPin(): Promise<boolean> {
    const pin = await storageService.getItem(APP_PIN_KEY);
    return pin !== null && pin !== '';
  }
};

export default securityService;
