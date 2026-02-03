import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useColorScheme, ColorSchemeName } from 'react-native';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  card: string;
  headerBg: string;
  primary: string;
  primaryDark: string;
  text: string;
  textSecondary: string;
  border: string;
  inputBg: string;
  success: string;
  error: string;
  danger: string;
  overlay: string;
  activeItem: string;
}

const lightColors: ThemeColors = {
  background: '#f6f8fa',
  card: '#ffffff',
  headerBg: '#f6f8fa',
  primary: '#58a6ff',
  primaryDark: '#1f6feb',
  text: '#24292f',
  textSecondary: '#57606a',
  border: '#d0d7de',
  inputBg: '#ffffff',
  success: '#3fb950',
  error: '#f85149',
  danger: '#f85149',
  overlay: 'rgba(0, 0, 0, 0.5)',
  activeItem: '#f3f4f6',
};

const darkColors: ThemeColors = {
  background: '#0d1117',
  card: '#161b22',
  headerBg: '#161b22',
  primary: '#58a6ff',
  primaryDark: '#1f6feb',
  text: '#c9d1d9',
  textSecondary: '#8b949e',
  border: '#30363d',
  inputBg: '#0d1117',
  success: '#3fb950',
  error: '#f85149',
  danger: '#f85149',
  overlay: 'rgba(0, 0, 0, 0.7)',
  activeItem: '#21262d',
};

interface ThemeContextType {
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
  isDarkMode: boolean;
  colors: ThemeColors;
  themeMode: ThemeMode;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  initialPreference?: ThemePreference;
  onPreferenceChange?: (preference: ThemePreference) => void;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  initialPreference = 'system',
  onPreferenceChange,
}) => {
  const systemColorScheme = useColorScheme();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(initialPreference);

  // Update when initialPreference changes (loaded from storage)
  useEffect(() => {
    setThemePreferenceState(initialPreference);
  }, [initialPreference]);

  const setThemePreference = (preference: ThemePreference) => {
    setThemePreferenceState(preference);
    onPreferenceChange?.(preference);
  };

  const themeMode: ThemeMode = useMemo(() => {
    if (themePreference === 'system') {
      return systemColorScheme === 'dark' ? 'dark' : 'light';
    }
    return themePreference;
  }, [themePreference, systemColorScheme]);

  const isDarkMode = themeMode === 'dark';
  const colors = isDarkMode ? darkColors : lightColors;

  const value = useMemo(
    () => ({
      themePreference,
      setThemePreference,
      isDarkMode,
      colors,
      themeMode,
    }),
    [themePreference, isDarkMode, colors, themeMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export { lightColors, darkColors };

