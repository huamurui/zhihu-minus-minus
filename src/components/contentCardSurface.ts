import { useMemo } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { useRuntimeThemeColors } from '@/components/Themed';
import { useSettingsStore } from '@/store/useSettingsStore';

/**
 * 列表里一张内容卡片的外观，随「外观 → 表面样式」切换：
 * - 分层：圆角卡片，卡片之间留出间距，不加分割线；
 * - 扁平：去掉卡片底色和圆角，相邻内容之间用一条分割线隔开。
 *
 * 两种样式都不会出现「圆角卡片贴在一起再用分割线隔开」。
 */
export function useContentCardSurface({
  radius,
  gap,
}: {
  radius: number;
  /** Space below each card in the layered style. */
  gap: number;
}): ViewStyle {
  const flat = useSettingsStore((state) => state.surfaceStyle === 'flat');
  const colors = useRuntimeThemeColors();
  return useMemo(
    () =>
      flat
        ? {
            backgroundColor: 'transparent',
            borderRadius: 0,
            marginBottom: 0,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
          }
        : {
            backgroundColor: colors.backgroundSecondary,
            borderRadius: radius,
            marginBottom: gap,
          },
    [colors.backgroundSecondary, colors.border, flat, gap, radius],
  );
}
