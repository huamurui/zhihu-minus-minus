import type { ReactNode } from 'react';
import { type ColorValue, StyleSheet, Text, View } from 'react-native';
import { useContentActionBarColor } from '@/components/ContentActionBarColor';
import { useThemeColor } from '@/components/Themed';
import { formatCount } from '@/utils/formatCount';

/** Overlay the count outside the button's circular ripple mask. */
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
    <View pointerEvents="box-none" accessible={false}>
      {children}
      {hasCount ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
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
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  count: {
    position: 'absolute',
    minWidth: 28,
    maxWidth: '100%',
    right: 0,
    bottom: 1,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    includeFontPadding: false,
  },
});
