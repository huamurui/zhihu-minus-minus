import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef } from 'react';
import { ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type FeedItem,
  getMemberWithFallback,
  getRecentMemberActivities,
  type ZhihuMember,
  type ZhihuMemberActivity,
} from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { FeedCard } from '@/components/FeedCard';
import { QueryErrorView } from '@/components/QueryErrorView';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import {
  getNextRecentActivityCursor,
  getRecentActivityReadBoundary,
  normalizeUserFeedType,
  type RecentActivityCursor,
} from '@/utils/userProfile';

function getPublishedExcerpt(
  target: NonNullable<ZhihuMemberActivity['target']>,
) {
  if (Array.isArray(target.content)) {
    return target.content
      .filter((segment) => segment.type === 'text')
      .map((segment) => segment.content || segment.own_text || '')
      .join('')
      .replace(/<[^>]+>/g, '')
      .slice(0, 150);
  }
  const text = target.excerpt || target.excerpt_title || target.content || '';
  return typeof text === 'string'
    ? text.replace(/<[^>]+>/g, '').slice(0, 150)
    : '';
}

function toFeedItem(
  activity: ZhihuMemberActivity,
  member: ZhihuMember,
): FeedItem | null {
  const target = activity.target;
  if (!target?.id) return null;

  const type = normalizeUserFeedType(target.type);
  if (!type) return null;

  const contentImage = Array.isArray(target.content)
    ? target.content.find((segment) => segment.type === 'image')
    : undefined;
  const author = target.author;

  return {
    id: String(target.id),
    title: target.question?.title || target.title || '',
    actionText: activity.source?.action_text,
    questionId:
      target.question?.id !== undefined
        ? String(target.question.id)
        : type === 'questions'
          ? String(target.id)
          : undefined,
    author: {
      id: author?.id || member.id,
      url_token: author?.url_token || member.url_token,
      name: author?.name || member.name,
      avatar: author?.avatar_url || member.avatar_url,
      headline: author?.headline || member.headline,
    },
    excerpt: getPublishedExcerpt(target),
    content: target.content,
    image:
      target.image_url ||
      target.thumbnail ||
      contentImage?.url ||
      contentImage?.data_draft_cover ||
      null,
    voteCount:
      type === 'pins'
        ? target.reaction_count || target.voteup_count || 0
        : target.voteup_count || 0,
    commentCount: target.comment_count || 0,
    favlistsCount: target.favlists_count || 0,
    voted: target.relationship?.voting || 0,
    type,
  };
}

type PublishedStreamRow =
  | {
      key: string;
      kind: 'content';
      item: FeedItem;
    }
  | {
      key: 'read-boundary';
      kind: 'read-boundary';
    };

function parseUnreadCount(value: string | undefined) {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export default function UserStreamScreen() {
  const { id, unreadCount } = useLocalSearchParams<{
    id: string;
    unreadCount?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const primaryColor = useThemeColor({}, 'primary');
  const initialCursor = useRef<RecentActivityCursor>({
    offset: Date.now(),
    pageNum: 1,
  });
  const initialUnreadCount = useRef(parseUnreadCount(unreadCount));

  const {
    data: member,
    isLoading: isMemberLoading,
    isError: isMemberError,
    refetch: refetchMember,
  } = useQuery({
    queryKey: ['user-detail', id],
    queryFn: () => getMemberWithFallback(id),
  });

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['user-recent-published-activities', member?.id],
    queryFn: ({ pageParam }) =>
      getRecentMemberActivities(member?.id || '', pageParam),
    initialPageParam: initialCursor.current,
    getNextPageParam: (lastPage) => {
      if (lastPage.paging?.is_end) return undefined;
      return getNextRecentActivityCursor(lastPage.paging?.next);
    },
    enabled: !!member?.id,
  });

  const activities = data?.pages.flatMap((page) => page.data) || [];
  const isEnd = data?.pages.at(-1)?.paging?.is_end ?? false;
  const readBoundary = getRecentActivityReadBoundary(
    initialUnreadCount.current,
    activities.length,
    isEnd,
  );
  const rows: PublishedStreamRow[] = [];

  if (member) {
    activities.forEach((activity, index) => {
      const item = toFeedItem(activity, member);
      if (item) {
        rows.push({
          key: `published-${item.type}-${item.id}`,
          kind: 'content',
          item,
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
      <Stack.Screen options={{ headerShown: false, title: '用户发布' }} />
      <View
        className="flex-row items-center px-4 pb-3 border-b border-black/5 dark:border-white/5"
        style={{ paddingTop: insets.top + 10 }}
      >
        <BouncyButton
          onPress={() => router.back()}
          className="w-9 h-9 items-center justify-center rounded-full mr-2"
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={Colors[colorScheme].text}
          />
        </BouncyButton>
        {member?.avatar_url ? (
          <Image
            source={{ uri: member.avatar_url }}
            className="w-9 h-9 rounded-full mr-2.5"
          />
        ) : null}
        <View className="flex-1 bg-transparent">
          <Text className="font-bold text-[15px]" numberOfLines={1}>
            {member?.name || '用户发布'}
          </Text>
          <Text type="secondary" className="text-[11px]">
            最近发布
          </Text>
        </View>
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
              <FeedCard item={row.item} />
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
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
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
