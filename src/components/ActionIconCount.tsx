import type { ReactNode } from 'react';
import { type ColorValue, StyleSheet, Text, View } from 'react-native';
import { useContentActionBarColor } from '@/components/ContentActionBarColor';
import { useThemeColor } from '@/components/Themed';
import { formatCount } from '@/utils/formatCount';

/**
 * A count centred under its icon inside a fixed 44×44 action target. The icon
 * and count are laid out as one centred column, so the count lines up with
 * any icon size or count length without fixed offsets.
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
    <View style={styles.container} accessible={false}>
      {children}
      {hasCount ? (
        <Text
          testID="action-icon-count"
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
  container: {
    width: 44,
    height: 44,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    maxWidth: 44,
    marginTop: 1,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '600',
    textAlign: 'center',
    includeFontPadding: false,
  },
});
