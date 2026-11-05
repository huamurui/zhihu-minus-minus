import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { CanceledError } from 'axios';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { hasAuthenticationCookie } from '@/api/client';
import {
  followQuestion,
  getQuestion,
  unfollowQuestion,
  type ZhihuQuestionDetail,
} from '@/api/zhihu/question';
import {
  QUESTION_DETAIL_TEXT_STYLE,
  QuestionDetailContent,
} from '@/components/QuestionDetailContent';
import { TitleTransitionTarget } from '@/features/adaptive-layout/TitleTransition';
import { RICH_CONTENT_STALE_TIME } from '@/features/rich-content';
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { formatCount } from '@/utils/formatCount';
import { BouncyButton } from './BouncyButton';
import { ContentActionButton } from './ContentActionButton';
import { FollowButton } from './FollowButton';
import { MoreActionsButton } from './MoreActionsButton';
import { QueryErrorView } from './QueryErrorView';
import { ShareMenu } from './ShareMenu';
import { Text, useRuntimeThemeColors, View } from './Themed';

/** A question feed has one question header, regardless of the number of cards. */
export function AnswerPreviewQuestionHeader({
  id,
  title,
  onTitleLayout,
}: {
  id: string;
  title: string;
  onTitleLayout?: (bottom: number) => void;
}) {
  const router = useRouter();
  const colors = useRuntimeThemeColors();
  const isAuthenticated = useAuthStore((state) =>
    hasAuthenticationCookie(state.cookies),
  );
  const sessionVersion = useAuthStore(() => getAuthSessionVersion());
  const [expanded, setExpanded] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const {
    data: question,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['question', id, isAuthenticated, sessionVersion],
    queryFn: async ({ signal }) => {
      if (sessionVersion !== getAuthSessionVersion())
        throw new CanceledError('登录会话已切换');
      const result = await getQuestion(id, undefined, { signal });
      if (sessionVersion !== getAuthSessionVersion())
        throw new CanceledError('登录会话已切换');
      return result;
    },
    staleTime: RICH_CONTENT_STALE_TIME,
  });
  const follow = useOptimisticToggle<ZhihuQuestionDetail>({
    queryKey: ['question', id, isAuthenticated, sessionVersion],
    isActive: question?.relationship?.is_following,
    mutationFn: () =>
      question?.relationship?.is_following
        ? unfollowQuestion(id)
        : followQuestion(id),
    onUpdateCache: (old) => ({
      ...old,
      relationship: {
        ...old.relationship,
        is_following: !old.relationship?.is_following,
      },
      follower_count: Math.max(
        0,
        (old.follower_count ?? 0) + (old.relationship?.is_following ? -1 : 1),
      ),
    }),
    successMessage: (wasFollowing) =>
      wasFollowing ? '已取消关注' : '已关注问题',
  });
  const questionTitle = question?.title || title;

  return (
    <View
      style={{
        backgroundColor: colors.backgroundSecondary,
        borderRadius: 16,
        padding: 12,
        marginBottom: 8,
      }}
    >
      <TitleTransitionTarget
        id={id}
        onLayout={({ nativeEvent: { layout } }) =>
          onTitleLayout?.(layout.y + layout.height)
        }
      >
        <Text style={{ fontSize: 22, lineHeight: 31, fontWeight: '700' }}>
          {questionTitle}
        </Text>
      </TitleTransitionTarget>
      {isPending ? (
        <ActivityIndicator color={colors.link} style={{ marginTop: 12 }} />
      ) : isError && !question ? (
        <QueryErrorView
          compact
          message="问题信息加载失败"
          onRetry={() => void refetch()}
        />
      ) : (
        <>
          {question?.topics?.length ? (
            <View className="flex-row flex-wrap gap-2 mt-3 bg-transparent">
              {question.topics.map((topic) => (
                <BouncyButton
                  key={topic.id}
                  onPress={() => router.push(`/topic/${topic.id}`)}
                  className="rounded-full px-1 py-0.5"
                >
                  <Text style={{ fontSize: 12, color: colors.link }}>
                    {topic.name}
                  </Text>
                </BouncyButton>
              ))}
            </View>
          ) : null}
          {question?.detail || question?.excerpt ? (
            <View className="mt-3 bg-transparent">
              {expanded && question.detail ? (
                <QuestionDetailContent
                  content={question.detail}
                  questionId={id}
                />
              ) : (
                <Text
                  type="secondary"
                  numberOfLines={3}
                  style={QUESTION_DETAIL_TEXT_STYLE}
                >
                  {(question.excerpt || question.detail || '').replace(
                    /<[^>]+>/g,
                    '',
                  )}
                </Text>
              )}
              {question.detail ? (
                <ContentActionButton
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  onPress={() => setExpanded(!expanded)}
                  className="self-end py-1 mt-1 rounded-full px-2"
                  hitSlop={6}
                >
                  <Text style={{ fontSize: 13, color: colors.link }}>
                    {expanded ? '收起问题描述' : '展开问题描述'}
                  </Text>
                </ContentActionButton>
              ) : null}
            </View>
          ) : null}
          <Text type="secondary" className="mt-3" style={{ fontSize: 12 }}>
            {question?.answer_count ?? 0} 个回答 ·{' '}
            {formatCount(question?.follower_count)} 关注 ·{' '}
            {formatCount(question?.visit_count)} 浏览
          </Text>
          <View className="flex-row flex-wrap items-center gap-2 mt-3 bg-transparent">
            <FollowButton
              following={Boolean(question?.relationship?.is_following)}
              loading={follow.isPending}
              disabled={!question}
              accessibilityLabel={
                question?.relationship?.is_following
                  ? '取消关注问题'
                  : '关注问题'
              }
              onPress={() => follow.mutate()}
            />
            <ContentActionButton
              accessibilityRole="button"
              accessibilityLabel="问题评论"
              className="flex-row items-center gap-1 px-2 py-2 rounded-full"
              onPress={() =>
                router.push({
                  pathname: '/comments/[id]',
                  params: {
                    id,
                    type: 'question',
                    count: question?.comment_count ?? 0,
                  },
                })
              }
            >
              <Ionicons
                name="chatbubble-outline"
                size={16}
                color={colors.textSecondary}
              />
              <Text type="secondary" style={{ fontSize: 13 }}>
                {question?.comment_count ?? 0}
              </Text>
            </ContentActionButton>
            <ContentActionButton
              onPress={() => router.push(`/question/write/${id}`)}
              className="px-2 py-2 rounded-full"
            >
              <Text style={{ fontSize: 13, color: colors.link }}>写回答</Text>
            </ContentActionButton>
            <MoreActionsButton
              accessibilityLabel="问题更多操作"
              style={{ marginLeft: 'auto' }}
              onPress={() => setMenuVisible(true)}
            />
          </View>
        </>
      )}
      <ShareMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        type="question"
        data={{ id, title: questionTitle }}
      />
    </View>
  );
}
