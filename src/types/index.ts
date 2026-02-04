// Note types
export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface EncryptedNote {
  id: string;
  encryptedData: string; // Base64 encoded encrypted data
  nonce: string; // Base64 encoded nonce
  createdAt: number;
  updatedAt: number;
}

// Media types
export type MediaType = 'photo' | 'video' | 'document';

export interface MediaItem {
  id: string;
  type: MediaType;
  filename: string;
  mimeType: string;
  fileSize: number;
  encryptedPath: string; // Path to encrypted file on disk
  thumbnailPath?: string; // Path to encrypted thumbnail (for photos/videos)
  createdAt: number;
  updatedAt: number;
}

export interface EncryptedMediaMetadata {
  id: string;
  type: MediaType;
  filename: string;
  mimeType: string;
  fileSize: number;
  encryptedPath: string;
  thumbnailPath?: string;
  nonce: string; // Nonce used for this file's encryption
  thumbnailNonce?: string; // Nonce for thumbnail encryption
  createdAt: number;
  updatedAt: number;
  // Password protection fields
  isPasswordProtected?: boolean;
  passwordSalt?: string; // Base64 encoded salt for key derivation
}

// User/Account types
export interface UserAccount {
  name: string;
  createdAt: number;
  publicKey: string; // Base64 encoded
}

// App state types
export type OnboardingStatus = 'not_started' | 'completed';

export interface AppState {
  isLoading: boolean;
  isAuthenticated: boolean;
  onboardingStatus: OnboardingStatus;
  user: UserAccount | null;
  notes: Note[];
  activeNoteId: string | null;
}

// Action types for state management
export type AppAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_AUTHENTICATED'; payload: boolean }
  | { type: 'SET_ONBOARDING_STATUS'; payload: OnboardingStatus }
  | { type: 'SET_USER'; payload: UserAccount | null }
  | { type: 'SET_NOTES'; payload: Note[] }
  | { type: 'ADD_NOTE'; payload: Note }
  | { type: 'UPDATE_NOTE'; payload: Note }
  | { type: 'DELETE_NOTE'; payload: string }
  | { type: 'SET_ACTIVE_NOTE'; payload: string | null };

// Settings types
export type ThemePreference = 'light' | 'dark' | 'system';

export interface AppSettings {
  themePreference: ThemePreference;
  requireAuthOnLaunch: boolean;
  screenshotPrevention: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  themePreference: 'system',
  requireAuthOnLaunch: true,
  screenshotPrevention: true,
};

// Storage keys
export const STORAGE_KEYS = {
  USER_ACCOUNT: 'privatepad_user',
  NOTES_INDEX: 'privatepad_notes_index',
  NOTE_PREFIX: 'privatepad_note_',
  ONBOARDING_STATUS: 'privatepad_onboarding',
  APP_SETTINGS: 'privatepad_settings',
  MEDIA_INDEX: 'privatepad_media_index',
} as const;

// Keychain service names
export const KEYCHAIN_SERVICE = {
  SECRET_KEY: 'privatepad_secret_key',
} as const;

// Portable encrypted file format for sharing
export type EncryptedContentType = 'media' | 'note';

export interface PrivatePadEncryptedFile {
  version: number;
  format: 'privatepad-encrypted';
  contentType: EncryptedContentType; // Distinguishes notes from media
  // Common fields
  ciphertext: string;  // base64 encoded encrypted data
  nonce: string;       // base64 encoded nonce
  salt: string;        // base64 encoded salt for key derivation
  createdAt: number;
  // Media-specific fields (when contentType === 'media')
  filename?: string;
  mimeType?: string;
  fileSize?: number;
  // Note-specific fields (when contentType === 'note')
  noteTitle?: string;
  noteId?: string;
}

export const PPENC_VERSION = 2; // Bumped for contentType support
export const PPENC_FORMAT = 'privatepad-encrypted' as const;

