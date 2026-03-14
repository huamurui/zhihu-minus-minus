import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/store/useAuthStore';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import React, { useRef, useState, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Dimensions } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolate
} from 'react-native-reanimated';

// 使用 @ 别名导入组件
import { FEED_URLS, getFeed } from '@/api/zhihu';
import { FeedCard } from '@/components/FeedCard';
import { HotCard, HotItem } from '@/components/HotCard';
import { Text, View } from '@/components/Themed';
import { DailyList } from '@/components/DailyList';
import { ProfileView } from '@/components/ProfileView';
import { PublishView } from '@/components/PublishView';
import Colors from '@/constants/Colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// 统一的所有可滑动的页面索引
// 0: 关注, 1: 推荐, 2: 热榜, 3: 日报, 4: 发布, 5: 我的
const TABS = ['following', 'recommend', 'hot', 'daily', 'publish', 'profile'] as const;
type TabType = typeof TABS[number];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const router = useRouter();

  // 核心状态：共享滚动位置
  const scrollX = useSharedValue(3); // 初始停在日报 (index 3)
  const pagerRef = useRef<PagerView>(null);
  const [currentPage, setCurrentPage] = useState(3);

  const tintColor = Colors[colorScheme].tint;
  const textColor = Colors[colorScheme].text;
  const { cookies } = useAuthStore();

  const handleTabPress = (index: number) => {
    pagerRef.current?.setPage(index);
  };

  // 顶部导航栏动画样式
  const topNavAnimStyle = useAnimatedStyle(() => {
    // 当滑动到 index 4 (发布) 及以后时，顶部导航渐隐
    const opacity = interpolate(
      scrollX.value,
      [3, 4],
      [1, 0],
      Extrapolate.CLAMP
    );
    const translateY = interpolate(
      scrollX.value,
      [3, 4],
      [0, -100],
      Extrapolate.CLAMP
    );
    return {
      opacity,
      transform: [{ translateY }],
      pointerEvents: scrollX.value > 3.5 ? 'none' : 'auto',
    };
  });

  // 顶部 Tab 指示器动画
  const topIndicatorStyle = useAnimatedStyle(() => {
    const tabWidth = 58;
    return {
      transform: [{ translateX: scrollX.value * tabWidth }]
    };
  });

  // 底部导航栏指示器动画
  const bottomIndicatorStyle = useAnimatedStyle(() => {
    // 底部 3 个 Icon 位置映射
    // index 0-3 -> Home (pos 0)
    // index 4 -> Publish (pos 1)
    // index 5 -> Profile (pos 2)
    const iconWidth = (SCREEN_WIDTH - 40) / 3;
    const translateX = interpolate(
      scrollX.value,
      [0, 3, 4, 5],
      [0, 0, iconWidth, iconWidth * 2],
      Extrapolate.CLAMP
    );
    return {
      transform: [{ translateX }]
    };
  });

  return (
    <View style={styles.container}>
      {/* 1. 顶部 Tab 导航 (Home 专属) */}
      <Animated.View style={[styles.topNavContainer, { top: insets.top + 10 }, topNavAnimStyle]}>
        <BlurView 
          intensity={100} 
          tint={colorScheme === 'dark' ? 'dark' : 'light'} 
          style={[
            styles.blurWrapper,
            { backgroundColor: colorScheme === 'dark' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.85)' }
          ]}
        >
          <View style={styles.topNav}>
            <View style={{ flexDirection: 'row', flex: 1, backgroundColor: 'transparent', alignItems: 'center', position: 'relative' }}>
              <Animated.View style={[styles.topPill, { backgroundColor: tintColor + '15' }, topIndicatorStyle]} />
              {['关注', '推荐', '热榜', '日报'].map((label, index) => (
                <Pressable key={label} onPress={() => handleTabPress(index)} style={styles.navItem}>
                  <Text style={[styles.navText, currentPage === index && { fontWeight: 'bold', color: tintColor }]} type={currentPage === index ? 'default' : 'secondary'}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => router.push('/search')} style={styles.searchBtn}>
              <Ionicons name="search" size={22} color={textColor} />
            </Pressable>
          </View>
        </BlurView>
      </Animated.View>

      {/* 2. 统一 PagerView */}
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={3}
        onPageScroll={(e) => {
          scrollX.value = e.nativeEvent.position + e.nativeEvent.offset;
        }}
        onPageSelected={(e) => {
          setCurrentPage(e.nativeEvent.position);
        }}
      >
        {TABS.map((tab, index) => (
          <View key={tab} style={{ flex: 1, backgroundColor: 'transparent' }}>
            {index === 3 ? (
              <DailyList insets={insets} />
            ) : index === 4 ? (
              <PublishView />
            ) : index === 5 ? (
              <ProfileView />
            ) : !cookies ? (
              <View style={styles.loginPrompt}>
                <Text style={styles.loginText} type="secondary">登录后才能看此栏目哦</Text>
                <Pressable style={[styles.loginBtn, { backgroundColor: tintColor }]} onPress={() => router.push('/login' as any)}>
                  <Text style={styles.loginBtnText}>去登录</Text>
                </Pressable>
              </View>
            ) : (
              <FeedList tab={tab as any} insets={insets} />
            )}
          </View>
        ))}
      </PagerView>

      {/* 3. 底部悬浮导航栏 (Custom TabBar) */}
      <View style={[styles.bottomBarContainer, { bottom: insets.bottom + 20 }]}>
        <BlurView 
          intensity={130} 
          tint={colorScheme === 'dark' ? 'dark' : 'light'} 
          style={[
            styles.bottomBlur,
            { backgroundColor: colorScheme === 'dark' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.85)' }
          ]}
        >
          <View style={styles.bottomNavItems}>
            {/* 联动指示器 */}
            <Animated.View style={[styles.bottomIndicator, { backgroundColor: tintColor + '15' }, bottomIndicatorStyle]} />

            <BottomTabIcon
              icon={currentPage <= 3 ? "home" : "home-outline"}
              active={currentPage <= 3}
              onPress={() => handleTabPress(1)} // 默认跳到推荐
              color={currentPage <= 3 ? tintColor : Colors[colorScheme].textSecondary}
            />
            <BottomTabIcon
              icon={currentPage === 4 ? "add-circle" : "add"}
              active={currentPage === 4}
              onPress={() => handleTabPress(4)}
              color={currentPage === 4 ? tintColor : Colors[colorScheme].textSecondary}
              size={currentPage === 4 ? 28 : 24}
            />
            <BottomTabIcon
              icon={currentPage === 5 ? "person" : "person-outline"}
              active={currentPage === 5}
              onPress={() => handleTabPress(5)}
              color={currentPage === 5 ? tintColor : Colors[colorScheme].textSecondary}
            />
          </View>
        </BlurView>
      </View>
    </View>
  );
}

function BottomTabIcon({ icon, active, onPress, color, size = 24 }: any) {
  return (
    <Pressable onPress={onPress} style={styles.bottomTabItem}>
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

// FeedList 组件保持不变
function FeedList({ tab, insets }: { tab: TabType; insets: any }) {
  const { cookies } = useAuthStore();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } = useInfiniteQuery({
    queryKey: ['zhihu-feed', tab],
    queryFn: async ({ pageParam = (FEED_URLS as any)[tab] }) => {
      if (!cookies && (tab === 'following' || tab === 'recommend')) return { items: [], nextUrl: null };
      try {
        const data = await getFeed(pageParam as string);
        const rawItems = data.data || [];
        let items;
        if (tab === 'following') items = rawItems.map((item: any) => parseFollowingData(item)).filter(Boolean);
        else if (tab === 'recommend') items = rawItems.map((item: any) => parseRecommendData(item));
        else items = rawItems.map((item: any, index: number) => parseHotData(item, index));
        return { items, nextUrl: data.paging?.next?.replace('http://', 'https://') };
      } catch (e: any) { return { items: [], nextUrl: null }; }
    },
    initialPageParam: (FEED_URLS as any)[tab],
    getNextPageParam: (lastPage) => lastPage.nextUrl,
    enabled: !!cookies,
  });

  const flattenedData = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <FlashList
      data={flattenedData}
      onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
      onEndReachedThreshold={0.5}
      onRefresh={refetch}
      refreshing={isLoading}
      contentContainerStyle={{ paddingTop: insets.top + 70, paddingBottom: 120 }}
      renderItem={({ item }: { item: any }) => tab === 'hot' ? <HotCard item={item} /> : <FeedCard item={item} />}
      ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ margin: 20 }} /> : null}
    />
  );
}

