import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { getMyLikes } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { CreationCard } from '@/components/CreationCard';
import { QueryErrorView } from '@/components/QueryErrorView';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useZhihuInfiniteQuery } from '@/hooks/useZhihuInfiniteQuery';
import type { ZhihuMemberRelation } from '@/types/zhihu';
import { refreshInfiniteQuery } from '@/utils/query';

export default function MyLikesScreen() {
  const queryClient = useQueryClient();
  const colorScheme = useColorScheme();
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState<'answers' | 'articles'>('answers');
  const primaryColor = useThemeColor({}, 'primary');
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
    isError,
    refetch,
    isRefetching,
  } = useZhihuInfiniteQuery({
    queryKey: ['my-likes', activeTab],
    queryFn: ({ pageParam = 0 }) =>
      getMyLikes(activeTab, 20, pageParam as number),
    initialPageParam: 0,
  });

  const handleRefresh = useCallback(() => {
    return refreshInfiniteQuery(queryClient, ['my-likes', activeTab], refetch);
  }, [queryClient, activeTab, refetch]);

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
        <BouncyButton
          className="flex-1 py-[15px] items-center"
          style={
            activeTab === 'answers'
              ? { borderBottomWidth: 2, borderBottomColor: primaryColor }
              : undefined
          }
          onPress={() => setActiveTab('answers')}
        >
          <Text
            className="font-bold"
            style={{
              color:
                activeTab === 'answers'
                  ? primaryColor
                  : Colors[colorScheme].iconMuted,
            }}
          >
            回答
          </Text>
        </BouncyButton>
        <BouncyButton
          className="flex-1 py-[15px] items-center"
          style={
            activeTab === 'articles'
              ? { borderBottomWidth: 2, borderBottomColor: primaryColor }
              : undefined
          }
          onPress={() => setActiveTab('articles')}
        >
          <Text
            className="font-bold"
            style={{
              color:
                activeTab === 'articles'
                  ? primaryColor
                  : Colors[colorScheme].iconMuted,
            }}
          >
            文章
          </Text>
        </BouncyButton>
      </View>

      <FlashList<ZhihuMemberRelation>
        data={listItems}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <CreationCard
            item={item}
            type={activeTab === 'answers' ? 'answer' : 'article'}
          />
        )}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onRefresh={handleRefresh}
        refreshing={isRefetching}
        ListEmptyComponent={() => (
          <View className="flex-1 p-[100px] items-center">
            {isLoading ? (
              <ActivityIndicator color={primaryColor} />
            ) : isError ? (
              <QueryErrorView
                compact
                message="点赞内容加载失败"
                onRetry={() => void handleRefresh()}
              />
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
