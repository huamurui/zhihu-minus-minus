import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { type Href, Stack, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable } from 'react-native';
import {
  batchDelReadHistory,
  getReadHistory,
  type ReadHistoryContentType,
  type ReadHistoryDataItem,
  type ReadHistoryResponse,
} from '@/api/zhihu';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { formatDate } from '@/utils/date';

export default function HistoryScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const primaryColor = useThemeColor({}, 'primary');
  const queryClient = useQueryClient();
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    getNextPageParam: (lastPage: ReadHistoryResponse) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      const nextUrl = lastPage.paging?.next;
      const match = nextUrl?.match(/offset=(\d+)/);
      return match ? parseInt(match[1], 10) : undefined;
    },
  });

  const historyItems = data?.pages.flatMap((page) => page.data) || [];

  const makeItemKey = useCallback((item: ReadHistoryDataItem): string => {
    const extra = item.data?.extra;
    return `${extra?.content_type || 'unknown'}-${extra?.content_token || ''}`;
  }, []);

  const exitSelection = () => {
    setSelecting(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = useCallback((key: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const deleteMutation = useMutation({
    mutationFn: async (
      pairs: { content_token: string; content_type: ReadHistoryContentType }[],
    ) => {
      await batchDelReadHistory({ pairs, clear: false });
    },
    onSuccess: () => {
      exitSelection();
      queryClient.invalidateQueries({ queryKey: ['read-history'] });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      await batchDelReadHistory({ clear: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['read-history'] });
    },
  });

  const handleClearAll = () => {
    Alert.alert('清空全部记录', '确定要清空所有浏览历史吗？此操作不可撤销。', [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: () => clearAllMutation.mutate(),
      },
    ]);
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    const pairs: {
      content_token: string;
      content_type: ReadHistoryContentType;
    }[] = [];
    for (const key of selectedIds) {
      const [type, token] = key.split('-');
      pairs.push({
        content_token: token,
        content_type: type as ReadHistoryContentType,
      });
    }
    Alert.alert('删除选中记录', `确定要删除选中的 ${pairs.length} 条记录吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(pairs),
      },
    ]);
  };

  const handleLongPress = () => {
    if (!selecting) setSelecting(true);
  };

  const onPressItem = useCallback(
    (item: ReadHistoryDataItem) => {
      if (selecting) {
        toggleSelect(makeItemKey(item));
      } else {
        const type = item.data?.extra?.content_type || 'answer';
        const token = item.data?.extra?.content_token;
        if (!token) return;
        if (type === 'profile') {
          router.push(`/user/${token}`);
        } else {
          router.push(`/${type}/${token}` as Href);
        }
      }
    },
    [makeItemKey, router, selecting, toggleSelect],
  );

  const renderItem = ({ item }: { item: ReadHistoryDataItem }) => {
    const rawData = item.data;
    if (!rawData) return null;

    const extra = rawData.extra;
    const _type = extra?.content_type || 'answer';

    const key = makeItemKey(item);
    const isSelected = selectedIds.has(key);

    const mappedItem = {
      id: extra?.content_token,
      title: rawData.header?.title,
      excerpt: rawData.content?.summary,
      stat_text: rawData.matrix?.[0]?.data?.text || '',
      updated_time: extra?.read_time,
    };

    return (
      <Pressable
        onPress={() => onPressItem(item)}
        onLongPress={handleLongPress}
      >
        <View
          type="surface"
          className="p-[15px] mb-0.5 mt-px flex-row items-start"
        >
          {selecting && (
            <View className="mr-3 mt-0.5 bg-transparent">
              <Ionicons
                name={isSelected ? 'checkbox' : 'square-outline'}
                size={22}
                color={
                  isSelected ? primaryColor : Colors[colorScheme].textTertiary
                }
              />
            </View>
          )}
          <View className="flex-1 bg-transparent">
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
                  ? formatDate(mappedItem.updated_time)
                  : ''}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View className="flex-1">
      <Stack.Screen
        options={{
          title: '最近浏览',
          headerRight: () =>
            selecting ? (
              <Pressable onPress={exitSelection}>
                <Text style={{ color: primaryColor, fontSize: 16 }}>完成</Text>
              </Pressable>
            ) : historyItems.length > 0 ? (
              <Pressable onPress={handleClearAll}>
                <Ionicons
                  name="trash-outline"
                  size={20}
                  color={Colors[colorScheme].textTertiary}
                />
              </Pressable>
            ) : null,
        }}
      />
      <FlashList
        data={historyItems}
        renderItem={renderItem}
        keyExtractor={(item, index) => {
          const id = item.data?.extra?.content_token || index;
          return `history-${id}-${index}`;
        }}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={() =>
          isFetchingNextPage ? (
            <ActivityIndicator style={{ margin: 20 }} color={primaryColor} />
          ) : historyItems.length > 0 && !hasNextPage ? (
            <Text type="secondary" className="text-center p-5 text-xs">
              — 已经到底了喵 —
            </Text>
          ) : null
        }
        ListEmptyComponent={() => (
          <View className="p-[50px] items-center">
            {isLoading ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : (
              <Text type="secondary">这里空空如也喵</Text>
            )}
          </View>
        )}
        onRefresh={refetch}
        refreshing={isRefetching}
      />
      {selecting && selectedIds.size > 0 && (
        <Pressable
          onPress={handleDeleteSelected}
          className="absolute bottom-8 left-8 right-8 py-3 rounded-xl items-center"
          style={{ backgroundColor: primaryColor }}
        >
          <Text className="text-white text-base font-bold">
            删除选中 ({selectedIds.size})
          </Text>
        </Pressable>
      )}
    </View>
  );
}
