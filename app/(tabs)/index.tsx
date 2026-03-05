import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

// 使用 @ 别名导入组件
import apiClient from '@/api/client';
import { FeedCard } from '@/components/FeedCard';
import { HotCard, HotItem } from '@/components/HotCard';
import { Text, View, useThemeColor } from '@/components/Themed';

const API_CONFIG = {
  recommend: 'https://www.zhihu.com/api/v3/feed/topstory/recommend?limit=10',
  hot: 'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50'
};

export default function HomeScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'recommend' | 'hot'>('recommend');
  const tintColor = useThemeColor({}, 'tint');
  const borderBottomColor = useThemeColor({}, 'border');

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } = useInfiniteQuery({
    queryKey: ['zhihu-feed', activeTab],
    queryFn: async ({ pageParam = API_CONFIG[activeTab] }) => {
      try {
        const res = await apiClient.get(pageParam);
        const rawItems = res.data.data || [];

        let items;
        if (activeTab === 'recommend') {
          items = rawItems.map((item: any) => parseRecommendData(item));
        } else {
          items = rawItems.map((item: any, index: number) => parseHotData(item, index));
        }

        return {
          items,
          nextUrl: res.data.paging?.next?.replace('http://', 'https://')
        };
      } catch (e: any) {
        console.log(`❌ API ${activeTab} 失败:`, e.response?.status || e.message);
        return { items: [], nextUrl: null };
      }
    },
    initialPageParam: API_CONFIG[activeTab],
    getNextPageParam: (lastPage) => lastPage.nextUrl,
  });

  const flattenedData = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <View style={styles.container}>
      {/* 顶部 Tab 导航 */}
      <View type="surface" style={[styles.topNav, { borderBottomColor }]}>
        {(['recommend', 'hot'] as const).map((tab) => (
          <Pressable key={tab} onPress={() => setActiveTab(tab)} style={styles.navItem}>
            <Text
              style={[
                styles.navText,
                activeTab === tab && { fontWeight: 'bold' }
              ]}
              type={activeTab === tab ? 'default' : 'secondary'}
            >
              {tab === 'recommend' ? '推荐' : '热榜'}
            </Text>
            {activeTab === tab && <View style={[styles.activeLine, { backgroundColor: tintColor }]} />}
          </Pressable>
        ))}
      </View>

      <FlashList
        data={flattenedData}
        {...({ estimatedItemSize: activeTab === 'recommend' ? 180 : 100 } as any)}
        onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
        onEndReachedThreshold={0.5}
        onRefresh={refetch}
        refreshing={isLoading}
        renderItem={({ item }: { item: any }) => {
          if (activeTab === 'hot') {
            return <HotCard item={item as HotItem} />;
          }
          return <FeedCard item={item} />;
        }}
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ margin: 20 }} /> : null}
      />
    </View>
  );
}

// 推荐流数据解析
function parseRecommendData(item: any) {
  const target = item.target || item;
  console.log(target.question?.id);
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
  };
}

// 热榜数据解析
function parseHotData(item: any, index: number) {
  const target = item.target || item;
  return {
    id: target.id?.toString() || Math.random().toString(),
    rank: index + 1,
    title: target.title || "无标题",
    excerpt: target.excerpt || "",
    image: target.children?.[0]?.thumbnail || target.image_url || null,
    hotValue: target.detail_text || "",
  };
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topNav: { flexDirection: 'row', paddingTop: 60, paddingHorizontal: 20, borderBottomWidth: 0.5 },
  navItem: { marginRight: 30, paddingBottom: 10, alignItems: 'center' },
  navText: { fontSize: 16 },
  activeLine: { width: 20, height: 3, borderRadius: 2, marginTop: 4 },
});