# PrivatePad

A secure, encrypted notepad application for iOS and Android built with React Native. Your notes are encrypted locally using industry-standard cryptography and protected by biometric authentication.

## Features

- End-to-end encryption using TweetNaCl (NaCl crypto library)
- Biometric authentication (Face ID / Touch ID / Fingerprint)
- Notes stored locally on device - no cloud, no servers
- Auto-save with debouncing
- Dark mode support
- Simple, distraction-free writing interface

---

## Security Architecture

### Overview

PrivatePad uses a **zero-knowledge** architecture where your encryption keys never leave your device. All notes are encrypted before being written to storage, and can only be decrypted with biometric authentication.

```
┌─────────────────────────────────────────────────────────────────┐
│                        SECURITY FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   Biometric  │───▶│   Keychain   │───▶│   Secret Key     │  │
│  │     Auth     │    │   (Secure)   │    │   Retrieved      │  │
│  └──────────────┘    └──────────────┘    └────────┬─────────┘  │
│                                                    │            │
│                                                    ▼            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │  Plain Text  │───▶│   TweetNaCl  │───▶│  Encrypted Note  │  │
│  │    Note      │    │   Encrypt    │    │    (Storage)     │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Cryptographic Primitives

| Component | Algorithm | Library |
|-----------|-----------|---------|
| Symmetric Encryption | XSalsa20-Poly1305 | TweetNaCl `secretbox` |
| Key Generation | Cryptographically secure random | `react-native-get-random-values` |
| Key Storage | iOS Keychain / Android Keystore | `react-native-keychain` |
| Note Storage | AES-256 encrypted storage | `react-native-encrypted-storage` |

### Onboarding Flow (First Launch)

```
1. User enters account name (stored locally)
                    │
                    ▼
2. Generate 32-byte secret key using nacl.randomBytes()
                    │
                    ▼
3. Generate asymmetric keypair (for future features)
                    │
                    ▼
4. Store secret key in device Keychain/Keystore
   - Protected by: BIOMETRY_ANY_OR_DEVICE_PASSCODE
   - Accessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY
                    │
                    ▼
5. Store user account metadata in encrypted storage
                    │
                    ▼
6. Mark onboarding complete → Navigate to Notes
```

### Authentication Flow (Subsequent Launches)

```
1. App checks onboarding status
                    │
                    ▼
2. If completed → Request secret key from Keychain
                    │
                    ▼
3. Device prompts for Face ID / Touch ID / Passcode
                    │
                    ▼
4. On success → Secret key returned to app memory
                    │
                    ▼
5. Load and decrypt notes using secret key
                    │
                    ▼
6. Display Notes screen
```

---

## Note Storage

### How Notes Are Saved

Each note goes through the following process:

```
┌─────────────────────────────────────────────────────────────────┐
│                     NOTE SAVE PROCESS                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Note Content                                                │
│     { title: "My Note", content: "Secret text..." }             │
│                          │                                      │
│                          ▼                                      │
│  2. Serialize to JSON string                                    │
│     '{"title":"My Note","content":"Secret text..."}'            │
│                          │                                      │
│                          ▼                                      │
│  3. Generate random 24-byte nonce                               │
│     nacl.randomBytes(24)                                        │
│                          │                                      │
│                          ▼                                      │
│  4. Encrypt with TweetNaCl secretbox                            │
│     nacl.secretbox(message, nonce, secretKey)                   │
│                          │                                      │
│                          ▼                                      │
│  5. Store encrypted note                                        │
│     {                                                           │
│       id: "abc123",                                             │
│       encryptedData: "base64...",  // Ciphertext                │
│       nonce: "base64...",          // Required for decrypt      │
│       createdAt: 1234567890,                                    │
│       updatedAt: 1234567890                                     │
│     }                                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Storage Structure

```
Encrypted Storage Keys:
├── privatepad_onboarding    → "completed" | "not_started"
├── privatepad_user          → { name, createdAt, publicKey }
├── privatepad_notes_index   → [{ id, title, updatedAt }, ...]
├── privatepad_note_abc123   → { id, encryptedData, nonce, ... }
├── privatepad_note_def456   → { id, encryptedData, nonce, ... }
└── ...

Device Keychain:
└── privatepad_secret_key    → 32-byte encryption key (biometric protected)
```

### Auto-Save Behavior

- Notes auto-save after **1 second** of inactivity (debounced)
- Status bar shows character count and last save time

---

## Project Structure

```
src/
├── App.tsx                      # Root component, auth flow routing
├── types/
│   └── index.ts                 # TypeScript interfaces
├── services/
│   ├── cryptoService.ts         # TweetNaCl encrypt/decrypt
│   ├── keychainService.ts       # Biometric key storage
│   └── storageService.ts        # Note CRUD operations
├── components/
│   └── NotesDrawer.tsx          # Side menu for note selection
└── screens/
    ├── OnboardingScreen.tsx     # First-time setup flow
    └── NotesScreen.tsx          # Main editor UI
```

---

## Getting Started

### Prerequisites

- Node.js >= 18
- React Native development environment set up
- Xcode (for iOS)
- Android Studio (for Android)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd PrivatePad

# Install dependencies
npm install

# Install iOS pods
cd ios && pod install && cd ..
```

### Running the App

```bash
# Start Metro bundler
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android
```

### Testing Biometrics

**iOS Simulator:**
- Features > Face ID > Enrolled
- Features > Face ID > Matching Face (to simulate success)

**Android Emulator:**
- Extended Controls > Fingerprint > Touch sensor

---

## Security Considerations

### What's Protected

✅ Note content (title + body) - encrypted with XSalsa20-Poly1305
✅ Encryption key - stored in secure hardware (Keychain/Keystore)
✅ All storage uses react-native-encrypted-storage (AES-256)

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Device theft | Biometric auth required to access keys |
| App data extraction | Notes encrypted, key in secure enclave |
| Memory dump | Keys only in memory when authenticated |
| Man-in-the-middle | No network communication (offline only) |

### Limitations

⚠️ If device is unlocked and app is open, notes are decrypted in memory
⚠️ No cloud backup - if you lose your device, notes are lost
⚠️ Jailbroken/rooted devices have reduced security guarantees

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `react-native` | 0.77.3 - Core framework |
| `tweetnacl` | NaCl cryptographic library |
| `react-native-keychain` | Secure key storage with biometrics |
| `react-native-encrypted-storage` | Encrypted AsyncStorage |
| `react-native-get-random-values` | Crypto PRNG polyfill |

---

## License

MIT
