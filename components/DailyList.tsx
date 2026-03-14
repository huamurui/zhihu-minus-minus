import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Dimensions, Image, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { getDailyBefore, getDailyLatest } from '@/api/zhihu';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

const { width } = Dimensions.get('window');

// --- 类型定义 ---
type Story = {
  id: number;
  title: string;
  hint: string;
  images: string[];
  type?: number;
};
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
  const colorScheme = useColorScheme();
  const skeletonBg = Colors[colorScheme].border;

  React.useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800 }),
        withTiming(0.3, { duration: 800 }),
      ),
      -1,
    );
  }, []);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View type="surface" className="flex-row mx-3 mb-3 p-3 rounded-xl">
      <Animated.View
        style={[
          {
            width: 80,
            height: 80,
            borderRadius: 8,
            backgroundColor: skeletonBg,
          },
          animatedStyle,
        ]}
      />
      <View className="flex-1 ml-3 justify-center bg-transparent">
        <Animated.View
          style={[
            {
              width: '90%',
              height: 20,
              backgroundColor: skeletonBg,
              marginBottom: 10,
            },
            animatedStyle,
          ]}
        />
        <Animated.View
          style={[
            { width: '40%', height: 14, backgroundColor: skeletonBg },
            animatedStyle,
          ]}
        />
      </View>
    </View>
  );
};

export function DailyList({ insets }: { insets: any }) {
  const router = useRouter();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery({
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
      <View className="flex-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </View>
    );
  }

  return (
    <View className="flex-1">
      <FlashList
        data={flattenedData}
        keyExtractor={(item: any, index: number) =>
          item.type === 'date' ? item.date : item.data.id.toString() + index
        }
        {...({ estimatedItemSize: 100 } as any)}
        onEndReached={() =>
          hasNextPage && !isFetchingNextPage && fetchNextPage()
        }
        onEndReachedThreshold={0.5}
        onRefresh={refetch}
        refreshing={isLoading}
        contentContainerStyle={{
          paddingTop: insets.top + 70,
          paddingBottom: 110,
        }}
        renderItem={({ item }: { item: any }) => {
          if (item.type === 'date') {
            return (
              <View className="bg-transparent">
                <Text type="secondary" className="p-4 text-sm font-semibold">
                  {formatDate(item.date)}
                </Text>
              </View>
            );
          }
          const story = item.data;
          return (
            <Pressable
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
              onPress={() =>
                router.push({
                  pathname: `/article/${story.id}`,
                  params: { source: 'daily' },
                } as any)
              }
            >
              <View
                type="surface"
                className="flex-row mx-3 mb-3 p-3 rounded-xl"
              >
                <Image
                  source={{ uri: story.images?.[0] }}
                  className="w-20 h-20 rounded-lg"
                />
                <View className="flex-1 ml-3 justify-center bg-transparent">
                  <Text
                    className="text-base font-bold mb-1.5 text-foreground dark:text-foreground-dark"
                    numberOfLines={2}
                  >
                    {story.title}
                  </Text>
                  <Text type="secondary" className="text-xs">
                    {story.hint}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        }}
        ListFooterComponent={
          isFetchingNextPage ? (
            <Text type="secondary" className="text-center p-5">
              加载中...
            </Text>
          ) : null
        }
      />
    </View>
  );
}
