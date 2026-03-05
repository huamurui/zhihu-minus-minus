import { parseFeedItem } from '@/utils/zhihu-parser';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

// 使用 @ 别名导入组件
import { FeedCard } from '@/components/FeedCard';
import { LikeButton } from '@/components/LikeButton';

const API_CONFIG = {
  recommend: 'https://www.zhihu.com/api/v3/feed/topstory/recommend?limit=10',
  hot: 'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50'
};

export default function HomeScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'recommend' | 'hot'>('recommend');

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } = useInfiniteQuery({
    queryKey: ['zhihu-feed', activeTab],
    queryFn: async ({ pageParam = API_CONFIG[activeTab] }) => {
      const cookie = await SecureStore.getItemAsync('user_cookies');
      try {
        // 知乎 V3 接口对 User-Agent 有要求，伪装成移动端浏览器
        const res = await axios.get(pageParam, {
          headers: { 
            'Cookie': cookie || '',
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
          }
        });
        
        return {
          items: res.data.data.map((item: any) => parseZhihuData(item, activeTab)),
          nextUrl: res.data.paging?.next?.replace('http://', 'https://') // 修正可能的协议错误
        };
      } catch (e: any) {
        // 打印详细错误方便调试
        console.log(`❌ API ${activeTab} 失败:`, e.response?.status || e.message);
        return { items: getMockData(activeTab), nextUrl: null };
      }
    },
    initialPageParam: API_CONFIG[activeTab],
    getNextPageParam: (lastPage) => lastPage.nextUrl,
  });

  const flattenedData = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <View style={styles.container}>
      {/* 顶部 Tab 导航 */}
      <View style={styles.topNav}>
        {(['recommend', 'hot'] as const).map((tab) => (
          <Pressable key={tab} onPress={() => setActiveTab(tab)} style={styles.navItem}>
            <Text style={[styles.navText, activeTab === tab && styles.activeNavText]}>
              {tab === 'recommend' ? '推荐' : '热榜'}
            </Text>
            {activeTab === tab && <View style={styles.activeLine} />}
          </Pressable>
        ))}
      </View>

      <FlashList
        data={flattenedData}
        estimatedItemSize={180}
        onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
        onEndReachedThreshold={0.5}
        onRefresh={refetch}
        refreshing={isLoading}
        renderItem={({ item }) => {
          const parsedItem = parseFeedItem(item);
          return (
            <FeedCard 
              item={parsedItem} 
              footer={<LikeButton count={parsedItem.voteCount} />} 
            />
          );
        }}
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ margin: 20 }} /> : null}
      />
    </View>
  );
}

// 数据解析适配器
function parseZhihuData(item: any, type: string) {
  // 推荐流和热榜的 target 嵌套层次不同
  const target = item.target || item;
  return {
    id: target.id?.toString() || Math.random().toString(),
    title: target.question?.title || target.title || "无标题内容",
    author: {
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

// 兜底 Mock
function getMockData(type: string) {
  return [
    {
      id: 'mock-1',
      title: `这就是你看到的 ${type === 'hot' ? '热榜' : '推荐'} 模拟数据喵`,
      author: { name: '开发猫', avatar: 'https://placekitten.com/100/100', headline: '正在努力 debug' },
      excerpt: '如果看到这个，说明 API 还是 403 或 404 了。知乎的防火墙很厚，建议检查 Cookie 是否包含 z_c0...',
      voteCount: 999,
      commentCount: 66
    }
  ];
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  topNav: { flexDirection: 'row', backgroundColor: '#fff', paddingTop: 60, paddingHorizontal: 20, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  navItem: { marginRight: 30, paddingBottom: 10, alignItems: 'center' },
  navText: { fontSize: 16, color: '#999' },
  activeNavText: { color: '#111', fontWeight: 'bold' },
  activeLine: { width: 20, height: 3, backgroundColor: '#0084ff', borderRadius: 2, marginTop: 4 },
});