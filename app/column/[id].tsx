import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  followColumn,
  getColumn,
  getColumnItems,
  unfollowColumn,
} from '@/api/zhihu/column';
import { recordReadHistory } from '@/api/zhihu/history';
import { BouncyButton } from '@/components/BouncyButton';
import { FollowButton } from '@/components/FollowButton';
import { QueryErrorView } from '@/components/QueryErrorView';
import { StableAvatar } from '@/components/StableAvatar';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle';
import { useRefreshAction } from '@/hooks/useRefreshAction';
import { useZhihuInfiniteQuery } from '@/hooks/useZhihuInfiniteQuery';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ZhihuColumnItem } from '@/types/zhihu';
import { formatDate } from '@/utils/date';
import { getCachedImageSource } from '@/utils/imageSource';
import { refreshInfiniteQuery } from '@/utils/query';

export default function ColumnDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const tintColor = useThemeColor({}, 'primary');
  const textColor = useThemeColor({}, 'text');
  const backgroundColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({}, 'border');

  // 1. 获取专栏基本信息
  const {
    data: column,
    isLoading: columnLoading,
    isError: columnError,
    refetch: refetchColumn,
  } = useQuery({
    queryKey: ['column-detail', id],
    queryFn: () => getColumn(id),
  });

  const enableBrowseHistory = useSettingsStore((s) => s.enableBrowseHistory);

  useEffect(() => {
    if (enableBrowseHistory && column?.id) {
      recordReadHistory({
        content_token: String(column.id),
        content_type: 'column',
      });
    }
  }, [enableBrowseHistory, column?.id]);

  const followMutation = useOptimisticToggle<NonNullable<typeof column>>({
    queryKey: ['column-detail', id],
    isActive: column?.is_following,
    mutationFn: async () => {
      if (column?.is_following) return unfollowColumn(id);
      return followColumn(id);
    },
    onUpdateCache: (old) => ({
      ...old,
      is_following: !old?.is_following,
      followers: old?.is_following
        ? (old.followers || 1) - 1
        : (old.followers || 0) + 1,
    }),
    successMessage: (isActive) => (isActive ? '已取消关注' : '已关注专栏'),
  });

  // 2. 获取专栏下的内容列表
  const {
    data: itemsData,
    isLoading: itemsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
    isFetchNextPageError,
    isError: itemsError,
    refetch,
  } = useZhihuInfiniteQuery({
    queryKey: ['column-items', id],
    queryFn: ({ pageParam = 0, signal }) =>
      getColumnItems(id, 20, pageParam, { signal }),
    initialPageParam: 0,
  });

  const { refresh, refreshing } = useRefreshAction(() =>
    Promise.all([
      refetchColumn(),
      refreshInfiniteQuery(queryClient, ['column-items', id]),
    ]),
  );

  const items = itemsData?.pages.flatMap((page) => page.data) || [];

  const renderHeader = () => {
    if (!column && columnLoading) {
      return <ActivityIndicator style={{ marginTop: 50 }} />;
    }
    if (!column && columnError) {
      return (
        <QueryErrorView
          compact
          message="专栏加载失败"
          onRetry={() => void refetchColumn()}
        />
      );
    }
    if (!column) return null;

    return (
      <View type="surface" className="pb-4 border-b" style={{ borderColor }}>
        <View className="flex-row p-5 items-center bg-transparent">
          <Image
            source={getCachedImageSource(column.image_url)}
            className="w-16 h-16 rounded-xl"
            resizeMode="cover"
          />
          <View className="ml-4 flex-1 bg-transparent">
            <Text className="text-xl font-bold">{column.title}</Text>
            <Text type="secondary" className="text-sm mt-1">
              {column.followers || 0} 关注者 ·{' '}
              {column.items_count || column.articles_count || 0} 内容
            </Text>
          </View>
          <FollowButton
            following={Boolean(column.is_following)}
            loading={followMutation.isPending}
            onPress={() => followMutation.mutate()}
          />
        </View>

        {column.intro || column.excerpt ? (
          <View className="px-5 mb-2 bg-transparent">
            <Text type="secondary" className="text-sm leading-5">
              {column.intro || column.excerpt}
            </Text>
          </View>
        ) : null}

        {column.author ? (
          <BouncyButton
            className="flex-row items-center px-5 py-2 mt-2 bg-transparent"
            onPress={() =>
              router.push(
                `/user/${column.author.url_token || column.author.id}`,
              )
            }
          >
            <StableAvatar
              uri={column.author.avatar_url}
              className="w-6 h-6 rounded-full"
            />
            <Text type="secondary" className="text-xs ml-2">
              创建人:{' '}
              <Text className="font-semibold text-xs">
                {column.author.name}
              </Text>
            </Text>
          </BouncyButton>
        ) : null}
      </View>
    );
  };

  const renderItem = ({ item }: { item: ZhihuColumnItem }) => {
    const isAnswer = item.type === 'answer';
    const title = (isAnswer ? item.question?.title : undefined) || item.title;
    const thumbnail = item.title_image || item.thumbnail;
    const updated =
      item.updated_time || item.updated || item.created_time || item.created;

    return (
      <BouncyButton
        className="p-4"
        style={{ borderBottomWidth: 0.5, borderBottomColor: borderColor }}
        onPress={() =>
          isAnswer
            ? router.push({
                pathname: '/answer/[id]',
                params: {
                  id: String(item.id),
                  questionId:
                    item.question?.id === undefined
                      ? undefined
                      : String(item.question.id),
                  title,
                },
              })
            : router.push(`/article/${item.id}`)
        }
      >
        {thumbnail ? (
          <View className="flex-row bg-transparent">
            <View className="flex-1 pr-3 bg-transparent">
              <Text
                className="text-[16px] font-bold leading-5"
                numberOfLines={2}
              >
                {title}
              </Text>
              <Text
                type="secondary"
                className="text-[13px] mt-1.5 leading-5"
                numberOfLines={2}
              >
                {item.excerpt}
              </Text>
            </View>
            <Image
              source={getCachedImageSource(thumbnail)}
              className="w-24 h-16 rounded"
              resizeMode="cover"
            />
          </View>
        ) : (
          <View className="bg-transparent">
            <Text className="text-[16px] font-bold leading-5" numberOfLines={2}>
              {title}
            </Text>
            <Text
              type="secondary"
              className="text-[13px] mt-1.5 leading-5"
              numberOfLines={2}
            >
              {item.excerpt}
            </Text>
          </View>
        )}

        <View className="flex-row mt-3 bg-transparent items-center">
          <Text type="secondary" className="text-xs">
            {item.voteup_count || 0} 赞同
          </Text>
          <Text type="secondary" className="text-xs ml-3">
            {item.comment_count || 0} 评论
          </Text>
          {updated && (
            <Text type="secondary" className="text-xs ml-auto">
              {formatDate(updated)}
            </Text>
          )}
        </View>
      </BouncyButton>
    );
  };

  return (
    <View type="default" className="flex-1">
      <Stack.Screen
        options={{
          headerTitle: column?.title || '专栏',
          headerShadowVisible: false,
          headerStyle: { backgroundColor },
          headerTintColor: textColor,
          headerLeft: () => (
            <BouncyButton
              onPress={() => router.back()}
              className="mr-2 p-2 rounded-full"
            >
              <Ionicons name="chevron-back" size={28} color={textColor} />
            </BouncyButton>
          ),
        }}
      />

      <FlashList
        data={items}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        onEndReached={() =>
          hasNextPage &&
          !isFetching &&
          !refreshing &&
          !isFetchNextPageError &&
          fetchNextPage()
        }
        onEndReachedThreshold={0.5}
        onRefresh={refresh}
        refreshing={refreshing}
        ListEmptyComponent={() => (
          <View className="p-10 items-center bg-transparent">
            {itemsLoading ? (
              <ActivityIndicator color={tintColor} />
            ) : itemsError ? (
              <QueryErrorView
                compact
                message="内容列表加载失败"
                onRetry={() => void refetch()}
              />
            ) : (
              <Text type="secondary">专栏里还没有内容喵</Text>
            )}
          </View>
        )}
        ListFooterComponent={() =>
          isFetchingNextPage ? (
            <ActivityIndicator
              style={{ marginVertical: 20 }}
              color={tintColor}
            />
          ) : isFetchNextPageError ? (
            <QueryErrorView
              compact
              message="更多内容加载失败"
              onRetry={() => void fetchNextPage()}
            />
          ) : items.length > 0 && !hasNextPage ? (
            <Text type="secondary" className="text-center my-5">
              — 没有更多内容了 —
            </Text>
          ) : null
        }
      />
    </View>
  );
}
