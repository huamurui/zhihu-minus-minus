import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View as RNView, type ViewInstance } from 'react-native';
import Animated, { SharedTransition } from 'react-native-reanimated';
import { hasAuthenticationCookie } from '@/api/client';
import { type FeedItem, getVoteSuccessMessage, voteContent } from '@/api/zhihu';
import { FeedCardActionRow } from '@/components/FeedCardActionRow';
import type { ActionSheetOption } from '@/components/overlays/ActionSheet';
import {
  useTitleTransition,
  useTitleTransitionSource,
} from '@/features/adaptive-layout/TitleTransition';
import { usePaneRouter as useRouter } from '@/features/adaptive-layout/usePaneRouter';
import { useContentActions } from '@/hooks/useContentActions';
import { useAuthStore } from '@/store/useAuthStore';
import { useCollectionStore } from '@/store/useCollectionStore';
import { seedAnswerPreviewEntry } from '@/utils/answerPreviewEntry';
import {
  type AnswerReadingContext,
  getAnswerReadingRouteParams,
} from '@/utils/answerReadingContext';
import {
  seedRichContentFromFeedItem,
  updateContentInteractionCaches,
} from '@/utils/contentCache';
import { ImpactFeedbackStyle, impactAsync } from '@/utils/haptics';
import { getCachedImageSource } from '@/utils/imageSource';
import { getRecommendFeedbackTarget } from '@/utils/recommendFeedback';
import { showToast } from '@/utils/toast';
import { getZhihuErrorMessage } from '@/utils/zhihuError';
import { BouncyButton } from './BouncyButton';
import { CustomContextMenu, type MenuOption } from './CustomContextMenu';
import { useContentCardSurface } from './contentCardSurface';
import { FeedCardPreview } from './FeedCardPreview';
import { FeedExcerpt } from './FeedExcerpt';
import { type ShareContentType, ShareMenu } from './ShareMenu';
import { Text, View } from './Themed';

const slowTransition = SharedTransition.duration(600);

interface FeedCardProps {
  item: FeedItem;
  tab?: string;
  answerContext?: AnswerReadingContext;
  onUninterested?: (item: FeedItem) => Promise<void>;
}

function areFeedContentEqual(
  previous: FeedItem['content'],
  next: FeedItem['content'],
): boolean {
  if (previous === next) return true;
  if (!Array.isArray(previous) || !Array.isArray(next)) return false;
  if (previous.length !== next.length) return false;

  return previous.every((previousSegment, index) => {
    const nextSegment = next[index];
    return (
      previousSegment === nextSegment ||
      (previousSegment.type === nextSegment.type &&
        previousSegment.content === nextSegment.content &&
        previousSegment.url === nextSegment.url &&
        previousSegment.data_draft_title === nextSegment.data_draft_title &&
        previousSegment.data_draft_cover === nextSegment.data_draft_cover &&
        previousSegment.thumbnail === nextSegment.thumbnail)
    );
  });
}

function areFeedTopicsEqual(
  previous: FeedItem['topics'],
  next: FeedItem['topics'],
): boolean {
  if (previous === next) return true;
  if (!previous || !next || previous.length !== next.length) return false;
  return previous.every(
    (topic, index) =>
      topic.id === next[index]?.id && topic.name === next[index]?.name,
  );
}

