import type { ReactNode } from 'react';
import { type ColorValue, StyleSheet, Text, View } from 'react-native';
import { useContentActionBarColor } from '@/components/ContentActionBarColor';
import { useThemeColor } from '@/components/Themed';
import { formatCount } from '@/utils/formatCount';

/** A count in the lower-right corner of a fixed-size action target. */
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
    <View style={styles.container} accessible={false}>
      <View style={styles.icon}>{children}</View>
      {hasCount ? (
        <Text
          accessible={false}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          maxFontSizeMultiplier={1.2}
          style={[styles.count, { color: color ?? actionColor }]}
        >
          {formatCount(count)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: 44, height: 44 },
  icon: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  count: {
    position: 'absolute',
    left: 16,
    right: 0,
    bottom: 3,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '600',
    textAlign: 'center',
    includeFontPadding: false,
  },
});
