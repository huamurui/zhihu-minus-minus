import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/store/useAuthStore';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

// 使用 @ 别名导入组件
import { FEED_URLS, getFeed } from '@/api/zhihu';
import { FeedCard } from '@/components/FeedCard';
import { HotCard, HotItem } from '@/components/HotCard';
import { Text, View, useThemeColor } from '@/components/Themed';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'following' | 'recommend' | 'hot'>('recommend');
  const tintColor = useThemeColor({}, 'tint');
  const borderBottomColor = useThemeColor({}, 'border');
  const textColor = useThemeColor({}, 'text');

  const { cookies } = useAuthStore();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } = useInfiniteQuery({
    queryKey: ['zhihu-feed', activeTab],
    queryFn: async ({ pageParam = FEED_URLS[activeTab] }) => {
      // 如果没有 cookie，理论上 enabled 已经阻止了调用，但这里加一层保护
      if (!cookies && activeTab === 'following') {
        return { items: [], nextUrl: null };
      }
      try {
        const data = await getFeed(pageParam as string);
        const rawItems = data.data || [];

        let items;
        if (activeTab === 'following') {
          items = rawItems.map((item: any) => parseFollowingData(item)).filter(Boolean);
        } else if (activeTab === 'recommend') {
          items = rawItems.map((item: any) => parseRecommendData(item));
        } else {
          items = rawItems.map((item: any, index: number) => parseHotData(item, index));
        }

        return {
          items,
          nextUrl: data.paging?.next?.replace('http://', 'https://')
        };
      } catch (e: any) {
        console.log(`❌ API ${activeTab} 失败:`, e.response?.status || e.message);
        return { items: [], nextUrl: null };
      }
    },
    initialPageParam: FEED_URLS[activeTab],
    getNextPageParam: (lastPage) => lastPage.nextUrl,
    enabled: !!cookies, // 首页三个 tab 均在登录后触发，避免未登录时的 401 或无效请求
  });

  const flattenedData = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <View style={styles.container}>
      {/* 顶部 Tab 导航：带毛玻璃效果 */}
      <BlurView
        intensity={80}
        tint={colorScheme}
        style={[styles.topNavContainer, { borderBottomColor }]}
      >
        <View style={[styles.topNav, { paddingTop: insets.top + 5 }]}>
          <View style={{ flexDirection: 'row', flex: 1, backgroundColor: 'transparent' }}>
            {(['following', 'recommend', 'hot'] as const).map((tab) => (
              <Pressable key={tab} onPress={() => setActiveTab(tab)} style={styles.navItem}>
                <Text
                  style={[
                    styles.navText,
                    activeTab === tab && { fontWeight: 'bold' }
                  ]}
                  type={activeTab === tab ? 'default' : 'secondary'}
                >
                  {tab === 'following' ? '关注' : tab === 'recommend' ? '推荐' : '热榜'}
                </Text>
                {activeTab === tab && <View style={[styles.activeLine, { backgroundColor: tintColor }]} />}
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => router.push('/search')}
            style={({ pressed }) => ({
              opacity: pressed ? 0.5 : 1,
              paddingBottom: 10,
              justifyContent: 'center'
            })}
          >
            <Ionicons name="search" size={22} color={textColor} />
          </Pressable>
        </View>
      </BlurView>

      {!cookies ? (
        <View style={styles.loginPrompt}>
          <Text style={styles.loginText} type="secondary">
            登录后才能看这里哦
          </Text>
          <Pressable
            style={[styles.loginBtn, { backgroundColor: tintColor }]}
            onPress={() => router.push('/login' as any)}
          >
            <Text style={styles.loginBtnText}>去登录</Text>
          </Pressable>
        </View>
      ) : (
        <FlashList
          data={flattenedData}
          {...({ estimatedItemSize: activeTab === 'recommend' ? 180 : 100 } as any)}
          onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
          onEndReachedThreshold={0.5}
          onRefresh={refetch}
          refreshing={isLoading}
          contentContainerStyle={{
            paddingTop: insets.top + 55, // 动态偏移，确保内容不被覆盖
            paddingBottom: 60
          }}
          renderItem={({ item }: { item: any }) => {
            if (activeTab === 'hot') {
              return <HotCard item={item as HotItem} />;
            }
            return <FeedCard item={item} />;
          }}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ margin: 20 }} /> : null}
        />
      )}
    </View>
  );
}

// 关注流数据解析
function parseFollowingData(item: any) {
  const target = item.target;
  if (!target) return null;

  return {
    id: target.id?.toString() || Math.random().toString(),
    title: target.question?.title || target.title || "无标题内容",
    questionId: target.question?.id || (target.type === 'question' ? target.id : ""),
    actionText: item.action_text,
    author: {
      id: target.author?.id || "",
      url_token: target.author?.url_token || "",
      name: target.author?.name || "匿名用户",
      avatar: target.author?.avatar_url || "https://picx.zhimg.com/v2-abed1a8c04700ba7d72b45195223e0ff_l.jpg",
    },
    excerpt: target.excerpt || "",
    image: target.thumbnail || (target.content_img?.length > 0 ? target.content_img[0] : null),
    voteCount: target.voteup_count || 0,
    commentCount: target.comment_count || 0,
    voted: target.relationship?.voting || 0,
    type: target.type === 'answer' ? 'answers' : target.type === 'article' ? 'articles' : 'answers',
  };
}

// 推荐流数据解析
function parseRecommendData(item: any) {
  const target = item.target || item;
  return {
    id: target.id?.toString() || Math.random().toString(),
    title: target.question?.title || target.title || "无标题内容",
    questionId: target.question?.id || "",
    author: {
      id: target.author?.id || "",
      name: target.author?.name || "匿名用户",
      avatar: target.author?.avatar_url || "https://picx.zhimg.com/v2-abed1a8c04700ba7d72b45195223e0ff_l.jpg",
      headline: target.author?.headline || ""
    },
    excerpt: target.excerpt || "",
    image: target.thumbnail || (target.content_img?.length > 0 ? target.content_img[0] : null),
    voteCount: target.voteup_count || 0,
    commentCount: target.comment_count || 0,
    voted: target.relationship?.voting || 0,
    type: target.type === 'answer' ? 'answers' : target.type === 'article' ? 'articles' : 'answers',
  };
}

// 热榜数据解析
function parseHotData(item: any, index: number) {
  const target = item.target || item;
  return {
    id: target.id?.toString() || Math.random().toString(),
    questionId: target.id?.toString() || "",
    rank: index + 1,
    title: target.title || "无标题",
    excerpt: target.excerpt || "",
    image: target.children?.[0]?.thumbnail || target.image_url || null,
    hotValue: target.detail_text || "",
  };
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topNavContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    borderBottomWidth: 0.5,
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  navItem: { marginRight: 30, paddingBottom: 10, alignItems: 'center' },
  navText: { fontSize: 16 },
  activeLine: { width: 20, height: 3, borderRadius: 2, marginTop: 4 },
  loginPrompt: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 },
  loginText: { fontSize: 16, marginTop: 20, marginBottom: 30 },
  loginBtn: { paddingHorizontal: 40, paddingVertical: 12, borderRadius: 25 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});