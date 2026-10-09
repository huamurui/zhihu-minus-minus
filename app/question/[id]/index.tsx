import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';
import { RefreshControl } from 'react-native-gesture-handler';
import Reanimated, {
  SharedTransition,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hasAuthenticationCookie } from '@/api/client';
import {
  type AnswerDetail,
  deleteAnswer,
  type QuestionAnswersResponse,
} from '@/api/zhihu/answer';
import { recordReadHistory } from '@/api/zhihu/history';
import { followMember, unfollowMember } from '@/api/zhihu/member';
import {
  followQuestion,
  getQuestion,
  getQuestionAnswers,
  unfollowQuestion,
  type ZhihuQuestionDetail,
} from '@/api/zhihu/question';
import { BouncyButton } from '@/components/BouncyButton';
import { ContentActionButton } from '@/components/ContentActionButton';
import {
  DetailNavigationHeader,
  useDetailNavigationHeight,
} from '@/components/DetailNavigationHeader';
import { FeedExcerpt } from '@/components/FeedExcerpt';
import { FollowButton } from '@/components/FollowButton';
import { LikeButton } from '@/components/LikeButton';
import { MoreActionsButton } from '@/components/MoreActionsButton';
import { QueryErrorView } from '@/components/QueryErrorView';
import { ShareMenu } from '@/components/ShareMenu';
import { StableAvatar } from '@/components/StableAvatar';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { RICH_CONTENT_STALE_TIME, ZhihuContent } from '@/features/rich-content';
import { useDetailHeaderState } from '@/hooks/useDetailHeaderState';
import { useGestureScrollView } from '@/hooks/useGestureScrollView';
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle';
import { useScrollHeaderAnim } from '@/hooks/useScrollAnimation';
import { useAuthStore } from '@/store/useAuthStore';
import { useCollectionStore } from '@/store/useCollectionStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { seedAnswerPreviewEntry } from '@/utils/answerPreviewEntry';
import { seedAnswerDetailFromList } from '@/utils/contentCache';
import { refreshInfiniteQuery } from '@/utils/query';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

const AnimatedFlashList = Reanimated.createAnimatedComponent(
  FlashList,
) as typeof FlashList;

type AnswerSort = 'default' | 'created';

interface QuestionAnswerCardProps {
  item: AnswerDetail;
  questionId: string;
  questionTitle: string;
  sortBy: AnswerSort;
  isAuthenticated: boolean;
  onMore: (item: AnswerDetail) => void;
}

