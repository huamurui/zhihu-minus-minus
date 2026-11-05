/**
 * Themed primitives.
 *
 * Now that NativeWind handles dark mode via className `dark:` variants,
 * these wrappers simply apply default colors for backward compatibility
 * with components that still pass a `type` prop.
 *
 * New components can use plain RN <Text>/<View> with className directly.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, useMemo } from 'react';
import {
  Text as DefaultText,
  View as DefaultView,
  StyleSheet,
  type TextStyle,
} from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { useContentActionBarColor } from '@/components/ContentActionBarColor';
import type Colors from '@/constants/Colors';
import { typography } from '@/constants/designTokens';
import { resolveThemeColors } from '@/constants/theme';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useColorScheme } from './useColorScheme';

type ThemeProps = {
  lightColor?: string;
  darkColor?: string;
};

export type TextProps = ThemeProps & ComponentProps<typeof DefaultText>;
export type ViewProps = ThemeProps & ComponentProps<typeof DefaultView>;

export function useRuntimeThemeColors() {
  const theme = useColorScheme();
  const preferences = useSettingsStore(
    useShallow((state) => ({
      primaryColor: state.primaryColor,
      readingBackground: state.readingBackground,
      textContrast: state.textContrast,
      surfaceStyle: state.surfaceStyle,
    })),
  );
  return useMemo(
    () => resolveThemeColors(theme, preferences),
    [theme, preferences],
  );
}

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: (keyof typeof Colors.light & keyof typeof Colors.dark) | string,
) {
  const theme = useColorScheme();
  const themeColors = useRuntimeThemeColors();
  const colorFromProps = props[theme];
  if (colorFromProps) return colorFromProps;
  const opacityHex = /^primary_([0-9a-f]{2})$/i.exec(colorName)?.[1];
  if (opacityHex) return `${themeColors.primary}${opacityHex}`;
  if (colorName === 'warning') return themeColors.warningAccent;
  return (
    themeColors[colorName as keyof typeof themeColors] ?? themeColors.primary
  );
}

export function Text(
  props: TextProps & {
    type?:
      | 'default'
      | 'secondary'
      | 'tertiary'
      | 'primary'
      | 'danger'
      | 'title'
      | 'subtitle'
      | 'caption';
  },
) {
  const {
    style,
    lightColor,
    darkColor,
    type = 'default',
    ...otherProps
  } = props;

  let colorName: keyof typeof Colors.light & keyof typeof Colors.dark = 'text';
  let defaultFontSize = typography.fontSize.body;
  let defaultFontWeight: TextStyle['fontWeight'] = 'normal';

  if (type === 'secondary') {
    colorName = 'textSecondary';
  } else if (type === 'tertiary') {
    colorName = 'textTertiary';
  } else if (type === 'primary') {
    colorName = 'link';
  } else if (type === 'danger') {
    colorName = 'danger';
  } else if (type === 'title') {
    colorName = 'text';
    defaultFontSize = typography.fontSize.title;
    defaultFontWeight = 'bold';
  } else if (type === 'subtitle') {
    colorName = 'text';
    defaultFontSize = typography.fontSize.subtitle;
    defaultFontWeight = '600';
  } else if (type === 'caption') {
    colorName = 'textSecondary';
    defaultFontSize = typography.fontSize.caption;
  }

  const color = useThemeColor(
    { light: lightColor, dark: darkColor },
    colorName,
  );
  const actionBarColor = useContentActionBarColor(color);

  const { fontSizeScale, lineHeightScale } = useSettingsStore(
    useShallow((state) => ({
      fontSizeScale: state.fontSizeScale,
      lineHeightScale: state.lineHeightScale,
    })),
  );

  const flattenedStyle = StyleSheet.flatten(style) || {};
  const currentFontSize = flattenedStyle.fontSize || defaultFontSize;
  const currentLineHeight = flattenedStyle.lineHeight || currentFontSize * 1.5;

  const finalStyle: TextStyle = {
    ...flattenedStyle,
    color:
      flattenedStyle.color ||
      (lightColor ||
      darkColor ||
      !['default', 'secondary', 'tertiary', 'caption'].includes(type)
        ? color
        : actionBarColor),
    fontSize: currentFontSize * fontSizeScale,
    lineHeight: (currentLineHeight * fontSizeScale * lineHeightScale) / 1.5,
    ...((flattenedStyle.fontWeight ||
      type === 'title' ||
      type === 'subtitle') && {
      fontWeight: flattenedStyle.fontWeight || defaultFontWeight,
    }),
  };

  return <DefaultText style={finalStyle} {...otherProps} />;
}

export function View(
  props: ViewProps & {
    type?:
      | 'default'
      | 'surface'
      | 'border'
      | 'secondary'
      | 'tertiary'
      | 'divider'
      | 'primaryTransparent';
  },
) {
  const { style, lightColor, darkColor, type, ...otherProps } = props;

  let colorName: keyof typeof Colors.light & keyof typeof Colors.dark =
    'background';
  if (type === 'surface' || type === 'secondary')
    colorName = 'backgroundSecondary';
  else if (type === 'border') colorName = 'border';
  else if (type === 'tertiary') colorName = 'backgroundTertiary';
  else if (type === 'divider') colorName = 'divider';
  else if (type === 'primaryTransparent') colorName = 'primaryTransparent';

  const themedBackgroundColor = useThemeColor(
    { light: lightColor, dark: darkColor },
    colorName,
  );
  const backgroundColor = type ? themedBackgroundColor : undefined;

  return <DefaultView style={[{ backgroundColor }, style]} {...otherProps} />;
}

export function ThemedIcon(
  props: Omit<React.ComponentProps<typeof Ionicons>, 'color'> & {
    colorType?:
      | 'default'
      | 'secondary'
      | 'tertiary'
      | 'primary'
      | 'danger'
      | 'warning'
      | 'success';
    lightColor?: string;
    darkColor?: string;
  },
) {
  const {
    colorType = 'default',
    lightColor,
    darkColor,
    name,
    size = 24,
    ...otherProps
  } = props;

  let colorName: keyof typeof Colors.light & keyof typeof Colors.dark = 'text';
  if (colorType === 'secondary') colorName = 'textSecondary';
  else if (colorType === 'tertiary') colorName = 'textTertiary';
  else if (colorType === 'primary') colorName = 'primary';
  else if (colorType === 'danger') colorName = 'danger';
  else if (colorType === 'warning') colorName = 'warning';
  else if (colorType === 'success') colorName = 'success';

  const color = useThemeColor(
    { light: lightColor, dark: darkColor },
    colorName,
  );
  const actionBarColor = useContentActionBarColor(color);

  return (
    <Ionicons
      name={name}
      size={size}
      color={
        lightColor ||
        darkColor ||
        !['default', 'secondary', 'tertiary'].includes(colorType)
          ? color
          : actionBarColor
      }
      {...otherProps}
    />
  );
}
