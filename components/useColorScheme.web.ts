import { useThemeStore } from '@/store/useThemeStore';

// Keep web and native on the same source of truth. Returning a hard-coded
// light scheme here made web-only components ignore theme changes.
export function useColorScheme() {
  const isDark = useThemeStore((state) => state.isDark);
  return isDark ? 'dark' : 'light';
}
