import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
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
import { addReadHistory } from '@/api/zhihu/history';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle';
import { useSettingsStore } from '@/store/useSettingsStore';
import { formatDate } from '@/utils/date';

export default function ColumnDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const _insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();

  const tintColor = useThemeColor({}, 'primary');
  const textColor = useThemeColor({}, 'text');
  const backgroundColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({}, 'border');

  // 1. 获取专栏基本信息
  const { data: column, isLoading: columnLoading } = useQuery({
    queryKey: ['column-detail', id],
    queryFn: () => getColumn(id),
  });

  const enableBrowseHistory = useSettingsStore((s) => s.enableBrowseHistory);

  useEffect(() => {
    if (enableBrowseHistory && column?.id) {
      addReadHistory({
        content_token: String(column.id),
        content_type: 'column',
      });
    }
  }, [enableBrowseHistory, column?.id]);

  const followMutation = useOptimisticToggle({
    queryKey: ['column-detail', id],
    isActive: column?.is_following,
    mutationFn: async () => {
      if (column?.is_following) return unfollowColumn(id);
      return followColumn(id);
    },
    onUpdateCache: (old: any) => ({
      ...old,
      is_following: !old?.is_following,
      followers: old?.is_following
        ? (old.followers || 1) - 1
        : (old.followers || 0) + 1,
    }),
    successMessage: (isActive) => (isActive ? '已取消关注' : '已关注专栏'),
  });

  // 2. 获取专栏下的文章列表
  const {
    data: itemsData,
    isLoading: itemsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['column-items', id],
    queryFn: ({ pageParam = 0 }) => getColumnItems(id, 20, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      const nextUrl = lastPage.paging?.next;
      const match = nextUrl?.match(/offset=(\d+)/);
      return match ? parseInt(match[1], 10) : undefined;
    },
  });

  const articles = itemsData?.pages.flatMap((page) => page.data) || [];

  const renderHeader = () => {
    if (!column && columnLoading) {
      return <ActivityIndicator style={{ marginTop: 50 }} />;
    }
    if (!column) return null;

    return (
      <View type="surface" className="pb-4 border-b" style={{ borderColor }}>
        <View className="flex-row p-5 items-center bg-transparent">
          <Image
            source={{ uri: column.image_url }}
            className="w-16 h-16 rounded-xl"
            resizeMode="cover"
          />
          <View className="ml-4 flex-1 bg-transparent">
            <Text className="text-xl font-bold">{column.title}</Text>
            <Text type="secondary" className="text-sm mt-1">
              {column.followers || 0} 关注者 ·{' '}
              {column.items_count || column.articles_count || 0} 文章
            </Text>
          </View>
          <BouncyButton
            onPress={() => followMutation.mutate()}
            className="px-4 py-1.5 rounded-full"
            style={[
              {
                backgroundColor: column.is_following
                  ? 'transparent'
                  : tintColor,
              },
              column.is_following && {
                borderWidth: 1,
                borderColor: borderColor,
              },
            ]}
          >
            <Text
              style={{
                color: column.is_following
                  ? Colors[colorScheme].textSecondary
                  : Colors[colorScheme].textInverse,
              }}
              className="font-bold text-sm"
            >
              {column.is_following ? '已关注' : '关注'}
            </Text>
          </BouncyButton>
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
            <Image
              source={{ uri: column.author.avatar_url }}
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

  const renderItem = ({ item }: { item: any }) => {
    return (
      <BouncyButton
        className="p-4"
        style={{ borderBottomWidth: 0.5, borderBottomColor: borderColor }}
        onPress={() => router.push(`/article/${item.id}`)}
      >
        {item.title_image ? (
          <View className="flex-row bg-transparent">
            <View className="flex-1 pr-3 bg-transparent">
              <Text
                className="text-[16px] font-bold leading-5"
                numberOfLines={2}
              >
                {item.title}
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
              source={{ uri: item.title_image }}
              className="w-24 h-16 rounded"
              resizeMode="cover"
            />
          </View>
        ) : (
          <View className="bg-transparent">
            <Text className="text-[16px] font-bold leading-5" numberOfLines={2}>
              {item.title}
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
          {item.updated && (
            <Text type="secondary" className="text-xs ml-auto">
              {formatDate(item.updated)}
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
        data={articles}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        onEndReached={() =>
          hasNextPage && !isFetchingNextPage && fetchNextPage()
        }
        onEndReachedThreshold={0.5}
        onRefresh={refetch}
        refreshing={isRefetching}
        ListEmptyComponent={() => (
          <View className="p-10 items-center bg-transparent">
            {!itemsLoading && <Text type="secondary">专栏里还没有文章喵</Text>}
          </View>
        )}
        ListFooterComponent={() =>
          isFetchingNextPage ? (
            <ActivityIndicator
              style={{ marginVertical: 20 }}
              color={tintColor}
            />
          ) : articles.length > 0 && !hasNextPage ? (
            <Text type="secondary" className="text-center my-5">
              — 没有更多内容了 —
            </Text>
          ) : null
        }
      />
    </View>
  );
}
