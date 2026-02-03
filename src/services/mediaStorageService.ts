import RNFS from 'react-native-fs';
import EncryptedStorage from 'react-native-encrypted-storage';
import { Image, Platform } from 'react-native';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import {
  MediaItem,
  MediaType,
  EncryptedMediaMetadata,
  STORAGE_KEYS,
} from '../types';
import {
  encryptBinary,
  decryptBinary,
  generateId,
  base64ToUint8Array,
  uint8ArrayToBase64,
  EncryptedData,
} from './cryptoService';

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
 * Delete media by ID
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

