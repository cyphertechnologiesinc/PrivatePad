import RNFS from 'react-native-fs';
import EncryptedStorage from 'react-native-encrypted-storage';
import { Image, Platform } from 'react-native';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import {
  MediaItem,
  MediaType,
  EncryptedMediaMetadata,
  STORAGE_KEYS,
  PrivatePadEncryptedFile,
  PPENC_VERSION,
  PPENC_FORMAT,
} from '../types';
import {
  encryptBinary,
  decryptBinary,
  generateId,
  base64ToUint8Array,
  uint8ArrayToBase64,
  EncryptedData,
  generateSalt,
  deriveKeyFromPassword,
} from './cryptoService';
import nacl from 'tweetnacl';

// Vault directory paths - lazily evaluated to avoid accessing native modules before bridge is ready
const getVaultDir = () => `${RNFS.DocumentDirectoryPath}/vault`;
const getThumbnailsDir = () => `${getVaultDir()}/thumbs`;

// Thumbnail settings - small size for fast loading
const THUMBNAIL_MAX_SIZE = 200;
const THUMBNAIL_QUALITY = 70; // JPEG quality for thumbnails

/**
 * Ensure vault directories exist
 */
export const initializeVaultDirectories = async (): Promise<void> => {
  const vaultDir = getVaultDir();
  const thumbsDir = getThumbnailsDir();
  
  const vaultExists = await RNFS.exists(vaultDir);
  if (!vaultExists) {
    await RNFS.mkdir(vaultDir);
  }

  const thumbsExists = await RNFS.exists(thumbsDir);
  if (!thumbsExists) {
    await RNFS.mkdir(thumbsDir);
  }
};

/**
 * Get the media index (list of all encrypted media metadata)
 */
export const getMediaIndex = async (): Promise<EncryptedMediaMetadata[]> => {
  try {
    const data = await EncryptedStorage.getItem(STORAGE_KEYS.MEDIA_INDEX);
    if (data) {
      return JSON.parse(data);
    }
    return [];
  } catch {
    return [];
  }
};

/**
 * Load all vault data in a single optimized call
 * Returns index, items, and counts without redundant storage reads
 */
export const loadVaultData = async (): Promise<{
  index: EncryptedMediaMetadata[];
  items: MediaItem[];
  counts: { photos: number; videos: number; documents: number; total: number };
}> => {
  const index = await getMediaIndex();
  
  const items: MediaItem[] = index.map((metadata) => ({
    id: metadata.id,
    type: metadata.type,
    filename: metadata.filename,
    mimeType: metadata.mimeType,
    fileSize: metadata.fileSize,
    encryptedPath: metadata.encryptedPath,
    thumbnailPath: metadata.thumbnailPath,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
  }));

  const counts = {
    photos: 0,
    videos: 0,
    documents: 0,
    total: index.length,
  };

  index.forEach((item) => {
    if (item.type === 'photo') counts.photos++;
    else if (item.type === 'video') counts.videos++;
    else counts.documents++;
  });

  return { index, items, counts };
};

/**
 * Update the media index
 */
const updateMediaIndex = async (
  items: EncryptedMediaMetadata[],
): Promise<void> => {
  await EncryptedStorage.setItem(
    STORAGE_KEYS.MEDIA_INDEX,
    JSON.stringify(items),
  );
};

/**
 * Determine media type from MIME type
 */
export const getMediaTypeFromMime = (mimeType: string): MediaType => {
  if (mimeType.startsWith('image/')) {
    return 'photo';
  }
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  return 'document';
};

/**
 * Get file extension from filename or MIME type
 */
const getExtension = (filename: string, mimeType: string): string => {
  // Try to get from filename first
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex !== -1) {
    return filename.substring(dotIndex);
  }

  // Fallback to MIME type mapping
  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/x-m4v': '.m4v',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'text/plain': '.txt',
  };

  return mimeToExt[mimeType] || '';
};

/**
 * Normalize a file URI for reading with RNFS
 */
const normalizeFileUri = (uri: string): string => {
  let cleanUri = uri;
  if (cleanUri.startsWith('file://')) {
    cleanUri = cleanUri.substring(7);
  }
  return decodeURIComponent(cleanUri);
};

/**
 * Generate a real thumbnail for an image using native image resizer
 * Creates a small ~200x200 JPEG for fast loading
 * Returns base64 encoded thumbnail data
 */
