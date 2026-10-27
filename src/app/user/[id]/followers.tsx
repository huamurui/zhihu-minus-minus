import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import type { ZhihuMemberListItem } from '@/api/zhihu';
import { getMemberFollowers } from '@/api/zhihu';
import { QueryErrorView } from '@/components/QueryErrorView';
import { Text, useThemeColor, View } from '@/components/Themed';
import { UserCard } from '@/components/UserCard';
import { refreshInfiniteQuery } from '@/utils/query';
import { getNextPageOffset } from '@/utils/userProfile';

export default function FollowersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const primaryColor = useThemeColor({}, 'primary');
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
    isError,
    error,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['user-followers', id],
    queryFn: ({ pageParam = 0 }) => getMemberFollowers(id, 20, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      return getNextPageOffset(lastPage.paging?.next);
    },
  });

  const users = data?.pages.flatMap((page) => page.data) || [];

  return (
    <View className="flex-1">
      <Stack.Screen options={{ title: '关注者列表' }} />
      <FlashList<ZhihuMemberListItem>
        data={users}
        keyExtractor={(item) => String(item.id || item.url_token)}
        renderItem={({ item }) => (
          <UserCard
            user={item}
            invalidateQueryKeys={[['user-followers', id]]}
          />
        )}
        onEndReached={() => {
          if (hasNextPage && !isFetching) void fetchNextPage();
        }}
        onRefresh={() =>
          void refreshInfiniteQuery(
            queryClient,
            ['user-followers', id],
            refetch,
          )
        }
        refreshing={isRefetching}
        ListEmptyComponent={() => (
          <View className="p-[50px] items-center">
            {isLoading ? (
              <ActivityIndicator color={primaryColor} />
            ) : isError ? (
              <QueryErrorView
                compact
                message="关注者加载失败"
                error={error}
                onRetry={() => void refetch()}
              />
            ) : (
              <Text type="secondary">还没有关注者喵</Text>
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
