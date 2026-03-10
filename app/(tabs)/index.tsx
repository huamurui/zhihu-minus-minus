import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/store/useAuthStore';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 使用 @ 别名导入组件
import { FEED_URLS, getFeed } from '@/api/zhihu';
import { FeedCard } from '@/components/FeedCard';
import { HotCard, HotItem } from '@/components/HotCard';
import { Text, View, useThemeColor } from '@/components/Themed';
import { DailyList } from '@/components/DailyList';

const TABS = ['following', 'recommend', 'daily', 'hot'] as const;
type TabType = typeof TABS[number];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('daily');
  const pagerRef = useRef<PagerView>(null);

  const tintColor = useThemeColor({}, 'tint');
  const borderBottomColor = useThemeColor({}, 'border');
  const textColor = useThemeColor({}, 'text');

  const { cookies } = useAuthStore();

  const handleTabPress = (tab: TabType, index: number) => {
    setActiveTab(tab);
    pagerRef.current?.setPage(index);
  };

  return (
    <View style={styles.container}>
      {/* 顶部 Tab 导航：带毛玻璃效果 */}
      <View style={[styles.topNavContainer, { top: insets.top + 10, paddingHorizontal: 16 }]}>
        <BlurView
          intensity={200}
          tint={colorScheme}
          style={styles.blurWrapper}
        >
          <View style={styles.topNav}>
            <View style={{ flexDirection: 'row', flex: 1, backgroundColor: 'transparent', alignItems: 'center' }}>
              {TABS.map((tab, index) => {
                const isActive = activeTab === tab;
                return (
                  <Pressable
                    key={tab}
                    onPress={() => handleTabPress(tab, index)}
                    style={[
                      styles.navItem,
                      isActive && { backgroundColor: tintColor + '15' }
                    ]}
                  >
                    <Text
                      style={[
                        styles.navText,
                        isActive && { fontWeight: 'bold', color: tintColor }
                      ]}
                      type={isActive ? 'default' : 'secondary'}
                    >
                      {tab === 'following' ? '关注' : tab === 'recommend' ? '推荐' : tab === 'daily' ? '日报' : '热榜'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              onPress={() => router.push('/search')}
              style={({ pressed }) => ({
                opacity: pressed ? 0.5 : 1,
                width: 40,
                height: 40,
                borderRadius: 20,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: 'transparent',
              })}
            >
              <Ionicons name="search" size={22} color={textColor} />
            </Pressable>
          </View>
        </BlurView>
      </View>

      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={2} // Daily is index 2
        onPageSelected={(e) => setActiveTab(TABS[e.nativeEvent.position])}
      >
        {TABS.map((tab) => (
          <View key={tab} style={{ flex: 1, backgroundColor: 'transparent' }}>
            {tab === 'daily' ? (
              <DailyList insets={insets} />
            ) : !cookies ? (
              <View style={styles.loginPrompt}>
                <Text style={styles.loginText} type="secondary">
                  登录后才能看{tab === 'following' ? '关注' : tab === 'recommend' ? '推荐' : '热榜'}哦
                </Text>
                <Pressable
                  style={[styles.loginBtn, { backgroundColor: tintColor }]}
                  onPress={() => router.push('/login' as any)}
                >
                  <Text style={styles.loginBtnText}>去登录</Text>
                </Pressable>
              </View>
            ) : (
              <FeedList tab={tab as any} insets={insets} />
            )}
          </View>
        ))}
      </PagerView>
    </View>
  );
}

// 抽取列表组件
function FeedList({ tab, insets }: { tab: TabType; insets: any }) {
  const { cookies } = useAuthStore();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } = useInfiniteQuery({
    queryKey: ['zhihu-feed', tab],
    queryFn: async ({ pageParam = (FEED_URLS as any)[tab] }) => {
      if (!cookies && tab === 'following') return { items: [], nextUrl: null };
      if (tab === 'daily') return { items: [], nextUrl: null }; // daily should be handled by DailyList
      try {
        const data = await getFeed(pageParam as string);
        const rawItems = data.data || [];

        let items;
        if (tab === 'following') {
          items = rawItems.map((item: any) => parseFollowingData(item)).filter(Boolean);
        } else if (tab === 'recommend') {
          items = rawItems.map((item: any) => parseRecommendData(item));
        } else {
          items = rawItems.map((item: any, index: number) => parseHotData(item, index));
        }

        return {
          items,
          nextUrl: data.paging?.next?.replace('http://', 'https://')
        };
      } catch (e: any) {
        console.log(`❌ API ${tab} 失败:`, e.response?.status || e.message);
        return { items: [], nextUrl: null };
      }
    },
    initialPageParam: (FEED_URLS as any)[tab],
    getNextPageParam: (lastPage) => lastPage.nextUrl,
    enabled: !!cookies,
  });

  const flattenedData = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <FlashList
      data={flattenedData}
      {...({ estimatedItemSize: tab === 'recommend' ? 180 : 100 } as any)}
      onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
      onEndReachedThreshold={0.5}
      onRefresh={refetch}
      refreshing={isLoading}
      contentContainerStyle={{
        paddingTop: insets.top + 70,
        paddingBottom: 110
      }}
      renderItem={({ item }: { item: any }) => {
        if (tab === 'hot') {
          return <HotCard item={item as HotItem} />;
        }
        return <FeedCard item={item} />;
      }}
      ListEmptyComponent={isLoading ? null : (
        <View style={{ flex: 1, alignItems: 'center', paddingTop: 100, backgroundColor: 'transparent' }}>
          <Text type="secondary">暂无内容</Text>
        </View>
      )}
      ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ margin: 20 }} /> : null}
    />
  );
}

// 关注流数据解析
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

// 推荐流数据解析
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

// 热榜数据解析
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
  topNavContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 100,
  },
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
    backgroundColor: 'transparent',
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
  loginPrompt: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 },
  loginText: { fontSize: 16, marginTop: 20, marginBottom: 30 },
  loginBtn: { paddingHorizontal: 40, paddingVertical: 12, borderRadius: 25 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