const generateImageThumbnail = async (
  uri: string,
): Promise<string | null> => {
  try {
    // Ensure URI has proper format for the resizer
    const imageUri = uri.startsWith('file://') ? uri : `file://${uri}`;
    
    // Use native image resizer to create actual small thumbnail
    // This is MUCH faster than reading full-size images
    const resizedImage = await ImageResizer.createResizedImage(
      imageUri,
      THUMBNAIL_MAX_SIZE,  // maxWidth
      THUMBNAIL_MAX_SIZE,  // maxHeight
      'JPEG',              // compressFormat - JPEG is smaller and faster
      THUMBNAIL_QUALITY,   // quality (0-100)
      0,                   // rotation
      undefined,           // outputPath (undefined = temp directory)
      false,               // keepMeta
      {
        mode: 'contain',   // Maintain aspect ratio, fit within bounds
        onlyScaleDown: true, // Don't upscale small images
      }
    );

    // Read the resized thumbnail as base64
    const thumbnailPath = normalizeFileUri(resizedImage.uri);
    const base64 = await RNFS.readFile(thumbnailPath, 'base64');
    
    // Clean up the temp resized file
    try {
      await RNFS.unlink(thumbnailPath);
    } catch {
      // Ignore cleanup errors
    }

    return base64;
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    // Fallback: try to read original if resize fails
    try {
      const cleanUri = normalizeFileUri(uri);
      return await RNFS.readFile(cleanUri, 'base64');
    } catch {
      return null;
    }
  }
};

/**
 * Save media to encrypted vault
 */
export const saveMedia = async (
  uri: string,
  filename: string,
  mimeType: string,
  secretKey: string,
): Promise<MediaItem | null> => {
  try {
    await initializeVaultDirectories();

    const id = generateId();
    const type = getMediaTypeFromMime(mimeType);
    const encryptedPath = `${getVaultDir()}/${id}.enc`;

    // Read the file as base64
    // Normalize the URI - remove file:// prefix and decode any percent-encoding
    const cleanUri = normalizeFileUri(uri);
    
    const fileBase64 = await RNFS.readFile(cleanUri, 'base64');
    const fileData = base64ToUint8Array(fileBase64);

    // Get file size
    const fileStats = await RNFS.stat(cleanUri);
    const fileSize = typeof fileStats.size === 'string' 
      ? parseInt(fileStats.size, 10) 
      : fileStats.size;

    // Encrypt the file data
    const encryptedFile = encryptBinary(fileData, secretKey);

    // Write encrypted file to disk
    await RNFS.writeFile(encryptedPath, encryptedFile.ciphertext, 'utf8');

    // Handle thumbnail for photos
    let thumbnailPath: string | undefined;
    let thumbnailNonce: string | undefined;

    if (type === 'photo') {
      const thumbnailBase64 = await generateImageThumbnail(uri);
      if (thumbnailBase64) {
        thumbnailPath = `${getThumbnailsDir()}/${id}.thumb.enc`;
        const thumbnailData = base64ToUint8Array(thumbnailBase64);
        const encryptedThumbnail = encryptBinary(thumbnailData, secretKey);
        await RNFS.writeFile(thumbnailPath, encryptedThumbnail.ciphertext, 'utf8');
        thumbnailNonce = encryptedThumbnail.nonce;
      }
    }

    const now = Date.now();
    const metadata: EncryptedMediaMetadata = {
      id,
      type,
      filename,
      mimeType,
      fileSize,
      encryptedPath,
      thumbnailPath,
      nonce: encryptedFile.nonce,
      thumbnailNonce,
      createdAt: now,
      updatedAt: now,
    };

    // Update index
    const index = await getMediaIndex();
    index.unshift(metadata); // Add to beginning
    await updateMediaIndex(index);

    // Return MediaItem (without encryption details)
    return {
      id,
      type,
      filename,
      mimeType,
      fileSize,
      encryptedPath,
      thumbnailPath,
      createdAt: now,
      updatedAt: now,
    };
  } catch (error) {
    console.error('Error saving media:', error);
    return null;
  }
};

/**
 * Load decrypted media data by ID
 * Returns base64 encoded data URI
 */
export const loadMedia = async (
  id: string,
  secretKey: string,
): Promise<string | null> => {
  try {
    const index = await getMediaIndex();
    const metadata = index.find((item) => item.id === id);

    if (!metadata) {
      console.error('Media not found:', id);
      return null;
    }

    // Read encrypted file
    const encryptedBase64 = await RNFS.readFile(metadata.encryptedPath, 'utf8');

    const encryptedData: EncryptedData = {
      ciphertext: encryptedBase64,
      nonce: metadata.nonce,
    };

    // Decrypt
    const decrypted = decryptBinary(encryptedData, secretKey);
    if (!decrypted) {
      console.error('Failed to decrypt media:', id);
      return null;
    }

    // Convert to base64 data URI
    const base64 = uint8ArrayToBase64(decrypted);
    return `data:${metadata.mimeType};base64,${base64}`;
  } catch (error) {
    console.error('Error loading media:', error);
    return null;
  }
};

/**
 * Load decrypted thumbnail by ID
 * Returns base64 encoded data URI
 */
