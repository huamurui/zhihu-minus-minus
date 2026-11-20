import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurTargetView } from 'expo-blur';
import { type ComponentRef, type ReactNode, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  useAnimatedValue,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassNavigationButton } from '@/components/navigation/GlassNavigationButton';
import { MyProfileBackdrop } from '@/components/profile/MyProfileBackdrop';
import { StableAvatar } from '@/components/StableAvatar';
import { Text, useRuntimeThemeColors } from '@/components/Themed';
import { withAlpha } from '@/utils/colorContrast';

const AVATAR_SIZE = 112;
const AVATAR_TOP = 36;
const NAME_GAP = 8;
const COLLAPSE_DISTANCE = AVATAR_TOP + AVATAR_SIZE + NAME_GAP;

interface MyProfileScrollViewProps {
  name: string;
  avatarUri?: string;
  coverUrl?: string;
  loading: boolean;
  identityLabel: string;
  onOpenIdentity?: () => void;
  onOpenAccounts: () => void;
  onOpenSettings: () => void;
  refreshing: boolean;
  onRefresh: () => void;
  children: ReactNode;
}

export function MyProfileScrollView({
  name,
  avatarUri,
  coverUrl,
  loading,
  identityLabel,
  onOpenIdentity,
  onOpenAccounts,
  onOpenSettings,
  refreshing,
  onRefresh,
  children,
}: MyProfileScrollViewProps) {
  const insets = useSafeAreaInsets();
  const colors = useRuntimeThemeColors();
  const [viewportHeight, setViewportHeight] = useState(0);
  // The scroll body mounts after the header. Supply the Android blur target
  // once its native view exists, and keep the header out of its own sample.
  const [body, setBody] = useState<ComponentRef<typeof View> | null>(null);
  const blurTarget = useMemo(() => ({ current: body }), [body]);
  const scrollY = useAnimatedValue(0);
  const motion = useMemo(() => {
    const pinnedOffset = scrollY.interpolate({
      inputRange: [0, COLLAPSE_DISTANCE, COLLAPSE_DISTANCE + 1],
      outputRange: [0, 0, 1],
      extrapolateLeft: 'clamp',
    });
    const travel = (from: number, to: number) =>
      scrollY.interpolate({
        inputRange: [0, COLLAPSE_DISTANCE],
        outputRange: [from, to],
        extrapolate: 'clamp',
      });
    // The scroll view already carries the avatar up by COLLAPSE_DISTANCE.
    // Correct only the remaining distance to the middle of the status area.
    const avatarEndY = insets.top / 2;
    const avatarStartY = insets.top + AVATAR_TOP + AVATAR_SIZE / 2;
    return {
      header: { transform: [{ translateY: pinnedOffset }] },
      toolbar: { transform: [{ translateY: travel(0, COLLAPSE_DISTANCE) }] },
      avatar: {
        transform: [
          {
            translateY: travel(
              0,
              avatarEndY - avatarStartY + COLLAPSE_DISTANCE,
            ),
          },
          { scale: travel(1, 0) },
        ],
      },
      title: {
        transform: [
          {
            scale: scrollY.interpolate({
              inputRange: [0.46, 0.62, 0.88, 1].map(
                (fraction) => fraction * COLLAPSE_DISTANCE,
              ),
              outputRange: [1, 0.965, 0.74, 0.7],
              extrapolate: 'clamp',
            }),
          },
        ],
      },
      onScroll: Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: true },
      ),
    };
  }, [insets.top, scrollY]);

  return (
    <Animated.ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      removeClippedSubviews={false}
      onLayout={({ nativeEvent }) =>
        setViewportHeight(nativeEvent.layout.height)
      }
      contentContainerStyle={{
        minHeight: viewportHeight + COLLAPSE_DISTANCE,
        paddingBottom: insets.bottom + 80,
      }}
      onScroll={motion.onScroll}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
          progressViewOffset={Platform.OS === 'android' ? insets.top + 48 : 0}
        />
      }
    >
      <Animated.View style={[styles.header, motion.header]}>
        <MyProfileBackdrop
          coverUrl={coverUrl}
          blurTarget={blurTarget}
          backgroundColor={colors.background}
        />
        <Pressable
          accessibilityRole={onOpenIdentity ? 'button' : 'header'}
          accessibilityLabel={identityLabel}
          disabled={!onOpenIdentity}
          onPress={onOpenIdentity}
          style={[styles.identity, { paddingTop: insets.top + AVATAR_TOP }]}
        >
          <Animated.View
            style={[
              styles.avatar,
              {
                backgroundColor: colors.backgroundSecondary,
                borderColor: colors.surface,
              },
              motion.avatar,
            ]}
          >
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : avatarUri ? (
              <StableAvatar uri={avatarUri} style={styles.photo} />
            ) : (
              <Ionicons name="person" size={54} color={colors.textSecondary} />
            )}
          </Animated.View>
          <View
            style={[
              styles.titleRow,
              { paddingHorizontal: 66 + Math.max(insets.left, insets.right) },
            ]}
          >
            <Animated.View style={motion.title}>
              <Text numberOfLines={1} style={styles.title}>
                {name}
              </Text>
            </Animated.View>
          </View>
        </Pressable>
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.actions,
            {
              top: insets.top,
              paddingLeft: insets.left + 12,
              paddingRight: insets.right + 12,
            },
            motion.toolbar,
          ]}
        >
          <GlassNavigationButton
            size={44}
            accessibilityLabel="切换账号"
            onPress={onOpenAccounts}
            backgroundColor={withAlpha(colors.surface, 0.7)}
          >
            <Ionicons name="people-outline" size={21} color={colors.text} />
          </GlassNavigationButton>
          <GlassNavigationButton
            size={44}
            accessibilityLabel="设置"
            onPress={onOpenSettings}
            backgroundColor={withAlpha(colors.surface, 0.7)}
          >
            <Ionicons name="settings-outline" size={21} color={colors.text} />
          </GlassNavigationButton>
        </Animated.View>
      </Animated.View>
      <BlurTargetView ref={Platform.OS === 'android' ? setBody : undefined}>
        {children}
      </BlurTargetView>
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  header: { zIndex: 1 },
  identity: { alignItems: 'center' },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%', borderRadius: AVATAR_SIZE / 2 },
  titleRow: {
    marginTop: NAME_GAP,
    minHeight: 52,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  title: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '700',
    textAlign: 'center',
  },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: COLLAPSE_DISTANCE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
