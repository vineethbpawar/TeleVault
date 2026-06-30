import * as SecureStore from 'expo-secure-store';

const APP_PIN_KEY = 'app_pin';
const LOCK_DRIVE_ENABLED_KEY = 'lock_drive_enabled';
const LOCK_PRIVATE_DRIVE_ENABLED_KEY = 'lock_private_drive_enabled';

export const securityService = {
  async createPin(pin: string): Promise<void> {
    await SecureStore.setItemAsync(APP_PIN_KEY, pin);
  },

  async verifyPin(pin: string): Promise<boolean> {
    const savedPin = await SecureStore.getItemAsync(APP_PIN_KEY);
    return savedPin === pin;
  },

  async changePin(oldPin: string, newPin: string): Promise<boolean> {
    const isCorrect = await this.verifyPin(oldPin);
    if (isCorrect) {
      await SecureStore.setItemAsync(APP_PIN_KEY, newPin);
      return true;
    }
    return false;
  },

  async disablePin(): Promise<void> {
    await SecureStore.deleteItemAsync(APP_PIN_KEY);
    await SecureStore.setItemAsync(LOCK_DRIVE_ENABLED_KEY, 'false');
    await SecureStore.setItemAsync(LOCK_PRIVATE_DRIVE_ENABLED_KEY, 'false');
  },

  async isDriveLockEnabled(): Promise<boolean> {
    const enabled = await SecureStore.getItemAsync(LOCK_DRIVE_ENABLED_KEY);
    return enabled === 'true';
  },

  async setDriveLockEnabled(enabled: boolean): Promise<void> {
    await SecureStore.setItemAsync(LOCK_DRIVE_ENABLED_KEY, enabled ? 'true' : 'false');
  },

  async isPrivateDriveLockEnabled(): Promise<boolean> {
    const enabled = await SecureStore.getItemAsync(LOCK_PRIVATE_DRIVE_ENABLED_KEY);
    return enabled === 'true';
  },

  async setPrivateDriveLockEnabled(enabled: boolean): Promise<void> {
    await SecureStore.setItemAsync(LOCK_PRIVATE_DRIVE_ENABLED_KEY, enabled ? 'true' : 'false');
  },

  async hasPin(): Promise<boolean> {
    const pin = await SecureStore.getItemAsync(APP_PIN_KEY);
    return pin !== null && pin !== '';
  }
};
export default securityService;
