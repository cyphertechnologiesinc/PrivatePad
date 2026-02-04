import nacl from 'tweetnacl';
import { encode as encodeBase64, decode as decodeBase64 } from '@stablelib/base64';
import { encode as encodeUTF8, decode as decodeUTF8 } from '@stablelib/utf8';

// Re-export base64 utilities for external use (constant-time implementations)
export const uint8ArrayToBase64 = encodeBase64;
export const base64ToUint8Array = decodeBase64;

// Internal aliases for string/Uint8Array conversion
const stringToUint8Array = encodeUTF8;
const uint8ArrayToString = decodeUTF8;

export interface KeyPair {
  publicKey: string; // Base64 encoded
  secretKey: string; // Base64 encoded
}

export interface EncryptedData {
  ciphertext: string; // Base64 encoded
  nonce: string; // Base64 encoded
}

/**
 * Generate a new keypair for symmetric encryption using NaCl secretbox
 * We use the secretKey for symmetric encryption of notes
 */
export const generateSecretKey = (): string => {
  const key = nacl.randomBytes(nacl.secretbox.keyLength);
  return uint8ArrayToBase64(key);
};

/**
 * Generate an asymmetric keypair (for potential future use like sharing)
 */
export const generateKeyPair = (): KeyPair => {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: uint8ArrayToBase64(keyPair.publicKey),
    secretKey: uint8ArrayToBase64(keyPair.secretKey),
  };
};

/**
 * Encrypt plaintext using symmetric encryption (secretbox)
 */
export const encrypt = (
  plaintext: string,
  secretKeyBase64: string,
): EncryptedData => {
  const secretKey = base64ToUint8Array(secretKeyBase64);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const message = stringToUint8Array(plaintext);

  const ciphertext = nacl.secretbox(message, nonce, secretKey);

  return {
    ciphertext: uint8ArrayToBase64(ciphertext),
    nonce: uint8ArrayToBase64(nonce),
  };
};

/**
 * Decrypt ciphertext using symmetric encryption (secretbox)
 */
export const decrypt = (
  encryptedData: EncryptedData,
  secretKeyBase64: string,
): string | null => {
  const secretKey = base64ToUint8Array(secretKeyBase64);
  const nonce = base64ToUint8Array(encryptedData.nonce);
  const ciphertext = base64ToUint8Array(encryptedData.ciphertext);

  const decrypted = nacl.secretbox.open(ciphertext, nonce, secretKey);

  if (!decrypted) {
    return null;
  }

  return uint8ArrayToString(decrypted);
};

/**
 * Derive a deterministic hash from a string (for generating IDs)
 */
export const generateId = (): string => {
  const randomBytes = nacl.randomBytes(16);
  return uint8ArrayToBase64(randomBytes).replace(/[+/=]/g, '').substring(0, 16);
};

/**
 * Encrypt binary data (Uint8Array) using symmetric encryption (secretbox)
 * Used for encrypting files/media
 */
export const encryptBinary = (
  data: Uint8Array,
  secretKeyBase64: string,
): EncryptedData => {
  const secretKey = base64ToUint8Array(secretKeyBase64);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

  const ciphertext = nacl.secretbox(data, nonce, secretKey);

  return {
    ciphertext: uint8ArrayToBase64(ciphertext),
    nonce: uint8ArrayToBase64(nonce),
  };
};

/**
 * Decrypt binary data using symmetric encryption (secretbox)
 * Returns raw Uint8Array for file/media data
 */
export const decryptBinary = (
  encryptedData: EncryptedData,
  secretKeyBase64: string,
): Uint8Array | null => {
  const secretKey = base64ToUint8Array(secretKeyBase64);
  const nonce = base64ToUint8Array(encryptedData.nonce);
  const ciphertext = base64ToUint8Array(encryptedData.ciphertext);

  const decrypted = nacl.secretbox.open(ciphertext, nonce, secretKey);

  return decrypted || null;
};
