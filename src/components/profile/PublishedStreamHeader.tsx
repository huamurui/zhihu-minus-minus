import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMemberWithFallback, type ZhihuActor } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { GlassNavigationButton } from '@/components/navigation/GlassNavigationButton';
import { StableAvatar } from '@/components/StableAvatar';
import { Text, useThemeColor } from '@/components/Themed';

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

export function PublishedStreamHeader({
  id,
  actor,
  page,
  total,
  goToPage,
}: {
  id: string;
  actor?: ZhihuActor;
  page: number;
  total: number;
  goToPage: (index: number) => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const textColor = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'textSecondary');
  // Each page loads its own member. Observe the selected page's cached details.
  const { data: member } = useQuery({
    queryKey: ['user-detail', id],
    queryFn: () => getMemberWithFallback(id),
    enabled: false,
  });
  const name = member?.name || actor?.name;
  const avatar = member?.avatar_url || actor?.avatar_url;

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
                ...(member?.headline ? { headline: member.headline } : {}),
              },
            })
          }
          className="flex-1 min-h-11 flex-row items-center gap-2 rounded-lg"
        >
          <View className="h-9 w-9 overflow-hidden rounded-full bg-surface-tertiary items-center justify-center">
            {avatar ? (
              <StableAvatar key={id} uri={avatar} className="h-9 w-9" />
            ) : (
              <Ionicons name="person" size={18} color={muted} />
            )}
          </View>
          <View className="flex-1">
            <Text type="secondary" style={styles.section} numberOfLines={1}>
              最近发布
            </Text>
            <Text style={styles.name} numberOfLines={1}>
              {name || '用户'}
            </Text>
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
