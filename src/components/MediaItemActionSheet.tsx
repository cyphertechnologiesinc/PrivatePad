import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTheme } from '../context/ThemeContext';

interface MediaItemActionSheetProps {
  visible: boolean;
  isPasswordProtected: boolean;
  onSetPassword: () => void;
  onRemovePassword: () => void;
  onShareDecrypted?: () => void;
  onShareEncrypted?: () => void;
  onDelete: () => void;
  onCancel: () => void;
  itemName?: string;
}

const MediaItemActionSheet: React.FC<MediaItemActionSheetProps> = ({
  visible,
  isPasswordProtected,
  onSetPassword,
  onRemovePassword,
  onShareDecrypted,
  onShareEncrypted,
  onDelete,
  onCancel,
  itemName,
}) => {
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onCancel}
      >
        <View style={[styles.container, { backgroundColor: colors.card }]}>
          {/* Title */}
          {itemName && (
            <Text 
              style={[styles.title, { color: colors.text }]} 
              numberOfLines={1}
            >
              {itemName}
            </Text>
          )}

          {/* Share Options for Password Protected Items */}
          {isPasswordProtected && onShareDecrypted && (
            <TouchableOpacity
              style={[styles.option, { borderBottomColor: colors.border }]}
              onPress={onShareDecrypted}
            >
              <MaterialIcons 
                name="share" 
                size={24} 
                color={colors.primary} 
                style={styles.optionIcon} 
              />
              <View style={styles.optionTextContainer}>
                <Text style={[styles.optionText, { color: colors.text }]}>
                  Share Decrypted
                </Text>
                <Text style={[styles.optionSubtext, { color: colors.textSecondary }]}>
                  Export as plain file
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {isPasswordProtected && onShareEncrypted && (
            <TouchableOpacity
              style={[styles.option, { borderBottomColor: colors.border }]}
              onPress={onShareEncrypted}
            >
              <MaterialIcons 
                name="enhanced-encryption" 
                size={24} 
                color={colors.primary} 
                style={styles.optionIcon} 
              />
              <View style={styles.optionTextContainer}>
                <Text style={[styles.optionText, { color: colors.text }]}>
                  Share Encrypted (.ppenc)
                </Text>
                <Text style={[styles.optionSubtext, { color: colors.textSecondary }]}>
                  Recipient needs password to open
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Password Option */}
          {isPasswordProtected ? (
            <TouchableOpacity
              style={[styles.option, { borderBottomColor: colors.border }]}
              onPress={onRemovePassword}
            >
              <MaterialIcons 
                name="lock-open" 
                size={24} 
                color={colors.primary} 
                style={styles.optionIcon} 
              />
              <View style={styles.optionTextContainer}>
                <Text style={[styles.optionText, { color: colors.text }]}>
                  Remove Password
                </Text>
                <Text style={[styles.optionSubtext, { color: colors.textSecondary }]}>
                  Unlock this item
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.option, { borderBottomColor: colors.border }]}
              onPress={onSetPassword}
            >
              <MaterialIcons 
                name="lock-outline" 
                size={24} 
                color={colors.primary} 
                style={styles.optionIcon} 
              />
              <View style={styles.optionTextContainer}>
                <Text style={[styles.optionText, { color: colors.text }]}>
                  Set Password
                </Text>
                <Text style={[styles.optionSubtext, { color: colors.textSecondary }]}>
                  Add extra protection
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Delete Option */}
          <TouchableOpacity
            style={[styles.option, { borderBottomColor: colors.border }]}
            onPress={onDelete}
          >
            <MaterialIcons 
              name="delete-outline" 
              size={24} 
              color="#e74c3c" 
              style={styles.optionIcon} 
            />
            <View style={styles.optionTextContainer}>
              <Text style={[styles.optionText, { color: '#e74c3c' }]}>
                Secure Delete
              </Text>
              <Text style={[styles.optionSubtext, { color: colors.textSecondary }]}>
                Permanently erase with overwrite
              </Text>
            </View>
          </TouchableOpacity>

          {/* Cancel Button */}
          <TouchableOpacity
            style={[styles.cancelButton, { backgroundColor: colors.border }]}
            onPress={onCancel}
          >
            <Text style={[styles.cancelText, { color: colors.text }]}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  container: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  optionIcon: {
    marginRight: 16,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  optionSubtext: {
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
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default MediaItemActionSheet;

