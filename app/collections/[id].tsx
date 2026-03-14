import { getCollection, getCollectionDetail } from '@/api/zhihu';
import { CreationCard } from '@/components/CreationCard';
import { Text, View } from '@/components/Themed';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export default function CollectionDetailScreen() {
  const colorScheme = useColorScheme();
  const { id } = useLocalSearchParams();
  const navigation = useNavigation();
  const primaryColor = '#0084ff';
  const borderColor = Colors[colorScheme].border;

  useEffect(() => {
    navigation.setOptions({ title: '收藏夹' });
  }, [navigation]);

  const { data: collection } = useQuery({
    queryKey: ['collection-detail', id],
    queryFn: () => getCollection(id as string),
  });

  const {
    data: listData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['collection-contents', id],
    queryFn: ({ pageParam = 0 }) =>
      getCollectionDetail(id as string, 20, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      const nextUrl = lastPage.paging?.next;
      const match = nextUrl?.match(/offset=(\d+)/);
      return match ? parseInt(match[1]) : undefined;
    },
  });

  const contents = listData?.pages.flatMap((page) => page.data) || [];

  return (
    <View className="flex-1">
      <View
        className="p-5"
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: borderColor,
        }}
      >
        <Text className="text-xl font-bold">
          {collection?.title || '收藏夹内容'}
        </Text>
        {collection?.description ? (
          <Text type="secondary" className="text-sm mt-2.5 leading-5">
            {collection.description}
          </Text>
        ) : null}
      </View>

      <FlashList
        data={contents}
        renderItem={({ item }: { item: any }) => {
          const content = item.content;
          if (!content) return null;
          let type: 'answer' | 'article' | 'pin' = 'answer';
          if (content.type === 'article') type = 'article';
          else if (content.type === 'pin') type = 'pin';
          return <CreationCard item={content} type={type} />;
        }}
        {...({ estimatedItemSize: 150 } as any)}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onRefresh={refetch}
        refreshing={isRefetching}
        ListEmptyComponent={() => (
          <View className="flex-1 p-[100px] items-center">
            {isLoading ? (
              <ActivityIndicator color={primaryColor} />
            ) : (
              <Text type="secondary">这个收藏夹空空如也喵</Text>
            )}
          </View>
        )}
        ListFooterComponent={() =>
          isFetchingNextPage ? (
            <ActivityIndicator style={{ margin: 20 }} color={primaryColor} />
          ) : null
        }
      />
    </View>
  );
}
