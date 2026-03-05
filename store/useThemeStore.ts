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