/**
 * Learn more about Light and Dark modes:
 * https://docs.expo.io/guides/color-schemes/
 */
import { Text as DefaultText, View as DefaultView } from 'react-native';

import { useColorScheme } from './useColorScheme';

import Colors from '@/constants/Colors';

type ThemeProps = {
  lightColor?: string;
  darkColor?: string;
};

export type TextProps = ThemeProps & DefaultText['props'];
export type ViewProps = ThemeProps & DefaultView['props'];

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  const theme = useColorScheme();
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}

export function Text(props: TextProps & { type?: 'default' | 'secondary' }) {
  const { style, lightColor, darkColor, type = 'default', ...otherProps } = props;
  const colorName = type === 'secondary' ? 'textSecondary' : 'text';
  const color = useThemeColor({ light: lightColor, dark: darkColor }, colorName);

  return <DefaultText style={[{ color }, style]} {...otherProps} />;
}

export function View(props: ViewProps & { type?: 'default' | 'surface' | 'border' }) {
  const { style, lightColor, darkColor, type = 'default', ...otherProps } = props;
  const colorName = type === 'surface' ? 'surface' : type === 'border' ? 'border' : 'background';
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, colorName);

  return <DefaultView style={[{ backgroundColor }, style]} {...otherProps} />;
}
