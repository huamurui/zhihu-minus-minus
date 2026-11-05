import { createContext, useContext } from 'react';
import { type ColorValue, Platform, PlatformColor } from 'react-native';

// Semantic UIKit colors can follow the glass effect's local appearance as its
// backdrop changes, independently of the app's selected theme.
export const glassActionColor =
  Platform.OS === 'ios' ? PlatformColor('labelColor') : null;

export const ContentActionBarColorContext = createContext<ColorValue | null>(
  null,
);

export function useContentActionBarColor(fallback: string): ColorValue {
  return useContext(ContentActionBarColorContext) ?? fallback;
}
