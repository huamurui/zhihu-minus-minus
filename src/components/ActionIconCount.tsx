import type { ReactNode } from 'react';
import { type ColorValue, StyleSheet, Text, View } from 'react-native';
import { useContentActionBarColor } from '@/components/ContentActionBarColor';
import { useThemeColor } from '@/components/Themed';
import { formatCount } from '@/utils/formatCount';

/**
 * An action icon with its count to the right, like the vote capsule's count.
 * At least 44 wide; a count widens the target instead of overlapping the icon.
 */
export function ActionIconCount({
  children,
  count,
  color,
}: {
  children: ReactNode;
  count?: number;
  color?: ColorValue;
}) {
  const secondaryColor = useThemeColor({}, 'textSecondary');
  const actionColor = useContentActionBarColor(secondaryColor);
  const hasCount = count !== undefined && Number.isFinite(count) && count >= 0;

  return (
    <View
      style={[styles.container, hasCount && styles.withCount]}
      accessible={false}
    >
      {children}
      {hasCount ? (
        <Text
          testID="action-icon-count"
          accessible={false}
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
          style={[styles.count, { color: color ?? actionColor }]}
        >
          {formatCount(count)}
        </Text>
      ) : null}
    </View>
  );
}

/** Button style for an ActionIconCount target: 44 square, wider with a count. */
export const ACTION_ICON_COUNT_BUTTON = {
  minWidth: 44,
  height: 44,
  paddingHorizontal: 0,
  paddingVertical: 0,
} as const;

const styles = StyleSheet.create({
  container: {
    minWidth: 44,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  withCount: { paddingHorizontal: 8 },
  count: {
    marginLeft: 4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    includeFontPadding: false,
  },
});
