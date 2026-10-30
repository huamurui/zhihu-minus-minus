import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';
import { hasAuthenticationCookie } from '@/api/client';
import { getReadHistory, type ReadHistoryDataItem } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { QueryErrorView } from '@/components/QueryErrorView';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { usePaneRouter as useRouter } from '@/features/adaptive-layout/usePaneRouter';
import { useListPreload } from '@/hooks/useListPreload';
import {
  READ_HISTORY_QUERY_KEY,
  useReadHistoryActions,
} from '@/hooks/useReadHistoryActions';
import { useRefreshAction } from '@/hooks/useRefreshAction';
import { useZhihuInfiniteQuery } from '@/hooks/useZhihuInfiniteQuery';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { formatDate } from '@/utils/date';
import { refreshInfiniteQuery } from '@/utils/query';
import {
  getReadHistoryKey,
  getReadHistoryPair,
  getReadHistoryRoute,
  getSelectedReadHistoryPairs,
} from '@/utils/readHistory';

export default function HistoryScreen() {
  const router = useRouter();
  const listPreload = useListPreload(0.5);
  const colorScheme = useColorScheme();
  const primaryColor = useThemeColor({}, 'primary');
  const onPrimary = useThemeColor({}, 'onPrimary');
  const queryClient = useQueryClient();
  const cookies = useAuthStore((state) => state.cookies);
  const isAuthenticated = hasAuthenticationCookie(cookies);
  const session = getAuthSessionVersion();
  const selectionSession = useRef(session);
  const { deleteHistory, isPending: isDeleting } = useReadHistoryActions();
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
    refetch,
    isError,
  } = useZhihuInfiniteQuery({
    queryKey: READ_HISTORY_QUERY_KEY,
    queryFn: ({ pageParam = 0, signal }) =>
      getReadHistory(20, pageParam as number, { signal }),
    enabled: isAuthenticated,
    initialPageParam: 0,
  });

  const { refresh, refreshing } = useRefreshAction(() =>
    refreshInfiniteQuery(queryClient, READ_HISTORY_QUERY_KEY),
  );

  const historyItems = data?.pages.flatMap((page) => page.data) || [];

  useEffect(() => {
    if (selectionSession.current !== session) {
      selectionSession.current = session;
      setSelecting(false);
      setSelectedIds(new Set());
    }
  }, [session]);

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

  const handleClearAll = () => {
    if (isDeleting || !isAuthenticated) return;
    const session = getAuthSessionVersion();
    Alert.alert('清空全部记录', '确定要清空所有浏览历史吗？此操作不可撤销。', [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: () => {
          if (session !== getAuthSessionVersion()) return;
          void deleteHistory({ clear: true }).then((deleted) => {
            if (deleted) exitSelection();
          });
        },
      },
    ]);
  };

  const handleDeleteSelected = () => {
    if (isDeleting || !isAuthenticated) return;
    const pairs = getSelectedReadHistoryPairs(historyItems, selectedIds);
    if (pairs.length === 0) return;
    const session = getAuthSessionVersion();
    Alert.alert('删除选中记录', `确定要删除选中的 ${pairs.length} 条记录吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          if (session !== getAuthSessionVersion()) return;
          void deleteHistory({ pairs, clear: false }).then((deleted) => {
            if (deleted) exitSelection();
          });
        },
      },
    ]);
  };

  const handleLongPress = (item: ReadHistoryDataItem) => {
    if (isDeleting || !getReadHistoryPair(item)) return;
    setSelecting(true);
    setSelectedIds((previous) =>
      new Set(previous).add(getReadHistoryKey(item)),
    );
  };

  const onPressItem = useCallback(
    (item: ReadHistoryDataItem) => {
      if (isDeleting) return;
      if (selecting) {
        if (getReadHistoryPair(item)) toggleSelect(getReadHistoryKey(item));
      } else {
        const route = getReadHistoryRoute(item);
        if (route) router.push(route);
      }
    },
    [isDeleting, router, selecting, toggleSelect],
  );

  const renderItem = ({ item }: { item: ReadHistoryDataItem }) => {
    const rawData = item.data;
    if (!rawData) return null;

    const extra = rawData.extra;
    const key = getReadHistoryKey(item);
    const isSelected = selectedIds.has(key);

    const mappedItem = {
      id: extra?.content_token,
      title: rawData.header?.title,
      excerpt: rawData.content?.summary,
      stat_text: rawData.matrix?.[0]?.data?.text || '',
      updated_time: extra?.read_time,
    };

    return (
      <BouncyButton
        onPress={() => onPressItem(item)}
        onLongPress={() => handleLongPress(item)}
        disabled={isDeleting}
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
      </BouncyButton>
    );
  };

  return (
    <View className="flex-1">
      <Stack.Screen
        options={{
          title: '最近浏览',
          headerRight: () =>
            selecting ? (
              <BouncyButton
                className="p-2 rounded-full"
                onPress={exitSelection}
                disabled={isDeleting}
              >
                <Text style={{ color: primaryColor, fontSize: 16 }}>完成</Text>
              </BouncyButton>
            ) : historyItems.length > 0 ? (
              <BouncyButton
                className="p-2 rounded-full"
                onPress={handleClearAll}
                disabled={isDeleting}
              >
                <Ionicons
                  name="trash-outline"
                  size={20}
                  color={Colors[colorScheme].textTertiary}
                />
              </BouncyButton>
            ) : null,
        }}
      />
      <FlashList
        data={historyItems}
        renderItem={renderItem}
        keyExtractor={getReadHistoryKey}
        extraData={{ selecting, selectedIds, isDeleting }}
        contentContainerStyle={{ paddingBottom: selecting ? 100 : 24 }}
        onEndReached={() => {
          if (hasNextPage && !isFetching && !isDeleting) void fetchNextPage();
        }}
        {...listPreload}
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
            {!isAuthenticated ? (
              <Text type="secondary">登录后才能查看浏览历史喵</Text>
            ) : isLoading ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : isError ? (
              <QueryErrorView
                compact
                message="浏览历史加载失败"
                onRetry={() => void refetch()}
              />
            ) : (
              <Text type="secondary">这里空空如也喵</Text>
            )}
          </View>
        )}
        onRefresh={
          isAuthenticated && !isDeleting ? () => void refresh() : undefined
        }
        refreshing={refreshing}
      />
      {selecting && selectedIds.size > 0 && (
        <BouncyButton
          onPress={handleDeleteSelected}
          disabled={isDeleting}
          className="absolute bottom-8 left-8 right-8 py-3 rounded-xl items-center"
          style={{ backgroundColor: primaryColor }}
        >
          <Text className="text-base font-bold" style={{ color: onPrimary }}>
            {isDeleting ? '正在删除…' : `删除选中 (${selectedIds.size})`}
          </Text>
        </BouncyButton>
      )}
    </View>
  );
}
