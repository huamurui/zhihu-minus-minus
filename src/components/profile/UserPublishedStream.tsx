import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type FeedItem,
  getMemberWithFallback,
  type ZhihuActor,
} from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { FeedCard } from '@/components/FeedCard';
import { getProfileFeedBody } from '@/components/profile/profileSearchResults';
import { QueryErrorView } from '@/components/QueryErrorView';
import { StableAvatar } from '@/components/StableAvatar';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useListPreload } from '@/hooks/useListPreload';
import { useUserCreations } from '@/hooks/useUserCreations';
import {
  type AnswerReadingContext,
  getProfileAnswerReadingContext,
} from '@/utils/answerReadingContext';
import { toUserCreationFeedItem } from '@/utils/userCreations';
import { getRecentActivityReadBoundary } from '@/utils/userProfile';

type PublishedStreamRow =
  | {
      key: string;
      kind: 'content';
      item: FeedItem;
      answerContext: AnswerReadingContext;
    }
  | {
      key: 'read-boundary';
      kind: 'read-boundary';
    };

interface UserPublishedStreamProps {
  id: string;
  unreadCount: number;
  actor?: ZhihuActor;
  isActive: boolean;
  enabled: boolean;
  navigation?: {
    index: number;
    total: number;
    onPrevious: () => void;
    onNext: () => void;
  };
}

/** Each user owns their list, refresh state and entry unread boundary. */
export function UserPublishedStream({
  id,
  unreadCount,
  actor,
  isActive,
  enabled,
  navigation,
}: UserPublishedStreamProps) {
  const router = useRouter();
  const listPreload = useListPreload(0.5);
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const primaryColor = useThemeColor({}, 'primary');
  const [entryUnreadCount, setEntryUnreadCount] = useState(unreadCount);
  const refreshPending = useRef(false);

  const {
    data: member,
    isLoading: isMemberLoading,
    isError: isMemberError,
    refetch: refetchMember,
  } = useQuery({
    queryKey: ['user-detail', id],
    queryFn: () => getMemberWithFallback(id),
    enabled,
  });

  const {
    activities,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    isFetching,
    refresh,
    refreshing,
    refetch,
  } = useUserCreations(member, enabled);

  const isEnd = !isLoading && !isError && !hasNextPage;
  const readBoundary = getRecentActivityReadBoundary(
    entryUnreadCount,
    activities.length,
    isEnd,
  );
  const rows: PublishedStreamRow[] = [];
  const handleRefresh = () => {
    if (!isActive || refreshPending.current || refreshing) return;
    refreshPending.current = true;
    // The entry count describes the old snapshot, not newly arrived creations.
    setEntryUnreadCount(0);
    void refresh()
      .catch(() => undefined)
      .finally(() => {
        refreshPending.current = false;
      });
  };

  if (member) {
    activities.forEach((activity, index) => {
      const item = toUserCreationFeedItem(activity, member);
      if (item) {
        rows.push({
          key: `published-${item.type}-${item.id}`,
          kind: 'content',
          item: { ...item, ...getProfileFeedBody(activity.target) },
          answerContext: getProfileAnswerReadingContext(
            activity.target?.author ?? {},
            member,
            id,
          ),
        });
      }
      if (index + 1 === readBoundary) {
        rows.push({ key: 'read-boundary', kind: 'read-boundary' });
      }
    });
  }

  return (
    <View
      className="flex-1"
      style={{ backgroundColor: Colors[colorScheme].background }}
    >
      <View
        className="flex-row items-center px-4 pb-3 border-b border-black/5 dark:border-white/5"
        style={{ paddingTop: insets.top + 10 }}
      >
        <BouncyButton
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={() => router.back()}
          className="w-9 h-9 items-center justify-center rounded-full mr-2"
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={Colors[colorScheme].text}
          />
        </BouncyButton>
        {member?.avatar_url || actor?.avatar_url ? (
          <StableAvatar
            uri={member?.avatar_url || actor?.avatar_url}
            className="w-9 h-9 rounded-full mr-2.5"
          />
        ) : null}
        <View className="flex-1 bg-transparent">
          <Text className="font-bold text-[15px]" numberOfLines={1}>
            {member?.name || actor?.name || '用户发布'}
          </Text>
          <Text type="secondary" className="text-[11px]">
            最近发布
            {navigation ? ` · ${navigation.index + 1}/${navigation.total}` : ''}
          </Text>
        </View>
        {navigation ? (
          <View className="flex-row bg-transparent">
            <BouncyButton
              accessibilityRole="button"
              accessibilityLabel="上一位用户"
              disabled={navigation.index === 0}
              onPress={navigation.onPrevious}
              className="w-9 h-9 items-center justify-center rounded-full"
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={
                  navigation.index === 0
                    ? Colors[colorScheme].textTertiary
                    : Colors[colorScheme].text
                }
              />
            </BouncyButton>
            <BouncyButton
              accessibilityRole="button"
              accessibilityLabel="下一位用户"
              disabled={navigation.index === navigation.total - 1}
              onPress={navigation.onNext}
              className="w-9 h-9 items-center justify-center rounded-full"
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color={
                  navigation.index === navigation.total - 1
                    ? Colors[colorScheme].textTertiary
                    : Colors[colorScheme].text
                }
              />
            </BouncyButton>
          </View>
        ) : null}
      </View>

      {isMemberLoading ? (
        <View className="flex-1 items-center justify-center bg-transparent">
          <ActivityIndicator color={primaryColor} />
        </View>
      ) : isMemberError || !member ? (
        <QueryErrorView
          message="用户资料加载失败"
          onRetry={() => void refetchMember()}
        />
      ) : (
        <FlashList<PublishedStreamRow>
          data={rows}
          keyExtractor={(row) => row.key}
          renderItem={({ item: row }) =>
            row.kind === 'content' ? (
              <FeedCard item={row.item} answerContext={row.answerContext} />
            ) : (
              <View className="flex-row items-center mx-4 my-5 bg-transparent">
                <View className="flex-1 h-px bg-black/10 dark:bg-white/10" />
                <Text type="secondary" className="mx-3 text-xs">
                  已看完本次更新
                </Text>
                <View className="flex-1 h-px bg-black/10 dark:bg-white/10" />
              </View>
            )
          }
          contentContainerStyle={{ paddingVertical: 10, paddingBottom: 50 }}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          onEndReached={() => {
            if (
              isActive &&
              hasNextPage &&
              !isFetching &&
              !isFetchNextPageError &&
              !refreshing &&
              !refreshPending.current
            )
              void fetchNextPage();
          }}
          {...listPreload}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator
                style={{ marginTop: 100 }}
                color={primaryColor}
              />
            ) : isError ? (
              <QueryErrorView
                message="发布内容加载失败"
                onRetry={() => void refetch()}
              />
            ) : (
              <Text type="secondary" className="text-center mt-20 text-sm">
                暂无发布内容
              </Text>
            )
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator style={{ margin: 20 }} color={primaryColor} />
            ) : isFetchNextPageError ? (
              <QueryErrorView
                message="更多创作加载失败"
                onRetry={() => void fetchNextPage()}
              />
            ) : rows.length > 0 && !hasNextPage ? (
              <Text type="secondary" className="text-center p-5 text-xs">
                — 已经到底了喵 —
              </Text>
            ) : null
          }
        />
      )}
    </View>
  );
}
