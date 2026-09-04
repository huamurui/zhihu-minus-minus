/**
 * Themed primitives.
 *
 * Now that NativeWind handles dark mode via className `dark:` variants,
 * these wrappers simply apply default colors for backward compatibility
 * with components that still pass a `type` prop.
 *
 * New components can use plain RN <Text>/<View> with className directly.
 */

import { Ionicons } from '@expo/vector-icons';
import {
  Text as DefaultText,
  View as DefaultView,
  StyleSheet,
  type TextStyle,
} from 'react-native';
import Colors from '@/constants/Colors';
import { typography } from '@/constants/designTokens';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useColorScheme } from './useColorScheme';

type ThemeProps = {
  lightColor?: string;
  darkColor?: string;
};

export type TextProps = ThemeProps & DefaultText['props'];
export type ViewProps = ThemeProps & DefaultView['props'];

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: (keyof typeof Colors.light & keyof typeof Colors.dark) | string,
) {
  const theme = useColorScheme();
  const { primaryColor } = useSettingsStore();
  const colorFromProps = props[theme];
  const resolvedPrimaryColor = primaryColor || Colors[theme].primary;
  const hasCustomPrimaryColor =
    !!primaryColor &&
    primaryColor.toLowerCase() !== Colors.light.primary.toLowerCase();

  if (colorFromProps) {
    return colorFromProps;
  }

  // Support dynamic transparent variations of the primaryColor via 'primary_XX' where XX is hex opacity
  if (primaryColor) {
    if (
      colorName === 'primary' ||
      colorName === 'tint' ||
      colorName === 'tabIconSelected'
    ) {
      return resolvedPrimaryColor;
    }
    if (colorName === 'primaryTransparent') {
      return hasCustomPrimaryColor
        ? `${resolvedPrimaryColor}26`
        : Colors[theme].primaryTransparent;
    }
    if (colorName === 'warning') {
      return Colors[theme].warningAccent;
    }
    if (typeof colorName === 'string' && colorName.startsWith('primary_')) {
      const opacityHex = colorName.split('_')[1];
      if (opacityHex && opacityHex.length === 2) {
        return `${resolvedPrimaryColor}${opacityHex}`;
      }
    }
  } else {
    // If primaryColor is null, use the default theme primary/tint color from constants
    if (
      colorName === 'primary' ||
      colorName === 'tint' ||
      colorName === 'tabIconSelected'
    ) {
      return Colors[theme].primary;
    }
    if (colorName === 'primaryTransparent') {
      return Colors[theme].primaryTransparent;
    }
  }

  if (colorName === 'warning') {
    return Colors[theme].warningAccent;
  }

  // Fallback to static mapping
  const staticKey = colorName as keyof typeof Colors.light &
    keyof typeof Colors.dark;
  if (staticKey && Colors[theme][staticKey]) {
    return Colors[theme][staticKey];
  }
  return Colors[theme].primary;
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
    colorName = 'primary';
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

  const { fontSizeScale, lineHeightScale } = useSettingsStore();

  const flattenedStyle = StyleSheet.flatten(style) || {};
  const currentFontSize = flattenedStyle.fontSize || defaultFontSize;
  const currentLineHeight = flattenedStyle.lineHeight || currentFontSize * 1.5;

  const finalStyle: TextStyle = {
    ...flattenedStyle,
    color: flattenedStyle.color || color,
    fontSize: currentFontSize * fontSizeScale,
    lineHeight: (currentLineHeight * lineHeightScale) / 1.5, // 修正比例
  };

  if (flattenedStyle.fontWeight || type === 'title' || type === 'subtitle') {
    finalStyle.fontWeight = flattenedStyle.fontWeight || defaultFontWeight;
  }

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

  return <Ionicons name={name} size={size} color={color} {...otherProps} />;
}
