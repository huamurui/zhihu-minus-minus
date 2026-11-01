import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import { GlassContainer, GlassView } from 'expo-glass-effect';
import {
  Pressable,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  type AnimatedStyle,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { BouncyButton } from '@/components/BouncyButton';
import { ScrollableNavigationRow } from '@/components/home/ScrollableNavigationRow';
import { TopTabLabel } from '@/components/home/TopTabLabel';
import {
  isLiquidGlassSupported,
  useIsLiquidGlassActive,
} from '@/components/surfaces/FloatingSurface';

export { isLiquidGlassSupported };

const TAB_WIDTH = 54;
const TAB_GAP = 4;
const TAB_STRIDE = TAB_WIDTH + TAB_GAP; // 58

export interface GlassTopNavigationProps {
  tabs: string[];
  currentPage: number;
  scrollX: SharedValue<number>;
  topInset: number;
  insets: EdgeInsets;
  colorScheme?: 'light' | 'dark' | null;
  indicatorBgColor: string;
  tintColor: string;
  secondaryTextColor: string;
  textColor: string;
  localCityName?: string | null;
  animStyle?: StyleProp<AnimatedStyle<ViewStyle>>;
  useLiquidGlass?: boolean;
  onTabPress: (index: number) => void;
  onSearchPress: () => void;
}

/**
 * 顶部导航栏（双胶囊分离设计）：
 * - 原生模式：iOS 26+ 原生 Liquid Glass（左侧分区胶囊与右侧独立搜索圆形按钮）；
 * - 普通模式：双 BlurView 毛玻璃（同样保持左侧分区胶囊与右侧独立搜索圆形按钮分离）；
 * - 内部指示器：普通半透明磨砂胶囊，跟随手势连续滑动并伴随轻微弹性形变。
 */
export function GlassTopNavigation({
  tabs,
  currentPage,
  scrollX,
  topInset,
  insets,
  colorScheme,
  indicatorBgColor,
  tintColor,
  secondaryTextColor,
  textColor,
  localCityName,
  animStyle,
  useLiquidGlass,
  onTabPress,
  onSearchPress,
}: GlassTopNavigationProps) {
  const liquidGlassActive = useIsLiquidGlassActive(useLiquidGlass ?? true);

  const labels: Record<string, string> = {
    following: '关注',
    recommend: '推荐',
    local: localCityName || '同城',
    hot: '热榜',
    daily: '日报',
  };

  // 连续滑动指示器动画 (跟随 scrollX 连续位移，并在滑动中带有轻微弹性拉伸)
  const topIndicatorStyle = useAnimatedStyle(() => {
    if (tabs.length <= 1) {
      return {
        transform: [{ translateX: 0 }, { scaleX: 1 }],
      };
    }
    const maxIndex = Math.max(0, tabs.length - 1);
    const position = Math.max(0, Math.min(scrollX.value, maxIndex));
    const fraction = position - Math.floor(position);
    // 两个 Tab 之间的过渡处轻微拉伸 (幅度 ~12%)
    const stretch = 1 + 0.12 * Math.sin(Math.PI * fraction);
    return {
      transform: [{ translateX: position * TAB_STRIDE }, { scaleX: stretch }],
    };
  });

  // 当处于原生 Liquid Glass 模式时使用 GlassContainer 协调相邻玻璃元件（触发按压融球联动）
  const ContainerView = liquidGlassActive ? GlassContainer : View;

  return (
    <Animated.View
      style={[
        styles.topNavContainer,
        { top: insets.top, left: topInset, right: topInset },
        animStyle,
      ]}
    >
      <ContainerView
        {...(liquidGlassActive ? { spacing: 8 } : {})}
        style={styles.navRow}
      >
        {/* 1. 左侧内容分区 Tab 轨道 (原生 Liquid Glass regular 或普通 BlurView 圆角胶囊) */}
        <View
          style={[
            styles.tabsTrackWrapper,
            colorScheme === 'light' &&
              !liquidGlassActive &&
              styles.lightTranslucentShadow,
          ]}
        >
          {liquidGlassActive ? (
            <GlassView
              glassEffectStyle="regular"
              colorScheme={colorScheme === 'dark' ? 'dark' : 'light'}
              pointerEvents="none"
              style={styles.tabsTrackGlass}
            />
          ) : (
            <BlurView
              intensity={100}
              tint={colorScheme === 'dark' ? 'dark' : 'light'}
              style={[
                styles.tabsTrackGlass,
                {
                  backgroundColor:
                    colorScheme === 'dark'
                      ? 'rgba(0,0,0,0.7)'
                      : 'rgba(255,255,255,0.85)',
                  borderColor:
                    colorScheme === 'dark'
                      ? 'rgba(255,255,255,0.15)'
                      : 'rgba(255,255,255,0.4)',
                  borderWidth: StyleSheet.hairlineWidth,
                },
              ]}
            />
          )}

          <ScrollableNavigationRow
            testID="home-top-navigation"
            contentWidth={tabs.length * TAB_STRIDE}
            activeStart={
              Math.min(currentPage, Math.max(0, tabs.length - 1)) * TAB_STRIDE
            }
            activeEnd={
              Math.min(currentPage, Math.max(0, tabs.length - 1)) * TAB_STRIDE +
              TAB_WIDTH
            }
            style={styles.tabsScrollView}
            contentStyle={styles.tabsScrollContent}
          >
            <View style={styles.tabsInnerRow}>
              {/* 普通半透明磨砂胶囊指示器：随手势连续滑动与弹性伸缩 */}
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.topPill,
                  { backgroundColor: indicatorBgColor },
                  topIndicatorStyle,
                ]}
              />

              {/* Tab 选项列表 */}
              {tabs.map((tab, index) => {
                const label = labels[tab] || tab;
                return (
                  <BouncyButton
                    key={tab}
                    accessibilityRole="tab"
                    accessibilityLabel={label}
                    accessibilityState={{ selected: currentPage === index }}
                    onPress={() => onTabPress(index)}
                    style={styles.navItem}
                  >
                    <TopTabLabel
                      index={index}
                      label={label}
                      scrollX={scrollX}
                      activeColor={tintColor}
                      inactiveColor={secondaryTextColor}
                    />
                  </BouncyButton>
                );
              })}
            </View>
          </ScrollableNavigationRow>
        </View>

        {/* 2. 右侧固定独立搜索按钮 (原生 Liquid Glass regular 或普通 BlurView 圆形按钮) */}
        {liquidGlassActive ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="搜索"
            onPress={onSearchPress}
            style={styles.searchBtnWrapper}
          >
            <GlassView
              glassEffectStyle="regular"
              colorScheme={colorScheme === 'dark' ? 'dark' : 'light'}
              isInteractive
              style={styles.searchGlass}
            >
              <Ionicons name="search" size={20} color={textColor} />
            </GlassView>
          </Pressable>
        ) : (
          <BouncyButton
            accessibilityRole="button"
            accessibilityLabel="搜索"
            onPress={onSearchPress}
            style={[
              styles.searchBtnWrapper,
              colorScheme === 'light' && styles.lightTranslucentShadow,
            ]}
          >
            <BlurView
              intensity={100}
              tint={colorScheme === 'dark' ? 'dark' : 'light'}
              style={[
                styles.searchGlass,
                {
                  backgroundColor:
                    colorScheme === 'dark'
                      ? 'rgba(0,0,0,0.7)'
                      : 'rgba(255,255,255,0.85)',
                  borderColor:
                    colorScheme === 'dark'
                      ? 'rgba(255,255,255,0.15)'
                      : 'rgba(255,255,255,0.4)',
                  borderWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <Ionicons name="search" size={20} color={textColor} />
            </BlurView>
          </BouncyButton>
        )}
      </ContainerView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  topNavContainer: {
    position: 'absolute',
    zIndex: 100,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
  },
  tabsTrackWrapper: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
  },
  tabsTrackGlass: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
    overflow: 'hidden',
  },
  tabsScrollView: {
    flex: 1,
    paddingHorizontal: 7,
  },
  tabsScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
  },
  tabsInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    height: 48,
  },
  topPill: {
    position: 'absolute',
    top: 7,
    width: TAB_WIDTH,
    height: 34,
    borderRadius: 17,
    left: 0,
  },
  navItem: {
    width: TAB_WIDTH,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: TAB_GAP,
    paddingHorizontal: 0,
  },
  searchBtnWrapper: {
    marginLeft: 8,
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
  },
  searchGlass: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightTranslucentShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
});
