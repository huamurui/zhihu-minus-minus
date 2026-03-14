import { useColorScheme as useNativewindColorScheme } from 'nativewind';
import { useEffect } from 'react';
import { Appearance } from 'react-native';
import { create } from 'zustand';

interface ThemeState {
  isDark: boolean;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  isDark: Appearance.getColorScheme() === 'dark',
  toggleTheme: () => set((state) => ({ isDark: !state.isDark })),
}));

/**
 * Hook that syncs useThemeStore with NativeWind's color scheme.
 * Call this once in your root layout.
 */
export function useSyncThemeWithNativeWind() {
  const isDark = useThemeStore((state) => state.isDark);
  const { setColorScheme } = useNativewindColorScheme();

  useEffect(() => {
    setColorScheme(isDark ? 'dark' : 'light');
  }, [isDark, setColorScheme]);
}