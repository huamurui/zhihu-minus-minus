import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurTargetView } from 'expo-blur';
import { type ComponentRef, type ReactNode, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassNavigationButton } from '@/components/navigation/GlassNavigationButton';
import { MyProfileBackdrop } from '@/components/profile/MyProfileBackdrop';
import { useProfileAvatarInk } from '@/components/profile/ProfileAvatarBridge';
import { StableAvatar } from '@/components/StableAvatar';
import { Text, useRuntimeThemeColors } from '@/components/Themed';
import { AndroidDisplayCutoutProbe } from '@/modules/display-cutout';
import { withAlpha } from '@/utils/colorContrast';

import {
  AVATAR_SIZE,
  AVATAR_TOP,
  COLLAPSE_DISTANCE,
  getMyProfileAvatarMotion,
  NAME_GAP,
} from './myProfileAvatarMotion';
import { useMyProfileCutout } from './useMyProfileCutout';

interface MyProfileScrollViewProps {
  cutoutEnabled: boolean;
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
  cutoutEnabled,
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
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const { cutout, probeAndroid, setAndroidCutout } = useMyProfileCutout(
    cutoutEnabled,
    viewport.width,
    insets.top,
  );
  // The scroll body mounts after the header. Supply the Android blur target
  // once its native view exists, and keep the header out of its own sample.
  const [body, setBody] = useState<ComponentRef<typeof View> | null>(null);
  const blurTarget = useMemo(() => ({ current: body }), [body]);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const progress = useDerivedValue(() =>
    Math.min(1, Math.max(0, scrollY.value / COLLAPSE_DISTANCE)),
  );
  const avatarMotion = useDerivedValue(() =>
    getMyProfileAvatarMotion(
      progress.value,
      viewport.width,
      insets.top,
      cutout,
    ),
  );
  useProfileAvatarInk(cutout ? avatarMotion : null);
  const avatarStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: avatarMotion.value.translateX },
      { translateY: avatarMotion.value.translateY },
      { scale: avatarMotion.value.scale },
    ],
  }));
  const headerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(0, scrollY.value - COLLAPSE_DISTANCE) }],
  }));
  const toolbarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: progress.value * COLLAPSE_DISTANCE }],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          progress.value,
          [0.46, 0.62, 0.88, 1],
          [1, 0.965, 0.74, 0.7],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <View
      style={styles.scroll}
      onLayout={({ nativeEvent: { layout } }) =>
        setViewport({ width: layout.width, height: layout.height })
      }
    >
      {probeAndroid && (
        <AndroidDisplayCutoutProbe onChange={setAndroidCutout} />
      )}
      <Animated.ScrollView
        style={[styles.scroll, { backgroundColor: colors.background }]}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        contentContainerStyle={{
          minHeight: viewport.height + COLLAPSE_DISTANCE,
          paddingBottom: insets.bottom + 80,
        }}
        onScroll={onScroll}
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
        <Animated.View style={[styles.header, headerStyle]}>
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
                avatarStyle,
                {
                  backgroundColor: colors.backgroundSecondary,
                  borderColor: colors.surface,
                },
              ]}
            >
              {loading ? (
                <ActivityIndicator color={colors.primary} />
              ) : avatarUri ? (
                <StableAvatar uri={avatarUri} style={styles.photo} />
              ) : (
                <Ionicons
                  name="person"
                  size={54}
                  color={colors.textSecondary}
                />
              )}
            </Animated.View>
            <View
              style={[
                styles.titleRow,
                { paddingHorizontal: 66 + Math.max(insets.left, insets.right) },
              ]}
            >
              <Animated.View style={titleStyle}>
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
              toolbarStyle,
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
    </View>
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
