import * as SecureStore from 'expo-secure-store';
import { colorScheme as nativewindColorScheme } from 'nativewind';
import { useEffect } from 'react';
import {
  Appearance,
  Platform,
  type TurboModule,
  TurboModuleRegistry,
} from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemeMode = 'system' | 'light' | 'dark';

interface NativeAppearanceModule extends TurboModule {
  setColorScheme: (style: 'light' | 'dark' | 'unspecified') => void;
}

interface ThemeState {
  isDark: boolean;
  hasHydrated: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  markHydrated: () => void;
}

const themeStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) =>
    SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};

function resolveIsDark(mode: ThemeMode): boolean {
  return mode === 'system'
    ? Appearance.getColorScheme() === 'dark'
    : mode === 'dark';
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

interface PersistedThemeState {
  themeMode: ThemeMode;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      isDark: resolveIsDark('system'),
      hasHydrated: false,
      setThemeMode: (mode) =>
        set({ themeMode: mode, isDark: resolveIsDark(mode) }),
      // Keep the binary toggle for callers that still need a quick manual
      // override; the settings UI uses setThemeMode for all three modes.
      toggleTheme: () =>
        set((state) => {
          const mode: ThemeMode = state.isDark ? 'light' : 'dark';
          return { themeMode: mode, isDark: mode === 'dark' };
        }),
      markHydrated: () => set({ hasHydrated: true }),
    }),
    {
      name: 'zhihu-theme-storage',
      storage: createJSONStorage(() => themeStorage),
      version: 1,
      partialize: (state): PersistedThemeState => ({
        themeMode: state.themeMode,
      }),
      // `isDark` is derived state and must be recalculated after async
      // SecureStore hydration, especially when the stored mode is `system`.
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setThemeMode(
            isThemeMode(state.themeMode) ? state.themeMode : 'system',
          );
          state.markHydrated();
        } else {
          // If SecureStore fails, keep the in-memory system default usable
          // and do not leave the splash screen visible indefinitely.
          useThemeStore.setState({ hasHydrated: true });
        }
      },
    },
  ),
);

// Keep the app in sync when the OS appearance changes while the user is in
// system mode. This listener is registered once because the Zustand store is
// a module singleton.
Appearance.addChangeListener(({ colorScheme }) => {
  const state = useThemeStore.getState();
  if (state.themeMode === 'system') {
    useThemeStore.setState({ isDark: colorScheme === 'dark' });
  }
});

/**
 * Hook that syncs useThemeStore with NativeWind's color scheme.
 * Call this once in your root layout.
 */
export function useSyncThemeWithNativeWind() {
  const themeMode = useThemeStore((state) => state.themeMode);

  useEffect(() => {
    if (Platform.OS === 'web') {
      nativewindColorScheme.set(themeMode);
      return;
    }

    // NativeWind 4 passes null for system; RN 0.83 requires `unspecified`.
    // Call the native module so RN's JS setter cannot cache `unspecified`
    // as a resolved color. Native events update both Appearance and NativeWind;
    // when the effective color is unchanged, their existing caches stay valid.
    TurboModuleRegistry.get<NativeAppearanceModule>(
      'Appearance',
    )?.setColorScheme(themeMode === 'system' ? 'unspecified' : themeMode);
  }, [themeMode]);
}
