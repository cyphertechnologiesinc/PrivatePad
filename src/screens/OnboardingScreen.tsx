import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  StatusBar,
  useColorScheme,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserAccount } from '../types';
import { generateSecretKey, generateKeyPair } from '../services/cryptoService';
import { storeSecretKey, getBiometryType } from '../services/keychainService';
import {
  storeUserAccount,
  storeOnboardingStatus,
} from '../services/storageService';

interface OnboardingScreenProps {
  onComplete: () => void;
}

const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const isDarkMode = useColorScheme() === 'dark';
  const [accountName, setAccountName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'welcome' | 'name' | 'setup'>('welcome');

  const colors = {
    background: isDarkMode ? '#000000' : '#FFFFFF',
    card: isDarkMode ? '#1A1A1A' : '#F8F8F8',
    primary: '#F5A862',
    primaryDark: '#E8944F',
    text: isDarkMode ? '#FFFFFF' : '#1A1A1A',
    textSecondary: isDarkMode ? '#999999' : '#666666',
    border: isDarkMode ? '#333333' : '#E5E5E5',
    inputBg: isDarkMode ? '#1A1A1A' : '#F8F8F8',
    success: '#3fb950',
    error: '#f85149',
  };

  const handleSetup = async () => {
    if (!accountName.trim()) {
      Alert.alert('Name Required', 'Please enter an account name to continue.');
      return;
    }

    setIsLoading(true);
    setStep('setup');

    try {
      // Check biometry availability
      const biometryType = await getBiometryType();
      console.log('Biometry type:', biometryType);

      // Generate encryption keys
      const secretKey = generateSecretKey();
      const keyPair = generateKeyPair();

      // Store secret key in keychain with biometric protection
      const keychainResult = await storeSecretKey(secretKey);
      
      if (!keychainResult.success) {
        throw new Error(keychainResult.error || 'Failed to store encryption key');
      }

      // Create and store user account
      const user: UserAccount = {
        name: accountName.trim(),
        createdAt: Date.now(),
        publicKey: keyPair.publicKey,
      };

      await storeUserAccount(user);
      await storeOnboardingStatus('completed');

      // Small delay to show completion
      setTimeout(() => {
        onComplete();
      }, 500);
    } catch (error) {
      console.error('Setup error:', error);
      Alert.alert(
        'Setup Failed',
        error instanceof Error ? error.message : 'An error occurred during setup.',
      );
      setStep('name');
      setIsLoading(false);
    }
  };

  const renderWelcome = () => (
    <View style={styles.stepContainer}>
      <View style={styles.logoContainer}>
        <Image
          source={require('../assets/nobgprivatepad.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>
        Welcome to PrivatePad
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Your notes, encrypted and secure.{'\n'}
        Only you can access them.
      </Text>
      <View style={styles.featureList}>
        <FeatureItem
          iconText="[E]"
          text="End-to-end encryption"
          colors={colors}
        />
        <FeatureItem
          iconText="[B]"
          text="Biometric authentication"
          colors={colors}
        />
        <FeatureItem
          iconText="[L]"
          text="Stored locally on your device"
          colors={colors}
        />
      </View>
      
      {/* Important Warnings */}
      <View style={[styles.warningContainer, { backgroundColor: colors.error + '15', borderColor: colors.error + '30' }]}>
        <Text style={[styles.warningTitle, { color: colors.error }]}>Important</Text>
        <Text style={[styles.warningText, { color: colors.textSecondary }]}>
          • Deleting this app will permanently erase all stored notes and files{'\n'}
          • After importing files, delete the originals from your device for best security
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: colors.primary }]}
        onPress={() => setStep('name')}
        activeOpacity={0.8}>
        <Text style={styles.primaryButtonText}>Get Started</Text>
      </TouchableOpacity>
    </View>
  );

  const renderNameInput = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.iconContainer, { backgroundColor: colors.primary + '15' }]}>
        <Text style={[styles.iconText, { color: colors.primary }]}>ID</Text>
      </View>
      <Text style={[styles.title, { color: colors.text }]}>
        Create Your Account
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Choose a name for your local account.{'\n'}
        This is stored only on your device.
      </Text>
      <View style={styles.inputContainer}>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.inputBg,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          placeholder="Enter your name"
          placeholderTextColor={colors.textSecondary}
          value={accountName}
          onChangeText={setAccountName}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={30}
        />
      </View>
      <TouchableOpacity
        style={[
          styles.primaryButton,
          { backgroundColor: colors.primary },
          !accountName.trim() && styles.disabledButton,
        ]}
        onPress={handleSetup}
        disabled={!accountName.trim()}
        activeOpacity={0.8}>
        <Text style={styles.primaryButtonText}>Continue</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => setStep('welcome')}>
        <Text style={[styles.backButtonText, { color: colors.textSecondary }]}>
          Back
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderSetup = () => (
    <View style={styles.stepContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.title, { color: colors.text, marginTop: 24 }]}>
        Setting up your vault...
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Generating encryption keys and securing your account.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      <KeyboardAvoidingView 
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.content}>
          {step === 'welcome' && renderWelcome()}
          {step === 'name' && renderNameInput()}
          {step === 'setup' && renderSetup()}
        </View>
        
        {/* Footer branding */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            Powered by CRYPTIC
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

interface FeatureItemProps {
  iconText: string;
  text: string;
  colors: {
    text: string;
    textSecondary: string;
    border: string;
    primary?: string;
  };
}

const FeatureItem: React.FC<FeatureItemProps> = ({ iconText, text, colors }) => (
  <View style={styles.featureItem}>
    <View style={[styles.featureIconContainer, { backgroundColor: '#F5A86215' }]}>
      <Text style={[styles.featureIconText, { color: '#F5A862' }]}>{iconText}</Text>
    </View>
    <Text style={[styles.featureText, { color: colors.textSecondary }]}>
      {text}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  stepContainer: {
    alignItems: 'center',
  },
  logoContainer: {
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 80,
    height: 80,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  iconText: {
    fontSize: 28,
    fontWeight: '700',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  featureList: {
    width: '100%',
    marginBottom: 16,
  },
  warningContainer: {
    width: '100%',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 24,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  warningText: {
    fontSize: 13,
    lineHeight: 20,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  featureIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  featureIconText: {
    fontSize: 12,
    fontWeight: '700',
  },
  featureText: {
    fontSize: 16,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 24,
  },
  input: {
    width: '100%',
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 18,
  },
  primaryButton: {
    width: '100%',
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  backButton: {
    marginTop: 16,
    padding: 12,
  },
  backButtonText: {
    fontSize: 16,
  },
  footer: {
    paddingBottom: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    letterSpacing: 1,
  },
});

export default OnboardingScreen;
