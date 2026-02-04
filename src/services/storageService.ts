import EncryptedStorage from 'react-native-encrypted-storage';
import RNFS from 'react-native-fs';
import {
  Note,
  EncryptedNote,
  UserAccount,
  OnboardingStatus,
  AppSettings,
  ThemePreference,
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  PrivatePadEncryptedFile,
  PPENC_VERSION,
  PPENC_FORMAT,
} from '../types';
import {
  encrypt,
  decrypt,
  generateId,
  EncryptedData,
  generateSalt,
  deriveKeyFromPassword,
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

// ============================================
// Encrypted Note Sharing Functions
// ============================================

/**
 * Export a note as an encrypted .ppenc bundle for sharing
 * @param note - The note to export
 * @param password - Password to protect the bundle
 * @returns Path to the .ppenc file in temp directory, or null if failed
 */
export const exportNoteAsEncryptedBundle = async (
  note: Note,
  password: string,
): Promise<string | null> => {
  try {
    // Generate salt and derive key from password
    const salt = generateSalt();
    const derivedKey = deriveKeyFromPassword(password, salt);

    // Encrypt the note content
    const noteData = JSON.stringify({
      title: note.title,
      content: note.content,
    });
    const encrypted = encrypt(noteData, derivedKey);

    // Create the .ppenc bundle
    const bundle: PrivatePadEncryptedFile = {
      version: PPENC_VERSION,
      format: PPENC_FORMAT,
      contentType: 'note',
      noteTitle: note.title,
      noteId: note.id,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      salt: salt,
      createdAt: note.createdAt,
    };

    // Write to temp directory
    const bundleJson = JSON.stringify(bundle, null, 2);
    const safeName = (note.title || 'note').replace(/[^a-zA-Z0-9.-]/g, '_');
    const tempPath = `${RNFS.TemporaryDirectoryPath}/${safeName}.ppenc`;
    await RNFS.writeFile(tempPath, bundleJson, 'utf8');

    return tempPath;
  } catch (error) {
    console.error('Error exporting encrypted note bundle:', error);
    return null;
  }
};

/**
 * Parse and validate a .ppenc note file
 * @param filePath - Path to the .ppenc file
 * @returns Parsed bundle or null if invalid/not a note
 */
export const parseEncryptedNoteBundle = async (
  filePath: string,
): Promise<PrivatePadEncryptedFile | null> => {
  try {
    // Read the file
    const content = await RNFS.readFile(filePath, 'utf8');
    
    // Parse JSON
    const bundle = JSON.parse(content) as PrivatePadEncryptedFile;
    
    // Validate common required fields
    if (
      bundle.format !== PPENC_FORMAT ||
      typeof bundle.version !== 'number' ||
      typeof bundle.ciphertext !== 'string' ||
      typeof bundle.nonce !== 'string' ||
      typeof bundle.salt !== 'string' ||
      typeof bundle.createdAt !== 'number'
    ) {
      console.error('Invalid .ppenc file format');
      return null;
    }

    // Check version compatibility
    if (bundle.version > PPENC_VERSION) {
      console.error('Unsupported .ppenc version:', bundle.version);
      return null;
    }

    // Verify this is a note bundle
    if (bundle.contentType !== 'note') {
      console.error('This .ppenc file is not a note');
      return null;
    }

    // Validate note-specific fields
    if (typeof bundle.noteTitle !== 'string') {
      console.error('Invalid note .ppenc file: missing required fields');
      return null;
    }

    return bundle;
  } catch (error) {
    console.error('Error parsing encrypted note bundle:', error);
    return null;
  }
};

/**
 * Verify a password works for a .ppenc note bundle by attempting decryption
 * @param bundle - Parsed .ppenc bundle
 * @param password - Password to try
 * @returns true if password is correct
 */
export const verifyNoteBundlePassword = (
  bundle: PrivatePadEncryptedFile,
  password: string,
): boolean => {
  try {
    const derivedKey = deriveKeyFromPassword(password, bundle.salt);
    const encryptedData: EncryptedData = {
      ciphertext: bundle.ciphertext,
      nonce: bundle.nonce,
    };
    const decrypted = decrypt(encryptedData, derivedKey);
    return decrypted !== null;
  } catch {
    return false;
  }
};

/**
 * Import an encrypted note bundle into the vault
 * @param bundle - Parsed .ppenc note bundle
 * @param password - Password for the bundle
 * @param secretKey - User's master encryption key to re-encrypt with
 * @returns The imported Note or null if failed
 */
export const importEncryptedNoteBundle = async (
  bundle: PrivatePadEncryptedFile,
  password: string,
  secretKey: string,
): Promise<Note | null> => {
  try {
    // Derive key from password
    const derivedKey = deriveKeyFromPassword(password, bundle.salt);

    // Decrypt the note data
    const encryptedData: EncryptedData = {
      ciphertext: bundle.ciphertext,
      nonce: bundle.nonce,
    };
    const decrypted = decrypt(encryptedData, derivedKey);

    if (!decrypted) {
      console.error('Failed to decrypt note bundle - wrong password');
      return null;
    }

    // Parse the decrypted note data
    const noteData = JSON.parse(decrypted) as { title: string; content: string };

    // Create new note with fresh ID
    const now = Date.now();
    const newNote: Note = {
      id: generateId(),
      title: noteData.title,
      content: noteData.content,
      createdAt: bundle.createdAt,
      updatedAt: now,
    };

    // Save the note with master key encryption
    await saveNote(newNote, secretKey);

    return newNote;
  } catch (error) {
    console.error('Error importing encrypted note bundle:', error);
    return null;
  }
};

/**
 * Clean up temporary exported note files
 */
export const cleanupTempNoteFiles = async (): Promise<void> => {
  try {
    const tempDir = RNFS.TemporaryDirectoryPath;
    const files = await RNFS.readDir(tempDir);

    for (const file of files) {
      // Delete .ppenc files
      if (file.name.endsWith('.ppenc')) {
        await RNFS.unlink(file.path);
      }
    }
  } catch (error) {
    console.error('Error cleaning up temp note files:', error);
  }
};

