import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FeedItem } from '@/api/zhihu/feed';
import {
  followTopic,
  getBestAnswerers,
  getTopic,
  getTopicChildren,
  getTopicFeed,
  getTopicParents,
  unfollowTopic,
} from '@/api/zhihu/topic';
import { getContentVoteCount, getContentVoteState } from '@/api/zhihu/voters';
import { BouncyButton } from '@/components/BouncyButton';
import { FeedCard } from '@/components/FeedCard';
import { FollowButton } from '@/components/FollowButton';
import { QueryErrorView } from '@/components/QueryErrorView';
import { StableAvatar } from '@/components/StableAvatar';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle';
import { useRefreshAction } from '@/hooks/useRefreshAction';
import { useZhihuInfiniteQuery } from '@/hooks/useZhihuInfiniteQuery';
import type {
  ZhihuBestAnswerer,
  ZhihuTopic,
  ZhihuTopicFeedItem,
  ZhihuTopicFeedTarget,
} from '@/types/zhihu';
import { getCachedImageSource } from '@/utils/imageSource';
import { refreshInfiniteQuery } from '@/utils/query';

export default function TopicDetail() {
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const tintColor = useThemeColor({}, 'primary');
  const textColor = useThemeColor({}, 'text');
  const backgroundColor = useThemeColor({}, 'background');

  const [activeTab, setActiveTab] = useState<
    'hot' | 'top-answers' | 'unanswered' | 'structure'
  >('top-answers');

  const {
    data: topic,
    isLoading: topicLoading,
    isError: topicError,
    refetch: refetchTopic,
  } = useQuery({
    queryKey: ['topic', id],
    queryFn: () => getTopic(id),
  });

  const followMutation = useOptimisticToggle<NonNullable<typeof topic>>({
    queryKey: ['topic', id],
    isActive: topic?.is_following,
    mutationFn: async () => {
      if (topic?.is_following) return unfollowTopic(id);
      return followTopic(id);
    },
    onUpdateCache: (old) => ({
      ...old,
      is_following: !old?.is_following,
      followers_count: old?.is_following
        ? Math.max(0, (old.followers_count ?? 0) - 1)
        : (old.followers_count ?? 0) + 1,
    }),
    successMessage: (isActive) => (isActive ? '已取消关注' : '已关注话题'),
  });

  const {
    data: feedData,
    isLoading: feedLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
    isFetchNextPageError,
    isError: feedError,
    refetch,
  } = useZhihuInfiniteQuery({
    queryKey: ['topic-feed', id, activeTab],
    queryFn: ({ pageParam = 0, signal }) =>
      getTopicFeed(id, activeTab, pageParam, { signal }),
    initialPageParam: 0,
    enabled: activeTab !== 'structure',
  });

  const {
    data: parentsData,
    isLoading: parentsLoading,
    isError: parentsError,
    refetch: refetchParents,
  } = useQuery({
    queryKey: ['topic-parents', id],
    queryFn: () => getTopicParents(id),
    enabled: activeTab === 'structure',
  });

  const {
    data: childrenData,
    isLoading: childrenLoading,
    isError: childrenError,
    refetch: refetchChildren,
  } = useQuery({
    queryKey: ['topic-children', id],
    queryFn: () => getTopicChildren(id),
    enabled: activeTab === 'structure',
  });

  const {
    data: bestAnswerersData,
    isLoading: bestAnswerersLoading,
    isError: bestAnswerersError,
    refetch: refetchBestAnswerers,
  } = useQuery({
    queryKey: ['topic-best-answerers', id],
    queryFn: () => getBestAnswerers(id),
    enabled: activeTab === 'structure',
  });

  const { refresh: handleRefresh, refreshing } = useRefreshAction(async () => {
    await Promise.all([
      refetchTopic(),
      ...(activeTab === 'structure'
        ? [refetchParents(), refetchChildren(), refetchBestAnswerers()]
        : [refreshInfiniteQuery(queryClient, ['topic-feed', id, activeTab])]),
    ]);
  });

  const items = useMemo(() => {
    if (activeTab === 'structure') return [];
    return (
      feedData?.pages.flatMap((page) =>
        page.data
          .map((item) => parseTopicFeedItem(item))
          .filter((item): item is FeedItem => Boolean(item)),
      ) || []
    );
  }, [feedData, activeTab]);

  const renderHeader = useMemo(() => {
    if (!topic && topicLoading)
      return <ActivityIndicator style={{ marginTop: 100 }} />;
    if (!topic && topicError) {
      return (
        <QueryErrorView
          compact
          message="话题加载失败"
          onRetry={() => void refetchTopic()}
        />
      );
    }
    if (!topic) return null;

    return (
      <View type="surface" className="pb-4">
        <View className="flex-row p-5 items-center bg-transparent">
          <Image
            source={getCachedImageSource(topic.avatar_url)}
            className="w-16 h-16 rounded-xl"
            resizeMode="cover"
          />
          <View className="ml-4 flex-1 bg-transparent">
            <Text className="text-xl font-bold">{topic.name}</Text>
            <Text type="secondary" className="text-sm mt-1">
              {topic.followers_count} 关注 · {topic.best_answers_count} 精华
            </Text>
          </View>
          <FollowButton
            following={Boolean(topic.is_following)}
            loading={followMutation.isPending}
            onPress={() => followMutation.mutate()}
          />
        </View>

        {topic.introduction ? (
          <View className="px-5 mb-4 bg-transparent">
            <Text
              type="secondary"
              className="text-sm leading-5"
              numberOfLines={3}
            >
              {topic.introduction.replace(/<[^>]+>/g, '')}
            </Text>
          </View>
        ) : null}

        <View
          className="flex-row border-b bg-transparent"
          style={{ borderColor: Colors[colorScheme].border }}
        >
          {(
            [
              // { id: 'hot', name: '讨论' }, // api 404
              { id: 'top-answers', name: '精华' },
              { id: 'unanswered', name: '等待回答' },
              { id: 'structure', name: '话题结构' },
            ] as const
          ).map((tab) => (
            <BouncyButton
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              className="flex-1 py-3 items-center"
            >
              <Text
                style={[
                  activeTab === tab.id
                    ? { color: tintColor, fontWeight: 'bold' }
                    : { color: Colors[colorScheme].textSecondary },
                ]}
                className="text-[15px]"
              >
                {tab.name}
              </Text>
              {activeTab === tab.id && (
                <View
                  className="absolute bottom-0 w-8 h-[3px] rounded-full"
                  style={{ backgroundColor: tintColor }}
                />
              )}
            </BouncyButton>
          ))}
        </View>
      </View>
    );
  }, [
    topic,
    topicLoading,
    topicError,
    activeTab,
    tintColor,
    colorScheme,
    followMutation.mutate,
    followMutation.isPending,
    refetchTopic,
  ]);

  return (
    <View type="default" className="flex-1">
      <Stack.Screen
        options={{
          headerTitle: topic?.name || '话题',
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
        data={activeTab === 'structure' ? [] : items}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        renderItem={({ item }) => <FeedCard item={item} />}
        ListHeaderComponent={() => (
          <>
            {renderHeader}
            {activeTab === 'structure' && (
              <TopicStructureView
                parents={parentsData?.data || []}
                childTopics={childrenData?.data || []}
                bestAnswerers={bestAnswerersData?.data || []}
                isLoading={
                  parentsLoading || childrenLoading || bestAnswerersLoading
                }
                hasError={parentsError || childrenError || bestAnswerersError}
                onRetry={() => {
                  void refetchParents();
                  void refetchChildren();
                  void refetchBestAnswerers();
                }}
              />
            )}
          </>
        )}
        onEndReached={() =>
          activeTab !== 'structure' &&
          hasNextPage &&
          !isFetching &&
          !refreshing &&
          !isFetchNextPageError &&
          fetchNextPage()
        }
        onEndReachedThreshold={0.5}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        ListFooterComponent={() =>
          isFetchingNextPage ? (
            <ActivityIndicator
              style={{ marginVertical: 20 }}
              color={tintColor}
            />
          ) : activeTab !== 'structure' && isFetchNextPageError ? (
            <QueryErrorView
              compact
              message="更多话题内容加载失败"
              onRetry={() => void fetchNextPage()}
            />
          ) : items.length > 0 && !hasNextPage ? (
            <Text type="secondary" className="text-center my-5">
              — 没有更多内容了 —
            </Text>
          ) : null
        }
        ListEmptyComponent={() =>
          !feedLoading &&
          items.length === 0 &&
          activeTab !== 'structure' &&
          (feedError ? (
            <QueryErrorView
              message="话题内容加载失败"
              onRetry={() => void refetch()}
            />
          ) : (
            <View className="items-center justify-center mt-20 bg-transparent">
              <Ionicons
                name="document-text-outline"
                size={48}
                color={Colors[colorScheme].textSecondary}
              />
              <Text type="secondary" className="mt-4">
                暂无内容
              </Text>
            </View>
          ))
        }
      />
    </View>
  );
}

function TopicStructureView({
  parents,
  childTopics,
  bestAnswerers,
  isLoading,
  hasError,
  onRetry,
}: {
  parents: ZhihuTopic[];
  childTopics: ZhihuTopic[];
  bestAnswerers: ZhihuBestAnswerer[];
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
}) {
  const router = useRouter();
  const primaryColor = useThemeColor({}, 'primary');

  if (isLoading) {
    return (
      <View className="p-10 items-center bg-transparent">
        <ActivityIndicator color={primaryColor} />
      </View>
    );
  }

  if (hasError) {
    return (
      <QueryErrorView compact message="话题结构加载失败" onRetry={onRetry} />
    );
  }

  return (
    <View className="bg-transparent pb-10">
      {bestAnswerers.length > 0 && (
        <View className="px-5 py-4 bg-transparent border-b border-gray-100 dark:border-gray-800">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-base font-bold">最佳回答者</Text>
          </View>
          <View className="bg-transparent">
            {bestAnswerers.map((item) => (
              <BouncyButton
                key={item.member.id}
                className="flex-row items-center mb-4"
                onPress={() => router.push(`/user/${item.member.url_token}`)}
              >
                <StableAvatar
                  uri={item.member.avatar_url}
                  className="w-12 h-12 rounded-full mr-3"
                />
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <Text className="font-bold text-[15px] mr-1">
                      {item.member.name}
                    </Text>
                    {item.member.badge && item.member.badge.length > 0 && (
                      <Ionicons
                        name="checkmark-circle"
                        size={14}
                        color="#0066FF"
                      />
                    )}
                  </View>
                  <Text type="secondary" className="text-xs" numberOfLines={1}>
                    {item.member.headline}
                  </Text>
                  <Text type="secondary" className="text-xs mt-1">
                    {item.answer_count} 回答 ·{' '}
                    {item.answer_votes >= 1000
                      ? `${(item.answer_votes / 1000).toFixed(1)}k`
                      : item.answer_votes}{' '}
                    赞同
                  </Text>
                </View>
              </BouncyButton>
            ))}
          </View>
        </View>
      )}

      {parents.length > 0 && (
        <View className="px-5 py-4 bg-transparent border-b border-gray-100 dark:border-gray-800">
          <Text className="text-base font-bold mb-3">父话题</Text>
          <View className="flex-row flex-wrap bg-transparent">
            {parents.map((topic) => (
              <TopicItem key={topic.id} topic={topic} />
            ))}
          </View>
        </View>
      )}

      {childTopics.length > 0 && (
        <View className="px-5 py-4 bg-transparent">
          <Text className="text-base font-bold mb-3">子话题</Text>
          <View className="flex-row flex-wrap bg-transparent">
            {childTopics.map((topic) => (
              <TopicItem key={topic.id} topic={topic} />
            ))}
          </View>
        </View>
      )}

      {parents.length === 0 &&
        childTopics.length === 0 &&
        bestAnswerers.length === 0 && (
          <View className="p-10 items-center bg-transparent">
            <Text type="secondary">暂无话题层级数据</Text>
          </View>
        )}
    </View>
  );
}

function TopicItem({ topic }: { topic: ZhihuTopic }) {
  const router = useRouter();
  const colorScheme = useColorScheme();

  return (
    <BouncyButton
      onPress={() => router.push(`/topic/${topic.id}`)}
      className="flex-row items-center p-3 mb-3 mr-3 rounded-xl border w-[46%]"
      style={{
        borderColor: Colors[colorScheme].border,
        backgroundColor: Colors[colorScheme].surface,
      }}
    >
      <Image
        source={getCachedImageSource(topic.avatar_url)}
        className="w-8 h-8 rounded-lg"
      />
      <View className="ml-2.5 flex-1 bg-transparent">
        <Text className="text-sm font-bold" numberOfLines={1}>
          {topic.name}
        </Text>
      </View>
    </BouncyButton>
  );
}

function parseTopicFeedItem(item: ZhihuTopicFeedItem): FeedItem | null {
  const target: ZhihuTopicFeedTarget = 'target' in item ? item.target : item;
  const type = target.type;
  let appType: 'answers' | 'articles' | 'pins' | 'questions' | null = null;
  if (type === 'answer') appType = 'answers';
  else if (type === 'article') appType = 'articles';
  else if (type === 'pin') appType = 'pins';
  else if (type === 'question') appType = 'questions';

  if (!appType || target.id == null || String(target.id).trim() === '')
    return null;

  // Extract content for pins (thoughts)
  let excerpt = target.excerpt || '';
  if (type === 'pin' && Array.isArray(target.content)) {
    const textContent = target.content.find(
      (content) => content.type === 'text',
    );
    excerpt = textContent
      ? (textContent.content ?? '')
      : target.content[0]?.content || '';
  }

  // Extract images
  const image =
    target.thumbnail ||
    (target.topic_thumbnails && target.topic_thumbnails.length > 0
      ? target.topic_thumbnails[0]
      : null) ||
    target.content_img?.[0] ||
    (type === 'pin' && Array.isArray(target.content)
      ? target.content.find((content) => content.type === 'image')?.url
      : null);

  return {
    id: String(target.id),
    title: target.question?.title || target.title || target.excerpt_title || '',
    questionId:
      target.question?.id?.toString() ||
      (type === 'question' ? target.id?.toString() : ''),
    author: {
      id: target.author?.id || '',
      url_token: target.author?.url_token || '',
      name: target.author?.name || '匿名用户',
      avatar:
        target.author?.avatar_url ||
        'https://picx.zhimg.com/v2-abed1a8c04700ba7d72b45195223e0ff_l.jpg',
      headline: target.author?.headline || '',
    },
    excerpt: excerpt.replace(/<[^>]+>/g, ''),
    image: image ?? null,
    voteCount: getContentVoteCount(appType, target) ?? 0,
    commentCount: target.comment_count || 0,
    voted: getContentVoteState(appType, target) ?? 0,
    type: appType,
  };
}