export const loadThumbnail = async (
  id: string,
  secretKey: string,
): Promise<string | null> => {
  try {
    const index = await getMediaIndex();
    const metadata = index.find((item) => item.id === id);

    if (!metadata || !metadata.thumbnailPath || !metadata.thumbnailNonce) {
      return null;
    }

    // Check if thumbnail file exists
    const exists = await RNFS.exists(metadata.thumbnailPath);
    if (!exists) {
      return null;
    }

    // Read encrypted thumbnail
    const encryptedBase64 = await RNFS.readFile(metadata.thumbnailPath, 'utf8');

    const encryptedData: EncryptedData = {
      ciphertext: encryptedBase64,
      nonce: metadata.thumbnailNonce,
    };

    // Decrypt
    const decrypted = decryptBinary(encryptedData, secretKey);
    if (!decrypted) {
      return null;
    }

    // Convert to base64 data URI
    const base64 = uint8ArrayToBase64(decrypted);
    return `data:${metadata.mimeType};base64,${base64}`;
  } catch (error) {
    console.error('Error loading thumbnail:', error);
    return null;
  }
};

/**
 * Load a single thumbnail using pre-loaded metadata (no index lookup)
 * More efficient when loading multiple thumbnails
 */
export const loadThumbnailFromMetadata = async (
  metadata: EncryptedMediaMetadata,
  secretKey: string,
): Promise<string | null> => {
  try {
    if (!metadata.thumbnailPath || !metadata.thumbnailNonce) {
      return null;
    }

    // Check if thumbnail file exists
    const exists = await RNFS.exists(metadata.thumbnailPath);
    if (!exists) {
      return null;
    }

    // Read encrypted thumbnail
    const encryptedBase64 = await RNFS.readFile(metadata.thumbnailPath, 'utf8');

    const encryptedData: EncryptedData = {
      ciphertext: encryptedBase64,
      nonce: metadata.thumbnailNonce,
    };

    // Decrypt
    const decrypted = decryptBinary(encryptedData, secretKey);
    if (!decrypted) {
      return null;
    }

    // Convert to base64 data URI
    const base64 = uint8ArrayToBase64(decrypted);
    return `data:${metadata.mimeType};base64,${base64}`;
  } catch (error) {
    console.error('Error loading thumbnail:', error);
    return null;
  }
};

/**
 * Load thumbnails in parallel with batch callback for efficient UI updates
 * @param index - Pre-loaded media index (avoids redundant storage reads)
 * @param secretKey - Encryption key
 * @param onBatchComplete - Callback fired after each batch with all results from that batch
 * @param concurrency - Max parallel loads per batch (default 6)
 */
