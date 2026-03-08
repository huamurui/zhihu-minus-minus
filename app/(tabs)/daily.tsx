import { getDailyBefore, getDailyLatest } from '@/api/zhihu';
import { Text, View, useThemeColor } from '@/components/Themed';
import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Dimensions, Image, Pressable, StyleSheet } from 'react-native';
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
  const skeletonBg = useThemeColor({}, 'border');

  React.useEffect(() => {
    opacity.value = withRepeat(withSequence(withTiming(0.7, { duration: 800 }), withTiming(0.3, { duration: 800 })), -1);
  }, []);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View type="surface" style={styles.card}>
      <Animated.View style={[styles.image, { backgroundColor: skeletonBg }, animatedStyle]} />
      <View style={[styles.textContainer, { backgroundColor: 'transparent' }]}>
        <Animated.View style={[{ width: '90%', height: 20, backgroundColor: skeletonBg, marginBottom: 10 }, animatedStyle]} />
        <Animated.View style={[{ width: '40%', height: 14, backgroundColor: skeletonBg }, animatedStyle]} />
      </View>
    </View>
  );
};

export default function DailyScreen() {
  const router = useRouter();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } = useInfiniteQuery({
    queryKey: ['zhihu-daily'],
    queryFn: ({ pageParam = '' }) => {
      if (pageParam) {
        return getDailyBefore(pageParam as string);
      }
      return getDailyLatest();
    },
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.date,
  });

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
        keyExtractor={(item: any, index: number) => (item.type === 'date' ? item.date : item.data.id.toString() + index)}
        {...({ estimatedItemSize: 100 } as any)}
        onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
        onEndReachedThreshold={0.5}
        onRefresh={refetch}
        refreshing={isLoading}
        renderItem={({ item }: { item: any }) => {
          if (item.type === 'date') {
            return <View style={{ backgroundColor: 'transparent' }}><Text type="secondary" style={styles.dateHeader}>{formatDate(item.date)}</Text></View>;
          }
          const story = item.data;
          return (
            <Pressable
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
              onPress={() => router.push(`/article/${story.id}`)}
            >
              <View type="surface" style={styles.card}>
                <Image source={{ uri: story.images?.[0] }} style={styles.image} />
                <View style={[styles.textContainer, { backgroundColor: 'transparent' }]}>
                  <Text style={styles.title} numberOfLines={2}>{story.title}</Text>
                  <Text type="secondary" style={styles.hint}>{story.hint}</Text>
                </View>
              </View>
            </Pressable>
          );
        }}
        ListFooterComponent={isFetchingNextPage ? <Text type="secondary" style={styles.loadingText}>加载中...喵</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  dateHeader: { padding: 15, fontSize: 14, fontWeight: '600' },
  card: { flexDirection: 'row', marginHorizontal: 12, marginBottom: 12, padding: 12, borderRadius: 12 },
  image: { width: 80, height: 80, borderRadius: 8 },
  textContainer: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: 'bold', marginBottom: 6 },
  hint: { fontSize: 12 },
  loadingText: { textAlign: 'center', padding: 20 }
});