function areFeedCardPropsEqual(
  previous: Readonly<FeedCardProps>,
  next: Readonly<FeedCardProps>,
): boolean {
  if (
    previous.tab !== next.tab ||
    previous.onUninterested !== next.onUninterested ||
    previous.answerContext?.scene !== next.answerContext?.scene ||
    previous.answerContext?.memberId !== next.answerContext?.memberId ||
    previous.answerContext?.memberSort !== next.answerContext?.memberSort
  )
    return false;
  const previousItem = previous.item;
  const nextItem = next.item;
  if (previousItem === nextItem) return true;

  return (
    previousItem.id === nextItem.id &&
    previousItem.isIdStable === nextItem.isIdStable &&
    previousItem.type === nextItem.type &&
    previousItem.videoSource === nextItem.videoSource &&
    previousItem.title === nextItem.title &&
    previousItem.titleString === nextItem.titleString &&
    previousItem.questionId === nextItem.questionId &&
    previousItem.actionText === nextItem.actionText &&
    previousItem.hideAuthor === nextItem.hideAuthor &&
    previousItem.excerpt === nextItem.excerpt &&
    areFeedContentEqual(previousItem.content, nextItem.content) &&
    previousItem.created_time === nextItem.created_time &&
    previousItem.updated_time === nextItem.updated_time &&
    previousItem.image === nextItem.image &&
    previousItem.voteCount === nextItem.voteCount &&
    previousItem.commentCount === nextItem.commentCount &&
    previousItem.favlistsCount === nextItem.favlistsCount &&
    previousItem.isCollected === nextItem.isCollected &&
    previousItem.voted === nextItem.voted &&
    previousItem.answerType === nextItem.answerType &&
    previousItem.contentNeedTruncated === nextItem.contentNeedTruncated &&
    previousItem.author.id === nextItem.author.id &&
    previousItem.author.url_token === nextItem.author.url_token &&
    previousItem.author.name === nextItem.author.name &&
    previousItem.author.avatar === nextItem.author.avatar &&
    previousItem.author.headline === nextItem.author.headline &&
    areFeedTopicsEqual(previousItem.topics, nextItem.topics)
  );
}

