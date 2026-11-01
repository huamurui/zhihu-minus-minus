import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BouncyButton } from '@/components/BouncyButton';
import { MoreActionsButton } from '@/components/MoreActionsButton';
import { GlassNavigationButton } from '@/components/navigation/GlassNavigationButton';
import { StableAvatar } from '@/components/StableAvatar';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useSettingsStore } from '@/store/useSettingsStore';

export const DETAIL_NAVIGATION_HEIGHT = 56;

/** Keep the reserved content inset in sync with reading and system text scaling. */
export function useDetailNavigationHeight(): number {
  const fontSizeScale = useSettingsStore((state) => state.fontSizeScale);
  const lineHeightScale = useSettingsStore((state) => state.lineHeightScale);
  const { fontScale } = useWindowDimensions();
  return Math.max(
    DETAIL_NAVIGATION_HEIGHT,
    Math.ceil(
      40 *
        Math.max(1, fontSizeScale) *
        Math.max(1, lineHeightScale / 1.5) *
        Math.max(1, fontScale) +
        12,
    ),
  );
}

interface DetailNavigationHeaderProps {
  title: string;
  collapsed: boolean;
  progress?: SharedValue<number>;
  onBack: () => void;
  onTitlePress?: () => void;
  onMore?: () => void;
  moreAlwaysVisible?: boolean;
  author?: {
    name: string;
    avatarUrl?: string | null;
    onPress: () => void;
  };
  testID?: string;
}

/** Stable navigation geometry shared by question and answer reading screens. */
export function DetailNavigationHeader({
  title,
  collapsed,
  progress,
  onBack,
  onTitlePress,
  onMore,
  moreAlwaysVisible = false,
  author,
  testID,
}: DetailNavigationHeaderProps) {
  const insets = useSafeAreaInsets();
  const navigationHeight = useDetailNavigationHeight();
  const background = useThemeColor({}, 'backgroundSecondary');
  const foreground = useThemeColor({}, 'text');
  const divider = useThemeColor({}, 'divider');
  const shadow = useThemeColor({}, 'shadow');
  const surfaceStyle = useAnimatedStyle(() => {
    const appearance = progress ? progress.value : collapsed ? 1 : 0;
    return {
      opacity: appearance,
      height: (insets.top + navigationHeight) * (0.75 + appearance * 0.25),
      shadowOpacity: appearance * 0.06,
    };
  }, [progress, collapsed, insets.top, navigationHeight]);
  const contentStyle = useAnimatedStyle(() => {
    const appearance = progress ? progress.value : collapsed ? 1 : 0;
    return {
      opacity: appearance,
      transform: [{ translateY: (1 - appearance) * 6 }],
    };
  }, [progress, collapsed]);

  return (
    <View
      testID={testID}
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          backgroundColor: 'transparent',
        },
      ]}
    >
      <Animated.View
        testID={testID ? `${testID}-surface` : undefined}
        pointerEvents="none"
        accessible={false}
        style={[
          styles.surface,
          {
            backgroundColor: background,
            borderBottomColor: divider,
            shadowColor: shadow,
          },
          surfaceStyle,
        ]}
      />
      <View
        testID={testID ? `${testID}-row` : undefined}
        pointerEvents="box-none"
        style={[styles.row, { height: navigationHeight }]}
      >
        <GlassNavigationButton
          icon="back"
          accessibilityLabel="返回"
          onPress={onBack}
          size={40}
          color={foreground}
        />
        <Animated.View
          pointerEvents={collapsed ? 'box-none' : 'none'}
          accessibilityElementsHidden={!collapsed}
          importantForAccessibility={collapsed ? 'auto' : 'no-hide-descendants'}
          style={[styles.center, contentStyle]}
        >
          <BouncyButton
            accessibilityRole="button"
            accessibilityLabel={title}
            onPress={onTitlePress}
            disabled={!onTitlePress}
            style={styles.titleButton}
          >
            <Text numberOfLines={1} style={styles.title}>
              {title}
            </Text>
          </BouncyButton>
          {author ? (
            <BouncyButton
              accessibilityRole="button"
              accessibilityLabel={`查看 ${author.name} 的主页`}
              onPress={author.onPress}
              style={styles.author}
            >
              <StableAvatar uri={author.avatarUrl} style={styles.avatar} />
              <Text
                type="secondary"
                numberOfLines={1}
                style={styles.authorName}
              >
                {author.name}
              </Text>
            </BouncyButton>
          ) : null}
        </Animated.View>
        {onMore ? (
          <Animated.View
            pointerEvents={collapsed || moreAlwaysVisible ? 'box-none' : 'none'}
            accessibilityElementsHidden={!collapsed && !moreAlwaysVisible}
            importantForAccessibility={
              collapsed || moreAlwaysVisible ? 'auto' : 'no-hide-descendants'
            }
            style={moreAlwaysVisible ? undefined : contentStyle}
          >
            <MoreActionsButton onPress={onMore} color={foreground} />
          </Animated.View>
        ) : (
          <View pointerEvents="none" style={styles.iconButton} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  surface: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
  },
  row: {
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
  },
  center: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  titleButton: { alignSelf: 'stretch' },
  title: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  author: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: 5,
    paddingTop: 2,
  },
  avatar: { width: 18, height: 18, borderRadius: 9 },
  authorName: { flexShrink: 1, fontSize: 12, lineHeight: 18 },
});
