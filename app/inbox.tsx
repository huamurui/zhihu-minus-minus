import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { ActivityIndicator, Image, StyleSheet } from 'react-native';
import { getInbox, type InboxThread } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { formatDateTime } from '@/utils/date';
import { refreshInfiniteQuery } from '@/utils/query';

export default function InboxScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const primaryColor = useThemeColor({}, 'primary');
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
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['inbox'],
    queryFn: ({ pageParam = '' }) => getInbox(pageParam as string),
    initialPageParam: '',
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      return lastPage.paging?.next;
    },
  });

  const handleRefresh = useCallback(() => {
    return refreshInfiniteQuery(queryClient, ['inbox'], refetch);
  }, [queryClient, refetch]);

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
          <Image
            source={{ uri: participant.avatar_url }}
            className="w-[52px] h-[52px] rounded-full bg-surface-tertiary dark:bg-surface-tertiary-dark"
          />
          {item.unread_count > 0 && (
            <View className="absolute top-0 right-0 bg-[#ff4d4f] rounded-full min-w-[18px] h-[18px] justify-center items-center px-1 border-2 border-white dark:border-black">
              <Text className="text-white text-[10px] font-bold">
                {item.unread_count > 99 ? '99+' : item.unread_count}
              </Text>
            </View>
          )}
        </View>

        <View className="ml-[15px] flex-1 bg-transparent justify-center">
          <View className="flex-row items-center justify-between mb-1 bg-transparent">
            <Text className="font-bold text-base" numberOfLines={1}>
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
        renderItem={renderItem}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onRefresh={handleRefresh}
        refreshing={isRefetching}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={() => (
          <View className="flex-1 p-[100px] items-center">
            {isLoading ? (
              <ActivityIndicator color={primaryColor} />
            ) : (
              <Text type="secondary">暂无私信</Text>
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
