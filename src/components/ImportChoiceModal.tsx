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

interface ImportChoiceModalProps {
  visible: boolean;
  filename: string;
  onKeepProtected: () => void;
  onRemoveProtection: () => void;
  onCancel: () => void;
}

const ImportChoiceModal: React.FC<ImportChoiceModalProps> = ({
  visible,
  filename,
  onKeepProtected,
  onRemoveProtection,
  onCancel,
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
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.container, { backgroundColor: colors.card }]}>
            {/* Header */}
            <View style={styles.header}>
              <MaterialIcons name="check-circle" size={40} color="#27ae60" />
              <Text style={[styles.title, { color: colors.text }]}>
                Password Verified
              </Text>
              <Text style={[styles.filename, { color: colors.textSecondary }]} numberOfLines={1}>
                {filename}
              </Text>
            </View>

            {/* Question */}
            <Text style={[styles.question, { color: colors.text }]}>
              How would you like to store this file?
            </Text>

            {/* Options */}
            <TouchableOpacity
              style={[styles.option, { borderColor: colors.border }]}
              onPress={onKeepProtected}
            >
              <View style={[styles.optionIcon, { backgroundColor: colors.primary + '20' }]}>
                <MaterialIcons name="lock" size={24} color={colors.primary} />
              </View>
              <View style={styles.optionContent}>
                <Text style={[styles.optionTitle, { color: colors.text }]}>
                  Keep Password Protected
                </Text>
                <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                  You'll need to enter the password each time you view this file
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.option, { borderColor: colors.border }]}
              onPress={onRemoveProtection}
            >
              <View style={[styles.optionIcon, { backgroundColor: '#27ae60' + '20' }]}>
                <MaterialIcons name="lock-open" size={24} color="#27ae60" />
              </View>
              <View style={styles.optionContent}>
                <Text style={[styles.optionTitle, { color: colors.text }]}>
                  Remove Password
                </Text>
                <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                  File will be protected by your vault encryption only
                </Text>
              </View>
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity
              style={[styles.cancelButton, { backgroundColor: colors.border }]}
              onPress={onCancel}
            >
              <Text style={[styles.cancelText, { color: colors.text }]}>
                Cancel Import
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  container: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    padding: 24,
    // Remove any box shadow
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 12,
  },
  filename: {
    fontSize: 14,
    marginTop: 4,
  },
  question: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 12,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  optionDesc: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  cancelButton: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ImportChoiceModal;

