import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  followTopic,
  getBestAnswerers,
  getTopic,
  getTopicChildren,
  getTopicFeed,
  getTopicParents,
  unfollowTopic,
} from '@/api/zhihu/topic';
import { BouncyButton } from '@/components/BouncyButton';
import { FeedCard } from '@/components/FeedCard';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle';
import { useZhihuInfiniteQuery } from '@/hooks/useZhihuInfiniteQuery';
import { refreshInfiniteQuery } from '@/utils/query';

export default function TopicDetail() {
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const _insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const tintColor = useThemeColor({}, 'primary');
  const textColor = useThemeColor({}, 'text');
  const backgroundColor = useThemeColor({}, 'background');

  const [activeTab, setActiveTab] = useState<
    'hot' | 'top-answers' | 'unanswered' | 'structure'
  >('top-answers');

  const { data: topic, isLoading: topicLoading } = useQuery({
    queryKey: ['topic', id],
    queryFn: () => getTopic(id),
  });

  const followMutation = useOptimisticToggle({
    queryKey: ['topic', id],
    isActive: topic?.is_following,
    mutationFn: async () => {
      if (topic?.is_following) return unfollowTopic(id);
      return followTopic(id);
    },
    onUpdateCache: (old: any) => ({
      ...old,
      is_following: !old?.is_following,
      followers_count: old?.is_following
        ? old.followers_count - 1
        : old.followers_count + 1,
    }),
    successMessage: (isActive) => (isActive ? '已取消关注' : '已关注话题'),
  });

  const {
    data: feedData,
    isLoading: feedLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useZhihuInfiniteQuery({
    queryKey: ['topic-feed', id, activeTab],
    queryFn: ({ pageParam = 0 }) => getTopicFeed(id, activeTab, pageParam),
    initialPageParam: 0,
    enabled: activeTab !== 'structure',
  });

  const handleRefresh = useCallback(() => {
    return refreshInfiniteQuery(
      queryClient,
      ['topic-feed', id, activeTab],
      refetch,
    );
  }, [queryClient, id, activeTab, refetch]);

  const { data: parentsData, isLoading: parentsLoading } = useQuery({
    queryKey: ['topic-parents', id],
    queryFn: () => getTopicParents(id),
    enabled: activeTab === 'structure',
  });

  const { data: childrenData, isLoading: childrenLoading } = useQuery({
    queryKey: ['topic-children', id],
    queryFn: () => getTopicChildren(id),
    enabled: activeTab === 'structure',
  });

  const { data: bestAnswerersData, isLoading: bestAnswerersLoading } = useQuery(
    {
      queryKey: ['topic-best-answerers', id],
      queryFn: () => getBestAnswerers(id),
      enabled: activeTab === 'structure',
    },
  );

  const items = useMemo(() => {
    if (activeTab === 'structure') return [];
    return (
      feedData?.pages.flatMap((page: any) =>
        page.data.map((item: any) => parseTopicFeedItem(item)).filter(Boolean),
      ) || []
    );
  }, [feedData, activeTab]);

  const renderHeader = useMemo(() => {
    if (!topic && topicLoading)
      return <ActivityIndicator style={{ marginTop: 100 }} />;
    if (!topic) return null;

    return (
      <View type="surface" className="pb-4">
        <View className="flex-row p-5 items-center bg-transparent">
          <Image
            source={{ uri: topic.avatar_url }}
            className="w-16 h-16 rounded-xl"
            resizeMode="cover"
          />
          <View className="ml-4 flex-1 bg-transparent">
            <Text className="text-xl font-bold">{topic.name}</Text>
            <Text type="secondary" className="text-sm mt-1">
              {topic.followers_count} 关注 · {topic.best_answers_count} 精华
            </Text>
          </View>
          <Pressable
            onPress={() => followMutation.mutate()}
            className="px-4 py-1.5 rounded-full"
            style={[
              {
                backgroundColor: topic.is_following ? 'transparent' : tintColor,
              },
              topic.is_following && {
                borderWidth: 1,
                borderColor: Colors[colorScheme].border,
              },
            ]}
          >
            <Text
              style={{
                color: topic.is_following
                  ? Colors[colorScheme].textSecondary
                  : Colors[colorScheme].textInverse,
              }}
              className="font-bold text-sm"
            >
              {topic.is_following ? '已关注' : '关注'}
            </Text>
          </Pressable>
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
          {[
            // { id: 'hot', name: '讨论' }, // api 404
            { id: 'top-answers', name: '精华' },
            { id: 'unanswered', name: '等待回答' },
            { id: 'structure', name: '话题结构' },
          ].map((tab) => (
            <Pressable
              key={tab.id}
              onPress={() => setActiveTab(tab.id as any)}
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
            </Pressable>
          ))}
        </View>
      </View>
    );
  }, [
    topic,
    topicLoading,
    activeTab,
    tintColor,
    colorScheme,
    followMutation.isPending,
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
            <Pressable onPress={() => router.back()} className="mr-4">
              <Ionicons name="chevron-back" size={28} color={textColor} />
            </Pressable>
          ),
        }}
      />

      <FlashList
        data={activeTab === 'structure' ? [] : items}
        renderItem={({ item }) => <FeedCard item={item as any} />}
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
              />
            )}
          </>
        )}
        onEndReached={() =>
          activeTab !== 'structure' &&
          hasNextPage &&
          !isFetchingNextPage &&
          fetchNextPage()
        }
        onEndReachedThreshold={0.5}
        onRefresh={handleRefresh}
        refreshing={isRefetching}
        ListFooterComponent={() =>
          isFetchingNextPage ? (
            <ActivityIndicator
              style={{ marginVertical: 20 }}
              color={tintColor}
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
          activeTab !== 'structure' && (
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
          )
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
}: {
  parents: any[];
  childTopics: any[];
  bestAnswerers: any[];
  isLoading: boolean;
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

  return (
    <View className="bg-transparent pb-10">
      {bestAnswerers.length > 0 && (
        <View className="px-5 py-4 bg-transparent border-b border-gray-100 dark:border-gray-800">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-base font-bold">最佳回答者</Text>
          </View>
          <View className="bg-transparent">
            {bestAnswerers.map((item: any) => (
              <BouncyButton
                key={item.member.id}
                className="flex-row items-center mb-4"
                onPress={() => router.push(`/user/${item.member.url_token}`)}
              >
                <Image
                  source={{ uri: item.member.avatar_url }}
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
            {parents.map((topic: any) => (
              <TopicItem key={topic.id} topic={topic} />
            ))}
          </View>
        </View>
      )}

      {childTopics.length > 0 && (
        <View className="px-5 py-4 bg-transparent">
          <Text className="text-base font-bold mb-3">子话题</Text>
          <View className="flex-row flex-wrap bg-transparent">
            {childTopics.map((topic: any) => (
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

function TopicItem({ topic }: { topic: any }) {
  const router = useRouter();
  const colorScheme = useColorScheme();

  return (
    <Pressable
      onPress={() => router.push(`/topic/${topic.id}` as any)}
      className="flex-row items-center p-3 mb-3 mr-3 rounded-xl border w-[46%]"
      style={{
        borderColor: Colors[colorScheme].border,
        backgroundColor: Colors[colorScheme].surface,
      }}
    >
      <Image
        source={{ uri: topic.avatar_url }}
        className="w-8 h-8 rounded-lg"
      />
      <View className="ml-2.5 flex-1 bg-transparent">
        <Text className="text-sm font-bold" numberOfLines={1}>
          {topic.name}
        </Text>
      </View>
    </Pressable>
  );
}

function parseTopicFeedItem(item: any) {
  const target = item.target || item;
  if (!target) return null;
  const type = target.type;
  let appType: 'answers' | 'articles' | 'pins' | 'questions' | null = null;
  if (type === 'answer') appType = 'answers';
  else if (type === 'article') appType = 'articles';
  else if (type === 'pin') appType = 'pins';
  else if (type === 'question') appType = 'questions';

  if (!appType) return null;

  // Extract content for pins (thoughts)
  let excerpt = target.excerpt || '';
  if (type === 'pin' && Array.isArray(target.content)) {
    const textContent = target.content.find((c: any) => c.type === 'text');
    excerpt = textContent
      ? textContent.content
      : target.content[0]?.content || '';
  }

  // Extract images
  const image =
    target.thumbnail ||
    (target.topic_thumbnails && target.topic_thumbnails.length > 0
      ? target.topic_thumbnails[0]
      : null) ||
    (target.content_img?.length > 0 ? target.content_img[0] : null) ||
    (type === 'pin' && Array.isArray(target.content)
      ? target.content.find((c: any) => c.type === 'image')?.url
      : null);

  return {
    id: target.id?.toString() || Math.random().toString(),
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
    image: image,
    voteCount:
      target.voteup_count || target.like_count || target.reaction_count || 0,
    commentCount: target.comment_count || 0,
    voted:
      target.relationship?.voting ||
      (target.relationship?.is_liked ? 1 : 0) ||
      0,
    type: appType,
  };
}