export const loadThumbnailsWithProgress = async (
  index: EncryptedMediaMetadata[],
  secretKey: string,
  onBatchComplete: (batch: { [id: string]: string | null }) => void,
  concurrency: number = 6,
): Promise<void> => {
  // Filter to only photos with thumbnails
  const photosWithThumbnails = index.filter(
    (item) => item.type === 'photo' && item.thumbnailPath && item.thumbnailNonce
  );

  if (photosWithThumbnails.length === 0) {
    return;
  }

  // Process in chunks for controlled parallelism
  const chunks: EncryptedMediaMetadata[][] = [];
  for (let i = 0; i < photosWithThumbnails.length; i += concurrency) {
    chunks.push(photosWithThumbnails.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    // Load chunk in parallel
    const results = await Promise.all(
      chunk.map(async (metadata) => {
        const thumbnail = await loadThumbnailFromMetadata(metadata, secretKey);
        return { id: metadata.id, thumbnail };
      })
    );

    // Combine results into a single batch object for efficient state update
    const batchResult: { [id: string]: string | null } = {};
    results.forEach(({ id, thumbnail }) => {
      batchResult[id] = thumbnail;
    });

    // Fire single callback with entire batch - reduces re-renders
    onBatchComplete(batchResult);
  }
};

/**
 * Delete media by ID (standard deletion)
 */
export const deleteMedia = async (id: string): Promise<boolean> => {
  try {
    const index = await getMediaIndex();
    const metadata = index.find((item) => item.id === id);

    if (!metadata) {
      return false;
    }

    // Delete encrypted file
    if (await RNFS.exists(metadata.encryptedPath)) {
      await RNFS.unlink(metadata.encryptedPath);
    }

    // Delete thumbnail if exists
    if (metadata.thumbnailPath && (await RNFS.exists(metadata.thumbnailPath))) {
      await RNFS.unlink(metadata.thumbnailPath);
    }

    // Update index
    const newIndex = index.filter((item) => item.id !== id);
    await updateMediaIndex(newIndex);

    return true;
  } catch (error) {
    console.error('Error deleting media:', error);
    return false;
  }
};

// ============================================
// Secure Deletion Functions
// ============================================

/**
 * Securely delete a file by overwriting with random data before unlinking.
 * This raises the bar significantly for forensic recovery on flash storage.
 * @param filePath - Path to the file to securely delete
 */
export const secureDeleteFile = async (filePath: string): Promise<void> => {
  try {
    if (!(await RNFS.exists(filePath))) {
      return; // File already gone
    }

    // Get file size
    const stats = await RNFS.stat(filePath);
    const fileSize = typeof stats.size === 'string' 
      ? parseInt(stats.size, 10) 
      : stats.size;

    if (fileSize > 0) {
      // Overwrite pass 1: Random data
      // For efficiency, we overwrite in chunks for large files
      const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
      const numChunks = Math.ceil(fileSize / CHUNK_SIZE);
      
      for (let i = 0; i < numChunks; i++) {
        const chunkSize = Math.min(CHUNK_SIZE, fileSize - i * CHUNK_SIZE);
        const randomData = nacl.randomBytes(chunkSize);
        const base64Data = uint8ArrayToBase64(randomData);
        
        if (i === 0) {
          await RNFS.writeFile(filePath, base64Data, 'base64');
        } else {
          await RNFS.appendFile(filePath, base64Data, 'base64');
        }
      }

      // Overwrite pass 2: Zeros (some forensic tools look for random patterns)
      const zeroChunkSize = Math.min(fileSize, CHUNK_SIZE);
      const zeros = new Uint8Array(zeroChunkSize).fill(0);
      const zerosBase64 = uint8ArrayToBase64(zeros);
      await RNFS.writeFile(filePath, zerosBase64, 'base64');
    }

    // Finally, unlink the file
    await RNFS.unlink(filePath);
  } catch (error) {
    console.error('Secure delete failed, attempting regular delete:', error);
    // Fall back to regular delete
    try {
      if (await RNFS.exists(filePath)) {
        await RNFS.unlink(filePath);
      }
    } catch {}
  }
};

/**
 * Securely delete media by ID with random data overwrite
 * More secure than regular deleteMedia - use for sensitive content
 */
export const secureDeleteMedia = async (id: string): Promise<boolean> => {
  try {
    const index = await getMediaIndex();
    const metadata = index.find((item) => item.id === id);

    if (!metadata) {
      return false;
    }

    // Securely delete encrypted file
    await secureDeleteFile(metadata.encryptedPath);

    // Securely delete thumbnail if exists
    if (metadata.thumbnailPath) {
      await secureDeleteFile(metadata.thumbnailPath);
    }

    // Update index
    const newIndex = index.filter((item) => item.id !== id);
    await updateMediaIndex(newIndex);

    return true;
  } catch (error) {
    console.error('Error in secure delete media:', error);
    return false;
  }
};

// ============================================
// Password Protection Functions
// ============================================

/**
 * Check if a media item is password protected
 */
export const isMediaPasswordProtected = async (id: string): Promise<boolean> => {
  const index = await getMediaIndex();
  const metadata = index.find((item) => item.id === id);
  return metadata?.isPasswordProtected ?? false;
};

/**
 * Get media metadata by ID
 */
export const getMediaMetadata = async (id: string): Promise<EncryptedMediaMetadata | null> => {
  const index = await getMediaIndex();
  return index.find((item) => item.id === id) || null;
};

/**
 * Set a password on a media item
 * Re-encrypts the file with a key derived from the password
 * @param id - Media item ID
 * @param password - User's password
 * @param masterKey - Current master encryption key
 * @returns true if successful
 */
export const setMediaPassword = async (
  id: string,
  password: string,
  masterKey: string,
): Promise<boolean> => {
  try {
    const index = await getMediaIndex();
    const metadataIndex = index.findIndex((item) => item.id === id);
    
    if (metadataIndex === -1) {
      return false;
    }

    const metadata = index[metadataIndex];

    // Don't allow setting password if already protected
    if (metadata.isPasswordProtected) {
      console.error('Media is already password protected');
      return false;
    }

    // Read and decrypt the file with master key
    const encryptedBase64 = await RNFS.readFile(metadata.encryptedPath, 'utf8');
    const encryptedData: EncryptedData = {
      ciphertext: encryptedBase64,
      nonce: metadata.nonce,
    };
    
    const decrypted = decryptBinary(encryptedData, masterKey);
    if (!decrypted) {
      console.error('Failed to decrypt file with master key');
      return false;
    }

    // Generate salt and derive key from password
    const salt = generateSalt();
    const derivedKey = deriveKeyFromPassword(password, salt);

    // Re-encrypt with password-derived key
    const reEncrypted = encryptBinary(decrypted, derivedKey);

    // Write re-encrypted file
    await RNFS.writeFile(metadata.encryptedPath, reEncrypted.ciphertext, 'utf8');

    // Handle thumbnail if exists - also re-encrypt with derived key
    if (metadata.thumbnailPath && metadata.thumbnailNonce) {
      try {
        const thumbEncrypted = await RNFS.readFile(metadata.thumbnailPath, 'utf8');
        const thumbData: EncryptedData = {
          ciphertext: thumbEncrypted,
          nonce: metadata.thumbnailNonce,
        };
        const thumbDecrypted = decryptBinary(thumbData, masterKey);
        
        if (thumbDecrypted) {
          const thumbReEncrypted = encryptBinary(thumbDecrypted, derivedKey);
          await RNFS.writeFile(metadata.thumbnailPath, thumbReEncrypted.ciphertext, 'utf8');
          metadata.thumbnailNonce = thumbReEncrypted.nonce;
        }
      } catch (thumbError) {
        console.error('Error re-encrypting thumbnail:', thumbError);
        // Continue anyway - main file is more important
      }
    }

    // Update metadata
    metadata.nonce = reEncrypted.nonce;
    metadata.isPasswordProtected = true;
    metadata.passwordSalt = salt;
    metadata.updatedAt = Date.now();

    // Save updated index
    index[metadataIndex] = metadata;
    await updateMediaIndex(index);

    return true;
  } catch (error) {
    console.error('Error setting media password:', error);
    return false;
  }
};

/**
 * Load a password-protected media item
 * Derives key from password and attempts decryption
 * @param id - Media item ID
 * @param password - User's password
 * @returns Data URI string if successful, null if wrong password or error
 */
export const loadProtectedMedia = async (
  id: string,
  password: string,
): Promise<string | null> => {
  try {
    const index = await getMediaIndex();
    const metadata = index.find((item) => item.id === id);

    if (!metadata) {
      console.error('Media not found:', id);
      return null;
    }

    if (!metadata.isPasswordProtected || !metadata.passwordSalt) {
      console.error('Media is not password protected');
      return null;
    }

    // Derive key from password + stored salt
    const derivedKey = deriveKeyFromPassword(password, metadata.passwordSalt);

    // Read encrypted file
    const encryptedBase64 = await RNFS.readFile(metadata.encryptedPath, 'utf8');
    const encryptedData: EncryptedData = {
      ciphertext: encryptedBase64,
      nonce: metadata.nonce,
    };

    // Attempt decryption - will return null if wrong password
    const decrypted = decryptBinary(encryptedData, derivedKey);
    if (!decrypted) {
      // Wrong password - decryption failed
      return null;
    }

    // Convert to base64 data URI
    const base64 = uint8ArrayToBase64(decrypted);
    return `data:${metadata.mimeType};base64,${base64}`;
  } catch (error) {
    console.error('Error loading protected media:', error);
    return null;
  }
};

/**
 * Load thumbnail for a password-protected media item
 * @param id - Media item ID
 * @param password - User's password
 * @returns Data URI string if successful, null if wrong password or error
 */
export const loadProtectedThumbnail = async (
  id: string,
  password: string,
): Promise<string | null> => {
  try {
    const index = await getMediaIndex();
    const metadata = index.find((item) => item.id === id);

    if (!metadata || !metadata.thumbnailPath || !metadata.thumbnailNonce) {
      return null;
    }

    if (!metadata.isPasswordProtected || !metadata.passwordSalt) {
      return null;
    }

    // Derive key from password + stored salt
    const derivedKey = deriveKeyFromPassword(password, metadata.passwordSalt);

    // Check if thumbnail file exists
    const exists = await RNFS.exists(metadata.thumbnailPath);
    if (!exists) {
      return null;
    }

    // Read encrypted thumbnail
    const encryptedBase64 = await RNFS.readFile(metadata.thumbnailPath, 'utf8');
    const encryptedData: EncryptedData = {
      ciphertext: encryptedBase64,
      nonce: metadata.thumbnailNonce,
    };

    // Attempt decryption
    const decrypted = decryptBinary(encryptedData, derivedKey);
    if (!decrypted) {
      return null;
    }

    // Convert to base64 data URI
    const base64 = uint8ArrayToBase64(decrypted);
    return `data:${metadata.mimeType};base64,${base64}`;
  } catch (error) {
    console.error('Error loading protected thumbnail:', error);
    return null;
  }
};

/**
 * Remove password protection from a media item
 * Re-encrypts the file with the master key
 * @param id - Media item ID
 * @param password - Current password
 * @param masterKey - Master encryption key to re-encrypt with
 * @returns true if successful
 */
export const removeMediaPassword = async (
  id: string,
  password: string,
  masterKey: string,
): Promise<boolean> => {
  try {
    const index = await getMediaIndex();
    const metadataIndex = index.findIndex((item) => item.id === id);
    
    if (metadataIndex === -1) {
      return false;
    }

    const metadata = index[metadataIndex];

    if (!metadata.isPasswordProtected || !metadata.passwordSalt) {
      console.error('Media is not password protected');
      return false;
    }

    // Derive key from password + stored salt
    const derivedKey = deriveKeyFromPassword(password, metadata.passwordSalt);

    // Read and decrypt the file with password-derived key
    const encryptedBase64 = await RNFS.readFile(metadata.encryptedPath, 'utf8');
    const encryptedData: EncryptedData = {
      ciphertext: encryptedBase64,
      nonce: metadata.nonce,
    };
    
    const decrypted = decryptBinary(encryptedData, derivedKey);
    if (!decrypted) {
      // Wrong password
      return false;
    }

    // Re-encrypt with master key
    const reEncrypted = encryptBinary(decrypted, masterKey);

    // Write re-encrypted file
    await RNFS.writeFile(metadata.encryptedPath, reEncrypted.ciphertext, 'utf8');

    // Handle thumbnail if exists
    if (metadata.thumbnailPath && metadata.thumbnailNonce) {
      try {
        const thumbEncrypted = await RNFS.readFile(metadata.thumbnailPath, 'utf8');
        const thumbData: EncryptedData = {
          ciphertext: thumbEncrypted,
          nonce: metadata.thumbnailNonce,
        };
        const thumbDecrypted = decryptBinary(thumbData, derivedKey);
        
        if (thumbDecrypted) {
          const thumbReEncrypted = encryptBinary(thumbDecrypted, masterKey);
          await RNFS.writeFile(metadata.thumbnailPath, thumbReEncrypted.ciphertext, 'utf8');
          metadata.thumbnailNonce = thumbReEncrypted.nonce;
        }
      } catch (thumbError) {
        console.error('Error re-encrypting thumbnail:', thumbError);
      }
    }

    // Update metadata
    metadata.nonce = reEncrypted.nonce;
    metadata.isPasswordProtected = false;
    metadata.passwordSalt = undefined;
    metadata.updatedAt = Date.now();

    // Save updated index
    index[metadataIndex] = metadata;
    await updateMediaIndex(index);

    return true;
  } catch (error) {
    console.error('Error removing media password:', error);
    return false;
  }
};

/**
 * Get all media items (metadata only, no decryption)
 */
export const getAllMediaItems = async (): Promise<MediaItem[]> => {
  const index = await getMediaIndex();
  return index.map((metadata) => ({
    id: metadata.id,
    type: metadata.type,
    filename: metadata.filename,
    mimeType: metadata.mimeType,
    fileSize: metadata.fileSize,
    encryptedPath: metadata.encryptedPath,
    thumbnailPath: metadata.thumbnailPath,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
  }));
};

/**
 * Get media count by type
 */
export const getMediaCounts = async (): Promise<{
  photos: number;
  videos: number;
  documents: number;
  total: number;
}> => {
  const index = await getMediaIndex();
  const counts = {
    photos: 0,
    videos: 0,
    documents: 0,
    total: index.length,
  };

  index.forEach((item) => {
    if (item.type === 'photo') counts.photos++;
    else if (item.type === 'video') counts.videos++;
    else counts.documents++;
  });

  return counts;
};

/**
 * Export media to a temporary location for sharing
 * Returns the temporary file path
 */
export const exportMediaForSharing = async (
  id: string,
  secretKey: string,
): Promise<string | null> => {
  try {
    const index = await getMediaIndex();
    const metadata = index.find((item) => item.id === id);

    if (!metadata) {
      return null;
    }

    // Read encrypted file
    const encryptedBase64 = await RNFS.readFile(metadata.encryptedPath, 'utf8');

    const encryptedData: EncryptedData = {
      ciphertext: encryptedBase64,
      nonce: metadata.nonce,
    };

    // Decrypt
    const decrypted = decryptBinary(encryptedData, secretKey);
    if (!decrypted) {
      return null;
    }

    // Write to temporary directory
    const ext = getExtension(metadata.filename, metadata.mimeType);
    const tempPath = `${RNFS.TemporaryDirectoryPath}/${id}${ext}`;
    const base64 = uint8ArrayToBase64(decrypted);
    await RNFS.writeFile(tempPath, base64, 'base64');

    return tempPath;
  } catch (error) {
    console.error('Error exporting media:', error);
    return null;
  }
};

/**
 * Clean up temporary exported files
 */
export const cleanupTempFiles = async (): Promise<void> => {
  try {
    const tempDir = RNFS.TemporaryDirectoryPath;
    const files = await RNFS.readDir(tempDir);

    for (const file of files) {
      // Only delete files we created (with our ID pattern)
      if (file.name.match(/^[A-Za-z0-9]{16}\./)) {
        await RNFS.unlink(file.path);
      }
    }
  } catch (error) {
    console.error('Error cleaning up temp files:', error);
  }
};

/**
 * Clear all vault data (for account reset)
 */
export const clearAllMediaData = async (): Promise<void> => {
  try {
    // Delete entire vault directory
    const vaultDir = getVaultDir();
    if (await RNFS.exists(vaultDir)) {
      await RNFS.unlink(vaultDir);
    }

    // Clear index
    await EncryptedStorage.removeItem(STORAGE_KEYS.MEDIA_INDEX);

    // Clean up temp files
    await cleanupTempFiles();
  } catch (error) {
    console.error('Error clearing media data:', error);
  }
};

// ============================================
// Encrypted File Import/Export (.ppenc)
// ============================================

/**
 * Export a password-protected media item as a portable .ppenc bundle
 * The bundle contains the encrypted data and can be imported by anyone with the password
 * @param id - Media item ID
 * @param password - Password to verify ownership (must match the file's password)
 * @returns Path to the .ppenc file in temp directory, or null if failed
 */
export const exportAsEncryptedBundle = async (
  id: string,
  password: string,
): Promise<string | null> => {
  try {
    const index = await getMediaIndex();
    const metadata = index.find((item) => item.id === id);

    if (!metadata) {
      console.error('Media not found:', id);
      return null;
    }

    if (!metadata.isPasswordProtected || !metadata.passwordSalt) {
      console.error('Media is not password protected');
      return null;
    }

    // Verify the password works by attempting to derive the key and read the file
    const derivedKey = deriveKeyFromPassword(password, metadata.passwordSalt);
    
    // Read encrypted file
    const encryptedBase64 = await RNFS.readFile(metadata.encryptedPath, 'utf8');
    
    // Verify decryption works (proves password is correct)
    const encryptedData: EncryptedData = {
      ciphertext: encryptedBase64,
      nonce: metadata.nonce,
    };
    const testDecrypt = decryptBinary(encryptedData, derivedKey);
    if (!testDecrypt) {
      console.error('Password verification failed');
      return null;
    }

    // Create the .ppenc bundle
    const bundle: PrivatePadEncryptedFile = {
      version: PPENC_VERSION,
      format: PPENC_FORMAT,
      contentType: 'media',
      filename: metadata.filename,
      mimeType: metadata.mimeType,
      fileSize: metadata.fileSize,
      ciphertext: encryptedBase64,
      nonce: metadata.nonce,
      salt: metadata.passwordSalt,
      createdAt: metadata.createdAt,
    };

    // Write to temp directory
    const bundleJson = JSON.stringify(bundle, null, 2);
    const safeName = metadata.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const tempPath = `${RNFS.TemporaryDirectoryPath}/${safeName}.ppenc`;
    await RNFS.writeFile(tempPath, bundleJson, 'utf8');

    return tempPath;
  } catch (error) {
    console.error('Error exporting encrypted bundle:', error);
    return null;
  }
};

/**
 * Parse and validate a .ppenc file for media
 * @param filePath - Path to the .ppenc file
 * @returns Parsed bundle or null if invalid
 */
export const parseEncryptedBundle = async (
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

    // Handle backward compatibility: v1 files without contentType are media
    if (!bundle.contentType) {
      bundle.contentType = 'media';
    }

    // For media files, validate media-specific fields
    if (bundle.contentType === 'media') {
      if (
        typeof bundle.filename !== 'string' ||
        typeof bundle.mimeType !== 'string' ||
        typeof bundle.fileSize !== 'number'
      ) {
        console.error('Invalid media .ppenc file: missing required fields');
        return null;
      }
    }

    // For note files, validate note-specific fields
    if (bundle.contentType === 'note') {
      if (typeof bundle.noteTitle !== 'string') {
        console.error('Invalid note .ppenc file: missing required fields');
        return null;
      }
    }

    return bundle;
  } catch (error) {
    console.error('Error parsing encrypted bundle:', error);
    return null;
  }
};

