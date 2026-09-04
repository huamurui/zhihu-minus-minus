import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import {
  type QueryClient,
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import Animated, {
  Extrapolate,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
// 使用 @ 别名导入组件
import {
  FEED_URLS,
  type FeedItem,
  getFeed,
  type RawFeedItem,
  type RawFeedTarget,
} from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { DailyList } from '@/components/DailyList';
import { FeedCard } from '@/components/FeedCard';
import { HotCard, type HotItem } from '@/components/HotCard';
import { RecentMoments } from '@/components/RecentMoments';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { hasReusableAnswerDetail } from '@/features/rich-content';
import {
  type FeedCacheContext,
  feedCacheRepository,
} from '@/storage/feedCacheRepository';
import {
  type FeedExposureContext,
  feedExposureRepository,
} from '@/storage/feedExposureRepository';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { supportsLocalFeedDedup } from '@/utils/feedDedup';
import {
  applyFeedFilter,
  type CollapsedGroup,
  type FeedFilterRules,
  isCollapsedGroup,
  supportsLocalFeedFilter,
} from '@/utils/feedFilter';
import {
  type FeedContentIdentity,
  getFeedContentIdentity,
  getFeedContentKey,
  getInMemoryFeedKey,
} from '@/utils/feedIdentity';
import { resolveLocalAccountKey } from '@/utils/localAccount';
import { refreshInfiniteQuery } from '@/utils/query';
import ProfileScreen from './profile';
import PublishScreen from './publish';

// 统一的所有可滑动的页面索引
// 0: 关注, 1: 推荐, 2: 热榜, 3: 日报, 4: 发布, 5: 我的
const TABS = [
  'following',
  'recommend',
  'local',
  'hot',
  'daily',
  'publish',
  'profile',
] as const;
type TabType = (typeof TABS)[number];
type FeedTabType = keyof typeof FEED_URLS;
type FeedListItem = FeedItem | HotItem | CollapsedGroup;
const AUTO_HIDE_NAV_TABS: readonly TabType[] = [
  'following',
  'recommend',
  'hot',
  'daily',
];

function isTabType(value: string): value is TabType {
  return (TABS as readonly string[]).includes(value);
}

interface TabListHandle {
  scrollToOffset: (args: { offset: number; animated?: boolean }) => void;
  refresh?: () => void;
}

interface FeedListHandle extends TabListHandle {
  refresh: () => void;
}

interface ScrollMotion {
  direction: 'up' | 'down' | null;
  directionStartOffset: number;
  lastOffset: number;
}

// 隐藏模式下被过滤项不占行，一页内容可能所剩无几甚至为空——列表不足一屏时
// 用户无法滚动，onEndReached 不会再触发，列表就此卡住。故在该模式下主动补页
// 直到攒够 MIN_RENDERABLE_ITEMS 行；同时用 MAX_AUTO_FETCH_ROUNDS 限制单轮
// 刷新内的补页次数，避免高过滤率下无节制连续请求。触顶后由 footer 给出提示。
// 折叠模式下过滤项仍占一行，不需要补页。
const MIN_RENDERABLE_ITEMS = 8;
const MAX_AUTO_FETCH_ROUNDS = 3;

export default function HomeScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const containerWidth = Math.min(windowWidth - 40, 500);

  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const colorScheme = useColorScheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { visibleTabs, defaultTab, localCityName } = useSettingsStore();

  // 动态过滤 Tabs
  const currentTabs = useMemo(() => {
    return TABS.filter((tab) => {
      if (tab === 'profile') return true;
      return visibleTabs.includes(tab);
    });
  }, [visibleTabs]);

  const homeTabs = useMemo(() => {
    return currentTabs.filter((t) => !['publish', 'profile'].includes(t));
  }, [currentTabs]);
  const homeTabsCount = homeTabs.length;

  const bottomCapsuleWidth = useMemo(() => {
    const hasPublish = currentTabs.includes('publish');
    const hasProfile = currentTabs.includes('profile');
    const totalBottomIcons =
      (homeTabsCount > 0 ? 1 : 0) + (hasPublish ? 1 : 0) + (hasProfile ? 1 : 0);
    return containerWidth / (totalBottomIcons || 1) - 20;
  }, [currentTabs, homeTabsCount, containerWidth]);

  // 计算初始页码
  const initialPageIndex = useMemo(() => {
    // 优先考虑 URL 参数中的 tab
    if (params.tab && isTabType(params.tab)) {
      const idx = currentTabs.indexOf(params.tab);
      if (idx >= 0) return idx;
    }
    const idx = currentTabs.indexOf(defaultTab);
    return idx >= 0 ? idx : 0;
  }, [currentTabs, defaultTab, params.tab]);

  // 核心状态：共享滚动位置
  const scrollX = useSharedValue(initialPageIndex);
  const chromeVisibility = useSharedValue(1);
  const pagerRef = useRef<PagerView>(null);
  const { cookies } = useAuthStore();

  const tintColor = useThemeColor({}, 'primary');
  const textColor = useThemeColor({}, 'text');
  const indicatorBgColor = useThemeColor({}, 'primary_26');
  const [currentPage, setCurrentPage] = useState(initialPageIndex);
  const [guestCookieReady, setGuestCookieReady] = useState(false);

  // 懒加载 Tab 标签页记录：仅在访问过的 Tab 渲染对应组件，避免冷启动时并发请求所有 Tab 的接口
  const [visitedPages, setVisitedPages] = useState<Set<number>>(
    () => new Set([initialPageIndex]),
  );

  // 记录离开首页区域前停留的分区，供从「发布」「我的」返回时定位
  const lastHomePageRef = useRef(
    initialPageIndex < homeTabsCount ? initialPageIndex : 0,
  );

  useEffect(() => {
    setVisitedPages((prev) => {
      if (prev.has(currentPage)) return prev;
      const next = new Set(prev);
      next.add(currentPage);
      return next;
    });
  }, [currentPage]);

  useEffect(() => {
    if (currentPage < homeTabsCount) {
      lastHomePageRef.current = currentPage;
    }
  }, [currentPage, homeTabsCount]);

  // 监听 params.tab 变化并切换页面
  useEffect(() => {
    if (params.tab && isTabType(params.tab)) {
      const idx = currentTabs.indexOf(params.tab);
      if (idx >= 0 && idx !== currentPage) {
        pagerRef.current?.setPage(idx);
        setCurrentPage(idx);
      }
    }
  }, [params.tab, currentTabs, currentPage]);

  const [scrolledTabs, setScrolledTabs] = useState<Record<number, boolean>>({});
  const [refreshingTabs, setRefreshingTabs] = useState<Record<number, boolean>>(
    {},
  );
  const listRefs = useRef<Array<TabListHandle | null>>([]);
  const scrollMotionRef = useRef<Record<number, ScrollMotion>>({});
  const isChromeHiddenRef = useRef(false);

  const setChromeHidden = useCallback(
    (hidden: boolean) => {
      if (isChromeHiddenRef.current === hidden) return;
      isChromeHiddenRef.current = hidden;
      chromeVisibility.value = withTiming(hidden ? 0 : 1, { duration: 180 });
    },
    [chromeVisibility],
  );

  const handleRefreshStateChange = useCallback(
    (pageIndex: number, isRefreshing: boolean) => {
      if (isRefreshing && pageIndex === currentPage) {
        setChromeHidden(false);
      }
      setRefreshingTabs((prev) => {
        if (prev[pageIndex] === isRefreshing) return prev;
        return { ...prev, [pageIndex]: isRefreshing };
      });
    },
    [currentPage, setChromeHidden],
  );

  const isCurrentRefreshing = refreshingTabs[currentPage] || false;

  const SCROLL_THRESHOLD_SHOW = 300;
  const SCROLL_THRESHOLD_HIDE = 200;

  const handleScrollUpdate = useCallback(
    (pageIndex: number, offset: number) => {
      setScrolledTabs((prev) => {
        const currentlyScrolled = prev[pageIndex] || false;
        let nextScrolled = currentlyScrolled;

        if (!currentlyScrolled && offset > SCROLL_THRESHOLD_SHOW) {
          nextScrolled = true;
        } else if (currentlyScrolled && offset < SCROLL_THRESHOLD_HIDE) {
          nextScrolled = false;
        }

        if (currentlyScrolled === nextScrolled) return prev;
        return { ...prev, [pageIndex]: nextScrolled };
      });

      const previousMotion = scrollMotionRef.current[pageIndex] ?? {
        direction: null,
        directionStartOffset: offset,
        lastOffset: offset,
      };
      const delta = offset - previousMotion.lastOffset;
      const direction =
        delta > 1 ? 'down' : delta < -1 ? 'up' : previousMotion.direction;

      if (direction !== previousMotion.direction) {
        previousMotion.direction = direction;
        previousMotion.directionStartOffset = offset;
      }
      previousMotion.lastOffset = offset;
      scrollMotionRef.current[pageIndex] = previousMotion;

      if (pageIndex !== currentPage) return;
      const currentTab = currentTabs[pageIndex];
      if (!currentTab || !AUTO_HIDE_NAV_TABS.includes(currentTab)) {
        setChromeHidden(false);
        return;
      }

      if (offset <= 24) {
        setChromeHidden(false);
        return;
      }

      const directionDistance = Math.abs(
        offset - previousMotion.directionStartOffset,
      );
      if (direction === 'down' && offset > 80 && directionDistance >= 24) {
        setChromeHidden(true);
      } else if (direction === 'up' && directionDistance >= 16) {
        setChromeHidden(false);
      }
    },
    [currentPage, currentTabs, setChromeHidden],
  );

  const handleHomeTabPress = () => {
    const isAtHome = currentPage < homeTabsCount;

    if (isAtHome) {
      if (scrolledTabs[currentPage]) {
        // 如果已经在首页 Tab 且已滚动，则置顶
        listRefs.current[currentPage]?.scrollToOffset({
          offset: 0,
          animated: true,
        });
      } else {
        // 在顶部时，刷新当前 tab 的内容
        listRefs.current[currentPage]?.refresh?.();
      }
    } else {
      // 如果不在首页 Tab（如发布或我的页面），则回到离开前停留的分区
      // clamp 兜底：Tab 配置变化后，记录的索引可能已越界
      const targetPage = Math.min(
        Math.max(lastHomePageRef.current, 0),
        Math.max(homeTabsCount - 1, 0),
      );
      pagerRef.current?.setPage(targetPage);
    }
  };

  const handleTabPress = (index: number) => {
    pagerRef.current?.setPage(index);
  };

  // 顶部导航栏动画样式
  const topNavAnimStyle = useAnimatedStyle(() => {
    if (homeTabsCount === 0) {
      return {
        opacity: 0,
        transform: [{ translateY: -100 }],
        pointerEvents: 'none',
      };
    }
    const fadeStart = homeTabsCount - 1;
    const fadeEnd = homeTabsCount;
    const opacity = interpolate(
      scrollX.value,
      [fadeStart, fadeEnd],
      [1, 0],
      Extrapolate.CLAMP,
    );
    const translateY = interpolate(
      scrollX.value,
      [fadeStart, fadeEnd],
      [0, -100],
      Extrapolate.CLAMP,
    );
    const scrollTranslateY = interpolate(
      chromeVisibility.value,
      [0, 1],
      [-80, 0],
      Extrapolate.CLAMP,
    );
    return {
      opacity: opacity * chromeVisibility.value,
      transform: [{ translateY: translateY + scrollTranslateY }],
      pointerEvents:
        scrollX.value > fadeStart + 0.5 || chromeVisibility.value < 0.5
          ? 'none'
          : 'auto',
    };
  });

  const bottomNavAnimStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      chromeVisibility.value,
      [0, 1],
      [96, 0],
      Extrapolate.CLAMP,
    );
    return {
      opacity: chromeVisibility.value,
      transform: [{ translateY }],
      pointerEvents: chromeVisibility.value < 0.5 ? 'none' : 'auto',
    };
  });

  // 顶部 Tab 指示器动画
  const topIndicatorStyle = useAnimatedStyle(() => {
    const tabWidth = 58;
    const maxIndex = Math.max(0, homeTabsCount - 1);
    const clampedScroll = interpolate(
      scrollX.value,
      [0, maxIndex],
      [0, maxIndex],
      Extrapolate.CLAMP,
    );
    return {
      transform: [{ translateX: clampedScroll * tabWidth }],
    };
  });

  // 底部导航栏指示器动画
  const bottomIndicatorStyle = useAnimatedStyle(() => {
    const hasPublish = currentTabs.includes('publish');
    const hasProfile = currentTabs.includes('profile');

    // 底部导航栏总图标数 (首页算一个)
    const totalBottomIcons =
      (homeTabsCount > 0 ? 1 : 0) + (hasPublish ? 1 : 0) + (hasProfile ? 1 : 0);
    const iconWidth = containerWidth / (totalBottomIcons || 1);

    // 构建插值映射表
    const inputRange: number[] = [];
    const outputRange: number[] = [];

    // 1. 首页区域：无论在首页内怎么滑，底部指示器都在索引 0
    if (homeTabsCount === 1) {
      inputRange.push(0);
      outputRange.push(0);
    } else if (homeTabsCount > 1) {
      inputRange.push(0, homeTabsCount - 1);
      outputRange.push(0, 0);
    }

    // 2. 发布区域
    if (hasPublish) {
      const publishIdx = currentTabs.indexOf('publish');
      const bottomIdx = homeTabsCount > 0 ? 1 : 0;
      inputRange.push(publishIdx);
      outputRange.push(bottomIdx * iconWidth);
    }

    // 3. 个人区域
    if (hasProfile) {
      const profileIdx = currentTabs.indexOf('profile');
      const bottomIdx = (homeTabsCount > 0 ? 1 : 0) + (hasPublish ? 1 : 0);
      inputRange.push(profileIdx);
      outputRange.push(bottomIdx * iconWidth);
    }

    // 确保 inputRange 是递增且唯一的（防止计算错误）
    const translateX = interpolate(
      scrollX.value,
      inputRange.length > 1 ? inputRange : [0, 1],
      outputRange.length > 1 ? outputRange : [0, 0],
      Extrapolate.CLAMP,
    );

    return {
      transform: [{ translateX }],
    };
  });

  return (
    <View style={styles.container}>
      {/* 1. 顶部 Tab 导航 (Home 专属) */}
      <Animated.View
        style={[styles.topNavContainer, { top: insets.top }, topNavAnimStyle]}
      >
        <BlurView
          intensity={100}
          tint={colorScheme === 'dark' ? 'dark' : 'light'}
          style={[
            styles.blurWrapper,
            {
              backgroundColor:
                colorScheme === 'dark'
                  ? 'rgba(0,0,0,0.7)'
                  : 'rgba(255,255,255,0.85)',
            },
          ]}
        >
          <View style={styles.topNav}>
            <View
              style={{
                flexDirection: 'row',
                flex: 1,
                backgroundColor: 'transparent',
                alignItems: 'center',
                position: 'relative',
              }}
            >
              <Animated.View
                style={[
                  styles.topPill,
                  { backgroundColor: indicatorBgColor },
                  topIndicatorStyle,
                ]}
              />
              {currentTabs
                .filter((t) => !['publish', 'profile'].includes(t))
                .map((tab, index) => {
                  const labels: Record<string, string> = {
                    following: '关注',
                    recommend: '推荐',
                    local: localCityName || '同城',
                    hot: '热榜',
                    daily: '日报',
                  };
                  return (
                    <BouncyButton
                      key={tab}
                      onPress={() => handleTabPress(index)}
                      style={[
                        styles.navItem,
                        { width: 54, paddingHorizontal: 0 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.navText,
                          currentPage === index && {
                            fontWeight: 'bold',
                            color: tintColor,
                          },
                        ]}
                        type={currentPage === index ? 'default' : 'secondary'}
                      >
                        {labels[tab]}
                      </Text>
                    </BouncyButton>
                  );
                })}
            </View>
            <Pressable
              onPress={() => router.push('/search')}
              style={styles.searchBtn}
            >
              <Ionicons name="search" size={22} color={textColor} />
            </Pressable>
          </View>
          {isCurrentRefreshing && <TopLoadingBar color={tintColor} />}
        </BlurView>
      </Animated.View>

      <PagerView
        key={`pager-${currentTabs.join('-')}`} // 强制重新渲染
        ref={pagerRef}
        style={styles.pager}
        initialPage={initialPageIndex}
        onPageScroll={(e) => {
          scrollX.value = e.nativeEvent.position + e.nativeEvent.offset;
        }}
        onPageSelected={(e) => {
          setChromeHidden(false);
          setCurrentPage(e.nativeEvent.position);
        }}
      >
        {currentTabs.map((tab, idx) => {
          const isVisited = visitedPages.has(idx);
          return (
            <View key={tab} style={{ flex: 1, backgroundColor: 'transparent' }}>
              {!isVisited ? null : tab === 'daily' ? (
                <DailyList
                  ref={(element) => {
                    listRefs.current[idx] = element;
                  }}
                  insets={insets}
                  onScroll={(offset) => handleScrollUpdate(idx, offset)}
                  onRefreshStateChange={(isRefreshing) =>
                    handleRefreshStateChange(idx, isRefreshing)
                  }
                />
              ) : tab === 'publish' ? (
                <PublishScreen />
              ) : tab === 'profile' ? (
                <ProfileScreen isActive={isFocused && currentPage === idx} />
              ) : !cookies && tab === 'following' ? (
                <View style={styles.loginPrompt}>
                  <Text style={styles.loginText} type="secondary">
                    登录后才能看此栏目哦
                  </Text>
                  <Pressable
                    style={[styles.loginBtn, { backgroundColor: tintColor }]}
                    onPress={() => router.push('/login')}
                  >
                    <Text style={styles.loginBtnText}>去登录</Text>
                  </Pressable>
                </View>
              ) : (
                <FeedList
                  ref={(element) => {
                    listRefs.current[idx] = element;
                  }}
                  tab={tab as FeedTabType}
                  isActive={isFocused && currentPage === idx}
                  insets={insets}
                  guestCookieReady={guestCookieReady}
                  onScroll={(offset) => handleScrollUpdate(idx, offset)}
                  onRefreshStateChange={(isRefreshing) =>
                    handleRefreshStateChange(idx, isRefreshing)
                  }
                />
              )}
            </View>
          );
        })}
      </PagerView>

      {/* 3. 底部悬浮导航栏 (Custom TabBar) */}
      <Animated.View
        style={[
          styles.bottomBarContainer,
          { bottom: insets.bottom, width: containerWidth },
          bottomNavAnimStyle,
        ]}
      >
        <BlurView
          intensity={130}
          tint={colorScheme === 'dark' ? 'dark' : 'light'}
          style={[
            styles.bottomBlur,
            {
              backgroundColor:
                colorScheme === 'dark'
                  ? 'rgba(0,0,0,0.7)'
                  : 'rgba(255,255,255,0.85)',
            },
          ]}
        >
          <View style={styles.bottomNavItems}>
            {/* 联动指示器 */}
            <Animated.View
              style={[
                styles.bottomIndicator,
                {
                  backgroundColor: indicatorBgColor,
                  width: bottomCapsuleWidth,
                },
                bottomIndicatorStyle,
              ]}
            />

            {currentTabs.some((t) => !['publish', 'profile'].includes(t)) && (
              <BottomTabIcon
                // 判断逻辑：当前在首页区域且当前子 Tab 有滚动
                isScrollTop={
                  currentPage <
                    currentTabs.filter(
                      (t) => !['publish', 'profile'].includes(t),
                    ).length && scrolledTabs[currentPage]
                }
                icon={
                  currentPage <
                  currentTabs.filter((t) => !['publish', 'profile'].includes(t))
                    .length
                    ? 'home'
                    : 'home-outline'
                }
                active={
                  currentPage <
                  currentTabs.filter((t) => !['publish', 'profile'].includes(t))
                    .length
                }
                onPress={handleHomeTabPress}
                color={
                  currentPage <
                  currentTabs.filter((t) => !['publish', 'profile'].includes(t))
                    .length
                    ? tintColor
                    : Colors[colorScheme].textSecondary
                }
                width={bottomCapsuleWidth}
              />
            )}

            {currentTabs.includes('publish') && (
              <BottomTabIcon
                icon={
                  currentTabs[currentPage] === 'publish' ? 'add-circle' : 'add'
                }
                active={currentTabs[currentPage] === 'publish'}
                onPress={() => handleTabPress(currentTabs.indexOf('publish'))}
                color={
                  currentTabs[currentPage] === 'publish'
                    ? tintColor
                    : Colors[colorScheme].textSecondary
                }
                size={currentTabs[currentPage] === 'publish' ? 28 : 24}
                width={bottomCapsuleWidth}
              />
            )}

            {currentTabs.includes('profile') && (
              <BottomTabIcon
                icon={
                  currentTabs[currentPage] === 'profile'
                    ? 'person'
                    : 'person-outline'
                }
                active={currentTabs[currentPage] === 'profile'}
                onPress={() => handleTabPress(currentTabs.indexOf('profile'))}
                color={
                  currentTabs[currentPage] === 'profile'
                    ? tintColor
                    : Colors[colorScheme].textSecondary
                }
                width={bottomCapsuleWidth}
              />
            )}
          </View>
        </BlurView>
      </Animated.View>
      {!cookies && !guestCookieReady && (
        <View
          style={{
            width: 1,
            height: 1,
            opacity: 0,
            position: 'absolute',
            pointerEvents: 'none',
          }}
        >
          <WebView
            source={{ uri: 'https://www.zhihu.com/' }}
            sharedCookiesEnabled={true}
            injectedJavaScript={`
              (function() {
                var checkCookie = setInterval(function() {
                  if (document.cookie.includes('d_c0')) {
                    clearInterval(checkCookie);
                    setTimeout(function() {
                      window.ReactNativeWebView.postMessage('ready');
                    }, 2000); // 找到 d_c0 后再等 2 秒，让其他 cookie 载入
                  }
                }, 500);
              })();
              true;
            `}
            onMessage={() => {
              setGuestCookieReady(true);
            }}
          />
        </View>
      )}
    </View>
  );
}

