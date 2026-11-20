import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CONTENT_ACTION_BAR_HEIGHT,
  getContentActionBarBottom,
} from '@/components/ContentActionBar';
import { Text, useRuntimeThemeColors } from '@/components/Themed';

export function SelectionActions({
  text,
  pending,
  onCancel,
  onLike,
  onComment,
}: {
  text: string;
  pending: boolean;
  onCancel: () => void;
  onLike: () => void;
  onComment?: () => void;
}) {
  const colors = useRuntimeThemeColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.position,
        {
          bottom:
            getContentActionBarBottom(insets.bottom) +
            CONTENT_ACTION_BAR_HEIGHT +
            8,
        },
      ]}
    >
      <View
        pointerEvents="box-none"
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.contentBorder,
          },
        ]}
      >
        <View pointerEvents="none" style={styles.excerpt}>
          <Text numberOfLines={1} type="secondary">
            {text}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="取消选区操作"
          focusable={false}
          onPress={onCancel}
          style={styles.button}
        >
          <Text>取消</Text>
        </Pressable>
        {onComment && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="评论所选文字"
            focusable={false}
            onPress={onComment}
            style={styles.button}
          >
            <Text>评论</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="赞同所选文字"
          accessibilityState={{ disabled: pending, busy: pending }}
          disabled={pending}
          focusable={false}
          onPress={onLike}
          style={[styles.button, { backgroundColor: colors.primary }]}
        >
          {pending ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Text style={{ color: colors.onPrimary }}>赞同</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  position: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  card: {
    width: '100%',
    maxWidth: 400,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  excerpt: { flex: 1, paddingHorizontal: 8 },
  button: {
    minHeight: 44,
    minWidth: 48,
    borderRadius: 14,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
