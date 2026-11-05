import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { getInbox, type InboxThread } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { QueryErrorView } from '@/components/QueryErrorView';
import { StableAvatar } from '@/components/StableAvatar';
import { Text, useThemeColor, View } from '@/components/Themed';
import { UnreadBadge } from '@/components/UnreadBadge';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useRefreshAction } from '@/hooks/useRefreshAction';
import { formatDateTime } from '@/utils/date';
import { refreshInfiniteQuery } from '@/utils/query';

export default function InboxScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const primaryColor = useThemeColor({}, 'primary');
  const backgroundColor = useThemeColor({}, 'background');
  const borderColor = Colors[colorScheme].border;

  useEffect(() => {
    navigation.setOptions({ title: '我的私信' });
  }, [navigation]);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
    isFetchNextPageError,
    refetch,
    isError,
  } = useInfiniteQuery({
    queryKey: ['inbox'],
    queryFn: ({ pageParam = '', signal }) =>
      getInbox(pageParam as string, { signal }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      return lastPage.paging?.next;
    },
  });

  const { refresh: handleRefresh, refreshing } = useRefreshAction(() => {
    return refreshInfiniteQuery(queryClient, ['inbox'], refetch);
  });

  const threads = data?.pages.flatMap((page) => page.data) || [];

  const renderItem = ({ item }: { item: InboxThread }) => {
    const participant = item.participant;
    const time = formatDateTime(item.updated_time);

    return (
      <BouncyButton
        className="flex-row p-[15px]"
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: borderColor,
        }}
        onPress={() => {
          router.push({
            pathname: `/chat/[id]`,
            params: {
              id: participant.id,
              name: participant.name,
            },
          });
        }}
      >
        <View className="relative">
          <StableAvatar
            uri={participant.avatar_url}
            className="w-[52px] h-[52px] rounded-full bg-surface-tertiary dark:bg-surface-tertiary-dark"
          />
          <UnreadBadge
            count={item.unread_count}
            placement="corner"
            size={18}
            borderColor={backgroundColor}
            className="absolute top-0 right-0"
          />
        </View>

        <View className="ml-[15px] flex-1 bg-transparent justify-center">
          <View className="flex-row items-center justify-between mb-1 bg-transparent">
            <Text className="font-bold text-base flex-1 mr-2" numberOfLines={1}>
              {participant.name}
            </Text>
            <Text type="secondary" className="text-[11px]">
              {time}
            </Text>
          </View>
          <Text
            className="text-sm leading-5"
            numberOfLines={2}
            type="secondary"
          >
            {item.snippet}
          </Text>
        </View>
      </BouncyButton>
    );
  };

  return (
    <View className="flex-1">
      <FlashList
        data={threads}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onEndReached={() => {
          if (
            hasNextPage &&
            !isFetching &&
            !refreshing &&
            !isFetchNextPageError
          )
            void fetchNextPage();
        }}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={() => (
          <View className="flex-1 px-6 py-20 items-center">
            {isLoading ? (
              <ActivityIndicator color={primaryColor} />
            ) : isError ? (
              <QueryErrorView
                compact
                message="私信加载失败"
                onRetry={() => void refetch()}
              />
            ) : (
              <Text type="secondary">暂无私信</Text>
            )}
          </View>
        )}
        ListFooterComponent={() =>
          isFetchingNextPage ? (
            <ActivityIndicator style={{ margin: 20 }} color={primaryColor} />
          ) : isFetchNextPageError ? (
            <QueryErrorView
              compact
              message="更多私信加载失败"
              onRetry={() => void fetchNextPage()}
            />
          ) : null
        }
      />
    </View>
  );
}
