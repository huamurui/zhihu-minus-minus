import { colors, designTokens } from './designTokens';

export type ReadingBackground = 'default' | 'soft' | 'warm' | 'dim';
export type TextContrast = 'standard' | 'high';
export type SurfaceStyle = 'layered' | 'flat';

export interface ThemePreferences {
  primaryColor: string | null;
  readingBackground: ReadingBackground;
  textContrast: TextContrast;
  surfaceStyle: SurfaceStyle;
}

export const READING_BACKGROUND_OPTIONS: ReadonlyArray<{
  value: ReadingBackground;
  label: string;
}> = [
  { value: 'default', label: '默认' },
  { value: 'soft', label: '柔和' },
  { value: 'warm', label: '暖色' },
  { value: 'dim', label: '低亮' },
];

export const TEXT_CONTRAST_OPTIONS: ReadonlyArray<{
  value: TextContrast;
  label: string;
}> = [
  { value: 'standard', label: '标准' },
  { value: 'high', label: '高对比' },
];

export const SURFACE_STYLE_OPTIONS: ReadonlyArray<{
  value: SurfaceStyle;
  label: string;
}> = [
  { value: 'layered', label: '分层' },
  { value: 'flat', label: '扁平' },
];

type ThemeColorMap = Record<string, string>;

type ThemeAdjustmentTokens = {
  readingBackground: Record<
    ReadingBackground,
    Record<'light' | 'dark', Partial<ThemeColorMap>>
  >;
  textContrast: Record<
    TextContrast,
    Record<'light' | 'dark', Partial<ThemeColorMap>>
  >;
};

const themeAdjustmentTokens = designTokens.themeAdjustments as
  | ThemeAdjustmentTokens
  | undefined;

export function resolveThemeColors(
  colorScheme: 'light' | 'dark',
  preferences: ThemePreferences,
): ThemeColorMap {
  const resolved = { ...colors[colorScheme] } as ThemeColorMap;
  const adjustmentTokens = themeAdjustmentTokens;

  if (adjustmentTokens) {
    Object.assign(
      resolved,
      adjustmentTokens.readingBackground[preferences.readingBackground][
        colorScheme
      ],
      adjustmentTokens.textContrast[preferences.textContrast][colorScheme],
    );
  }

  if (preferences.surfaceStyle === 'flat') {
    resolved.backgroundSecondary = resolved.background;
    resolved.backgroundTertiary = resolved.background;
    resolved.surface = resolved.background;
  }

  const primaryColor = preferences.primaryColor;
  if (primaryColor) {
    const isDefaultPrimary =
      primaryColor.toLowerCase() === colors.light.primary.toLowerCase();
    resolved.primary = primaryColor;
    resolved.tint = primaryColor;
    resolved.tabIconSelected = primaryColor;
    if (!isDefaultPrimary) {
      resolved.primaryTransparent = `${primaryColor}26`;
    }
  }

  return resolved;
}