const _AnimatedIcon = Animated.createAnimatedComponent(Ionicons);

function BottomTabIcon({
  icon,
  onPress,
  color,
  size = 24,
  isScrollTop,
  width,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  color: string;
  size?: number;
  active?: boolean;
  isScrollTop?: boolean;
  width?: number;
}) {
  // 动画状态
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  // 当置顶状态切换时播放动画
  React.useEffect(() => {
    scale.value = withSequence(
      withTiming(0.6, { duration: 150 }),
      withTiming(1, { duration: 150 }),
    );
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={styles.bottomTabItem} className="bg-transparent">
      <BouncyButton
        onPress={onPress}
        style={{
          width: width || 44,
          height: 44,
          borderRadius: 22,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Animated.View style={animatedStyle}>
          <Ionicons
            name={isScrollTop ? 'arrow-up-circle' : icon}
            size={isScrollTop ? size + 4 : size}
            color={isScrollTop ? color : color}
          />
        </Animated.View>
      </BouncyButton>
    </View>
  );
}

// FeedList 组件
const FeedList = React.forwardRef<
  FeedListHandle,
  {
    tab: FeedTabType;
    isActive: boolean;
    insets: EdgeInsets;
    guestCookieReady: boolean;
    onScroll?: (offset: number) => void;
    onRefreshStateChange?: (isRefreshing: boolean) => void;
  }
>(
  (
    { tab, isActive, insets, guestCookieReady, onScroll, onRefreshStateChange },
    ref,
  ) => {
    const queryClient = useQueryClient();
    const { cookies, me } = useAuthStore();
    const {
      enableLocalFeedDedup,
      enableFeedCacheOnLaunch,
      enableLocalFeedFilter,
      filterMode,
      filterShowReason,
      filterBlockPaid,
      filterBlockAdPlatform,
      filterBlockZhihuSchool,
      filterBlockWeChat,
      filterBlockLabeled,
      filterBlockOrgAuthor,
      filterBlockAdvertiser,
      filterEnableQuality,
      filterQualityLevel,
      filterKeepFollowing,
      filterKeepUpvotedByFollowee,
    } = useSettingsStore();
    const _colorScheme = useColorScheme();
    const tintColor = useThemeColor({}, 'primary');
    const [isRefreshing, setIsRefreshing] = useState(false);

    const localAccountKey = useMemo(
      () => resolveLocalAccountKey(me, Boolean(cookies)),
      [cookies, me],
    );
    const queryAccountKey = localAccountKey ?? 'authenticated-pending';
    const localDedupEnabled =
      enableLocalFeedDedup &&
      supportsLocalFeedDedup(tab) &&
      localAccountKey !== null;
    const exposureContext = useMemo<FeedExposureContext | null>(() => {
      if (!localAccountKey) return null;
      return { accountKey: localAccountKey, feedType: tab };
    }, [localAccountKey, tab]);
    // 启动缓存只服务推荐流（与设置项「启动时保留推荐流」一致）。
    // 读写两端都由这一个值派生，任一端都不可能再漏判 tab。
    const launchCacheContext = useMemo<FeedCacheContext | null>(() => {
      if (!enableFeedCacheOnLaunch || tab !== 'recommend') return null;
      if (!localAccountKey) return null;
      return { accountKey: localAccountKey, feedType: tab };
    }, [enableFeedCacheOnLaunch, localAccountKey, tab]);

    const filterRules = useMemo<FeedFilterRules>(
      () => ({
        blockPaid: filterBlockPaid,
        blockAdPlatform: filterBlockAdPlatform,
        blockZhihuSchool: filterBlockZhihuSchool,
        blockWeChat: filterBlockWeChat,
        blockLabeled: filterBlockLabeled,
        blockOrgAuthor: filterBlockOrgAuthor,
        blockAdvertiser: filterBlockAdvertiser,
        enableQuality: filterEnableQuality,
        qualityLevel: filterQualityLevel,
        keepFollowing: filterKeepFollowing,
        keepUpvotedByFollowee: filterKeepUpvotedByFollowee,
      }),
      [
        filterBlockPaid,
        filterBlockAdPlatform,
        filterBlockZhihuSchool,
        filterBlockWeChat,
        filterBlockLabeled,
        filterBlockOrgAuthor,
        filterBlockAdvertiser,
        filterEnableQuality,
        filterQualityLevel,
        filterKeepFollowing,
        filterKeepUpvotedByFollowee,
      ],
    );
    // 本地过滤仅作用于推荐流
    const filterEnabled = enableLocalFeedFilter && supportsLocalFeedFilter(tab);
    // 折叠组展开状态：刷新即重置，不持久化
    const [expandedCollapsedKeys, setExpandedCollapsedKeys] = useState<
      Set<string>
    >(new Set());
    const toggleCollapsed = useCallback((groupKey: string) => {
      setExpandedCollapsedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(groupKey)) next.delete(groupKey);
        else next.add(groupKey);
        return next;
      });
    }, []);
    // 隐藏模式下的自动补页轮次，handleRefresh 时清零
    const autoFetchRounds = useRef(0);
    // 补页预算耗尽（仍有下一页但已停止自动补）——ref 不触发重渲染，
    // 用一个 state 让 footer 能如实告知用户列表为何偏短。
    const [autoFetchExhausted, setAutoFetchExhausted] = useState(false);
    const [recentExposureKeys, setRecentExposureKeys] =
      useState<Set<string> | null>(() =>
        localDedupEnabled ? null : new Set(),
      );

    const [initialFeedCache, setInitialFeedCache] = useState<{
      pages: Array<{ items: FeedListItem[]; nextUrl: string | null }>;
      pageParams: string[];
    } | null>(null);
    const [isCacheCheckDone, setIsCacheCheckDone] = useState(false);

    useEffect(() => {
      if (!launchCacheContext) {
        setIsCacheCheckDone(true);
        return;
      }

      let cancelled = false;
      void feedCacheRepository
        .getFeedCache<FeedListItem>(launchCacheContext)
        .then((cached) => {
          if (cancelled) return;
          if (cached && cached.items.length > 0) {
            setInitialFeedCache({
              pages: [{ items: cached.items, nextUrl: cached.nextUrl }],
              pageParams: [FEED_URLS[tab]],
            });
          }
        })
        .catch((err) => {
          console.warn('获取启动 Feed 缓存失败', err);
        })
        .finally(() => {
          if (!cancelled) setIsCacheCheckDone(true);
        });

      return () => {
        cancelled = true;
      };
    }, [launchCacheContext, tab]);

    useEffect(() => {
      let cancelled = false;
      if (!localDedupEnabled || !exposureContext) {
        setRecentExposureKeys(new Set());
        return () => {
          cancelled = true;
        };
      }

      setRecentExposureKeys(null);
      void feedExposureRepository
        .getRecentContentKeys(exposureContext)
        .then((keys) => {
          if (!cancelled) setRecentExposureKeys(keys);
        })
        .catch((error) => {
          console.warn('读取本地 Feed 曝光记录失败', error);
          if (!cancelled) setRecentExposureKeys(new Set());
        });

      return () => {
        cancelled = true;
      };
    }, [exposureContext, localDedupEnabled]);

    const exposureTrackingRef = useRef({
      enabled:
        isActive &&
        localDedupEnabled &&
        exposureContext !== null &&
        recentExposureKeys !== null,
      context: exposureContext,
    });
    exposureTrackingRef.current = {
      enabled:
        isActive &&
        localDedupEnabled &&
        exposureContext !== null &&
        recentExposureKeys !== null,
      context: exposureContext,
    };
    const viewabilityConfig = useRef({
      itemVisiblePercentThreshold: 50,
      minimumViewTime: 800,
    }).current;
    const onViewableItemsChanged = useRef(
      ({ viewableItems }: { viewableItems: Array<{ item: FeedListItem }> }) => {
        const { enabled, context } = exposureTrackingRef.current;
        if (!enabled || !context) return;

        const identities = viewableItems
          .map((viewable) => viewable.item)
          .filter((item): item is FeedItem | HotItem => !isCollapsedGroup(item))
          .map((item) => getFeedContentIdentity(item))
          .filter(
            (identity): identity is FeedContentIdentity => identity !== null,
          );
        if (identities.length > 0) {
          void feedExposureRepository
            .recordExposures(context, identities)
            .catch((error) => {
              console.warn('记录本地 Feed 曝光失败', error);
            });
        }
      },
    ).current;
    const {
      data,
      fetchNextPage,
      hasNextPage,
      isFetchingNextPage,
      isLoading,
      isRefetching,
      refetch,
    } = useInfiniteQuery({
      queryKey: ['zhihu-feed', queryAccountKey, tab],
      queryFn: async ({ pageParam = FEED_URLS[tab] }) => {
        if (!cookies && tab === 'following')
          return { items: [], nextUrl: null };
        try {
          let requestUrl = pageParam as string;
          const isInitialUrl =
            (requestUrl === FEED_URLS[tab] ||
              requestUrl === 'zhihu://local-feed' ||
              requestUrl.includes('feed/topstory/recommend')) &&
            !requestUrl.includes('action=down');
          if (isRefreshing && isInitialUrl) {
            const sep = requestUrl.includes('?') ? '&' : '?';
            requestUrl = `${requestUrl}${sep}action=up&t=${Date.now()}`;
          }

          console.log(
            `🌐 [queryFn] Requesting URL: ${requestUrl} (tab=${tab}, isRefreshing=${isRefreshing})`,
          );
          const data = await getFeed(requestUrl);
          const rawItems = data.data || [];
          seedAnswerDetailsFromFeed(queryClient, rawItems);
          let items: Array<FeedItem | HotItem>;
          if (tab === 'following')
            items = rawItems
              .map((item: RawFeedItem) => parseFollowingData(item))
              .filter(Boolean) as FeedItem[];
          else if (tab === 'recommend' || tab === 'local')
            items = rawItems
              .map((item: RawFeedItem) => parseRecommendData(item))
              .filter(Boolean) as FeedItem[];
          else
            items = rawItems.map((item: RawFeedItem, index: number) =>
              parseHotData(item, index),
            );

          const nextUrl =
            data.paging?.next?.replace('http://', 'https://') ?? null;

          if (launchCacheContext && isInitialUrl && items.length > 0) {
            void feedCacheRepository
              .saveFeedCache(launchCacheContext, items, nextUrl)
              .catch((err) => console.warn('保存启动 Feed 缓存失败', err));
          }

          return {
            items,
            nextUrl,
          };
        } catch {
          return { items: [], nextUrl: null };
        }
      },
      initialPageParam: FEED_URLS[tab],
      getNextPageParam: (lastPage) => lastPage.nextUrl,
      initialData: initialFeedCache ?? undefined,
      staleTime: launchCacheContext && initialFeedCache ? 5 * 60 * 1000 : 0,
      enabled:
        (!!cookies || guestCookieReady) &&
        (!localDedupEnabled || recentExposureKeys !== null) &&
        (!launchCacheContext || isCacheCheckDone),
    });

    const handleRefresh = useCallback(async () => {
      setIsRefreshing(true);
      onRefreshStateChange?.(true);
      // 刷新即重置折叠展开状态（计划要求展开不持久化）
      setExpandedCollapsedKeys(new Set());
      // 新一轮刷新重新计算补页预算
      autoFetchRounds.current = 0;
      setAutoFetchExhausted(false);
      try {
        if (localDedupEnabled && exposureContext) {
          try {
            const keys =
              await feedExposureRepository.getRecentContentKeys(
                exposureContext,
              );
            setRecentExposureKeys(keys);
          } catch (error) {
            console.warn('刷新本地 Feed 曝光记录失败', error);
          }
        }
        const initialParam =
          tab === 'local' ? 'zhihu://local-feed' : FEED_URLS[tab];
        await refreshInfiniteQuery(
          queryClient,
          ['zhihu-feed', queryAccountKey, tab],
          refetch,
          initialParam,
        );
      } catch (_e) {
      } finally {
        setIsRefreshing(false);
        onRefreshStateChange?.(false);
      }
    }, [
      exposureContext,
      localDedupEnabled,
      onRefreshStateChange,
      queryClient,
      queryAccountKey,
      refetch,
      tab,
    ]);

    const flattenedData = useMemo(() => {
      const all = data?.pages.flatMap((page) => page.items) ?? [];
      const seen = new Set<string>();
      const deduped: FeedListItem[] = [];
      for (const item of all) {
        // 启动缓存与解析均只产出 FeedItem / HotItem，折叠行不会从源头进入；
        // 这里仅做类型收窄，避免 CollapsedGroup 误传入 identity 函数。
        if (isCollapsedGroup(item)) {
          deduped.push(item);
          continue;
        }
        const inMemoryKey = getInMemoryFeedKey(item);
        if (!inMemoryKey || seen.has(inMemoryKey)) continue;
        seen.add(inMemoryKey);

        const persistentKey = getFeedContentKey(item);
        if (
          localDedupEnabled &&
          persistentKey &&
          recentExposureKeys?.has(persistentKey)
        ) {
          continue;
        }
        deduped.push(item);
      }

      // 本地过滤仅作用于推荐流。Recommend tab 下 deduped 全为 FeedItem。
      if (filterEnabled) {
        const filtered = applyFeedFilter(
          deduped as FeedItem[],
          filterRules,
          filterMode,
        );
        const out: FeedListItem[] = [];
        for (const item of filtered) {
          if (
            isCollapsedGroup(item) &&
            expandedCollapsedKeys.has(item.groupKey)
          ) {
            // 已展开：保留折叠行（变「已展开」态）并把内容平铺回列表
            out.push(item);
            for (const sub of item.items) out.push(sub);
          } else {
            out.push(item);
          }
        }
        return out;
      }
      return deduped;
    }, [
      data,
      localDedupEnabled,
      recentExposureKeys,
      filterEnabled,
      filterRules,
      filterMode,
      expandedCollapsedKeys,
    ]);

    const flashListRef = useRef<FlashListRef<FeedListItem>>(null);

    // 过滤开启下，列表可能因大量过滤/折叠短到无法滚动，onEndReached 就此失效。
    // 这里主动补页把可渲染行数补到 MIN_RENDERABLE_ITEMS，并以
    // MAX_AUTO_FETCH_ROUNDS 封顶，避免高过滤率下无节制连续请求。
    useEffect(() => {
      if (!filterEnabled) return;
      if (!hasNextPage || isFetchingNextPage) return;
      if (flattenedData.length >= MIN_RENDERABLE_ITEMS) return;
      if (autoFetchRounds.current >= MAX_AUTO_FETCH_ROUNDS) {
        // 相同值的 setState 会被 React bail out，不会造成循环
        setAutoFetchExhausted(true);
        return;
      }
      autoFetchRounds.current += 1;
      void fetchNextPage();
    }, [
      filterEnabled,
      flattenedData.length,
      hasNextPage,
      isFetchingNextPage,
      fetchNextPage,
    ]);

    useEffect(() => {
      if (!isActive || !localDedupEnabled || recentExposureKeys === null)
        return;

      const frame = requestAnimationFrame(() => {
        flashListRef.current?.recomputeViewableItems();
      });
      return () => cancelAnimationFrame(frame);
    }, [isActive, localDedupEnabled, recentExposureKeys]);

    React.useImperativeHandle(ref, () => ({
      scrollToOffset: (args) => flashListRef.current?.scrollToOffset(args),
      refresh: handleRefresh,
    }));

    return (
      <FlashList
        ref={flashListRef}
        showsVerticalScrollIndicator={false}
        data={flattenedData}
        extraData={{
          expandedCollapsedKeys,
          filterMode,
          filterRules,
          isRefreshing,
          isRefetching,
        }}
        keyExtractor={(item, index) => {
          if (isCollapsedGroup(item)) return `collapsed-${item.groupKey}`;
          const key = getInMemoryFeedKey(item);
          return `feed-${key || index}`;
        }}
        onEndReached={() => {
          // 只要有下一页就继续追加。隐藏模式被过滤项不占行，列表自然偏短，
          // 这里依靠 hasNextPage 持续续页即可；列表过短且已到底时由 footer
          // 给出一句诚实的提示，避免用户以为加载卡住。
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onRefresh={handleRefresh}
        refreshing={isRefreshing || isRefetching}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing || isRefetching}
            onRefresh={handleRefresh}
            tintColor="transparent"
            colors={['transparent']}
            progressBackgroundColor="transparent"
            progressViewOffset={insets.top + 10}
            style={{ opacity: 0 }}
          />
        }
        onScroll={(e) => onScroll?.(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={100}
        contentContainerStyle={{
          paddingTop: insets.top + 70,
          paddingBottom: 120,
        }}
        renderItem={({ item }: { item: FeedListItem }) => {
          if (isCollapsedGroup(item)) {
            const expanded = expandedCollapsedKeys.has(item.groupKey);
            const showReason = filterMode === 'collapse' && filterShowReason;
            return (
              <Pressable
                onPress={() => toggleCollapsed(item.groupKey)}
                className="mx-2 my-1 flex-row items-center justify-between rounded-xl px-4 py-3"
                style={{ backgroundColor: `${tintColor}14` }}
              >
                <Text type="secondary">
                  {expanded
                    ? `已展开 ${item.items.length} 条`
                    : `已折叠 ${item.items.length} 条`}
                  {showReason && !expanded && item.reasons.length > 0
                    ? ` · ${item.reasons.join('、')}`
                    : ''}
                </Text>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={tintColor}
                />
              </Pressable>
            );
          }
          return tab === 'hot' ? (
            // tab 在该 FeedList 实例生命周期内不变，是可靠的运行时判别：
            // hot tab 的 data 只含 HotItem，其余 tab 只含 FeedItem（折叠行已在上层排除）。
            <HotCard item={item as HotItem} />
          ) : (
            <FeedCard item={item as FeedItem} tab={tab} />
          );
        }}
        ListHeaderComponent={tab === 'following' ? <RecentMoments /> : null}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator style={{ margin: 20 }} />
          ) : filterEnabled &&
            !isRefreshing &&
            !isRefetching &&
            !isLoading &&
            flattenedData.length > 0 &&
            flattenedData.length <= MIN_RENDERABLE_ITEMS &&
            (!hasNextPage || autoFetchExhausted) ? (
            <Text
              type="secondary"
              style={{ textAlign: 'center', margin: 20, fontSize: 12 }}
            >
              {hasNextPage
                ? '过滤后内容偏少，下拉可继续加载'
                : '过滤后内容偏少，已无更多可加载'}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          isLoading || isRefreshing || isRefetching ? (
            <View className="flex-1 items-center justify-center mt-[100px] bg-transparent">
              <ActivityIndicator size="large" color={tintColor} />
            </View>
          ) : (
            <View className="flex-1 items-center justify-center mt-[100px] bg-transparent">
              <Text type="secondary">暂无内容 喵~</Text>
            </View>
          )
        }
      />
    );
  },
);

// 数据解析函数保持不变 (省略以节省空间，实际代码中应保留)
function parseFollowingData(item: RawFeedItem): FeedItem | null {
  const target = item.target;
  if (!target) return null;
  const type = target.type;
  let appType: 'answers' | 'articles' | 'pins' | 'questions' | null = null;
  if (type === 'answer') appType = 'answers';
  else if (type === 'article') appType = 'articles';
  else if (type === 'pin') appType = 'pins';
  else if (type === 'question') appType = 'questions';

  if (!appType) return null;

  return {
    id: target.id?.toString() || Math.random().toString(),
    title: target.question?.title || target.title || '',
    questionId:
      target.question?.id?.toString() ||
      (type === 'question' ? target.id?.toString() : ''),
    actionText: item.action_text,
    author: {
      id: target.author?.id || '',
      url_token: target.author?.url_token || '',
      name: target.author?.name || '匿名用户',
      avatar:
        target.author?.avatar_url ||
        'https://picx.zhimg.com/v2-abed1a8c04700ba7d72b45195223e0ff_l.jpg',
    },
    excerpt:
      target.excerpt ||
      (Array.isArray(target.content)
        ? target.content[0]?.content
        : target.content) ||
      '',
    content: target.content || '',
    image:
      target.thumbnail ||
      (target.content_img && target.content_img.length > 0
        ? target.content_img[0]
        : null),
    voteCount: target.voteup_count || target.like_count || 0,
    commentCount: target.comment_count || 0,
    favlistsCount:
      target.favorite_count || target.reaction?.statistics?.favorites || 0,
    voted: target.relationship?.voting || 0,
    type: appType,
    topics: target.topics?.map((topic) => ({
      id: topic.id,
      name: topic.name,
    })),
  };
}

/**
 * 归一化回答的付费类型。
 *
 * `answer_type` 的大小写随接口而异——实测游客推荐流返回小写 `normal`，
 * 话题流返回大写 `NORMAL` / `PAID`。统一大写后比较，并与 `paid_info`
 * 取或作为兜底信号，避免盐选内容因大小写差异静默漏判。
 */
function normalizeAnswerType(target: {
  answer_type?: unknown;
  paid_info?: unknown;
}): string | undefined {
  const raw =
    typeof target.answer_type === 'string'
      ? target.answer_type.toUpperCase()
      : undefined;
  if (raw === 'PAID' || target.paid_info != null) return 'PAID';
  return raw;
}

function seedAnswerDetailsFromFeed(
  queryClient: QueryClient,
  items: RawFeedItem[],
) {
  for (const item of items) {
    const target = (item.target || item) as unknown as RawFeedTarget;
    const id = target.id?.toString().trim();

    if (!id || !hasReusableAnswerDetail(target)) continue;

    queryClient.setQueryData(['answer-detail', id], (existing: unknown) =>
      existing == null ? target : existing,
    );
  }
}

function parseRecommendData(item: RawFeedItem): FeedItem | null {
  const target = (item.target || item) as unknown as RawFeedTarget;
  const type = target.type;
  const stableId = target.id?.toString().trim();
  let appType: 'answers' | 'articles' | 'pins' | 'questions' | null = null;
  if (type === 'answer') appType = 'answers';
  else if (type === 'article') appType = 'articles';
  else if (type === 'pin') appType = 'pins';
  else if (type === 'question') appType = 'questions';

  if (!appType) return null;

  return {
    id: stableId || Math.random().toString(),
    isIdStable: Boolean(stableId),
    title: target.question?.title || target.title || '',
    questionId:
      target.question?.id?.toString() ||
      (type === 'question' ? target.id?.toString() : ''),
    author: {
      id: target.author?.id || '',
      name: target.author?.name || '匿名用户',
      avatar:
        target.author?.avatar_url ||
        'https://picx.zhimg.com/v2-abed1a8c04700ba7d72b45195223e0ff_l.jpg',
      headline: target.author?.headline || '',
    },
    excerpt:
      target.excerpt ||
      (Array.isArray(target.content)
        ? target.content[0]?.content
        : target.content) ||
      '',
    content: target.content || '',
    image:
      target.thumbnail ||
      (target.content_img && target.content_img.length > 0
        ? target.content_img[0]
        : null),
    voteCount: target.voteup_count || target.like_count || 0,
    commentCount: target.comment_count || 0,
    favlistsCount:
      target.favlists_count ||
      target.favorite_count ||
      target.reaction?.statistics?.favorites ||
      0,
    voted: target.relationship?.voting || 0,
    type: appType,
    topics: target.topics?.map((topic) => ({
      id: topic.id,
      name: topic.name,
    })),
    // 本地过滤信号：实测推荐流可用字段（详见 utils/feedFilter.ts）
    // 盐选双信号取或：answer_type === 'PAID' 或 paid_info != null。
    // 大小写按接口而异——实测游客推荐流返回小写 `normal`，话题流返回大写
    // `NORMAL`/`PAID`，故统一大写后再比较，避免漏判。
    answerType: normalizeAnswerType(target),
    isLabeled: Boolean(target.is_labeled),
    isOrgAuthor: Boolean(target.author?.is_org),
    isAdvertiser: Boolean(target.author?.is_advertiser),
    isFollowingAuthor: Boolean(target.author?.is_following),
    upvotedByFollowee:
      (target.relationship?.upvoted_followee_ids?.length ?? 0) > 0,
    boundTopicIds: target.question?.bound_topic_ids,
    // question 类型 target 自身即 question，答案/文章则从嵌套 question 读取
    answerCount:
      type === 'question' ? target.answer_count : target.question?.answer_count,
    followerCount:
      type === 'question'
        ? target.follower_count
        : target.question?.follower_count,
  };
}

function parseHotData(item: RawFeedItem, index: number): HotItem {
  const target = item.target || (item as unknown as RawFeedTarget);
  const questionId =
    target.link?.url?.split('/').pop() || target.url?.split('/').pop() || '';

  // Handle fallback fields for both JSON structures
  const hotValue =
    target.metrics_area?.text || item.detail_text || target.detail_text || '';
  const answerCount =
    item.feed_specific?.answer_count || target.answer_count || 0;

  // Reconstruct labelArea if it's missing but we have card_label
  let labelArea = target.label_area || null;
  if (!labelArea) {
    if (item.card_label?.type === 'new' || item.debut) {
      labelArea = { type: 'text', text: '新', normal_color: '#ff9607' };
    } else if (item.card_label?.type === 'hot') {
      labelArea = { type: 'text', text: '热', normal_color: '#f65324' };
    }
  }

  return {
    id:
      item.id?.toString() || target.id?.toString() || Math.random().toString(),
    questionId: questionId,
    rank: index + 1,
    title: target.title_area?.text || target.title || '无标题',
    excerpt: target.excerpt_area?.text || target.excerpt || '',
    image:
      target.image_area?.url ||
      item.children?.[0]?.thumbnail ||
      item.image_url ||
      null,
    hotValue,
    answerCount,
    labelArea,
  };
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pager: { flex: 1 },
  topNavContainer: { position: 'absolute', left: 16, right: 16, zIndex: 100 },
  blurWrapper: {
    borderRadius: 25,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    height: 50,
  },
  navItem: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  navText: { fontSize: 15 },
  topPill: {
    position: 'absolute',
    width: 54,
    height: 34,
    borderRadius: 17,
    left: 0,
  },
  searchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },

  bottomBarContainer: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 1001,
  },
  bottomBlur: { borderRadius: 32, overflow: 'hidden', height: 64 },
  bottomNavItems: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  bottomTabItem: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomIndicator: {
    position: 'absolute',
    height: 44,
    borderRadius: 22,
    left: 10,
  },

  loginPrompt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  loginText: { fontSize: 16, marginTop: 20, marginBottom: 30 },
  loginBtn: { paddingHorizontal: 40, paddingVertical: 12, borderRadius: 25 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

function TopLoadingBar({ color }: { color: string }) {
  const anim = useSharedValue(0);

  useEffect(() => {
    anim.value = withRepeat(withTiming(1, { duration: 1000 }), -1, false);
  }, [anim]);

  const animatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(anim.value, [0, 1], [-150, 300]);
    return {
      transform: [{ translateX }],
    };
  });

  return (
    <View
      style={{
        height: 2.5,
        width: '100%',
        backgroundColor: 'rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={[
          {
            width: 120,
            height: 2.5,
            backgroundColor: color,
            borderRadius: 1.25,
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}