/**
 * Verify a password works for a .ppenc bundle by attempting decryption
 * @param bundle - Parsed .ppenc bundle
 * @param password - Password to try
 * @returns true if password is correct
 */
export const verifyBundlePassword = (
  bundle: PrivatePadEncryptedFile,
  password: string,
): boolean => {
  try {
    const derivedKey = deriveKeyFromPassword(password, bundle.salt);
    const encryptedData: EncryptedData = {
      ciphertext: bundle.ciphertext,
      nonce: bundle.nonce,
    };
    const decrypted = decryptBinary(encryptedData, derivedKey);
    return decrypted !== null;
  } catch {
    return false;
  }
};

/**
 * Import a .ppenc bundle into the vault
 * @param bundle - Parsed .ppenc bundle
 * @param password - Password for the bundle
 * @param masterKey - User's master encryption key
 * @param keepProtected - If true, keeps file password-protected; if false, re-encrypts with master key
 * @returns The imported MediaItem or null if failed
 */
export const importEncryptedBundle = async (
  bundle: PrivatePadEncryptedFile,
  password: string,
  masterKey: string,
  keepProtected: boolean,
): Promise<MediaItem | null> => {
  try {
    await initializeVaultDirectories();

    // Derive key from password
    const derivedKey = deriveKeyFromPassword(password, bundle.salt);
    
    // Decrypt the file data
    const encryptedData: EncryptedData = {
      ciphertext: bundle.ciphertext,
      nonce: bundle.nonce,
    };
    const decrypted = decryptBinary(encryptedData, derivedKey);
    
    if (!decrypted) {
      console.error('Failed to decrypt bundle - wrong password');
      return null;
    }

    // Generate new ID for this file
    const id = generateId();
    const type = getMediaTypeFromMime(bundle.mimeType);
    const encryptedPath = `${getVaultDir()}/${id}.enc`;

    let finalNonce: string;
    let finalSalt: string | undefined;
    let isPasswordProtected: boolean;

    if (keepProtected) {
      // Keep the file encrypted with the same password
      // Generate new salt for security (in case same password used elsewhere)
      const newSalt = generateSalt();
      const newDerivedKey = deriveKeyFromPassword(password, newSalt);
      const reEncrypted = encryptBinary(decrypted, newDerivedKey);
      
      await RNFS.writeFile(encryptedPath, reEncrypted.ciphertext, 'utf8');
      
      finalNonce = reEncrypted.nonce;
      finalSalt = newSalt;
      isPasswordProtected = true;
    } else {
      // Re-encrypt with master key (remove password protection)
      const reEncrypted = encryptBinary(decrypted, masterKey);
      await RNFS.writeFile(encryptedPath, reEncrypted.ciphertext, 'utf8');
      
      finalNonce = reEncrypted.nonce;
      finalSalt = undefined;
      isPasswordProtected = false;
    }

    // Generate thumbnail for photos
    let thumbnailPath: string | undefined;
    let thumbnailNonce: string | undefined;

    if (type === 'photo') {
      try {
        // Write decrypted data to temp file for thumbnail generation
        const tempImagePath = `${RNFS.TemporaryDirectoryPath}/${id}_temp_import`;
        const base64Data = uint8ArrayToBase64(decrypted);
        await RNFS.writeFile(tempImagePath, base64Data, 'base64');

        // Generate thumbnail using the existing function
        const thumbnailBase64 = await generateImageThumbnailFromPath(tempImagePath);
        
        // Clean up temp file
        try {
          await RNFS.unlink(tempImagePath);
        } catch {}

        if (thumbnailBase64) {
          thumbnailPath = `${getThumbnailsDir()}/${id}.thumb.enc`;
          const thumbnailData = base64ToUint8Array(thumbnailBase64);
          
          // Encrypt thumbnail with same key as main file
          const encryptKey = keepProtected 
            ? deriveKeyFromPassword(password, finalSalt!)
            : masterKey;
          const encryptedThumbnail = encryptBinary(thumbnailData, encryptKey);
          await RNFS.writeFile(thumbnailPath, encryptedThumbnail.ciphertext, 'utf8');
          thumbnailNonce = encryptedThumbnail.nonce;
        }
      } catch (thumbError) {
        console.error('Error generating thumbnail for imported file:', thumbError);
        // Continue without thumbnail
      }
    }

    const now = Date.now();
    const metadata: EncryptedMediaMetadata = {
      id,
      type,
      filename: bundle.filename,
      mimeType: bundle.mimeType,
      fileSize: bundle.fileSize,
      encryptedPath,
      thumbnailPath,
      nonce: finalNonce,
      thumbnailNonce,
      createdAt: bundle.createdAt,
      updatedAt: now,
      isPasswordProtected,
      passwordSalt: finalSalt,
    };

    // Update index
    const index = await getMediaIndex();
    index.unshift(metadata);
    await updateMediaIndex(index);

    return {
      id,
      type,
      filename: bundle.filename,
      mimeType: bundle.mimeType,
      fileSize: bundle.fileSize,
      encryptedPath,
      thumbnailPath,
      createdAt: bundle.createdAt,
      updatedAt: now,
    };
  } catch (error) {
    console.error('Error importing encrypted bundle:', error);
    return null;
  }
};

