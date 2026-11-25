import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueries } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { type PropsWithChildren, useLayoutEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMemberWithFallback } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { GlassNavigationButton } from '@/components/navigation/GlassNavigationButton';
import { RetainedAvatar } from '@/components/StableAvatar';
import { Text, useThemeColor } from '@/components/Themed';
import type { RecentMomentStreamEntry } from '@/utils/recentMomentStream';

function PageButton({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  icon: 'chevron-back' | 'chevron-forward';
  onPress: () => void;
  disabled?: boolean;
}) {
  const color = useThemeColor({}, disabled ? 'textTertiary' : 'text');
  return (
    <BouncyButton
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-full"
    >
      <Ionicons name={icon} size={18} color={color} />
    </BouncyButton>
  );
}

function IdentityLayer({
  active,
  children,
}: PropsWithChildren<{ active: boolean }>) {
  const opacity = useSharedValue(active ? 1 : 0);
  useLayoutEffect(() => {
    opacity.value = withTiming(active ? 1 : 0, { duration: 160 });
  }, [active, opacity]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      style={[!active && StyleSheet.absoluteFill, fade]}
    >
      {children}
    </Animated.View>
  );
}

export function PublishedStreamHeader({
  entries,
  page,
  goToPage,
}: {
  entries: readonly RecentMomentStreamEntry[];
  page: number;
  goToPage: (index: number) => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const textColor = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'textSecondary');
  const total = entries.length;
  const first = Math.max(0, page - 1);
  const nearby = entries.slice(first, page + 2);
  // The stream pages fetch member details. Warm the same neighboring identities
  // in the header so Android can keep their decoded image views through selection.
  const members = useQueries({
    queries: nearby.map(({ id }) => ({
      queryKey: ['user-detail', id],
      queryFn: () => getMemberWithFallback(id),
      enabled: false,
    })),
  });
  const identities = nearby.map(({ id, moment }, i) => {
    const member = members[i].data;
    return {
      id,
      name: member?.name || moment?.actor.name,
      avatar: member?.avatar_url || moment?.actor.avatar_url,
      headline: member?.headline,
    };
  });
  const { id, name, avatar, headline } = identities[page - first];

  return (
    <View className="bg-surface" style={{ paddingTop: insets.top }}>
      <View
        className="flex-row items-center gap-1 py-1.5"
        style={{
          paddingLeft: Math.max(6, insets.left),
          paddingRight: Math.max(12, insets.right),
        }}
      >
        <GlassNavigationButton
          icon="back"
          accessibilityLabel="返回"
          color={textColor}
          onPress={() => router.back()}
        />
        <BouncyButton
          accessibilityRole="link"
          accessibilityLabel={`查看${name || '用户'}的主页`}
          disabled={!id}
          onPress={() =>
            router.push({
              pathname: '/user/[id]',
              params: {
                id,
                ...(name ? { name } : {}),
                ...(avatar ? { avatar } : {}),
                ...(headline ? { headline } : {}),
              },
            })
          }
          className="flex-1 min-h-11 flex-row items-center gap-2 rounded-lg"
        >
          <View className="h-9 w-9 overflow-hidden rounded-full bg-surface-tertiary">
            {identities.map((identity) => (
              <IdentityLayer key={identity.id} active={identity.id === id}>
                <View className="h-9 w-9 items-center justify-center bg-surface-tertiary">
                  <Ionicons name="person" size={18} color={muted} />
                  {identity.avatar && (
                    <RetainedAvatar
                      uri={identity.avatar}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                </View>
              </IdentityLayer>
            ))}
          </View>
          <View className="flex-1">
            <Text type="secondary" style={styles.section} numberOfLines={1}>
              最近发布
            </Text>
            <View>
              {identities.map((identity) => (
                <IdentityLayer key={identity.id} active={identity.id === id}>
                  <Text style={styles.name} numberOfLines={1}>
                    {identity.name || '用户'}
                  </Text>
                </IdentityLayer>
              ))}
            </View>
          </View>
        </BouncyButton>
        {total > 1 && (
          <View className="flex-row items-center">
            <PageButton
              label="上一位用户"
              icon="chevron-back"
              disabled={page === 0}
              onPress={() => goToPage(page - 1)}
            />
            <Text
              accessibilityLabel={`第 ${page + 1} 位，共 ${total} 位用户`}
              numberOfLines={1}
              style={styles.position}
            >
              {`${String(page + 1).padStart(String(total).length, '\u2007')} / ${total}`}
            </Text>
            <PageButton
              label="下一位用户"
              icon="chevron-forward"
              disabled={page === total - 1}
              onPress={() => goToPage(page + 1)}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 12, lineHeight: 16 },
  name: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  position: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
