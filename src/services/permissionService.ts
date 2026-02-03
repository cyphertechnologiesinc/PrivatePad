import { Platform, Alert, Linking } from 'react-native';
import {
  check,
  request,
  PERMISSIONS,
  RESULTS,
  Permission,
  PermissionStatus,
} from 'react-native-permissions';

export type PermissionType = 'camera' | 'photoLibrary' | 'microphone';

interface PermissionResult {
  granted: boolean;
  status: PermissionStatus;
}

/**
 * Get the platform-specific permission constant
 */
const getPermission = (type: PermissionType): Permission | null => {
  switch (type) {
    case 'camera':
      return Platform.select({
        ios: PERMISSIONS.IOS.CAMERA,
        android: PERMISSIONS.ANDROID.CAMERA,
      }) || null;
    case 'photoLibrary':
      return Platform.select({
        ios: PERMISSIONS.IOS.PHOTO_LIBRARY,
        android: 
          // Android 13+ uses READ_MEDIA_IMAGES, older versions use READ_EXTERNAL_STORAGE
          Platform.Version >= 33
            ? PERMISSIONS.ANDROID.READ_MEDIA_IMAGES
            : PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE,
      }) || null;
    case 'microphone':
      return Platform.select({
        ios: PERMISSIONS.IOS.MICROPHONE,
        android: PERMISSIONS.ANDROID.RECORD_AUDIO,
      }) || null;
    default:
      return null;
  }
};

/**
 * Get user-friendly permission name for alerts
 */
const getPermissionName = (type: PermissionType): string => {
  switch (type) {
    case 'camera':
      return 'Camera';
    case 'photoLibrary':
      return 'Photo Library';
    case 'microphone':
      return 'Microphone';
    default:
      return 'Permission';
  }
};

/**
 * Check if a permission is granted
 */
export const checkPermission = async (type: PermissionType): Promise<PermissionResult> => {
  const permission = getPermission(type);
  
  if (!permission) {
    return { granted: false, status: RESULTS.UNAVAILABLE };
  }

  const status = await check(permission);
  return {
    granted: status === RESULTS.GRANTED || status === RESULTS.LIMITED,
    status,
  };
};

/**
 * Request a permission from the user
 */
export const requestPermission = async (type: PermissionType): Promise<PermissionResult> => {
  const permission = getPermission(type);
  
  if (!permission) {
    return { granted: false, status: RESULTS.UNAVAILABLE };
  }

  const status = await request(permission);
  return {
    granted: status === RESULTS.GRANTED || status === RESULTS.LIMITED,
    status,
  };
};

/**
 * Show an alert when permission is denied, with option to open settings
 */
const showPermissionDeniedAlert = (type: PermissionType): void => {
  const permissionName = getPermissionName(type);
  
  Alert.alert(
    `${permissionName} Access Required`,
    `PrivatePad needs ${permissionName.toLowerCase()} access to use this feature. Please enable it in your device settings.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Open Settings',
        onPress: () => Linking.openSettings(),
      },
    ],
  );
};

/**
 * Show an alert when permission is blocked (user needs to go to settings)
 */
const showPermissionBlockedAlert = (type: PermissionType): void => {
  const permissionName = getPermissionName(type);
  
  Alert.alert(
    `${permissionName} Access Blocked`,
    `${permissionName} access has been blocked. To use this feature, please enable it in Settings.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Open Settings',
        onPress: () => Linking.openSettings(),
      },
    ],
  );
};

/**
 * Check and request a permission if needed.
 * Returns true if permission is granted, false otherwise.
 * Shows appropriate alerts when permission is denied or blocked.
 */
export const ensurePermission = async (type: PermissionType): Promise<boolean> => {
  // First check current status
  const { granted, status } = await checkPermission(type);
  
  if (granted) {
    return true;
  }

  // If denied (not permanently), request it
  if (status === RESULTS.DENIED) {
    const requestResult = await requestPermission(type);
    
    if (requestResult.granted) {
      return true;
    }
    
    // If still denied after request, show alert
    if (requestResult.status === RESULTS.BLOCKED) {
      showPermissionBlockedAlert(type);
    } else {
      showPermissionDeniedAlert(type);
    }
    return false;
  }

  // If blocked (permanently denied), show settings alert
  if (status === RESULTS.BLOCKED) {
    showPermissionBlockedAlert(type);
    return false;
  }

  // If unavailable, show message
  if (status === RESULTS.UNAVAILABLE) {
    const permissionName = getPermissionName(type);
    Alert.alert(
      'Feature Unavailable',
      `${permissionName} is not available on this device.`,
    );
    return false;
  }

  return false;
};

/**
 * Check and request camera permission
 */
export const ensureCameraPermission = async (): Promise<boolean> => {
  return ensurePermission('camera');
};

/**
 * Check and request photo library permission
 */
export const ensurePhotoLibraryPermission = async (): Promise<boolean> => {
  return ensurePermission('photoLibrary');
};

/**
 * Check and request microphone permission
 */
export const ensureMicrophonePermission = async (): Promise<boolean> => {
  return ensurePermission('microphone');
};

/**
 * Check and request multiple permissions at once
 * Returns true only if all permissions are granted
 */
export const ensurePermissions = async (types: PermissionType[]): Promise<boolean> => {
  for (const type of types) {
    const granted = await ensurePermission(type);
    if (!granted) {
      return false;
    }
  }
  return true;
};

