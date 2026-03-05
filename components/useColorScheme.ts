import { useThemeStore } from '@/store/useThemeStore';

export const useColorScheme = () => {
  const isDark = useThemeStore((state) => state.isDark);
  return isDark ? 'dark' : 'light';
};