/** The question list shows summaries; its reading mode starts after navigation. */
const QuestionAnswerCard = React.memo(function QuestionAnswerCard({
  item,
  questionId,
  questionTitle,
  sortBy,
  isAuthenticated,
  onMore,
}: QuestionAnswerCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const secondaryColor = useThemeColor({}, 'textSecondary');
  const followMutation = useOptimisticToggle<
    InfiniteData<QuestionAnswersResponse, number | string>
  >({
    queryKey: ['question-answers', questionId, sortBy, isAuthenticated],
    mutationFn: async () => {
      const authorId = item.author.url_token || item.author.id;
      if (!authorId) return;
      return item.author.is_following
        ? unfollowMember(authorId)
        : followMember(authorId);
    },
    isActive: item.author.is_following,
    onUpdateCache: (old) => ({
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        data: page.data.map((answer) =>
          answer.id.toString() === item.id.toString()
            ? {
                ...answer,
                author: {
                  ...answer.author,
                  is_following: !answer.author.is_following,
                },
              }
            : answer,
        ),
      })),
    }),
    successMessage: (isActive) => (isActive ? '已取消关注' : '已关注'),
  });
  const openAnswer = () => {
    const initialAnswer: AnswerDetail = {
      ...item,
      type: 'answer',
      question: {
        ...item.question,
        id: questionId,
        title: questionTitle,
        type: 'question',
      },
    };
    seedAnswerDetailFromList(queryClient, initialAnswer);
    seedAnswerPreviewEntry(queryClient, initialAnswer);
    router.push({
      pathname: '/answer/[id]',
      params: {
        answerScene: 'question_feed',
        id: String(item.id),
        questionId,
        title: questionTitle,
        sortBy,
      },
    });
  };

  return (
    <View type="surface" className="p-4 mb-2.5 mx-1.5 rounded-xl">
      <View className="flex-row items-center mb-3 bg-transparent">
        <BouncyButton
          accessibilityRole="button"
          accessibilityLabel={`查看 ${item.author.name} 的主页`}
          onPress={() => {
            const authorId = item.author.url_token || item.author.id;
            if (authorId)
              router.push({ pathname: '/user/[id]', params: { id: authorId } });
          }}
          className="flex-row flex-1 items-center bg-transparent"
        >
          <StableAvatar
            uri={item.author.avatar_url}
            className="w-[34px] h-[34px] rounded-[17px]"
          />
          <View className="flex-1 ml-2.5 bg-transparent">
            <Text className="text-[15px] font-bold">{item.author.name}</Text>
            {item.author.headline ? (
              <Text
                type="secondary"
                className="text-xs mt-0.5"
                numberOfLines={1}
              >
                {item.author.headline}
              </Text>
            ) : null}
          </View>
        </BouncyButton>
        {!item.relationship?.is_author ? (
          <FollowButton
            following={Boolean(item.author.is_following)}
            loading={followMutation.isPending}
            onPress={() => followMutation.mutate()}
          />
        ) : null}
      </View>
      <BouncyButton
        accessibilityRole="button"
        accessibilityLabel={`阅读 ${item.author.name} 的回答`}
        onPress={openAnswer}
        className="py-1 mb-2"
      >
        <FeedExcerpt
          html={item.excerpt || item.content || '点击阅读回答'}
          numberOfLines={4}
        />
      </BouncyButton>
      <View className="flex-row items-center bg-transparent">
        <LikeButton
          id={item.id}
          count={item.voteup_count}
          voted={item.relationship?.voting}
          type="answers"
          variant="ghost"
        />
        <ContentActionButton
          accessibilityRole="button"
          accessibilityLabel={`${item.comment_count} 条回答评论`}
          className="flex-row items-center py-1.5 px-3 rounded-full"
          onPress={() =>
            router.push({
              pathname: '/comments/[id]',
              params: {
                id: item.id,
                type: 'answer',
                count: item.comment_count,
              },
            })
          }
        >
          <Ionicons
            name="chatbubble-outline"
            size={16}
            color={secondaryColor}
          />
          <Text type="secondary" className="ml-1 text-xs font-semibold">
            {item.comment_count}
          </Text>
        </ContentActionButton>
        <MoreActionsButton
          accessibilityLabel="回答更多操作"
          style={{ marginLeft: 'auto' }}
          onPress={() => onMore(item)}
        />
      </View>
    </View>
  );
});

const slowTransition = SharedTransition.duration(600);

