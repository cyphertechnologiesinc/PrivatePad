import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Share,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentPicker from 'react-native-document-picker';
import RNShare from 'react-native-share';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { Note, UserAccount, AppSettings, PrivatePadEncryptedFile } from '../types';
import {
  saveNote,
  loadAllNotes,
  deleteNote as deleteNoteStorage,
  createNewNote,
  exportNoteAsEncryptedBundle,
  parseEncryptedNoteBundle,
  verifyNoteBundlePassword,
  importEncryptedNoteBundle,
  cleanupTempNoteFiles,
} from '../services/storageService';
import { getSecretKey } from '../services/keychainService';
import { useTheme } from '../context/ThemeContext';
import NotesDrawer from '../components/NotesDrawer';
import ProfileScreen from './ProfileScreen';
import PasswordModal, { PasswordModalMode } from '../components/PasswordModal';

interface NotesScreenProps {
  user: UserAccount;
  onSettingsChange?: (settings: AppSettings) => void;
  onOpenVault: () => void;
}

const NotesScreen: React.FC<NotesScreenProps> = ({ user, onSettingsChange, onOpenVault }) => {
  const { colors, isDarkMode } = useTheme();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserAccount>(user);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasChangesRef = useRef(false);

  // Share options modal state
  const [showShareOptions, setShowShareOptions] = useState(false);
  
  // Password modal state for encrypted sharing
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [passwordModalMode, setPasswordModalMode] = useState<PasswordModalMode>('set');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Import state
  const [pendingImportBundle, setPendingImportBundle] = useState<PrivatePadEncryptedFile | null>(null);

  // Load notes on mount
  useEffect(() => {
    loadNotes();
  }, []);

  // Auto-save when content changes (debounced)
  useEffect(() => {
    if (!activeNote || !secretKey) return;

    hasChangesRef.current = true;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (hasChangesRef.current) {
        handleSaveNote();
      }
    }, 1000); // Auto-save after 1 second of inactivity

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [title, content]);

  const loadNotes = async () => {
    setIsLoading(true);
    try {
      // Get the secret key with biometric auth
      const keyResult = await getSecretKey();
      if (!keyResult.success || !keyResult.value) {
        Alert.alert('Authentication Failed', 'Could not access your encryption key.');
        return;
      }

      setSecretKey(keyResult.value);

      // Load all notes
      const loadedNotes = await loadAllNotes(keyResult.value);
      setNotes(loadedNotes);

      // Select the first note or create a new one if none exist
      if (loadedNotes.length > 0) {
        selectNote(loadedNotes[0]);
      } else {
        handleNewNote(keyResult.value);
      }
    } catch (error) {
      console.error('Error loading notes:', error);
      Alert.alert('Error', 'Failed to load your notes.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectNote = (note: Note) => {
    setActiveNote(note);
    setTitle(note.title);
    setContent(note.content);
    hasChangesRef.current = false;
  };

  const handleSelectNote = (noteId: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      // Save current note before switching
      if (hasChangesRef.current && activeNote) {
        handleSaveNote();
      }
      selectNote(note);
    }
  };

  const handleNewNote = (key?: string) => {
    // Save current note before creating new
    if (hasChangesRef.current && activeNote) {
      handleSaveNote();
    }

    const newNote = createNewNote();
    setNotes((prev) => [newNote, ...prev]);
    selectNote(newNote);

    // Save the new note immediately
    const keyToUse = key || secretKey;
    if (keyToUse) {
      saveNote(newNote, keyToUse);
    }
  };

  const handleSaveNote = useCallback(async () => {
    if (!activeNote || !secretKey) return;

    setIsSaving(true);
    try {
      const updatedNote: Note = {
        ...activeNote,
        title: title || 'Untitled',
        content,
        updatedAt: Date.now(),
      };

      await saveNote(updatedNote, secretKey);

      // Update the note in the list
      setNotes((prev) =>
        prev.map((n) => (n.id === updatedNote.id ? updatedNote : n)),
      );
      setActiveNote(updatedNote);
      hasChangesRef.current = false;
    } catch (error) {
      console.error('Error saving note:', error);
    } finally {
      setIsSaving(false);
    }
  }, [activeNote, secretKey, title, content]);

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteNoteStorage(noteId);
      const updatedNotes = notes.filter((n) => n.id !== noteId);
      setNotes(updatedNotes);

      // If deleting active note, select another
      if (activeNote?.id === noteId) {
        if (updatedNotes.length > 0) {
          selectNote(updatedNotes[0]);
        } else {
          handleNewNote();
        }
      }
    } catch (error) {
      console.error('Error deleting note:', error);
      Alert.alert('Error', 'Failed to delete the note.');
    }
  };

  const handleShareNote = () => {
    if (!activeNote || !content) return;
    setShowShareOptions(true);
  };

  const handleShareAsText = async () => {
    setShowShareOptions(false);
    if (!activeNote) return;

    try {
      const noteTitle = title || 'Untitled';
      const shareContent = `${noteTitle}\n\n${content}`;

      await Share.share({
        message: shareContent,
        title: noteTitle,
      });
    } catch (error) {
      console.error('Error sharing note:', error);
    }
  };

  const handleShareEncrypted = () => {
    setShowShareOptions(false);
    setPasswordModalMode('set');
    setPasswordModalVisible(true);
  };

  const handlePasswordSubmit = async (password: string): Promise<boolean> => {
    if (!activeNote || !secretKey) return false;

    setIsProcessing(true);
    try {
      // For sharing: export the note as encrypted bundle
      if (passwordModalMode === 'set' && !pendingImportBundle) {
        // First save the current note state
        const noteToExport: Note = {
          ...activeNote,
          title: title || 'Untitled',
          content,
          updatedAt: Date.now(),
        };

        const tempPath = await exportNoteAsEncryptedBundle(noteToExport, password);
        if (tempPath) {
          setPasswordModalVisible(false);
          
          // Share the .ppenc file
          const fileUrl = Platform.OS === 'ios' ? tempPath : `file://${tempPath}`;
          const safeName = (noteToExport.title || 'note').replace(/[^a-zA-Z0-9.-]/g, '_');
          
          await RNShare.open({
            url: fileUrl,
            filename: `${safeName}.ppenc`,
            type: 'application/octet-stream',
            failOnCancel: false,
          });
          
          // Clean up
          await cleanupTempNoteFiles();
          return true;
        }
        return false;
      }
      
      // For importing: verify password and import
      if (passwordModalMode === 'enter' && pendingImportBundle) {
        const isValid = verifyNoteBundlePassword(pendingImportBundle, password);
        if (!isValid) {
          return false; // Wrong password
        }
        
        const importedNote = await importEncryptedNoteBundle(
          pendingImportBundle,
          password,
          secretKey
        );
        
        if (importedNote) {
          setPasswordModalVisible(false);
          setPendingImportBundle(null);
          
          // Add to notes list and select it
          setNotes((prev) => [importedNote, ...prev]);
          selectNote(importedNote);
          
          Alert.alert('Success', `"${importedNote.title}" imported successfully.`);
          return true;
        }
        return false;
      }
    } catch (error: any) {
      if (error?.message !== 'User did not share') {
        console.error('Error in password submit:', error);
      }
      return false;
    } finally {
      setIsProcessing(false);
    }
    return false;
  };

  const handlePasswordCancel = () => {
    setPasswordModalVisible(false);
    setPendingImportBundle(null);
  };

  const handleImportEncryptedNote = async () => {
    try {
      const results = await DocumentPicker.pick({
        type: [DocumentPicker.types.allFiles],
        copyTo: 'cachesDirectory',
      });

      const doc = results[0];
      const fileUri = doc.fileCopyUri || doc.uri;
      
      // Check if it's a .ppenc file
      if (!doc.name?.toLowerCase().endsWith('.ppenc')) {
        Alert.alert('Invalid File', 'Please select a .ppenc encrypted file.');
        return;
      }

      // Parse the bundle
      const bundle = await parseEncryptedNoteBundle(fileUri);
      
      if (!bundle) {
        Alert.alert('Invalid File', 'This file is not a valid encrypted note. It may be a media file or corrupted.');
        return;
      }

      // Store the bundle and show password modal
      setPendingImportBundle(bundle);
      setPasswordModalMode('enter');
      setPasswordModalVisible(true);
    } catch (error) {
      if (!DocumentPicker.isCancel(error)) {
        console.error('Error importing encrypted note:', error);
        Alert.alert('Error', 'Failed to import encrypted note.');
      }
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle={isDarkMode ? 'light-content' : 'dark-content'}
          backgroundColor={colors.background}
        />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Unlocking your notes...
        </Text>
      </SafeAreaView>
    );
  }

  // Show Profile Screen
  if (isProfileOpen) {
    return (
      <ProfileScreen
        user={currentUser}
        onClose={() => setIsProfileOpen(false)}
        onSettingsChange={onSettingsChange}
        onUserUpdate={(updatedUser) => setCurrentUser(updatedUser)}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={colors.headerBg}
      />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setIsDrawerOpen(true)}>
          <Text style={[styles.menuIcon, { color: colors.text }]}>|||</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <TextInput
            style={[styles.titleInput, { color: colors.text }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Note title"
            placeholderTextColor={colors.textSecondary}
            maxLength={50}
          />
        </View>

        <View style={styles.headerRight}>
          {/* Share Button */}
          <TouchableOpacity
            onPress={handleShareNote}
            style={styles.headerButton}
            disabled={!content}>
            <Text style={[styles.headerButtonIcon, { color: content ? colors.primary : colors.textSecondary }]}>
              Share
            </Text>
          </TouchableOpacity>

          {/* Save Indicator / Profile Button */}
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.primary} style={styles.savingIndicator} />
          ) : (
            <TouchableOpacity
              onPress={() => setIsProfileOpen(true)}
              style={styles.profileButton}>
              <View style={[styles.profileAvatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.profileAvatarText}>
                  {currentUser.name.charAt(0).toUpperCase()}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Editor */}
      <KeyboardAvoidingView
        style={styles.editorContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
        <TextInput
          style={[
            styles.editor,
            {
              backgroundColor: colors.inputBg,
              color: colors.text,
            },
          ]}
          value={content}
          onChangeText={setContent}
          placeholder="Start writing..."
          placeholderTextColor={colors.textSecondary}
          multiline
          textAlignVertical="top"
          autoCapitalize="sentences"
          autoCorrect
        />
      </KeyboardAvoidingView>

      {/* Status Bar */}
      <View style={[styles.statusBar, { backgroundColor: colors.headerBg, borderTopColor: colors.border }]}>
        <Text style={[styles.statusText, { color: colors.textSecondary }]}>
          {content.length} characters
        </Text>
        <Text style={[styles.statusText, { color: colors.textSecondary }]}>
          {activeNote ? `Last saved: ${new Date(activeNote.updatedAt).toLocaleTimeString()}` : ''}
        </Text>
      </View>

      {/* Notes Drawer */}
      <NotesDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        notes={notes}
        activeNoteId={activeNote?.id || null}
        onSelectNote={handleSelectNote}
        onNewNote={() => handleNewNote()}
        onDeleteNote={handleDeleteNote}
        onOpenVault={onOpenVault}
        onImportNote={handleImportEncryptedNote}
        user={currentUser}
      />

      {/* Share Options Modal */}
      <Modal
        visible={showShareOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowShareOptions(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowShareOptions(false)}
        >
          <View style={[styles.shareOptionsContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.shareOptionsTitle, { color: colors.text }]}>
              Share Note
            </Text>
            
            <TouchableOpacity
              style={[styles.shareOption, { borderBottomColor: colors.border }]}
              onPress={handleShareAsText}
            >
              <MaterialIcons name="text-snippet" size={24} color={colors.primary} style={styles.shareOptionIcon} />
              <View style={styles.shareOptionTextContainer}>
                <Text style={[styles.shareOptionText, { color: colors.text }]}>
                  Share as Text
                </Text>
                <Text style={[styles.shareOptionSubtext, { color: colors.textSecondary }]}>
                  Plain text, readable by anyone
                </Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.shareOption}
              onPress={handleShareEncrypted}
            >
              <MaterialIcons name="enhanced-encryption" size={24} color={colors.primary} style={styles.shareOptionIcon} />
              <View style={styles.shareOptionTextContainer}>
                <Text style={[styles.shareOptionText, { color: colors.text }]}>
                  Share Encrypted
                </Text>
                <Text style={[styles.shareOptionSubtext, { color: colors.textSecondary }]}>
                  Password-protected .ppenc file
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelButton, { backgroundColor: colors.border }]}
              onPress={() => setShowShareOptions(false)}
            >
              <Text style={[styles.cancelButtonText, { color: colors.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Password Modal */}
      <PasswordModal
        visible={passwordModalVisible}
        mode={passwordModalMode}
        onSubmit={handlePasswordSubmit}
        onCancel={handlePasswordCancel}
        isLoading={isProcessing}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  menuButton: {
    padding: 8,
    marginRight: 4,
  },
  menuIcon: {
    fontSize: 24,
  },
  headerCenter: {
    flex: 1,
  },
  titleInput: {
    fontSize: 18,
    fontWeight: '600',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerButton: {
    padding: 8,
  },
  headerButtonIcon: {
    fontSize: 12,
    fontWeight: '600',
  },
  savingIndicator: {
    marginHorizontal: 8,
  },
  profileButton: {
    padding: 4,
  },
  profileAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileAvatarText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  editorContainer: {
    flex: 1,
  },
  editor: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    fontSize: 17,
    lineHeight: 26,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  statusText: {
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  shareOptionsContainer: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  shareOptionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 16,
  },
  shareOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  shareOptionIcon: {
    marginRight: 16,
  },
  shareOptionTextContainer: {
    flex: 1,
  },
  shareOptionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  shareOptionSubtext: {
    fontSize: 13,
    marginTop: 2,
  },
  cancelButton: {
    marginTop: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default NotesScreen;
