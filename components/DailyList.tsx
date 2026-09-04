import { Ionicons } from '@expo/vector-icons';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { Image, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { getDailyBefore, getDailyLatest } from '@/api/zhihu';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { refreshInfiniteQuery } from '@/utils/query';
import { BouncyButton } from './BouncyButton';

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
  }, [opacity]);
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

export const DailyList = React.forwardRef<
  any,
  {
    insets: any;
    onScroll?: (offset: number) => void;
    onRefreshStateChange?: (isRefreshing: boolean) => void;
  }
>(({ insets, onScroll, onRefreshStateChange }, ref) => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const primaryColor = useThemeColor({}, 'primary');
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isRefetching,
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

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    onRefreshStateChange?.(true);
    try {
      await refreshInfiniteQuery(queryClient, ['zhihu-daily'], refetch);
    } catch (_e) {
    } finally {
      setIsRefreshing(false);
      onRefreshStateChange?.(false);
    }
  }, [queryClient, refetch, onRefreshStateChange]);

  const flattenedData = useMemo(() => {
    if (!data) return [];
    const items: ListItem[] = [];
    data.pages.forEach((page) => {
      if (page.date) {
        items.push({ type: 'date', date: page.date });
      }
      if (Array.isArray(page.stories)) {
        page.stories.forEach((story: Story) => {
          items.push({ type: 'story', data: story });
        });
      }
    });
    return items;
  }, [data]);

  const flashListRef = React.useRef<FlashListRef<any>>(null);

  React.useImperativeHandle(ref, () => ({
    scrollToOffset: (args: any) => flashListRef.current?.scrollToOffset(args),
    refresh: handleRefresh,
  }));

  if (isLoading) {
    return (
      <View className="flex-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </View>
    );
  }

  if (!isLoading && flattenedData.length === 0) {
    return (
      <View className="flex-1 justify-center items-center p-10">
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={Colors[colorScheme].tabIconDefault}
        />
        <Text type="secondary" className="mt-4 text-center">
          暂时没发现日报内容喵，可能是网络问题或者知乎日报今天还没更新。
        </Text>
        <Pressable
          className="mt-6 px-6 py-2.5 rounded-full"
          style={{ backgroundColor: primaryColor }}
          onPress={() => refetch()}
        >
          <Text className="text-white font-bold">重试一下</Text>
        </Pressable>
      </View>
    );
  }

  const showRefreshing = isRefreshing || isRefetching;

  return (
    <View className="flex-1">
      <FlashList
        ref={flashListRef}
        showsVerticalScrollIndicator={false}
        data={flattenedData}
        keyExtractor={(item: any, index: number) =>
          item.type === 'date' ? item.date : item.data.id.toString() + index
        }
        {...({ estimatedItemSize: 100 } as any)}
        onEndReached={() =>
          hasNextPage && !isFetchingNextPage && fetchNextPage()
        }
        onEndReachedThreshold={0.5}
        onRefresh={handleRefresh}
        refreshing={showRefreshing}
        onScroll={(e) => onScroll?.(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
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
            <BouncyButton
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
            </BouncyButton>
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
});