export default function QuestionDetail() {
  const { id, title: initialTitle } = useLocalSearchParams<{
    id: string;
    title?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isAuthenticated = useAuthStore((state) =>
    hasAuthenticationCookie(state.cookies),
  );
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const navigationHeight = insets.top + useDetailNavigationHeight();
  const queryClient = useQueryClient();
  const scrollY = useSharedValue(0);
  const {
    headerProgress,
    collapsed: headerCollapsed,
    onScrollOffset,
    onHeaderLayout,
  } = useDetailHeaderState(id, { scrollY, initialCollapseOffset: 100 });
  const { renderScrollComponent } = useGestureScrollView();

  const [sortBy, setSortBy] = useState<AnswerSort>('default');
  const [menuSelection, setMenuSelection] = useState<{
    questionId: string;
    answer: AnswerDetail | null;
  } | null>(null);
  const menuVisible = menuSelection !== null && menuSelection.questionId === id;
  const selectedAnswer = menuVisible ? (menuSelection?.answer ?? null) : null;

  React.useEffect(() => {
    setMenuSelection((selection) =>
      selection?.questionId === id ? selection : null,
    );
  }, [id]);
  const [detailExpanded, setDetailExpanded] = useState(false);

  const selectedAnswerCollected = useCollectionStore((state) =>
    selectedAnswer
      ? (state.collectedStatusMap[selectedAnswer.id.toString()] ??
        selectedAnswer.relationship?.is_favorited)
      : undefined,
  );

  const deleteMutation = useMutation({
    mutationFn: (answerId: string | number) => deleteAnswer(answerId),
    onMutate: () => ({ questionId: id }),
    onSuccess: (_result, _answerId, context) => {
      Alert.alert('删除成功', '你的回答已删除喵！');
      void queryClient.invalidateQueries({
        queryKey: ['question-answers', context?.questionId || id],
      });
    },
    onError: (error: unknown) => {
      Alert.alert('删除失败', getZhihuErrorMessage(error));
    },
  });

  const confirmDeleteAnswer = (answerId: string | number) => {
    Alert.alert('确认删除', '确定要删除这个回答吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认删除',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(answerId),
      },
    ]);
  };

  const flashListRef = useRef<FlashListRef<AnswerDetail>>(null);
  const {
    data: answersData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
    isPending: answersPending,
    isError: answersError,
  } = useInfiniteQuery<
    QuestionAnswersResponse,
    Error,
    InfiniteData<QuestionAnswersResponse, number | string>,
    ['question-answers', string, AnswerSort, boolean],
    number | string
  >({
    queryKey: ['question-answers', id, sortBy, isAuthenticated],
    queryFn: async ({ pageParam = 0 }) => {
      const include =
        'data[*].content,excerpt,endorsements,answer_type,paid_info,content_need_truncated,voteup_count,comment_count,favlists_count,author.name,author.avatar_url,author.headline,author.is_following,relationship.voting,relationship.is_author,relationship.is_favorited,created_time,updated_time,ip_info,segment_infos,link_card_info';
      return getQuestionAnswers(id as string, pageParam, sortBy, include);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (lastPage.paging?.is_end) return undefined;
      return lastPage.paging?.next;
    },
  });

  const handleRefresh = useCallback(() => {
    return refreshInfiniteQuery(
      queryClient,
      ['question-answers', id, sortBy, isAuthenticated],
      refetch,
    );
  }, [queryClient, id, sortBy, isAuthenticated, refetch]);

  const answers = useMemo(() => {
    const all = answersData?.pages.flatMap((page) => page.data) || [];
    const seen = new Set<string>();
    return all.filter((item) => {
      const id = item?.id?.toString();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [answersData]);

  const enableBrowseHistory = useSettingsStore((s) => s.enableBrowseHistory);

  const getShareLink = (answer: AnswerDetail) => {
    const aid = answer?.id;
    return `https://www.zhihu.com/question/${id}/answer/${aid}`;
  };

  const { handleScroll } = useScrollHeaderAnim(
    400,
    onScrollOffset,
    100,
    scrollY,
  );

  const primaryColor = useThemeColor({}, 'primary');
  const linkColor = useThemeColor({}, 'link');
  const onPrimaryColor = useThemeColor({}, 'onPrimary');
  const topicBackground = useThemeColor({}, 'backgroundTertiary');

  const {
    data: question,
    isLoading: qLoading,
    isError: questionError,
    refetch: refetchQuestion,
  } = useQuery({
    queryKey: ['question', id, isAuthenticated],
    queryFn: async () => await getQuestion(id as string),
    staleTime: RICH_CONTENT_STALE_TIME,
  });

  const followMutation = useOptimisticToggle<ZhihuQuestionDetail>({
    queryKey: ['question', id, isAuthenticated],
    isActive: question?.relationship?.is_following,
    mutationFn: async () => {
      if (question?.relationship?.is_following)
        return unfollowQuestion(id as string);
      return followQuestion(id as string);
    },
    onUpdateCache: (old) => ({
      ...old,
      relationship: {
        ...old?.relationship,
        is_following: !old?.relationship?.is_following,
      },
      follower_count: old.relationship?.is_following
        ? Math.max(0, (old.follower_count ?? 0) - 1)
        : (old.follower_count ?? 0) + 1,
    }),
    successMessage: (isActive) => (isActive ? '已取消关注' : '已关注问题'),
  });

  React.useEffect(() => {
    if (enableBrowseHistory && question?.id) {
      recordReadHistory({
        content_token: String(question.id),
        content_type: 'question',
      });
    }
  }, [enableBrowseHistory, question?.id]);

  const renderHeader = useMemo(
    () => (
      <View>
        <View
          type="surface"
          className="px-5 pb-5"
          style={{
            paddingTop: navigationHeight + 14,
            borderBottomLeftRadius: 20,
            borderBottomRightRadius: 20,
          }}
        >
          <Reanimated.View
            sharedTransitionTag={`title-${id}`}
            sharedTransitionStyle={slowTransition}
            onLayout={({ nativeEvent }) => {
              const { y, height } = nativeEvent.layout;
              onHeaderLayout(Math.max(1, y + height - navigationHeight));
            }}
          >
            <Text
              style={{
                fontSize: 22,
                lineHeight: 30,
                fontWeight: '700',
              }}
            >
              {question?.title || initialTitle || '加载中...'}
            </Text>
          </Reanimated.View>
          {qLoading && !question ? (
            <View className="h-[100px] justify-center">
              <ActivityIndicator size="small" color={primaryColor} />
            </View>
          ) : questionError && !question ? (
            <QueryErrorView
              compact
              message="问题详情加载失败"
              onRetry={() => void refetchQuestion()}
            />
          ) : (
            <>
              {question?.topics?.length ? (
                <View className="flex-row flex-wrap mt-3 gap-1.5">
                  {question.topics.map((topic) => (
                    <BouncyButton
                      key={topic.id}
                      accessibilityRole="button"
                      onPress={() => router.push(`/topic/${topic.id}`)}
                      style={{
                        backgroundColor: topicBackground,
                        paddingHorizontal: 9,
                        paddingVertical: 4,
                        borderRadius: 6,
                      }}
                    >
                      <Text
                        type="secondary"
                        style={{ fontSize: 12, lineHeight: 18 }}
                      >
                        {topic.name}
                      </Text>
                    </BouncyButton>
                  ))}
                </View>
              ) : null}
              {question?.detail ? (
                <View className="mt-3 rounded-2xl overflow-hidden">
                  {detailExpanded ? (
                    <>
                      <ZhihuContent
                        content={question.detail}
                        objectId={id as string}
                        type="question"
                      />
                      <BouncyButton
                        accessibilityRole="button"
                        accessibilityLabel="收起问题描述"
                        onPress={() => setDetailExpanded(false)}
                        className="flex-row items-center self-start py-1 mt-1 gap-1"
                      >
                        <Text
                          style={{
                            color: linkColor,
                            fontSize: 13,
                            lineHeight: 20,
                          }}
                        >
                          收起问题描述
                        </Text>
                        <Ionicons
                          name="chevron-up"
                          size={13}
                          color={linkColor}
                        />
                      </BouncyButton>
                    </>
                  ) : (
                    <BouncyButton
                      accessibilityRole="button"
                      accessibilityLabel="展开问题描述"
                      onPress={() => setDetailExpanded(true)}
                    >
                      <Text
                        type="secondary"
                        numberOfLines={3}
                        style={{ fontSize: 14, lineHeight: 22 }}
                      >
                        {question.excerpt?.replace(/<[^>]+>/g, '') || ''}
                      </Text>
                      <View className="flex-row items-center mt-1 gap-1">
                        <Text
                          style={{
                            color: linkColor,
                            fontSize: 13,
                            lineHeight: 20,
                          }}
                        >
                          展开问题描述
                        </Text>
                        <Ionicons
                          name="chevron-down"
                          size={13}
                          color={linkColor}
                        />
                      </View>
                    </BouncyButton>
                  )}
                </View>
              ) : question?.excerpt ? (
                <Text
                  type="secondary"
                  className="mt-3"
                  numberOfLines={3}
                  style={{ fontSize: 14, lineHeight: 22 }}
                >
                  {question.excerpt.replace(/<[^>]+>/g, '')}
                </Text>
              ) : null}
              <Text
                type="tertiary"
                className="mt-4"
                style={{ fontSize: 12, lineHeight: 18 }}
              >
                {question?.follower_count || 0} 关注 ·{' '}
                {question?.visit_count || 0} 浏览
              </Text>
              <View className="flex-row flex-wrap items-center mt-3.5 gap-2">
                <FollowButton
                  following={Boolean(question?.relationship?.is_following)}
                  loading={followMutation.isPending}
                  accessibilityLabel={
                    question?.relationship?.is_following
                      ? '取消关注问题'
                      : '关注问题'
                  }
                  onPress={() => followMutation.mutate()}
                />
                <ContentActionButton
                  accessibilityRole="button"
                  accessibilityLabel={`${question?.comment_count || 0} 条问题评论`}
                  className="flex-row items-center justify-center gap-1.5"
                  style={{ minHeight: 34, paddingHorizontal: 6 }}
                  onPress={() =>
                    router.push({
                      pathname: '/comments/[id]',
                      params: {
                        id,
                        type: 'question',
                        count: question?.comment_count || 0,
                      },
                    })
                  }
                >
                  <Ionicons
                    name="chatbubble-outline"
                    size={16}
                    color={secondaryTextColor}
                  />
                  <Text
                    type="secondary"
                    style={{ fontSize: 13, lineHeight: 20 }}
                  >
                    {question?.comment_count || 0} 评论
                  </Text>
                </ContentActionButton>
                <View className="flex-1" />
                <ContentActionButton
                  accessibilityRole="button"
                  onPress={() => router.push(`/question/write/${id}`)}
                  style={{
                    minHeight: 34,
                    paddingHorizontal: 15,
                    paddingVertical: 6,
                    borderRadius: 20,
                    backgroundColor: primaryColor,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      lineHeight: 21,
                      fontWeight: '600',
                      color: onPrimaryColor,
                    }}
                  >
                    写回答
                  </Text>
                </ContentActionButton>
              </View>
            </>
          )}
        </View>
        <View className="mx-5 flex-row justify-between items-center py-3.5 mb-1">
          <Text style={{ fontSize: 15, lineHeight: 22, fontWeight: '600' }}>
            {question?.answer_count || 0} 个回答
          </Text>
          <View className="flex-row items-center gap-4">
            <BouncyButton
              accessibilityRole="button"
              accessibilityState={{ selected: sortBy === 'default' }}
              onPress={() => setSortBy('default')}
              className="py-1"
            >
              <Text
                type={sortBy === 'default' ? 'default' : 'secondary'}
                style={{
                  fontSize: 13,
                  lineHeight: 20,
                  fontWeight: sortBy === 'default' ? '600' : '400',
                }}
              >
                默认
              </Text>
            </BouncyButton>
            <BouncyButton
              accessibilityRole="button"
              accessibilityState={{ selected: sortBy === 'created' }}
              onPress={() => setSortBy('created')}
              className="py-1"
            >
              <Text
                type={sortBy === 'created' ? 'default' : 'secondary'}
                style={{
                  fontSize: 13,
                  lineHeight: 20,
                  fontWeight: sortBy === 'created' ? '600' : '400',
                }}
              >
                时间
              </Text>
            </BouncyButton>
          </View>
        </View>
      </View>
    ),
    [
      qLoading,
      question,
      id,
      initialTitle,
      navigationHeight,
      onHeaderLayout,
      sortBy,
      followMutation.mutate,
      followMutation.isPending,
      detailExpanded,
      primaryColor,
      linkColor,
      onPrimaryColor,
      secondaryTextColor,
      topicBackground,
      questionError,
      refetchQuestion,
      router.push,
    ],
  );

  return (
    <View type="default" className="flex-1">
      <Stack.Screen options={{ headerShown: false, title: '问题' }} />

      <ShareMenu
        visible={menuVisible}
        onClose={() => setMenuSelection(null)}
        type={selectedAnswer ? 'answer' : 'question'}
        data={
          selectedAnswer
            ? {
                id: selectedAnswer.id,
                questionId: id,
                title: question?.title || initialTitle,
                author: selectedAnswer.author?.name,
                authorHeadline: selectedAnswer.author?.headline,
                isCollected: selectedAnswerCollected,
                url: getShareLink(selectedAnswer),
              }
            : {
                id,
                title: question?.title || initialTitle,
                url: `https://www.zhihu.com/question/${id}`,
              }
        }
        additionalOptions={
          selectedAnswer?.relationship?.is_author
            ? [
                {
                  key: 'edit',
                  icon: 'create-outline',
                  label: '编辑回答',
                  onPress: () =>
                    router.push(
                      `/question/write/${selectedAnswer.question?.id || id}`,
                    ),
                },
                {
                  key: 'delete',
                  icon: 'trash-outline',
                  label: '删除回答',
                  destructive: true,
                  disabled: deleteMutation.isPending,
                  onPress: () => confirmDeleteAnswer(selectedAnswer.id),
                },
              ]
            : []
        }
      />

      <View className="flex-1">
        <DetailNavigationHeader
          title={question?.title || initialTitle || '问题'}
          collapsed={headerCollapsed}
          progress={headerProgress}
          onBack={() => router.back()}
          onMore={() => setMenuSelection({ questionId: id, answer: null })}
          moreAlwaysVisible
          onTitlePress={() =>
            flashListRef.current?.scrollToOffset({ offset: 0, animated: true })
          }
        />

        <AnimatedFlashList<AnswerDetail>
          ref={flashListRef}
          renderScrollComponent={renderScrollComponent}
          onScroll={handleScroll}
          data={qLoading ? [] : answers}
          ListHeaderComponent={renderHeader}
          renderItem={({ item }) => (
            <QuestionAnswerCard
              item={item}
              questionId={id}
              questionTitle={question?.title || initialTitle || '问题'}
              sortBy={sortBy}
              isAuthenticated={isAuthenticated}
              onMore={(answer) => setMenuSelection({ questionId: id, answer })}
            />
          )}
          keyExtractor={(item) => `ans-${item.id.toString()}`}
          onEndReached={() =>
            hasNextPage && !isFetchingNextPage && fetchNextPage()
          }
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            qLoading ? null : answersPending ? (
              <ActivityIndicator
                style={{ marginTop: 60 }}
                color={primaryColor}
              />
            ) : answersError ? (
              <QueryErrorView
                message="回答列表加载失败"
                onRetry={() => void refetch()}
              />
            ) : (
              <Text type="secondary" className="text-center mt-16 text-sm">
                暂无回答
              </Text>
            )
          }
          ListFooterComponent={() =>
            isFetchingNextPage ? (
              <ActivityIndicator
                style={{ marginVertical: 20 }}
                color={primaryColor}
              />
            ) : answers?.length > 0 && !hasNextPage ? (
              <Text type="secondary" className="text-center my-5">
                — 没有更多回答了 —
              </Text>
            ) : null
          }
          refreshControl={
            <RefreshControl
              onRefresh={handleRefresh}
              refreshing={isRefetching}
            />
          }
        />
      </View>

      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
