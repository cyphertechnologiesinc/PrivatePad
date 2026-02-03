/**
 * PrivatePad - A secure notepad application
 * Root App Component
 * 
 * Note: Screenshot prevention is handled natively:
 * - Android: FLAG_SECURE in MainActivity.kt
 * - iOS: Handled via AppDelegate or info.plist settings
 */

import React, { useState, useEffect, useCallback } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BootSplash from 'react-native-bootsplash';
import SplashScreen from './screens/SplashScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import NotesScreen from './screens/NotesScreen';
import MediaVaultScreen from './screens/MediaVaultScreen';
import { ThemeProvider, ThemePreference } from './context/ThemeContext';
import {
  UserAccount,
  OnboardingStatus,
  AppSettings,
  DEFAULT_SETTINGS,
} from './types';
import {
  getUserAccount,
  getOnboardingStatus,
  getAppSettings,
  setThemePreference,
} from './services/storageService';
import { hasSecretKey } from './services/keychainService';

type AppScreen = 'splash' | 'onboarding' | 'notes' | 'vault';

const AppContent = (): React.JSX.Element => {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('splash');
  const [user, setUser] = useState<UserAccount | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    const minSplashTime = 2000; // 2 seconds minimum for branding visibility
    const startTime = Date.now();

    // Hide the native splash screen once JS is ready
    // This reveals our JS SplashScreen which matches the native one
    if (!nativeSplashHidden) {
      await BootSplash.hide({ fade: true });
      setNativeSplashHidden(true);
    }

    // Check initial state
    const nextScreen = await checkInitialState();

    // Ensure minimum splash time for branding
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, minSplashTime - elapsed);

    setTimeout(() => {
      setCurrentScreen(nextScreen);
    }, remaining);
  };

  const checkInitialState = async (): Promise<'onboarding' | 'notes'> => {
    try {
      // Load app settings
      const loadedSettings = await getAppSettings();
      setSettings(loadedSettings);

      // Check onboarding status
      const onboardingStatus: OnboardingStatus = await getOnboardingStatus();

      if (onboardingStatus !== 'completed') {
        return 'onboarding';
      }

      // Check if we have a secret key stored
      const keyExists = await hasSecretKey();
      if (!keyExists) {
        return 'onboarding';
      }

      // Get user account
      const userAccount = await getUserAccount();
      if (!userAccount) {
        return 'onboarding';
      }

      setUser(userAccount);
      return 'notes';
    } catch (error) {
      console.error('Error checking initial state:', error);
      return 'onboarding';
    }
  };

  const handleOnboardingComplete = async () => {
    // Reload user data
    const userAccount = await getUserAccount();
    setUser(userAccount);
    setCurrentScreen('notes');
  };

  const handleSettingsChange = useCallback((newSettings: AppSettings) => {
    setSettings(newSettings);
  }, []);

  if (currentScreen === 'splash') {
    return <SplashScreen />;
  }

  if (currentScreen === 'onboarding') {
    return <OnboardingScreen onComplete={handleOnboardingComplete} />;
  }

  if (currentScreen === 'notes' && user) {
    return (
      <NotesScreen 
        user={user} 
        onSettingsChange={handleSettingsChange}
        onOpenVault={() => setCurrentScreen('vault')}
      />
    );
  }

  if (currentScreen === 'vault' && user) {
    return (
      <MediaVaultScreen 
        user={user}
        onClose={() => setCurrentScreen('notes')}
      />
    );
  }

  // Fallback to splash
  return <SplashScreen />;
};

const App = (): React.JSX.Element => {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    loadThemePreference();
  }, []);

  const loadThemePreference = async () => {
    try {
      const settings = await getAppSettings();
      setThemePreferenceState(settings.themePreference);
    } catch (error) {
      console.error('Error loading theme preference:', error);
    } finally {
      setIsReady(true);
    }
  };

  const handleThemePreferenceChange = useCallback(
    async (preference: ThemePreference) => {
      setThemePreferenceState(preference);
      await setThemePreference(preference);
    },
    [],
  );

  // Show nothing while loading preferences - native splash is still visible
  if (!isReady) {
    return <SplashScreen />;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider
        initialPreference={themePreference}
        onPreferenceChange={handleThemePreferenceChange}>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
};

export default App;
