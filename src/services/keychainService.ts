import * as Keychain from 'react-native-keychain';
import { KEYCHAIN_SERVICE } from '../types';

export interface KeychainResult {
  success: boolean;
  error?: string;
}

export interface KeychainGetResult extends KeychainResult {
  value?: string;
}

/**
 * Store the secret key in the device keychain with biometric protection
 */
export const storeSecretKey = async (
  secretKey: string,
): Promise<KeychainResult> => {
  try {
    // Check if biometrics are available
    const biometryType = await Keychain.getSupportedBiometryType();

    // If biometrics available, use them for protection
    if (biometryType) {
      await Keychain.setGenericPassword(
        'privatepad_encryption_key',
        secretKey,
        {
          service: KEYCHAIN_SERVICE.SECRET_KEY,
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
        },
      );
    } else {
      // Fall back to device passcode
      await Keychain.setGenericPassword(
        'privatepad_encryption_key',
        secretKey,
        {
          service: KEYCHAIN_SERVICE.SECRET_KEY,
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          accessControl: Keychain.ACCESS_CONTROL.DEVICE_PASSCODE,
        },
      );
    }

    return { success: true };
  } catch (error) {
    console.error('Error storing secret key:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Retrieve the secret key from keychain (will prompt for biometrics if enabled)
 */
export const getSecretKey = async (): Promise<KeychainGetResult> => {
  try {
    const credentials = await Keychain.getGenericPassword({
      service: KEYCHAIN_SERVICE.SECRET_KEY,
      authenticationPrompt: {
        title: 'Authenticate to access PrivatePad',
        subtitle: 'Use biometrics or passcode to unlock your notes',
        cancel: 'Cancel',
      },
    });

    if (credentials) {
      return { success: true, value: credentials.password };
    }

    return { success: false, error: 'No credentials found' };
  } catch (error) {
    console.error('Error retrieving secret key:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Check if a secret key exists in keychain
 */
export const hasSecretKey = async (): Promise<boolean> => {
  try {
    // Try to check if credentials exist without triggering biometrics
    const credentials = await Keychain.getGenericPassword({
      service: KEYCHAIN_SERVICE.SECRET_KEY,
    });
    return !!credentials;
  } catch {
    return false;
  }
};

/**
 * Delete the secret key from keychain
 */
export const deleteSecretKey = async (): Promise<KeychainResult> => {
  try {
    await Keychain.resetGenericPassword({
      service: KEYCHAIN_SERVICE.SECRET_KEY,
    });
    return { success: true };
  } catch (error) {
    console.error('Error deleting secret key:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Check if biometrics are available on the device
 */
export const getBiometryType = async (): Promise<Keychain.BIOMETRY_TYPE | null> => {
  try {
    return await Keychain.getSupportedBiometryType();
  } catch {
    return null;
  }
};