// 数据解析函数保持不变 (省略以节省空间，实际代码中应保留)
function parseFollowingData(item: any) {
  const target = item.target;
  if (!target) return null;
  const type = target.type;
  let appType: 'answers' | 'articles' | 'pins' | 'questions' = 'answers';
  if (type === 'answer') appType = 'answers';
  else if (type === 'article') appType = 'articles';
  else if (type === 'pin') appType = 'pins';
  else if (type === 'question') appType = 'questions';

  return {
    id: target.id?.toString() || Math.random().toString(),
    title: target.question?.title || target.title || "",
    questionId: target.question?.id?.toString() || (type === 'question' ? target.id?.toString() : ""),
    actionText: item.action_text,
    author: {
      id: target.author?.id || "",
      url_token: target.author?.url_token || "",
      name: target.author?.name || "匿名用户",
      avatar: target.author?.avatar_url || "https://picx.zhimg.com/v2-abed1a8c04700ba7d72b45195223e0ff_l.jpg",
    },
    excerpt: target.excerpt || target.content?.[0]?.content || "",
    image: target.thumbnail || (target.content_img?.length > 0 ? target.content_img[0] : null),
    voteCount: target.voteup_count || target.like_count || 0,
    commentCount: target.comment_count || 0,
    voted: target.relationship?.voting || 0,
    type: appType,
  };
}

