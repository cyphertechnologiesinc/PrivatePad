import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTheme } from '../context/ThemeContext';

export type PasswordModalMode = 'set' | 'enter' | 'remove';

interface PasswordModalProps {
  visible: boolean;
  mode: PasswordModalMode;
  onSubmit: (password: string) => Promise<boolean>;
  onCancel: () => void;
  isLoading?: boolean;
}

const PasswordModal: React.FC<PasswordModalProps> = ({
  visible,
  mode,
  onSubmit,
  onCancel,
  isLoading = false,
}) => {
  const { colors } = useTheme();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  
  const passwordInputRef = useRef<TextInput>(null);
  const confirmInputRef = useRef<TextInput>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (visible) {
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setError(null);
      // Focus the input after modal opens
      setTimeout(() => passwordInputRef.current?.focus(), 100);
    }
  }, [visible]);

  const getTitle = (): string => {
    switch (mode) {
      case 'set':
        return 'Set Password';
      case 'enter':
        return 'Enter Password';
      case 'remove':
        return 'Remove Password';
      default:
        return 'Password';
    }
  };

  const getSubtitle = (): string => {
    switch (mode) {
      case 'set':
        return 'Create a password to protect this item. You\'ll need it to view the file.';
      case 'enter':
        return 'This item is password protected. Enter the password to view.';
      case 'remove':
        return 'Enter the current password to remove protection.';
      default:
        return '';
    }
  };

  const getPasswordStrength = (pwd: string): { level: number; text: string; color: string } => {
    if (pwd.length === 0) return { level: 0, text: '', color: colors.textSecondary };
    if (pwd.length < 4) return { level: 1, text: 'Too short', color: '#e74c3c' };
    if (pwd.length < 6) return { level: 2, text: 'Weak', color: '#e67e22' };
    if (pwd.length < 8) return { level: 3, text: 'Fair', color: '#f1c40f' };
    
    const hasUppercase = /[A-Z]/.test(pwd);
    const hasLowercase = /[a-z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
    const varietyScore = [hasUppercase, hasLowercase, hasNumber, hasSpecial].filter(Boolean).length;
    
    if (pwd.length >= 12 && varietyScore >= 3) return { level: 5, text: 'Strong', color: '#27ae60' };
    if (pwd.length >= 8 && varietyScore >= 2) return { level: 4, text: 'Good', color: '#2ecc71' };
    return { level: 3, text: 'Fair', color: '#f1c40f' };
  };

  const validateAndSubmit = async () => {
    setError(null);

    // Validation
    if (password.length === 0) {
      setError('Please enter a password');
      return;
    }

    if (mode === 'set') {
      if (password.length < 4) {
        setError('Password must be at least 4 characters');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }

    setProcessing(true);
    try {
      const success = await onSubmit(password);
      if (!success) {
        if (mode === 'enter' || mode === 'remove') {
          setError('Incorrect password');
        } else {
          setError('Failed to set password');
        }
      }
    } catch (err) {
      setError('An error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const strength = mode === 'set' ? getPasswordStrength(password) : null;
  const isSubmitting = processing || isLoading;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
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
                <MaterialIcons 
                  name={mode === 'set' ? 'lock-outline' : 'lock'} 
                  size={32} 
                  color={colors.primary} 
                />
                <Text style={[styles.title, { color: colors.text }]}>
                  {getTitle()}
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {getSubtitle()}
                </Text>
              </View>

              {/* Password Input */}
              <View style={styles.inputContainer}>
                <View style={[styles.inputWrapper, { borderColor: error ? '#e74c3c' : colors.border }]}>
                  <TextInput
                    ref={passwordInputRef}
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Password"
                    placeholderTextColor={colors.textSecondary}
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      setError(null);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType={mode === 'set' ? 'next' : 'done'}
                    onSubmitEditing={() => {
                      if (mode === 'set') {
                        confirmInputRef.current?.focus();
                      } else {
                        validateAndSubmit();
                      }
                    }}
                    editable={!isSubmitting}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeButton}
                  >
                    <MaterialIcons
                      name={showPassword ? 'visibility-off' : 'visibility'}
                      size={22}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                {/* Password Strength Indicator (only for set mode) */}
                {mode === 'set' && strength && strength.level > 0 && (
                  <View style={styles.strengthContainer}>
                    <View style={styles.strengthBars}>
                      {[1, 2, 3, 4, 5].map((level) => (
                        <View
                          key={level}
                          style={[
                            styles.strengthBar,
                            {
                              backgroundColor: level <= strength.level 
                                ? strength.color 
                                : colors.border,
                            },
                          ]}
                        />
                      ))}
                    </View>
                    <Text style={[styles.strengthText, { color: strength.color }]}>
                      {strength.text}
                    </Text>
                  </View>
                )}

                {/* Confirm Password (only for set mode) */}
                {mode === 'set' && (
                  <View style={[styles.inputWrapper, { borderColor: error ? '#e74c3c' : colors.border, marginTop: 12 }]}>
                    <TextInput
                      ref={confirmInputRef}
                      style={[styles.input, { color: colors.text }]}
                      placeholder="Confirm Password"
                      placeholderTextColor={colors.textSecondary}
                      secureTextEntry={!showPassword}
                      value={confirmPassword}
                      onChangeText={(text) => {
                        setConfirmPassword(text);
                        setError(null);
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={validateAndSubmit}
                      editable={!isSubmitting}
                    />
                  </View>
                )}

                {/* Error Message */}
                {error && (
                  <Text style={styles.errorText}>{error}</Text>
                )}
              </View>

              {/* Buttons */}
              <View style={styles.buttons}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton, { borderColor: colors.border }]}
                  onPress={onCancel}
                  disabled={isSubmitting}
                >
                  <Text style={[styles.buttonText, { color: colors.text }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.submitButton, { backgroundColor: colors.primary }]}
                  onPress={validateAndSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={[styles.buttonText, { color: '#fff' }]}>
                      {mode === 'set' ? 'Set Password' : mode === 'remove' ? 'Remove' : 'Unlock'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 16,
  },
  eyeButton: {
    padding: 8,
  },
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  strengthBars: {
    flexDirection: 'row',
    gap: 4,
    flex: 1,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  strengthText: {
    fontSize: 12,
    fontWeight: '500',
    width: 60,
    textAlign: 'right',
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  submitButton: {},
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default PasswordModal;

