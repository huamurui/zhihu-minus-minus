import { getMyLikes } from '@/api/zhihu';
import { CreationCard } from '@/components/CreationCard';
import { Text, View } from '@/components/Themed';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigation } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export default function MyLikesScreen() {
  const colorScheme = useColorScheme();
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState<'answers' | 'articles'>('answers');
  const primaryColor = '#0084ff';
  const borderColor = Colors[colorScheme].border;

  useEffect(() => {
    navigation.setOptions({ title: '我的点赞' });
  }, [navigation]);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['my-likes', activeTab],
    queryFn: ({ pageParam = 0 }) =>
      getMyLikes(activeTab, 20, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      const nextUrl = lastPage.paging?.next;
      const match = nextUrl?.match(/offset=(\d+)/);
      return match ? parseInt(match[1]) : undefined;
    },
  });

  const listItems = data?.pages.flatMap((page) => page.data) || [];

  return (
    <View className="flex-1">
      <View
        className="flex-row"
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: borderColor,
        }}
      >
        <Pressable
          className="flex-1 py-[15px] items-center"
          style={
            activeTab === 'answers'
              ? { borderBottomWidth: 2, borderBottomColor: '#0084ff' }
              : undefined
          }
          onPress={() => setActiveTab('answers')}
        >
          <Text
            className="font-bold"
            style={{ color: activeTab === 'answers' ? primaryColor : '#888' }}
          >
            回答
          </Text>
        </Pressable>
        <Pressable
          className="flex-1 py-[15px] items-center"
          style={
            activeTab === 'articles'
              ? { borderBottomWidth: 2, borderBottomColor: '#0084ff' }
              : undefined
          }
          onPress={() => setActiveTab('articles')}
        >
          <Text
            className="font-bold"
            style={{ color: activeTab === 'articles' ? primaryColor : '#888' }}
          >
            文章
          </Text>
        </Pressable>
      </View>

      <FlashList
        data={listItems}
        renderItem={({ item }: { item: any }) => (
          <CreationCard
            item={item}
            type={activeTab === 'answers' ? 'answer' : 'article'}
          />
        )}
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
              <Text type="secondary">还没有点赞过内容喵</Text>
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
