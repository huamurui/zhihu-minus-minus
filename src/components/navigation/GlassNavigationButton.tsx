import Ionicons from '@expo/vector-icons/Ionicons';
import type { GlassEffectStyleConfig, GlassStyle } from 'expo-glass-effect';
import type React from 'react';
import {
  type Insets,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { BouncyButton } from '@/components/BouncyButton';
import {
  FloatingSurface,
  useIsLiquidGlassActive,
} from '@/components/surfaces/FloatingSurface';
import { useColorScheme } from '@/components/useColorScheme';

export type GlassNavigationIconType =
  | 'back'
  | 'close'
  | 'search'
  | 'download'
  | 'more';

export interface GlassNavigationButtonProps {
  icon?: GlassNavigationIconType;
  accessibilityLabel: string;
  accessibilityRole?: 'button';
  onPress: () => void;
  disabled?: boolean;
  size?: number;
  iconSize?: number;
  color?: string;
  backgroundColor?: string;
  glassStyle?: GlassStyle | GlassEffectStyleConfig;
  colorScheme?: 'light' | 'dark' | 'auto';
  hitSlop?: Insets | number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: React.ReactNode;
}

function renderIcon(
  icon: GlassNavigationIconType | undefined,
  color: string,
  iconSize: number,
) {
  switch (icon) {
    case 'back':
      return (
        <Ionicons
          name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
          size={iconSize}
          color={color}
          style={Platform.OS === 'ios' ? styles.iosBackShift : undefined}
        />
      );
    case 'close':
      return <Ionicons name="close" size={iconSize} color={color} />;
    case 'search':
      return <Ionicons name="search" size={iconSize - 2} color={color} />;
    case 'download':
      return (
        <Ionicons name="download-outline" size={iconSize - 2} color={color} />
      );
    case 'more':
      return (
        <Ionicons
          name="ellipsis-horizontal"
          size={iconSize - 2}
          color={color}
        />
      );
    default:
      return null;
  }
}

/**
 * 统一导航按钮（返回、关闭、搜索等）：
 * - iOS 26+ 原生 Liquid Glass 模式：采用系统原生 GlassView 圆形按钮，开启 isInteractive
 *   由系统底层提供光学触觉交互，避免父级 opacity/scale 动画撕裂材质；
 * - 旧版 iOS / Android / 无障碍减少透明度模式：降级使用 BouncyButton 与稳定半透明圆底。
 */
export function GlassNavigationButton({
  icon = 'back',
  accessibilityLabel,
  accessibilityRole = 'button',
  onPress,
  disabled = false,
  size = 40,
  iconSize,
  color,
  backgroundColor,
  glassStyle = 'regular',
  colorScheme: preferredColorScheme = 'auto',
  hitSlop = 8,
  style,
  testID,
  children,
}: GlassNavigationButtonProps) {
  const currentTheme = useColorScheme();
  const isGlassActive = useIsLiquidGlassActive();

  const resolvedColorScheme: 'light' | 'dark' =
    preferredColorScheme === 'auto'
      ? currentTheme === 'dark'
        ? 'dark'
        : 'light'
      : preferredColorScheme;

  const defaultTextColor =
    resolvedColorScheme === 'dark' ? '#FFFFFF' : '#111111';

  const iconColor = color ?? defaultTextColor;
  const resolvedIconSize = iconSize ?? (icon === 'back' ? 26 : 24);
  const borderRadius = size / 2;

  const content = children ?? renderIcon(icon, iconColor, resolvedIconSize);

  if (isGlassActive) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        disabled={disabled}
        hitSlop={hitSlop}
        style={[
          styles.container,
          {
            width: size,
            height: size,
            borderRadius,
          },
          style,
        ]}
      >
        <FloatingSurface
          glassStyle={glassStyle}
          colorScheme={resolvedColorScheme}
          isInteractive={!disabled}
          style={[
            styles.surface,
            {
              width: size,
              height: size,
              borderRadius,
            },
          ]}
        >
          {content}
        </FloatingSurface>
      </Pressable>
    );
  }

  return (
    <BouncyButton
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={[
        styles.fallbackButton,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: backgroundColor ?? 'transparent',
        },
        style,
      ]}
    >
      {content}
    </BouncyButton>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  surface: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  fallbackButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  iosBackShift: {
    marginLeft: -1,
  },
});
