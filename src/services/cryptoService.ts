import nacl from 'tweetnacl';

// React Native compatible base64 encoding/decoding
const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Helper to convert Uint8Array to base64 (React Native compatible)
export const uint8ArrayToBase64 = (arr: Uint8Array): string => {
  let result = '';
  const len = arr.length;
  
  for (let i = 0; i < len; i += 3) {
    const a = arr[i];
    const b = i + 1 < len ? arr[i + 1] : 0;
    const c = i + 2 < len ? arr[i + 2] : 0;
    
    result += base64Chars[a >> 2];
    result += base64Chars[((a & 3) << 4) | (b >> 4)];
    result += i + 1 < len ? base64Chars[((b & 15) << 2) | (c >> 6)] : '=';
    result += i + 2 < len ? base64Chars[c & 63] : '=';
  }
  
  return result;
};

// Helper to convert base64 to Uint8Array (React Native compatible)
export const base64ToUint8Array = (base64: string): Uint8Array => {
  // Remove padding
  const cleanBase64 = base64.replace(/=+$/, '');
  const len = cleanBase64.length;
  const bufferLength = Math.floor((len * 3) / 4);
  const arr = new Uint8Array(bufferLength);
  
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = base64Chars.indexOf(cleanBase64[i]);
    const b = base64Chars.indexOf(cleanBase64[i + 1]);
    const c = i + 2 < len ? base64Chars.indexOf(cleanBase64[i + 2]) : 0;
    const d = i + 3 < len ? base64Chars.indexOf(cleanBase64[i + 3]) : 0;
    
    arr[p++] = (a << 2) | (b >> 4);
    if (p < bufferLength) arr[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < bufferLength) arr[p++] = ((c & 3) << 6) | d;
  }
  
  return arr;
};

// Helper to convert string to Uint8Array (React Native compatible)
const stringToUint8Array = (str: string): Uint8Array => {
  const utf8: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let charCode = str.charCodeAt(i);
    if (charCode < 0x80) {
      utf8.push(charCode);
    } else if (charCode < 0x800) {
      utf8.push(0xc0 | (charCode >> 6), 0x80 | (charCode & 0x3f));
    } else if (charCode < 0xd800 || charCode >= 0xe000) {
      utf8.push(
        0xe0 | (charCode >> 12),
        0x80 | ((charCode >> 6) & 0x3f),
        0x80 | (charCode & 0x3f),
      );
    } else {
      // Surrogate pair
      i++;
      charCode = 0x10000 + (((charCode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      utf8.push(
        0xf0 | (charCode >> 18),
        0x80 | ((charCode >> 12) & 0x3f),
        0x80 | ((charCode >> 6) & 0x3f),
        0x80 | (charCode & 0x3f),
      );
    }
  }
  return new Uint8Array(utf8);
};

// Helper to convert Uint8Array to string (React Native compatible)
const uint8ArrayToString = (arr: Uint8Array): string => {
  let result = '';
  let i = 0;
  while (i < arr.length) {
    const c1 = arr[i++];
    if (c1 < 128) {
      result += String.fromCharCode(c1);
    } else if (c1 > 191 && c1 < 224) {
      const c2 = arr[i++];
      result += String.fromCharCode(((c1 & 31) << 6) | (c2 & 63));
    } else if (c1 > 223 && c1 < 240) {
      const c2 = arr[i++];
      const c3 = arr[i++];
      result += String.fromCharCode(((c1 & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
    } else {
      const c2 = arr[i++];
      const c3 = arr[i++];
      const c4 = arr[i++];
      const codePoint =
        ((c1 & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63);
      result += String.fromCodePoint(codePoint);
    }
  }
  return result;
};

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