const FeedCardComponent = ({
  item,
  tab,
  answerContext,
  onUninterested,
}: FeedCardProps) => {
  const router = useRouter();
  const transitionTitle = useTitleTransition();
  const titleRef = useRef<ViewInstance>(null);
  const queryClient = useQueryClient();
  const { cookies } = useAuthStore();
  const [menuVisible, setMenuVisible] = useState(false);
  const isQuestionType = item.type === 'questions';
  const isPinType = item.type === 'pins';
  const isVideoType = item.type === 'videos';
  const engagementType: 'answers' | 'articles' | 'pins' | null =
    item.type === 'answers' || item.type === 'articles' || item.type === 'pins'
      ? item.type
      : null;
  const isGuest = !cookies;
  const surface = useContentCardSurface({ radius: 12, gap: 8 });

  const [voted, setVoted] = useState(item.voted || 0);
  const [voteCount, setVoteCount] = useState(item.voteCount || 0);
  const identity = `${item.type}:${item.videoSource || ''}:${item.id}`;
  const titleSource = useTitleTransitionSource(identity);
  const currentIdentityRef = useRef(identity);
  currentIdentityRef.current = identity;
  const pendingVotesRef = useRef(new Set<string>());

  const itemIdStr = item.id != null ? item.id.toString() : '';
  const storeCollected = useCollectionStore((state) =>
    itemIdStr ? state.collectedStatusMap[itemIdStr] : undefined,
  );

  const cleanTitle =
    typeof item.title === 'string' ? item.title : item.titleString || '';
  const sourceTitle = (
    <Text
      className="text-lg font-bold leading-6 text-foreground dark:text-foreground-dark"
      numberOfLines={2}
    >
      {item.title}
    </Text>
  );
  const authorAvatarSource = useMemo(
    () => getCachedImageSource(item.author.avatar),
    [item.author.avatar],
  );
  const authorId = item.author.url_token || item.author.id;
  const thumbnailSource = useMemo(
    () => getCachedImageSource(item.image),
    [item.image],
  );
  const isAuthenticated = hasAuthenticationCookie(cookies);

  useEffect(() => {
    if (isGuest) return;

    // FeedCard is shared by the home feed, search, topic and user pages.
    // Prewarm the matching detail cache for every source as soon as a card
    // with reusable inline content is mounted.
    seedRichContentFromFeedItem(queryClient, item, isAuthenticated);
  }, [isAuthenticated, isGuest, item, queryClient]);

  const openDetail = () => {
    if (isVideoType) {
      router.push({
        pathname: '/video/[id]',
        params: {
          id: item.id,
          title: cleanTitle,
          source: item.videoSource || 'zvideo',
        },
      });
      return;
    }
    if (isGuest) {
      router.push({
        pathname: '/guest/detail',
        params: {
          item: JSON.stringify({
            ...item,
            title: cleanTitle,
            excerpt: typeof item.excerpt === 'string' ? item.excerpt : '',
          }),
        },
      });
      return;
    }

    // FeedCard 可能来自首页、搜索、用户页或话题页。把卡片已有的正文
    // 写入统一详情缓存，避免只有首页 queryFn 执行时才能享受到加速。
    seedRichContentFromFeedItem(queryClient, item, isAuthenticated);

    const params = {
      id: item.id,
      title: cleanTitle,
      questionId: item.questionId,
      ...(tab ? { source: 'feed', tab } : {}),
    };
    if (item.type === 'answers') {
      seedAnswerPreviewEntry(queryClient, item);
      router.push({
        pathname: '/answer/[id]',
        params: {
          ...params,
          ...getAnswerReadingRouteParams(
            answerContext ||
              (tab === 'recommend' || tab === 'local'
                ? { scene: 'recommend' }
                : undefined),
          ),
        },
      });
    } else if (item.type === 'articles') {
      router.push({ pathname: '/article/[id]', params });
    } else if (item.type === 'pins') {
      router.push({ pathname: '/pin/[id]', params });
    } else {
      router.push({ pathname: '/question/[id]', params });
    }
  };

  const [previewVisible, setPreviewVisible] = useState(false);
  const containerRef = useRef<ViewInstance>(null);
  const [originLayout, setOriginLayout] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // A recycled FlashList cell gets another item: reset local reactions and
  // overlays while rendering, not in an effect. An effect commits the old
  // item first and schedules one more update per recycled card; during a
  // large page append those updates chain with FlashList's layout updates
  // until React aborts with "Maximum update depth exceeded".
  const [syncedItem, setSyncedItem] = useState({
    identity,
    voted: item.voted,
    voteCount: item.voteCount,
  });
  if (
    syncedItem.identity !== identity ||
    syncedItem.voted !== item.voted ||
    syncedItem.voteCount !== item.voteCount
  ) {
    setSyncedItem({ identity, voted: item.voted, voteCount: item.voteCount });
    setVoted(item.voted || 0);
    setVoteCount(item.voteCount || 0);
    if (syncedItem.identity !== identity) {
      setMenuVisible(false);
      setPreviewVisible(false);
      setOriginLayout(null);
    }
  }
  const shareType: ShareContentType =
    item.type === 'answers'
      ? 'answer'
      : item.type === 'articles'
        ? 'article'
        : item.type === 'pins'
          ? 'pin'
          : item.type === 'questions'
            ? 'question'
            : 'video';
  const shareData = {
    id: item.id,
    title: cleanTitle,
    author: item.author.name,
    authorHeadline: item.author.headline,
    questionId: item.questionId,
    isCollected: storeCollected ?? item.isCollected,
  };
  const feedbackOptions: ActionSheetOption[] =
    isAuthenticated && onUninterested && getRecommendFeedbackTarget(item)
      ? [
          {
            key: 'uninterested',
            label: '不喜欢，减少相似内容',
            icon: 'eye-off-outline',
            onPress: () => onUninterested(item),
          },
        ]
      : [];
  const { actions: contentActions } = useContentActions({
    type: shareType,
    data: shareData,
    enabled: previewVisible,
    ...(feedbackOptions.length > 0 && {
      additionalOptions: feedbackOptions,
    }),
  });

  const menuOptions: MenuOption[] = [
    ...(engagementType
      ? [
          {
            key: 'like',
            title:
              voted === 1
                ? isPinType
                  ? '取消点赞'
                  : '取消赞同'
                : isPinType
                  ? '点赞'
                  : '赞同',
            icon: voted === 1 ? 'caret-up' : 'caret-up-outline',
            onPress: async () => {
              if (pendingVotesRef.current.has(identity)) return;
              pendingVotesRef.current.add(identity);
              const nextVoted = voted === 1 ? 0 : 1;
              try {
                const voteType =
                  item.type === 'pins'
                    ? nextVoted === 1
                      ? 'like'
                      : 'unlike'
                    : nextVoted === 1
                      ? 'up'
                      : 'neutral';
                const result = await voteContent(
                  item.id,
                  engagementType,
                  voteType,
                );
                const resolvedCount =
                  result.voteCount ??
                  Math.max(
                    0,
                    voteCount +
                      Number(result.voted === 1) -
                      Number(voted === 1),
                  );
                if (currentIdentityRef.current === identity) {
                  setVoted(result.voted);
                  setVoteCount(resolvedCount);
                }
                updateContentInteractionCaches(queryClient, {
                  type: engagementType,
                  id: item.id,
                  voted: result.voted,
                  voteCount: resolvedCount,
                });
                showToast(
                  getVoteSuccessMessage(engagementType, voted, result.voted),
                );
              } catch (error: unknown) {
                showToast(getZhihuErrorMessage(error));
              } finally {
                pendingVotesRef.current.delete(identity);
              }
            },
          },
          {
            key: 'comment',
            title: '评论',
            icon: 'chatbubble-outline',
            onPress: () => {
              const type =
                item.type === 'articles'
                  ? 'article'
                  : item.type === 'answers'
                    ? 'answer'
                    : item.type.slice(0, -1);
              router.push(
                `/comments/${item.id}?type=${type}&count=${item.commentCount}`,
              );
            },
          },
        ]
      : []),
    ...contentActions.map((action) => ({
      key: action.key,
      title: action.label,
      icon: action.icon,
      iconFamily: action.iconFamily,
      iconSolid: action.iconSolid,
      isDestructive: action.destructive,
      disabled: action.disabled,
      onPress: action.onPress,
    })),
  ];

  return (
    <RNView ref={containerRef} className="w-full bg-transparent">
      <BouncyButton
        onLongPress={() => {
          void impactAsync(ImpactFeedbackStyle.Medium);
          containerRef.current?.measureInWindow(
            (x: number, y: number, width: number, height: number) => {
              if (currentIdentityRef.current !== identity) return;
              setOriginLayout({ x, y, width, height });
              setPreviewVisible(true);
            },
          );
        }}
        onPress={() => {
          if (item.type === 'answers' || item.type === 'questions') {
            transitionTitle(
              titleRef,
              String(item.questionId || item.id),
              cleanTitle,
              () => {
                if (currentIdentityRef.current === identity) openDetail();
              },
              () => currentIdentityRef.current === identity,
              titleSource.onSourceHiddenChange,
              sourceTitle,
            );
          } else openDetail();
        }}
        style={[
          surface,
          { opacity: previewVisible ? 0 : 1 },
          isQuestionType ? { paddingBottom: 10 } : undefined,
        ]}
        className="p-4 pb-2 mx-1.5"
      >
        {/* 动态动作提示 (针对关注流) */}
        {item.actionText && item.hideAuthor && authorId ? (
          <BouncyButton
            accessibilityRole="link"
            accessibilityLabel={`查看${item.author.name}的主页`}
            onPress={() =>
              router.push({
                pathname: '/user/[id]',
                params: {
                  id: authorId,
                  avatar: item.author.avatar,
                  name: item.author.name,
                  ...(item.author.headline
                    ? { headline: item.author.headline }
                    : {}),
                },
              })
            }
          >
            <Text
              type="secondary"
              className="text-[13px] mb-2 text-tertiary dark:text-tertiary-dark"
            >
              {item.actionText}
            </Text>
          </BouncyButton>
        ) : item.actionText ? (
          <Text
            type="secondary"
            className="text-[13px] mb-2 text-tertiary dark:text-tertiary-dark"
          >
            {item.actionText}
          </Text>
        ) : null}

        {/* 热区1：点击作者头像/姓名 -> 用户页 */}
        {item.hideAuthor ? null : (
          <BouncyButton
            disabled={!authorId}
            onPress={() =>
              router.push({
                pathname: '/user/[id]',
                params: {
                  id: authorId,
                  avatar: item.author.avatar,
                  name: item.author.name,
                  ...(item.author.headline
                    ? { headline: item.author.headline }
                    : {}),
                },
              })
            }
            className="flex-row items-center mb-2"
          >
            <Animated.Image
              fadeDuration={0}
              source={authorAvatarSource}
              className="w-[22px] h-[22px] rounded-full"
              sharedTransitionTag={`avatar-${item.author.url_token || item.author.id}`}
            />
            <Text type="secondary" className="ml-2 text-[13px]">
              {item.author.name}
            </Text>
          </BouncyButton>
        )}

        {/* 话题标签 */}
        {item.topics && item.topics.length > 0 && (
          <View className="flex-row flex-wrap mb-2 bg-transparent">
            {item.topics.map((topic) => (
              <BouncyButton
                key={topic.id}
                onPress={() =>
                  router.push({
                    pathname: '/topic/[id]',
                    params: { id: topic.id },
                  })
                }
                className="px-2 py-0.5 rounded-sm mr-2 mb-1"
                style={{ backgroundColor: 'rgba(0,0,132,0.05)' }}
              >
                <Text className="text-[11px] text-tertiary dark:text-tertiary-dark">
                  {topic.name}
                </Text>
              </BouncyButton>
            ))}
          </View>
        )}

        {/* 标题 - 统一为主卡片点击，但点击标题跳转问题 */}
        {item.title ? (
          <BouncyButton
            onPress={() => {
              if (item.type === 'answers' && item.questionId) {
                const questionId = String(item.questionId);
                transitionTitle(
                  titleRef,
                  questionId,
                  cleanTitle,
                  () => {
                    if (currentIdentityRef.current !== identity) return;
                    router.push({
                      pathname: '/question/[id]',
                      params: { id: questionId, title: cleanTitle },
                    });
                  },
                  () => currentIdentityRef.current === identity,
                  titleSource.onSourceHiddenChange,
                  sourceTitle,
                );
                return;
              }
              if (item.type === 'questions')
                transitionTitle(
                  titleRef,
                  String(item.questionId || item.id),
                  cleanTitle,
                  () => {
                    if (currentIdentityRef.current === identity) openDetail();
                  },
                  () => currentIdentityRef.current === identity,
                  titleSource.onSourceHiddenChange,
                  sourceTitle,
                );
              else openDetail();
            }}
          >
            <RNView
              ref={titleRef}
              collapsable={false}
              style={titleSource.hidden ? { opacity: 0 } : undefined}
            >
              <Animated.View
                sharedTransitionTag={`title-${item.questionId || item.id}`}
                sharedTransitionStyle={slowTransition}
              >
                {sourceTitle}
              </Animated.View>
            </RNView>
          </BouncyButton>
        ) : null}

        {/* 摘要与图片 - 统一为主卡片点击，完美穿透 */}
        <View className="flex-row mt-1 bg-transparent">
          <View className="flex-1 bg-transparent">
            {isPinType && Array.isArray(item.content) ? (
              <FeedExcerpt contentArray={item.content} />
            ) : item.excerpt ? (
              <FeedExcerpt html={item.excerpt} />
            ) : null}
          </View>
          {item.image && (
            <Animated.Image
              fadeDuration={0}
              source={thumbnailSource}
              className="w-[100px] h-[75px] rounded-md ml-2.5 mt-1"
              sharedTransitionTag={`image-${item.id}`}
            />
          )}
        </View>

        <FeedCardActionRow
          id={item.id}
          voteCount={voteCount}
          voted={voted}
          engagementType={engagementType}
          commentCount={item.commentCount}
          isCollected={storeCollected ?? item.isCollected}
          collectionCount={item.favlistsCount}
          onVoteChange={(newVoted, newCount) => {
            setVoted(newVoted);
            setVoteCount(newCount);
          }}
          onComments={() => {
            const type =
              item.type === 'articles'
                ? 'article'
                : item.type === 'answers'
                  ? 'answer'
                  : item.type.slice(0, -1);
            router.push(
              `/comments/${item.id}?type=${type}&count=${item.commentCount}`,
            );
          }}
          onMore={() => setMenuVisible(true)}
        />

        <ShareMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          type={shareType}
          data={shareData}
          additionalOptions={feedbackOptions}
        />
      </BouncyButton>

      {previewVisible && (
        <CustomContextMenu
          visible={previewVisible}
          onClose={() => setPreviewVisible(false)}
          previewContent={<FeedCardPreview item={item} />}
          options={menuOptions}
          contentIdentity={identity}
          originLayout={originLayout}
        />
      )}
    </RNView>
  );
};

export const FeedCard = React.memo(FeedCardComponent, areFeedCardPropsEqual);
FeedCard.displayName = 'FeedCard';
