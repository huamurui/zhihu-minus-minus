import {
  type ColorScheme,
  type ColorToken,
  colors,
  designTokens,
} from './designTokens';

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

type ThemeColorMap = Record<ColorToken, string>;

type ThemeAdjustmentTokens = {
  readingBackground: Record<
    ReadingBackground,
    Record<ColorScheme, ThemeColorMap>
  >;
  textContrast: Record<
    TextContrast,
    Record<
      ColorScheme,
      Partial<Pick<ThemeColorMap, 'text' | 'textSecondary' | 'textTertiary'>>
    >
  >;
};

// Default uses the base palette directly; every other preset must be complete.
const themeAdjustmentTokens: ThemeAdjustmentTokens = {
  readingBackground: {
    default: colors,
    ...designTokens.themeAdjustments.readingBackground,
  },
  textContrast: designTokens.themeAdjustments.textContrast,
};

export function resolveThemeColors(
  colorScheme: ColorScheme,
  preferences: ThemePreferences,
): ThemeColorMap {
  const resolved: ThemeColorMap = {
    ...themeAdjustmentTokens.readingBackground[preferences.readingBackground][
      colorScheme
    ],
    // Standard keeps the preset's text palette; high contrast overrides it.
    ...themeAdjustmentTokens.textContrast[preferences.textContrast][
      colorScheme
    ],
  };

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
