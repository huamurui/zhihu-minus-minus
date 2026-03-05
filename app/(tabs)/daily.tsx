import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Dimensions, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

// --- 类型定义 ---
type Story = { id: number; title: string; hint: string; images: string[]; type?: number };
type ListItem = { type: 'date'; date: string } | { type: 'story'; data: Story };

// --- 辅助函数：格式化日期 ---
const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  return `${month}月${day}日`;
};

// --- 骨架屏组件 ---
const SkeletonCard = () => {
  const opacity = useSharedValue(0.3);
  React.useEffect(() => {
    opacity.value = withRepeat(withSequence(withTiming(0.7, { duration: 800 }), withTiming(0.3, { duration: 800 })), -1);
  }, []);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={styles.card}>
      <Animated.View style={[styles.image, { backgroundColor: '#E1E9EE' }, animatedStyle]} />
      <View style={styles.textContainer}>
        <Animated.View style={[{ width: '90%', height: 20, backgroundColor: '#E1E9EE', marginBottom: 10 }, animatedStyle]} />
        <Animated.View style={[{ width: '40%', height: 14, backgroundColor: '#E1E9EE' }, animatedStyle]} />
      </View>
    </View>
  );
};

export default function HomeScreen() {
  const router = useRouter();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } = useInfiniteQuery({
    queryKey: ['zhihu-feed'],
    queryFn: async ({ pageParam = '' }) => {
      const url = pageParam ? `https://news-at.zhihu.com/api/4/news/before/${pageParam}` : `https://news-at.zhihu.com/api/4/news/latest`;
      const res = await axios.get(url);
      return res.data;
    },
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.date,
  });

  // --- 数据转换逻辑：插入日期分割线 ---
  const flattenedData = useMemo(() => {
    if (!data) return [];
    const items: ListItem[] = [];
    data.pages.forEach((page) => {
      items.push({ type: 'date', date: page.date });
      page.stories.forEach((story: Story) => {
        items.push({ type: 'story', data: story });
      });
    });
    return items;
  }, [data]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        {[1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={flattenedData}
        keyExtractor={(item, index) => (item.type === 'date' ? item.date : item.data.id.toString() + index)}
        estimatedItemSize={100}
        onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
        onEndReachedThreshold={0.5}
        onRefresh={refetch}
        refreshing={isLoading}
        renderItem={({ item }) => {
          if (item.type === 'date') {
            return <Text style={styles.dateHeader}>{formatDate(item.date)}</Text>;
          }
          const { data: story } = item;
          return (
            <Pressable 
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
              onPress={() => router.push(`/article/${story.id}`)}
            >
              <Image source={{ uri: story.images?.[0] }} style={styles.image} />
              <View style={styles.textContainer}>
                <Text style={styles.title} numberOfLines={2}>{story.title}</Text>
                <Text style={styles.hint}>{story.hint}</Text>
              </View>
            </Pressable>
          );
        }}
        ListFooterComponent={isFetchingNextPage ? <Text style={styles.loadingText}>加载中...喵</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f6f6' },
  dateHeader: { padding: 15, fontSize: 14, color: '#888', fontWeight: '600' },
  card: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 12, padding: 12, borderRadius: 12 },
  image: { width: 80, height: 80, borderRadius: 8 },
  textContainer: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: 'bold', color: '#222', marginBottom: 6 },
  hint: { fontSize: 12, color: '#999' },
  loadingText: { textAlign: 'center', padding: 20, color: '#999' }
});