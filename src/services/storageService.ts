import EncryptedStorage from 'react-native-encrypted-storage';
import {
  Note,
  EncryptedNote,
  UserAccount,
  OnboardingStatus,
  AppSettings,
  ThemePreference,
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
} from '../types';
import {
  encrypt,
  decrypt,
  generateId,
  EncryptedData,
} from './cryptoService';

/**
 * Store user account information
 */
export const storeUserAccount = async (user: UserAccount): Promise<void> => {
  await EncryptedStorage.setItem(
    STORAGE_KEYS.USER_ACCOUNT,
    JSON.stringify(user),
  );
};

/**
 * Get user account information
 */
export const getUserAccount = async (): Promise<UserAccount | null> => {
  try {
    const data = await EncryptedStorage.getItem(STORAGE_KEYS.USER_ACCOUNT);
    if (data) {
      return JSON.parse(data) as UserAccount;
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Store onboarding status
 */
export const storeOnboardingStatus = async (
  status: OnboardingStatus,
): Promise<void> => {
  await EncryptedStorage.setItem(STORAGE_KEYS.ONBOARDING_STATUS, status);
};

/**
 * Get onboarding status
 */
export const getOnboardingStatus = async (): Promise<OnboardingStatus> => {
  try {
    const status = await EncryptedStorage.getItem(STORAGE_KEYS.ONBOARDING_STATUS);
    return (status as OnboardingStatus) || 'not_started';
  } catch {
    return 'not_started';
  }
};

/**
 * Get the notes index (list of note IDs and metadata)
 */
export const getNotesIndex = async (): Promise<
  Array<{ id: string; title: string; updatedAt: number }>
> => {
  try {
    const data = await EncryptedStorage.getItem(STORAGE_KEYS.NOTES_INDEX);
    if (data) {
      return JSON.parse(data);
    }
    return [];
  } catch {
    return [];
  }
};

/**
 * Update the notes index
 */
const updateNotesIndex = async (
  notes: Array<{ id: string; title: string; updatedAt: number }>,
): Promise<void> => {
  await EncryptedStorage.setItem(
    STORAGE_KEYS.NOTES_INDEX,
    JSON.stringify(notes),
  );
};

/**
 * Save a note (encrypts and stores)
 */
export const saveNote = async (
  note: Note,
  secretKey: string,
): Promise<void> => {
  // Encrypt the note content
  const noteData = JSON.stringify({
    title: note.title,
    content: note.content,
  });
  
  const encrypted = encrypt(noteData, secretKey);
  
  const encryptedNote: EncryptedNote = {
    id: note.id,
    encryptedData: encrypted.ciphertext,
    nonce: encrypted.nonce,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };

  // Store the encrypted note
  await EncryptedStorage.setItem(
    `${STORAGE_KEYS.NOTE_PREFIX}${note.id}`,
    JSON.stringify(encryptedNote),
  );

  // Update the index
  const index = await getNotesIndex();
  const existingIndex = index.findIndex((n) => n.id === note.id);
  
  if (existingIndex >= 0) {
    index[existingIndex] = {
      id: note.id,
      title: note.title,
      updatedAt: note.updatedAt,
    };
  } else {
    index.push({
      id: note.id,
      title: note.title,
      updatedAt: note.updatedAt,
    });
  }

  await updateNotesIndex(index);
};

/**
 * Load a note by ID (decrypts and returns)
 */
export const loadNote = async (
  noteId: string,
  secretKey: string,
): Promise<Note | null> => {
  try {
    const data = await EncryptedStorage.getItem(
      `${STORAGE_KEYS.NOTE_PREFIX}${noteId}`,
    );
    
    if (!data) {
      return null;
    }

    const encryptedNote: EncryptedNote = JSON.parse(data);
    
    const encryptedData: EncryptedData = {
      ciphertext: encryptedNote.encryptedData,
      nonce: encryptedNote.nonce,
    };

    const decrypted = decrypt(encryptedData, secretKey);
    
    if (!decrypted) {
      console.error('Failed to decrypt note');
      return null;
    }

    const noteData = JSON.parse(decrypted);
    
    return {
      id: encryptedNote.id,
      title: noteData.title,
      content: noteData.content,
      createdAt: encryptedNote.createdAt,
      updatedAt: encryptedNote.updatedAt,
    };
  } catch (error) {
    console.error('Error loading note:', error);
    return null;
  }
};

/**
 * Load all notes
 */
export const loadAllNotes = async (secretKey: string): Promise<Note[]> => {
  const index = await getNotesIndex();
  const notes: Note[] = [];

  for (const item of index) {
    const note = await loadNote(item.id, secretKey);
    if (note) {
      notes.push(note);
    }
  }

  // Sort by updatedAt descending
  return notes.sort((a, b) => b.updatedAt - a.updatedAt);
};

/**
 * Delete a note
 */
export const deleteNote = async (noteId: string): Promise<void> => {
  // Remove from storage
  await EncryptedStorage.removeItem(`${STORAGE_KEYS.NOTE_PREFIX}${noteId}`);

  // Update index
  const index = await getNotesIndex();
  const newIndex = index.filter((n) => n.id !== noteId);
  await updateNotesIndex(newIndex);
};

/**
 * Create a new empty note
 */
export const createNewNote = (): Note => {
  const now = Date.now();
  return {
    id: generateId(),
    title: 'Untitled',
    content: '',
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * Clear all data (for account reset)
 */
export const clearAllData = async (): Promise<void> => {
  const index = await getNotesIndex();
  
  // Delete all notes
  for (const item of index) {
    await EncryptedStorage.removeItem(`${STORAGE_KEYS.NOTE_PREFIX}${item.id}`);
  }
  
  // Delete index and user data
  await EncryptedStorage.removeItem(STORAGE_KEYS.NOTES_INDEX);
  await EncryptedStorage.removeItem(STORAGE_KEYS.USER_ACCOUNT);
  await EncryptedStorage.removeItem(STORAGE_KEYS.ONBOARDING_STATUS);
  await EncryptedStorage.removeItem(STORAGE_KEYS.APP_SETTINGS);
  await EncryptedStorage.removeItem(STORAGE_KEYS.MEDIA_INDEX);
  
  // Note: Encrypted media files on disk are cleared separately via 
  // clearAllMediaData() from mediaStorageService
};

// ============================================
// Settings Storage
// ============================================

/**
 * Get app settings
 */
export const getAppSettings = async (): Promise<AppSettings> => {
  try {
    const data = await EncryptedStorage.getItem(STORAGE_KEYS.APP_SETTINGS);
    if (data) {
      const settings = JSON.parse(data) as Partial<AppSettings>;
      // Merge with defaults to ensure all keys exist
      return { ...DEFAULT_SETTINGS, ...settings };
    }
    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
};

/**
 * Save app settings
 */
export const saveAppSettings = async (settings: AppSettings): Promise<void> => {
  await EncryptedStorage.setItem(
    STORAGE_KEYS.APP_SETTINGS,
    JSON.stringify(settings),
  );
};

/**
 * Update a single setting
 */
export const updateSetting = async <K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<AppSettings> => {
  const currentSettings = await getAppSettings();
  const newSettings = { ...currentSettings, [key]: value };
  await saveAppSettings(newSettings);
  return newSettings;
};

/**
 * Get theme preference
 */
export const getThemePreference = async (): Promise<ThemePreference> => {
  const settings = await getAppSettings();
  return settings.themePreference;
};

/**
 * Set theme preference
 */
export const setThemePreference = async (
  preference: ThemePreference,
): Promise<void> => {
  await updateSetting('themePreference', preference);
};

/**
 * Get require auth on launch setting
 */
export const getRequireAuthOnLaunch = async (): Promise<boolean> => {
  const settings = await getAppSettings();
  return settings.requireAuthOnLaunch;
};

/**
 * Set require auth on launch setting
 */
export const setRequireAuthOnLaunch = async (
  required: boolean,
): Promise<void> => {
  await updateSetting('requireAuthOnLaunch', required);
};

/**
 * Get screenshot prevention setting
 */
export const getScreenshotPrevention = async (): Promise<boolean> => {
  const settings = await getAppSettings();
  return settings.screenshotPrevention;
};

/**
 * Set screenshot prevention setting
 */
export const setScreenshotPrevention = async (
  enabled: boolean,
): Promise<void> => {
  await updateSetting('screenshotPrevention', enabled);
};

