import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { Note, UserAccount } from '../types';
import { useTheme } from '../context/ThemeContext';
import SwipeableNoteItem from './SwipeableNoteItem';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = SCREEN_WIDTH * 0.8;

interface NotesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  activeNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onNewNote: () => void;
  onDeleteNote: (noteId: string) => void;
  onOpenVault: () => void;
  user: UserAccount | null;
}

const NotesDrawer: React.FC<NotesDrawerProps> = ({
  isOpen,
  onClose,
  notes,
  activeNoteId,
  onSelectNote,
  onNewNote,
  onDeleteNote,
  onOpenVault,
  user,
}) => {
  const { colors } = useTheme();
  const slideAnim = React.useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  React.useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isOpen ? 0 : -DRAWER_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [isOpen, slideAnim]);

  if (!isOpen) {
    return null;
  }

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="none"
      onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <TouchableOpacity
          style={[styles.overlay, { backgroundColor: colors.overlay }]}
          activeOpacity={1}
          onPress={onClose}
        />
        <Animated.View
          style={[
            styles.drawer,
            {
              backgroundColor: colors.background,
              transform: [{ translateX: slideAnim }],
            },
          ]}>
          <SafeAreaView style={styles.drawerContent}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <View style={styles.userInfo}>
                <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                  <Text style={styles.avatarText}>
                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                  </Text>
                </View>
                <View style={styles.userTextContainer}>
                  <Text style={[styles.userName, { color: colors.text }]}>
                    {user?.name || 'User'}
                  </Text>
                  <Text style={[styles.userSubtitle, { color: colors.textSecondary }]}>
                    {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Text style={[styles.closeIcon, { color: colors.textSecondary }]}>
                  X
                </Text>
              </TouchableOpacity>
            </View>

            {/* New Note Button */}
            <TouchableOpacity
              style={[styles.newNoteButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                onNewNote();
                onClose();
              }}
              activeOpacity={0.8}>
              <Text style={styles.newNoteIcon}>+</Text>
              <Text style={styles.newNoteText}>New Note</Text>
            </TouchableOpacity>

            {/* Secure Vault Button */}
            <TouchableOpacity
              style={[styles.vaultButton, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                onOpenVault();
                onClose();
              }}
              activeOpacity={0.8}>
              <MaterialIcons name="lock" size={24} color={colors.primary} style={styles.vaultIcon} />
              <View style={styles.vaultTextContainer}>
                <Text style={[styles.vaultText, { color: colors.text }]}>Secure Vault</Text>
                <Text style={[styles.vaultSubtext, { color: colors.textSecondary }]}>
                  Photos, videos & files
                </Text>
              </View>
              <Text style={[styles.vaultArrow, { color: colors.textSecondary }]}>›</Text>
            </TouchableOpacity>

            {/* Swipe Hint */}
            <View style={styles.swipeHint}>
              <Text style={[styles.swipeHintText, { color: colors.textSecondary }]}>
                Swipe left to delete
              </Text>
            </View>

            {/* Notes List */}
            <ScrollView style={styles.notesList} showsVerticalScrollIndicator={false}>
              {notes.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={[styles.emptyIconContainer, { backgroundColor: colors.primary + '15' }]}>
                    <Text style={[styles.emptyIconText, { color: colors.primary }]}>N</Text>
                  </View>
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No notes yet
                  </Text>
                  <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                    Tap "New Note" to get started
                  </Text>
                </View>
              ) : (
                notes.map((note) => (
                  <SwipeableNoteItem
                    key={note.id}
                    note={note}
                    isActive={note.id === activeNoteId}
                    onPress={() => {
                      onSelectNote(note.id);
                      onClose();
                    }}
                    onDelete={() => onDeleteNote(note.id)}
                  />
                ))
              )}
            </ScrollView>

            {/* Footer */}
            <View style={[styles.footer, { borderTopColor: colors.border }]}>
              <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                All notes encrypted
              </Text>
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  drawer: {
    width: DRAWER_WIDTH,
    height: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  drawerContent: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  userTextContainer: {
    marginLeft: 12,
  },
  userName: {
    fontSize: 17,
    fontWeight: '600',
  },
  userSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  closeButton: {
    padding: 8,
  },
  closeIcon: {
    fontSize: 20,
  },
  newNoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginVertical: 16,
    paddingVertical: 14,
    borderRadius: 10,
  },
  newNoteIcon: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
    marginRight: 8,
  },
  newNoteText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  vaultButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  vaultIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  vaultTextContainer: {
    flex: 1,
  },
  vaultText: {
    fontSize: 15,
    fontWeight: '600',
  },
  vaultSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  vaultArrow: {
    fontSize: 24,
    fontWeight: '300',
  },
  swipeHint: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  swipeHintText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  notesList: {
    flex: 1,
    paddingHorizontal: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyIconText: {
    fontSize: 28,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '500',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
  },
});

export default NotesDrawer;
