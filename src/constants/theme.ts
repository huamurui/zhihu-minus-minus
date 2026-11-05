import {
  argbFromHex,
  Blend,
  DynamicColor,
  Hct,
  hexFromArgb,
  TonalPalette,
} from '@material/material-color-utilities';
import {
  contrastingText,
  readableColor,
  rgbChannels,
  withAlpha,
} from '@/utils/colorContrast';
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
  description: string;
}> = [
  { value: 'default', label: '随主题', description: '清亮底色，轻染主题色' },
  { value: 'soft', label: '柔灰', description: '柔和灰底，降低明暗反差' },
  { value: 'warm', label: '暖纸', description: '米色纸感，偏暖文字' },
  { value: 'dim', label: '低亮', description: '压低页面和卡片亮度' },
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

/** 未读角标：红色数字（默认）、主题色数字、小圆点或不显示。 */
export type UnreadBadgeStyle = 'count' | 'tinted' | 'dot' | 'hidden';

export const UNREAD_BADGE_STYLE_OPTIONS: ReadonlyArray<{
  value: UnreadBadgeStyle;
  label: string;
}> = [
  { value: 'count', label: '红色数字' },
  { value: 'tinted', label: '主题色数字' },
  { value: 'dot', label: '小圆点' },
  { value: 'hidden', label: '不显示' },
];

type ThemeColorMap = Record<ColorToken, string>;
export type RuntimeThemeColors = ThemeColorMap & {
  onPrimary: string;
  onDanger: string;
  onSuccess: string;
  onWarning: string;
  link: string;
};

// Text primitives and legacy Colors often request the same palette together.
// Bound the cache so dragging the custom color picker cannot retain every seed.
const paletteCache = new Map<string, RuntimeThemeColors>();
const readingPresets = designTokens.themeAdjustments.readingBackground;

export function resolveThemeColors(
  colorScheme: ColorScheme,
  preferences: ThemePreferences,
): RuntimeThemeColors {
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const hasCustomPrimary = /^#[\da-f]{6}$/i.test(
    preferences.primaryColor ?? '',
  );
  const primary = hasCustomPrimary
    ? (preferences.primaryColor as string).toLowerCase()
    : colors.light.primary;
  const reading = Object.hasOwn(readingPresets, preferences.readingBackground)
    ? preferences.readingBackground
    : 'default';
  const highContrast = preferences.textContrast === 'high';
  const flat = preferences.surfaceStyle === 'flat';
  const key = `${scheme}:${primary}:${hasCustomPrimary}:${reading}:${highContrast}:${flat}`;
  const cached = paletteCache.get(key);
  if (cached) return cached;

  const preset = readingPresets[reading];
  const tones = preset[scheme];
  const seed = argbFromHex(primary);
  const seedHct = Hct.fromInt(seed);
  const channels = rgbChannels(primary);
  const isNeutralSeed = Math.max(...channels) - Math.min(...channels) < 3;
  const chroma = isNeutralSeed ? 0 : seedHct.chroma;
  // Warm paper stays warm: Material harmonization shifts its hue by at most 15°.
  const neutralHue =
    reading === 'warm'
      ? Hct.fromInt(
          isNeutralSeed
            ? argbFromHex('#e3bf82')
            : Blend.harmonize(argbFromHex('#e3bf82'), seed),
        ).hue
      : seedHct.hue;
  const neutral = TonalPalette.fromHueAndChroma(
    neutralHue,
    reading === 'warm' ? preset.chroma : Math.min(chroma, preset.chroma),
  );
  const tone = (value: number) => hexFromArgb(neutral.tone(value));
  const resolved: ThemeColorMap = { ...colors[scheme] };

  resolved.primary = primary;
  resolved.tint = primary;
  if (hasCustomPrimary) resolved.tabIconSelected = primary;
  // Preserve the existing accent and alpha recipes for icons and light buttons.
  if (primary !== colors.light.primary.toLowerCase()) {
    resolved.primaryTransparent = `${primary}26`;
  }
  resolved.background = tone(tones.background);
  resolved.backgroundSecondary = tone(flat ? tones.background : tones.surface);
  resolved.backgroundTertiary = tone(
    flat ? tones.background : tones.surfaceVariant,
  );
  resolved.surface = resolved.backgroundSecondary;
  resolved.controlBackground = resolved.backgroundTertiary;
  resolved.chatBubble = resolved.backgroundTertiary;
  resolved.border = tone(tones.border);
  resolved.controlBorder = resolved.border;

  const backgrounds = [
    resolved.background,
    resolved.backgroundSecondary,
    resolved.backgroundTertiary,
  ];
  const textTones = highContrast
    ? designTokens.themeAdjustments.textContrast.high[scheme]
    : tones;
  resolved.text = readableColor(
    tone(textTones.text),
    backgrounds,
    highContrast ? 7 : 4.5,
  );
  resolved.textSecondary = readableColor(
    tone(textTones.textSecondary),
    backgrounds,
  );
  resolved.textTertiary = readableColor(
    tone(textTones.textTertiary),
    backgrounds,
  );
  // Longer emphasized text keeps the existing readability adjustment. Accent
  // controls continue to use the unmodified primary color instead of this role.
  const link = readableColor(primary, backgrounds);
  resolved.textInverse = tone(scheme === 'light' ? 98 : 8);
  resolved.divider = withAlpha(resolved.text, scheme === 'light' ? 0.09 : 0.14);
  resolved.pressedOverlay = withAlpha(resolved.text, 0.07);
  resolved.contentBorder = withAlpha(resolved.textSecondary, 0.16);
  resolved.contentBorderStrong = withAlpha(resolved.textSecondary, 0.24);
  resolved.contentPlaceholder = withAlpha(resolved.textSecondary, 0.08);
  resolved.contentOverlay = withAlpha(resolved.surface, 0.92);
  resolved.contentOverlayStrong = withAlpha(resolved.surface, 0.85);
  resolved.whiteTransparent = withAlpha(resolved.surface, 0.85);
  resolved.blackTransparent = resolved.scrim;
  resolved.toastSurface = tone(14);

  const palette: RuntimeThemeColors = Object.freeze({
    ...resolved,
    // Match the fill's perceptual tone, independent of page appearance. Material
    // prefers white below rounded T60, including the unchanged brand blue.
    // This visual preference guarantees 3:1, not the 4.5:1 used for body text.
    onPrimary: DynamicColor.tonePrefersLightForeground(seedHct.tone)
      ? '#ffffff'
      : '#000000',
    onDanger: contrastingText(resolved.danger),
    onSuccess: contrastingText(resolved.success),
    onWarning: contrastingText(resolved.warning),
    link,
  });
  if (paletteCache.size >= 64) {
    const oldest = paletteCache.keys().next().value;
    if (oldest !== undefined) paletteCache.delete(oldest);
  }
  paletteCache.set(key, palette);
  return palette;
}