/**
 * Helper to generate thumbnail from a file path
 */
const generateImageThumbnailFromPath = async (
  filePath: string,
): Promise<string | null> => {
  try {
    const imageUri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
    
    const resizedImage = await ImageResizer.createResizedImage(
      imageUri,
      THUMBNAIL_MAX_SIZE,
      THUMBNAIL_MAX_SIZE,
      'JPEG',
      THUMBNAIL_QUALITY,
      0,
      undefined,
      false,
      {
        mode: 'contain',
        onlyScaleDown: true,
      }
    );

    const thumbnailPath = normalizeFileUri(resizedImage.uri);
    const base64 = await RNFS.readFile(thumbnailPath, 'base64');
    
    try {
      await RNFS.unlink(thumbnailPath);
    } catch {}

    return base64;
  } catch {
    return null;
  }
};

/**
 * Export a protected media item as a decrypted file for sharing
 * @param id - Media item ID
 * @param password - Password for the protected file
 * @returns Path to decrypted temp file, or null if failed
 */
export const exportProtectedMediaForSharing = async (
  id: string,
  password: string,
): Promise<string | null> => {
  try {
    const index = await getMediaIndex();
    const metadata = index.find((item) => item.id === id);

    if (!metadata) {
      return null;
    }

    if (!metadata.isPasswordProtected || !metadata.passwordSalt) {
      return null;
    }

    // Derive key from password
    const derivedKey = deriveKeyFromPassword(password, metadata.passwordSalt);

    // Read encrypted file
    const encryptedBase64 = await RNFS.readFile(metadata.encryptedPath, 'utf8');
    const encryptedData: EncryptedData = {
      ciphertext: encryptedBase64,
      nonce: metadata.nonce,
    };

    // Decrypt
    const decrypted = decryptBinary(encryptedData, derivedKey);
    if (!decrypted) {
      return null;
    }

    // Write to temporary directory
    const ext = getExtension(metadata.filename, metadata.mimeType);
    const tempPath = `${RNFS.TemporaryDirectoryPath}/${id}${ext}`;
    const base64 = uint8ArrayToBase64(decrypted);
    await RNFS.writeFile(tempPath, base64, 'base64');

    return tempPath;
  } catch (error) {
    console.error('Error exporting protected media:', error);
    return null;
  }
};

