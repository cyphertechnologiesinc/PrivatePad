import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Switch,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Clipboard from '@react-native-clipboard/clipboard';
import { useTheme, ThemePreference } from '../context/ThemeContext';
import { UserAccount, AppSettings, DEFAULT_SETTINGS } from '../types';
import {
  getAppSettings,
  setThemePreference as saveThemePreference,
  setRequireAuthOnLaunch,
} from '../services/storageService';
import { getBiometryType } from '../services/keychainService';

interface ProfileScreenProps {
  user: UserAccount;
  onClose: () => void;
  onSettingsChange?: (settings: AppSettings) => void;
}

// Crypto wallet addresses - replace with your actual addresses
const CRYPTO_WALLETS = {
  bitcoin: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  ethereum: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
  solana: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
};

const ProfileScreen: React.FC<ProfileScreenProps> = ({
  user,
  onClose,
  onSettingsChange,
}) => {
  const { colors, themePreference, setThemePreference, isDarkMode } = useTheme();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [biometryType, setBiometryType] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedWallet, setCopiedWallet] = useState<string | null>(null);
  const [securityInfoExpanded, setSecurityInfoExpanded] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [loadedSettings, bioType] = await Promise.all([
        getAppSettings(),
        getBiometryType(),
      ]);
      setSettings(loadedSettings);
      setBiometryType(bioType);
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleThemeChange = async (preference: ThemePreference) => {
    setThemePreference(preference);
    await saveThemePreference(preference);
    const newSettings = { ...settings, themePreference: preference };
    setSettings(newSettings);
    onSettingsChange?.(newSettings);
  };

  const handleAuthOnLaunchChange = async (value: boolean) => {
    await setRequireAuthOnLaunch(value);
    const newSettings = { ...settings, requireAuthOnLaunch: value };
    setSettings(newSettings);
    onSettingsChange?.(newSettings);
  };

  const getBiometryLabel = (): string => {
    switch (biometryType) {
      case 'FaceID':
        return 'Face ID';
      case 'TouchID':
        return 'Touch ID';
      case 'Fingerprint':
        return 'Fingerprint';
      default:
        return 'Biometrics';
    }
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const copyToClipboard = (walletType: string, address: string) => {
    Clipboard.setString(address);
    setCopiedWallet(walletType);
    setTimeout(() => setCopiedWallet(null), 2000);
  };

  const openBuyMeCoffee = async () => {
    // Replace 'your-username' with your actual Buy Me a Coffee username
    const url = 'https://cryptictechnologies.co';
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Unable to open link');
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to open link');
    }
  };

  const truncateAddress = (address: string): string => {
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={colors.headerBg}
      />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}> Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Section */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.profileHeader}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>
                {user.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: colors.text }]}>
                {user.name}
              </Text>
              <Text style={[styles.profileDate, { color: colors.textSecondary }]}>
                Member since {formatDate(user.createdAt)}
              </Text>
            </View>
          </View>
        </View>

        {/* Appearance Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          APPEARANCE
        </Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Theme</Text>
          <View style={styles.themeOptions}>
            {(['light', 'dark', 'system'] as ThemePreference[]).map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.themeOption,
                  {
                    backgroundColor:
                      themePreference === option ? colors.primary : colors.inputBg,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => handleThemeChange(option)}>
                <Text
                  style={[
                    styles.themeOptionText,
                    {
                      color:
                        themePreference === option ? '#ffffff' : colors.text,
                    },
                  ]}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Security Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          SECURITY
        </Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                Require {getBiometryLabel()} on Launch
              </Text>
              <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                Authenticate each time you open the app
              </Text>
            </View>
            <Switch
              value={settings.requireAuthOnLaunch}
              onValueChange={handleAuthOnLaunchChange}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#ffffff"
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                Screenshot Prevention
              </Text>
              <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                Screenshots and screen recording are blocked
              </Text>
            </View>
            <View style={[styles.alwaysOnBadge, { backgroundColor: colors.success + '20' }]}>
              <Text style={[styles.alwaysOnText, { color: colors.success }]}>
                Always On
              </Text>
            </View>
          </View>
        </View>

        {/* Data Security Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          DATA SECURITY
        </Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={styles.securityHeaderRow}
            onPress={() => setSecurityInfoExpanded(!securityInfoExpanded)}
            activeOpacity={0.7}
          >
            <View style={styles.securityHeaderLeft}>
              <MaterialIcons name="shield" size={24} color={colors.primary} />
              <View style={styles.securityHeaderText}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>
                  How Your Data is Protected
                </Text>
                <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                  Learn about our security measures
                </Text>
              </View>
            </View>
            <Ionicons
              name={securityInfoExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {securityInfoExpanded && (
            <View style={styles.securityContent}>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Hardware-Backed Key Storage */}
              <View style={styles.securityItem}>
                <View style={[styles.securityIconBg, { backgroundColor: colors.primary + '15' }]}>
                  <MaterialIcons name="hardware" size={20} color={colors.primary} />
                </View>
                <View style={styles.securityItemContent}>
                  <Text style={[styles.securityItemTitle, { color: colors.text }]}>
                    Hardware-Backed Key Storage
                  </Text>
                  <Text style={[styles.securityItemDesc, { color: colors.textSecondary }]}>
                    {Platform.OS === 'ios'
                      ? 'Your encryption keys are stored in the iOS Keychain, protected by the Secure Enclave - a dedicated hardware security processor.'
                      : 'Your encryption keys are stored in the Android Keystore, backed by hardware security modules (HSM) when available on your device.'}
                  </Text>
                </View>
              </View>

              {/* Military-Grade Encryption */}
              <View style={styles.securityItem}>
                <View style={[styles.securityIconBg, { backgroundColor: colors.primary + '15' }]}>
                  <MaterialIcons name="lock" size={20} color={colors.primary} />
                </View>
                <View style={styles.securityItemContent}>
                  <Text style={[styles.securityItemTitle, { color: colors.text }]}>
                    Military-Grade Encryption
                  </Text>
                  <Text style={[styles.securityItemDesc, { color: colors.textSecondary }]}>
                    All your notes and files are encrypted using XSalsa20-Poly1305, an authenticated encryption algorithm used by security professionals worldwide.
                  </Text>
                </View>
              </View>

              {/* Local-Only Storage */}
              <View style={styles.securityItem}>
                <View style={[styles.securityIconBg, { backgroundColor: colors.primary + '15' }]}>
                  <MaterialIcons name="smartphone" size={20} color={colors.primary} />
                </View>
                <View style={styles.securityItemContent}>
                  <Text style={[styles.securityItemTitle, { color: colors.text }]}>
                    100% Local Storage
                  </Text>
                  <Text style={[styles.securityItemDesc, { color: colors.textSecondary }]}>
                    Your data never leaves your device. There are no cloud servers, no sync services, and no network transmission. Your data stays with you.
                  </Text>
                </View>
              </View>

              {/* App Sandboxing */}
              <View style={styles.securityItem}>
                <View style={[styles.securityIconBg, { backgroundColor: colors.primary + '15' }]}>
                  <MaterialIcons name="security" size={20} color={colors.primary} />
                </View>
                <View style={styles.securityItemContent}>
                  <Text style={[styles.securityItemTitle, { color: colors.text }]}>
                    App Sandboxing
                  </Text>
                  <Text style={[styles.securityItemDesc, { color: colors.textSecondary }]}>
                    {Platform.OS === 'ios'
                      ? 'iOS app sandbox prevents other apps from accessing PrivatePad data. Each app has its own isolated storage container.'
                      : 'Android app sandbox isolates PrivatePad data from other apps. No other application can read your encrypted notes or files.'}
                  </Text>
                </View>
              </View>

              {/* Screenshot Prevention */}
              <View style={[styles.securityItem, { marginBottom: 0 }]}>
                <View style={[styles.securityIconBg, { backgroundColor: colors.primary + '15' }]}>
                  <MaterialIcons name="visibility-off" size={20} color={colors.primary} />
                </View>
                <View style={styles.securityItemContent}>
                  <Text style={[styles.securityItemTitle, { color: colors.text }]}>
                    Screenshot & Recording Prevention
                  </Text>
                  <Text style={[styles.securityItemDesc, { color: colors.textSecondary }]}>
                    Screenshots and screen recordings are blocked to prevent unauthorized capture of your sensitive information.
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Support Us Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          SUPPORT US
        </Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.coffeeButton, { backgroundColor: '#FFDD00' }]}
            onPress={openBuyMeCoffee}
            activeOpacity={0.8}>
            <View style={styles.coffeeButtonContent}>
              <Text style={styles.coffeeEmoji}>☕</Text>
              <View style={styles.coffeeTextContainer}>
                <Text style={styles.coffeeButtonTitle}>Buy us a coffee</Text>
                <Text style={styles.coffeeButtonSubtitle}>Support development</Text>
              </View>
            </View>
            <Ionicons name="open-outline" size={18} color="#000000" />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Text style={[styles.cryptoTitle, { color: colors.text }]}>
            Tip in Crypto
          </Text>
          <Text style={[styles.cryptoSubtitle, { color: colors.textSecondary }]}>
            Tap to copy wallet address
          </Text>

          {/* Bitcoin */}
          <TouchableOpacity
            style={[styles.walletRow, { backgroundColor: colors.inputBg }]}
            onPress={() => copyToClipboard('bitcoin', CRYPTO_WALLETS.bitcoin)}
            activeOpacity={0.7}>
            <View style={[styles.walletIcon, { backgroundColor: '#F7931A' }]}>
              <Text style={styles.walletIconText}>₿</Text>
            </View>
            <View style={styles.walletInfo}>
              <Text style={[styles.walletName, { color: colors.text }]}>Bitcoin</Text>
              <Text style={[styles.walletAddress, { color: colors.textSecondary }]}>
                {truncateAddress(CRYPTO_WALLETS.bitcoin)}
              </Text>
            </View>
            {copiedWallet === 'bitcoin' ? (
              <View style={[styles.copiedBadge, { backgroundColor: colors.success + '20' }]}>
                <Text style={[styles.copiedText, { color: colors.success }]}>Copied!</Text>
              </View>
            ) : (
              <Ionicons name="copy-outline" size={20} color={colors.textSecondary} />
            )}
          </TouchableOpacity>

          {/* Ethereum */}
          <TouchableOpacity
            style={[styles.walletRow, { backgroundColor: colors.inputBg }]}
            onPress={() => copyToClipboard('ethereum', CRYPTO_WALLETS.ethereum)}
            activeOpacity={0.7}>
            <View style={[styles.walletIcon, { backgroundColor: '#627EEA' }]}>
              <Text style={styles.walletIconText}>Ξ</Text>
            </View>
            <View style={styles.walletInfo}>
              <Text style={[styles.walletName, { color: colors.text }]}>Ethereum</Text>
              <Text style={[styles.walletAddress, { color: colors.textSecondary }]}>
                {truncateAddress(CRYPTO_WALLETS.ethereum)}
              </Text>
            </View>
            {copiedWallet === 'ethereum' ? (
              <View style={[styles.copiedBadge, { backgroundColor: colors.success + '20' }]}>
                <Text style={[styles.copiedText, { color: colors.success }]}>Copied!</Text>
              </View>
            ) : (
              <Ionicons name="copy-outline" size={20} color={colors.textSecondary} />
            )}
          </TouchableOpacity>

          {/* Solana */}
          <TouchableOpacity
            style={[styles.walletRow, { backgroundColor: colors.inputBg }]}
            onPress={() => copyToClipboard('solana', CRYPTO_WALLETS.solana)}
            activeOpacity={0.7}>
            <View style={[styles.walletIcon, { backgroundColor: '#9945FF' }]}>
              <Text style={styles.walletIconText}>◎</Text>
            </View>
            <View style={styles.walletInfo}>
              <Text style={[styles.walletName, { color: colors.text }]}>Solana</Text>
              <Text style={[styles.walletAddress, { color: colors.textSecondary }]}>
                {truncateAddress(CRYPTO_WALLETS.solana)}
              </Text>
            </View>
            {copiedWallet === 'solana' ? (
              <View style={[styles.copiedBadge, { backgroundColor: colors.success + '20' }]}>
                <Text style={[styles.copiedText, { color: colors.success }]}>Copied!</Text>
              </View>
            ) : (
              <Ionicons name="copy-outline" size={20} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
        </View>

        {/* Legal Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          LEGAL
        </Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={styles.legalRow}
            onPress={() => Linking.openURL('https://app.termly.io/policy-viewer/policy.html?policyUUID=2eb9766a-e053-4de8-91d8-df102e31708e')}
            activeOpacity={0.7}>
            <View style={styles.legalRowLeft}>
              <MaterialIcons name="privacy-tip" size={22} color={colors.primary} />
              <Text style={[styles.legalRowText, { color: colors.text }]}>Privacy Policy</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <TouchableOpacity
            style={styles.legalRow}
            onPress={() => Linking.openURL('https://app.termly.io/policy-viewer/policy.html?policyUUID=b1b039af-95ef-4164-8a25-6e320e89dd0e')}
            activeOpacity={0.7}>
            <View style={styles.legalRowLeft}>
              <MaterialIcons name="description" size={22} color={colors.primary} />
              <Text style={[styles.legalRowText, { color: colors.text }]}>Terms & Conditions</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* About Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          ABOUT
        </Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.aboutRow}>
            <Text style={[styles.aboutLabel, { color: colors.text }]}>Version</Text>
            <Text style={[styles.aboutValue, { color: colors.textSecondary }]}>
              1.0.0
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.aboutRow}>
            <Text style={[styles.aboutLabel, { color: colors.text }]}>
              Encryption
            </Text>
            <Text style={[styles.aboutValue, { color: colors.textSecondary }]}>
              XSalsa20-Poly1305
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.aboutRow}>
            <Text style={[styles.aboutLabel, { color: colors.text }]}>
              Key Storage
            </Text>
            <Text style={[styles.aboutValue, { color: colors.textSecondary }]}>
              {biometryType ? `${getBiometryLabel()} Protected` : 'Device Keychain'}
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            Your notes are encrypted and stored locally
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  backText: {
    fontSize: 17,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  headerRight: {
    width: 60,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
    marginLeft: 4,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '600',
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  profileDate: {
    fontSize: 14,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
  },
  themeOptions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  themeOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  themeOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  alwaysOnBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  alwaysOnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aboutLabel: {
    fontSize: 16,
  },
  aboutValue: {
    fontSize: 16,
  },
  footer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
  },
  coffeeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
  },
  coffeeButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  coffeeEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  coffeeTextContainer: {
    flexDirection: 'column',
  },
  coffeeButtonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  coffeeButtonSubtitle: {
    fontSize: 13,
    color: '#333333',
    marginTop: 2,
  },
  cryptoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  cryptoSubtitle: {
    fontSize: 13,
    marginBottom: 16,
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  walletIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  walletIconText: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: '700',
  },
  walletInfo: {
    flex: 1,
  },
  walletName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  walletAddress: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  copiedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  copiedText: {
    fontSize: 12,
    fontWeight: '600',
  },
  securityHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  securityHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  securityHeaderText: {
    marginLeft: 12,
    flex: 1,
  },
  securityContent: {
    marginTop: 0,
  },
  securityItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  securityIconBg: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  securityItemContent: {
    flex: 1,
  },
  securityItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  securityItemDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  legalRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legalRowText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 12,
  },
});

export default ProfileScreen;
