import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { type Href, useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { Image } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { getDailyBefore, getDailyLatest } from '@/api/zhihu';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import {
  type CollapsibleChromeScrollOptions,
  useCollapsibleChromeScroll,
} from '@/hooks/useCollapsibleChromeScroll';
import {
  type DailyListItem,
  flattenDailyPages,
  getDailyNextPageParam,
} from '@/utils/dailyList';
import { getCachedImageSource } from '@/utils/imageSource';
import { refreshInfiniteQuery, shouldRetryQuery } from '@/utils/query';
import { BouncyButton } from './BouncyButton';
import { PullToRefresh } from './PullToRefresh';
import { QueryErrorView } from './QueryErrorView';

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList,
) as typeof FlashList;
const MIN_REFRESH_INDICATOR_MS = 500;

interface DailyListHandle {
  scrollToOffset: (args: { offset: number; animated?: boolean }) => void;
  refresh: () => void;
}

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
  DailyListHandle,
  {
    insets: EdgeInsets;
    chrome: CollapsibleChromeScrollOptions;
    onRefreshStateChange?: (isRefreshing: boolean) => void;
  }
>(({ insets, chrome, onRefreshStateChange }, ref) => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const primaryColor = useThemeColor({}, 'primary');
  const onPrimary = useThemeColor({}, 'onPrimary');
  const backgroundColor = useThemeColor({}, 'background');
  const indicatorTrackColor = useThemeColor({}, 'border');
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const refreshInFlightRef = React.useRef(false);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
    isFetchNextPageError,
    isError,
    isLoading,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['zhihu-daily'],
    queryFn: ({ pageParam = '', signal }) => {
      if (pageParam) {
        return getDailyBefore(pageParam, { signal });
      }
      return getDailyLatest({ signal });
    },
    initialPageParam: '',
    getNextPageParam: (lastPage, _pages, _lastPageParam, pageParams) =>
      getDailyNextPageParam(lastPage, pageParams),
    retry: shouldRetryQuery,
  });

  const handleRefresh = useCallback(async () => {
    if (refreshInFlightRef.current) return;

    refreshInFlightRef.current = true;
    const startedAt = Date.now();
    setIsRefreshing(true);
    onRefreshStateChange?.(true);
    try {
      await refreshInfiniteQuery(queryClient, ['zhihu-daily'], refetch);
    } catch (_e) {
    } finally {
      const remaining = MIN_REFRESH_INDICATOR_MS - (Date.now() - startedAt);
      if (remaining > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, remaining));
      }
      setIsRefreshing(false);
      onRefreshStateChange?.(false);
      refreshInFlightRef.current = false;
    }
  }, [queryClient, refetch, onRefreshStateChange]);

  const flattenedData = useMemo(
    () => flattenDailyPages(data?.pages ?? []),
    [data],
  );

  const flashListRef = React.useRef<FlashListRef<DailyListItem>>(null);
  const scrollHandler = useCollapsibleChromeScroll(chrome);

  React.useImperativeHandle(ref, () => ({
    scrollToOffset: (args) => flashListRef.current?.scrollToOffset(args),
    refresh: handleRefresh,
  }));

  if (isLoading && !isRefreshing) {
    return (
      <View className="flex-1" style={{ paddingTop: insets.top + 70 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </View>
    );
  }

  if (isError && flattenedData.length === 0 && !isRefreshing) {
    return (
      <View className="flex-1 justify-center">
        <QueryErrorView
          message="日报加载失败，请检查网络后重试"
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  if (!isLoading && !isRefreshing && flattenedData.length === 0) {
    return (
      <View className="flex-1 justify-center items-center p-10">
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={Colors[colorScheme].tabIconDefault}
        />
        <Text type="secondary" className="mt-4 text-center">
          暂时没有日报内容，稍后刷新再看看。
        </Text>
        <BouncyButton
          className="mt-6 px-6 py-2.5 rounded-full"
          style={{ backgroundColor: primaryColor }}
          onPress={() => refetch()}
        >
          <Text className="font-bold" style={{ color: onPrimary }}>
            重试一下
          </Text>
        </BouncyButton>
      </View>
    );
  }

  return (
    <PullToRefresh
      enabled={chrome.enabled}
      indicatorTop={insets.top + 60}
      onRefresh={handleRefresh}
      refreshing={isRefreshing}
      backgroundColor={backgroundColor}
      indicatorColor={primaryColor}
      indicatorTrackColor={indicatorTrackColor}
    >
      <AnimatedFlashList
        ref={flashListRef}
        showsVerticalScrollIndicator={false}
        bounces
        alwaysBounceVertical
        overScrollMode="never"
        data={flattenedData}
        keyExtractor={(item) =>
          item.type === 'date' ? `date:${item.date}` : `story:${item.data.id}`
        }
        getItemType={(item) => item.type}
        onEndReached={() => {
          if (
            chrome.enabled &&
            hasNextPage &&
            !isFetching &&
            !refreshInFlightRef.current &&
            !isFetchNextPageError
          ) {
            void fetchNextPage({ cancelRefetch: false });
          }
        }}
        onEndReachedThreshold={0.5}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: insets.top + 70,
          paddingBottom: 110,
        }}
        renderItem={({ item }: { item: DailyListItem }) => {
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
              className="mx-3 mb-3 rounded-xl overflow-hidden"
              onPress={() =>
                router.push({
                  pathname: `/article/${story.id}`,
                  params: { source: 'daily' },
                } as Href)
              }
            >
              <View type="surface" className="flex-row p-3">
                <Image
                  source={getCachedImageSource(story.images?.[0])}
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
          ) : isFetchNextPageError ? (
            <QueryErrorView
              compact
              message="更多日报加载失败"
              onRetry={() => void fetchNextPage({ cancelRefetch: false })}
            />
          ) : null
        }
      />
    </PullToRefresh>
  );
});
