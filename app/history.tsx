import { getReadHistory } from '@/api/zhihu';
import { Text, View } from '@/components/Themed';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

export default function HistoryScreen() {
  const router = useRouter();
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['read-history'],
    queryFn: ({ pageParam = 0 }) => getReadHistory(20, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (lastPage: any) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      const nextUrl = lastPage.paging?.next;
      const match = nextUrl?.match(/offset=(\d+)/);
      return match ? parseInt(match[1]) : undefined;
    },
  });

  const historyItems = data?.pages.flatMap((page: any) => page.data) || [];

  const renderItem = ({ item }: { item: any }) => {
    const rawData = item.data;
    if (!rawData) return null;

    const extra = rawData.extra;
    const type = extra?.content_type || 'answer';
    if (type === 'profile') return null;

    const mappedItem = {
      id: extra?.content_token,
      title: rawData.header?.title,
      excerpt: rawData.content?.summary,
      stat_text: rawData.matrix?.[0]?.data?.text || '',
      updated_time: extra?.read_time,
    };

    return (
      <Pressable onPress={() => router.push(`/${type}/${mappedItem.id}`)}>
        <View type="surface" className="p-[15px] mb-0.5 mt-px">
          <Text
            className="text-base font-bold mb-2 leading-[22px]"
            numberOfLines={2}
          >
            {mappedItem.title}
          </Text>
          {mappedItem.excerpt ? (
            <Text
              type="secondary"
              className="text-sm leading-5"
              numberOfLines={3}
            >
              {mappedItem.excerpt}
            </Text>
          ) : null}
          <View className="flex-row justify-between mt-3 bg-transparent">
            <Text type="secondary" className="text-xs">
              {mappedItem.stat_text}
            </Text>
            <Text type="secondary" className="text-xs">
              {mappedItem.updated_time
                ? new Date(mappedItem.updated_time * 1000).toLocaleDateString()
                : ''}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View className="flex-1">
      <Stack.Screen options={{ title: '最近浏览' }} />
      <FlashList
        data={historyItems}
        renderItem={renderItem}
        {...({ estimatedItemSize: 100 } as any)}
        keyExtractor={(item: any, index: number) => {
          const id = item.data?.extra?.content_token || index;
          return `history-${id}-${index}`;
        }}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={() =>
          isFetchingNextPage ? (
            <ActivityIndicator style={{ margin: 20 }} color="#0084ff" />
          ) : historyItems.length > 0 && !hasNextPage ? (
            <Text type="secondary" className="text-center p-5 text-xs">
              — 已经到底了喵 —
            </Text>
          ) : null
        }
        ListEmptyComponent={() => (
          <View className="p-[50px] items-center">
            {isLoading ? (
              <ActivityIndicator size="small" color="#0084ff" />
            ) : (
              <Text type="secondary">这里空空如也喵</Text>
            )}
          </View>
        )}
        onRefresh={refetch}
        refreshing={isRefetching}
      />
    </View>
  );
}