function parseRecommendData(item: any) {
  const target = item.target || item;
  const type = target.type;
  let appType: 'answers' | 'articles' | 'pins' | 'questions' = 'answers';
  if (type === 'answer') appType = 'answers';
  else if (type === 'article') appType = 'articles';
  else if (type === 'pin') appType = 'pins';
  else if (type === 'question') appType = 'questions';

  return {
    id: target.id?.toString() || Math.random().toString(),
    title: target.question?.title || target.title || "",
    questionId: target.question?.id?.toString() || (type === 'question' ? target.id?.toString() : ""),
    author: {
      id: target.author?.id || "",
      name: target.author?.name || "匿名用户",
      avatar: target.author?.avatar_url || "https://picx.zhimg.com/v2-abed1a8c04700ba7d72b45195223e0ff_l.jpg",
      headline: target.author?.headline || ""
    },
    excerpt: target.excerpt || target.content?.[0]?.content || "",
    image: target.thumbnail || (target.content_img?.length > 0 ? target.content_img[0] : null),
    voteCount: target.voteup_count || target.like_count || 0,
    commentCount: target.comment_count || 0,
    voted: target.relationship?.voting || 0,
    type: appType,
  };
}

function parseHotData(item: any, index: number) {
  const target = item.target || item;
  const questionId = target.url.split('/').pop();
  return {
    id: target.id?.toString() || Math.random().toString(),
    questionId: questionId,
    rank: index + 1,
    title: target.title || "无标题",
    excerpt: target.excerpt || "",
    image: item.children?.[0]?.thumbnail || item.image_url || null,
    hotValue: target.detail_text || "",
  };
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pager: { flex: 1 },
  topNavContainer: { position: 'absolute', left: 16, right: 16, zIndex: 100 },
  blurWrapper: { borderRadius: 25, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)' },
  topNav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, height: 50 },
  navItem: { paddingHorizontal: 12, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', marginRight: 4 },
  navText: { fontSize: 15 },
  topPill: { position: 'absolute', width: 54, height: 34, borderRadius: 17, left: 0 },
  searchBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

  bottomBarContainer: { position: 'absolute', left: 20, right: 20, zIndex: 1001 },
  bottomBlur: { borderRadius: 32, overflow: 'hidden', height: 64 },
  bottomNavItems: { flexDirection: 'row', flex: 1, alignItems: 'center', position: 'relative' },
  bottomTabItem: { flex: 1, height: '100%', justifyContent: 'center', alignItems: 'center' },
  bottomIndicator: { position: 'absolute', width: (SCREEN_WIDTH - 40) / 3 - 20, height: 44, borderRadius: 22, left: 10 },

  loginPrompt: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 },
  loginText: { fontSize: 16, marginTop: 20, marginBottom: 30 },
  loginBtn: { paddingHorizontal: 40, paddingVertical: 12, borderRadius: 25 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
