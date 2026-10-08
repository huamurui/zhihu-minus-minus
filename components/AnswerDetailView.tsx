import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useRef } from 'react';
import {
  Alert,
  type ScrollView as NativeScrollView,
  type View as NativeView,
  useWindowDimensions,
} from 'react-native';
import Reanimated, {
  runOnJS,
  SharedTransition,
  type SharedValue,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type AnswerDetail, deleteAnswer, getAnswer } from '@/api/zhihu';
import { getAllContentCollectionStatus } from '@/api/zhihu/collection';
import { followMember, unfollowMember } from '@/api/zhihu/member';
import { AnswerLoadingPlaceholder } from '@/components/AnswerLoadingPlaceholder';
import { BouncyButton } from '@/components/BouncyButton';
import {
  CONTENT_ACTION_BAR_HEIGHT,
  ContentActionBar,
  getContentActionBarBottom,
} from '@/components/ContentActionBar';
import { ContentActionButton } from '@/components/ContentActionButton';
import { useDetailNavigationHeight } from '@/components/DetailNavigationHeader';
import { FollowButton } from '@/components/FollowButton';
import { MoreActionsButton } from '@/components/MoreActionsButton';
import { QueryErrorView } from '@/components/QueryErrorView';
import { ReadingProgressNotice } from '@/components/ReadingProgressNotice';
import { ReadingScrollIndicator } from '@/components/ReadingScrollIndicator';
import { SegmentedVoteCapsule } from '@/components/SegmentedVoteCapsule';
import { ShareMenu } from '@/components/ShareMenu';
import { StableAvatar } from '@/components/StableAvatar';
import { Text, ThemedIcon, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { VoterListModal } from '@/components/VoterListModal';
import Colors from '@/constants/Colors';
import {
  isRichTextNativeAvailable,
  RICH_CONTENT_STALE_TIME,
  type RichContentLoadingPhase,
  ZhihuContent,
} from '@/features/rich-content';
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle';
import { useReadingContentMeasurement } from '@/hooks/useReadingContentMeasurement';
import { useReadingProgress } from '@/hooks/useReadingProgress';
import { useCollectionStore } from '@/store/useCollectionStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { formatDate } from '@/utils/date';
import { calculateDetailHeaderAppearance } from '@/utils/detailHeaderAppearance';
import { getZhihuErrorMessage, getZhihuErrorStatus } from '@/utils/zhihuError';

const slowTransition = SharedTransition.duration(600);

function renderContentPlaceholder(phase: RichContentLoadingPhase) {
  return <AnswerLoadingPlaceholder phase={phase} />;
}

interface AnswerDetailViewProps {
  id: string;
  initialTitle?: string;
  questionId?: string;
  onScroll?: (y: number) => void;
  onHeaderLayout?: (collapseOffset: number) => void;
  headerProgress?: SharedValue<number>;
  activeAnswerId?: SharedValue<string>;
  activeScrollY?: SharedValue<number>;
  activeScopeVersion?: SharedValue<number>;
  scopeVersion?: number;
  isFocused?: boolean;
  isPreloading?: boolean;
}

export const AnswerDetailView = ({
  id,
  initialTitle,
  questionId,
  onScroll,
  onHeaderLayout,
  headerProgress,
  activeAnswerId,
  activeScrollY,
  activeScopeVersion,
  scopeVersion,
  isFocused = false,
  isPreloading = false,
}: AnswerDetailViewProps) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const actionBarBottom = getContentActionBarBottom(insets.bottom);

  const colorScheme = useColorScheme();
  const navigationHeight = insets.top + useDetailNavigationHeight();

  const scrollViewRef = useRef<NativeScrollView>(null);
  const contentViewRef = useRef<NativeView>(null);
  const focusScope = React.useMemo(
    () => ({ id, isFocused, scopeVersion }),
    [id, isFocused, scopeVersion],
  );
  const focusedRef = useRef(focusScope);
  focusedRef.current = focusScope;
  React.useLayoutEffect(() => {
    focusedRef.current = focusScope;
    return () => {
      if (focusedRef.current === focusScope)
        focusedRef.current = { ...focusScope, isFocused: false };
    };
  }, [focusScope]);
  const isCurrentFocus = React.useCallback(
    () =>
      focusScope.isFocused &&
      focusedRef.current === focusScope &&
      activeScopeVersion?.value === scopeVersion &&
      (!activeAnswerId || activeAnswerId.value === id),
    [focusScope, activeScopeVersion, scopeVersion, activeAnswerId, id],
  );
  const scrollCallbackRef = useRef(onScroll);
  scrollCallbackRef.current = onScroll;
  const scrollY = useSharedValue(0);
  const collapseOffset = useSharedValue(80);
  const contentHeight = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const lastCallbackTime = useSharedValue(0);

  const [menuVisible, setMenuVisible] = React.useState(false);
  const [votersVisible, setVotersVisible] = React.useState(false);
  const [hasBeenFocused, setHasBeenFocused] = React.useState(isFocused);

  React.useEffect(() => {
    if (!isFocused) setMenuVisible(false);
  }, [isFocused]);

  React.useEffect(() => {
    if (isFocused && !hasBeenFocused) {
      setHasBeenFocused(true);
    }
  }, [isFocused, hasBeenFocused]);

  const {
    data: answer,
    isLoading: queryLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['answer-detail', id],
    queryFn: ({ signal }) => getAnswer(id, undefined, { signal }),
    enabled: isFocused,
    staleTime: RICH_CONTENT_STALE_TIME,
    retry: (failureCount, err) =>
      getZhihuErrorStatus(err) === 404 ? false : failureCount < 2,
  });

  const richContentRenderer = useSettingsStore(
    (state) => state.richContentRenderer,
  );
  const fontSizeScale = useSettingsStore((state) => state.fontSizeScale);
  const lineHeightScale = useSettingsStore((state) => state.lineHeightScale);
  const dimensions = useWindowDimensions();
  const waitForNativeLayout =
    richContentRenderer === 'native-v2' && isRichTextNativeAvailable();
  const shouldRenderBody =
    isFocused || hasBeenFocused || (isPreloading && Boolean(answer));
  const contentLayoutSource = React.useMemo(
    () => ({
      id,
      content: answer?.content,
      fontSizeScale,
      lineHeightScale,
      width: dimensions.width,
      fontScale: dimensions.fontScale,
      waitForNativeLayout,
      // Leaving the preload window unmounts an unread body and its measurements.
      shouldRenderBody,
    }),
    [
      id,
      answer?.content,
      fontSizeScale,
      lineHeightScale,
      dimensions.width,
      dimensions.fontScale,
      waitForNativeLayout,
      shouldRenderBody,
    ],
  );
  const [readyLayoutSource, setReadyLayoutSource] = React.useState<
    typeof contentLayoutSource | null
  >(null);
  const latestLayoutSource = useRef(contentLayoutSource);
  latestLayoutSource.current = contentLayoutSource;
  const handleContentLayoutReady = React.useCallback(() => {
    if (latestLayoutSource.current === contentLayoutSource)
      setReadyLayoutSource(contentLayoutSource);
  }, [contentLayoutSource]);
  const contentLayoutReady =
    shouldRenderBody &&
    Boolean(answer) &&
    (!waitForNativeLayout || readyLayoutSource === contentLayoutSource);

  const updateHeaderProgress = React.useCallback(
    (offset: number) => {
      if (
        !headerProgress ||
        activeAnswerId?.value !== id ||
        activeScopeVersion?.value !== scopeVersion
      )
        return;
      if (activeScrollY) activeScrollY.value = offset;
      headerProgress.value = calculateDetailHeaderAppearance(
        offset,
        collapseOffset.value,
      );
    },
    [
      headerProgress,
      activeAnswerId,
      activeScrollY,
      activeScopeVersion,
      scopeVersion,
      id,
      collapseOffset,
    ],
  );
  React.useLayoutEffect(() => {
    if (!isCurrentFocus()) return;
    // An offscreen page can be clamped by native layout after content reflows.
    const offset = scrollY.value;
    updateHeaderProgress(offset);
    scrollCallbackRef.current?.(offset);
  }, [isCurrentFocus, scrollY, updateHeaderProgress]);
  const handleProgrammaticScroll = React.useCallback(
    (offset: number) => {
      if (!focusedRef.current.isFocused) return;
      scrollY.value = offset;
      updateHeaderProgress(offset);
      scrollCallbackRef.current?.(offset);
    },
    [scrollY, updateHeaderProgress],
  );
  const handleContentMeasured = React.useCallback(
    (_width: number, height: number) => {
      if (Number.isFinite(height) && height > 0) contentHeight.value = height;
    },
    [contentHeight],
  );
  const readingProgress = useReadingProgress({
    contentKey: `answer:${id}`,
    enabled: isFocused,
    ready: contentLayoutReady,
    layoutSource: waitForNativeLayout ? contentLayoutSource : undefined,
    scrollRef: scrollViewRef,
    onProgrammaticScroll: handleProgrammaticScroll,
    onContentMeasured: handleContentMeasured,
  });
  const handleContentSizeChange = useReadingContentMeasurement({
    enabled: waitForNativeLayout && isFocused,
    ready: contentLayoutReady,
    contentRef: contentViewRef,
    beginMeasurement: readingProgress.beginContentMeasurement,
    onContentSizeChange: readingProgress.onContentSizeChange,
  });
  const handleTrackedScroll = React.useCallback(() => {
    if (!isCurrentFocus()) return;
    const offset = scrollY.value;
    scrollCallbackRef.current?.(offset);
    readingProgress.onScroll(offset);
  }, [isCurrentFocus, readingProgress.onScroll, scrollY]);
  const handleScroll = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        if (activeScopeVersion?.value !== scopeVersion) return;
        const offset = event.contentOffset.y;
        scrollY.value = offset;
        if (!isFocused || (activeAnswerId && activeAnswerId.value !== id))
          return;
        if (headerProgress && activeAnswerId?.value === id) {
          if (activeScrollY) activeScrollY.value = offset;
          headerProgress.value = calculateDetailHeaderAppearance(
            offset,
            collapseOffset.value,
          );
        }
        const now = Date.now();
        if (now - lastCallbackTime.value >= 80) {
          lastCallbackTime.value = now;
          runOnJS(handleTrackedScroll)();
        }
      },
    },
    [
      isFocused,
      handleTrackedScroll,
      headerProgress,
      activeAnswerId,
      activeScrollY,
      activeScopeVersion,
      scopeVersion,
      id,
      scrollY,
      collapseOffset,
      lastCallbackTime,
    ],
  );

  const followMutation = useOptimisticToggle<AnswerDetail>({
    queryKey: ['answer-detail', id],
    mutationFn: async () => {
      const author = answer?.author;
      if (!author) throw new Error('回答尚未加载');
      if (author.is_following)
        return unfollowMember(author.url_token || author.id);
      return followMember(author.url_token || author.id);
    },
    isActive: answer?.author?.is_following,
    onUpdateCache: (old) => ({
      ...old,
      author: {
        ...old.author,
        is_following: !old.author.is_following,
      },
    }),
    successMessage: (isActive) => (isActive ? '已取消关注' : '已关注'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAnswer(id),
    onSuccess: () => {
      Alert.alert('删除成功', '你的回答已删除喵！');
      router.back();
    },
    onError: (err: unknown) =>
      Alert.alert('删除失败', getZhihuErrorMessage(err) || '无法删除回答'),
  });

  const handleDelete = () => {
    Alert.alert('确认删除', '确定要删除这个回答吗？此操作不可撤销喵！', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认删除',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(),
      },
    ]);
  };

  const { data: collectionStatus, isFetchedAfterMount } = useQuery({
    queryKey: ['answer-collection-status', id],
    queryFn: () => getAllContentCollectionStatus(id, 'answer'),
    enabled: !!id && hasBeenFocused,
    staleTime: 60 * 1000, // 1 minute
  });

  const setCollectedStatus = useCollectionStore(
    (state) => state.setCollectedStatus,
  );

  const statusCollected = collectionStatus?.data?.some(
    (item) => item.is_favorited,
  );

  const storeCollected = useCollectionStore(
    (state) => state.collectedStatusMap[id.toString()],
  );
  const rawIsFaved =
    answer?.reaction?.relation?.faved ?? answer?.relationship?.is_favorited;
  const activeCollected =
    storeCollected !== undefined
      ? storeCollected
      : statusCollected !== undefined
        ? statusCollected
        : rawIsFaved;
  const storeCollectedRef = useRef(storeCollected);
  const authorAvatarUrl = answer?.author?.avatar_url;

  React.useEffect(() => {
    storeCollectedRef.current = storeCollected;
  }, [storeCollected]);

  React.useEffect(() => {
    if (
      collectionStatus &&
      (isFetchedAfterMount || storeCollectedRef.current === undefined)
    ) {
      const activeCollected =
        collectionStatus?.data?.some((item) => item.is_favorited) || false;
      setCollectedStatus(id, activeCollected);
    }
  }, [collectionStatus, id, isFetchedAfterMount, setCollectedStatus]);

  const goToProfile = () => {
    const token = answer?.author?.url_token || answer?.author?.id;
    if (token) router.push(`/user/${token}`);
  };

  const linkColor = useThemeColor({}, 'link');
  const primaryTransparent = useThemeColor({}, 'primaryTransparent');
  const secondaryColor = useThemeColor({}, 'textSecondary');
  if (!shouldRenderBody) {
    return <View className="flex-1" />;
  }

  return (
    <View className="flex-1">
      <Reanimated.ScrollView
        ref={scrollViewRef}
        innerViewRef={
          // RN forwards a nullable React ref, but its public prop type omits null.
          contentViewRef as React.RefObject<NativeView>
        }
        className="flex-1"
        style={{
          backgroundColor: Colors[colorScheme].backgroundSecondary,
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        onLayout={(event) => {
          viewportHeight.value = event.nativeEvent.layout.height;
          readingProgress.onLayout(event);
        }}
        onContentSizeChange={handleContentSizeChange}
        onScrollEndDrag={(event) => {
          if (!isCurrentFocus()) return;
          scrollY.value = event.nativeEvent.contentOffset.y;
          updateHeaderProgress(event.nativeEvent.contentOffset.y);
          handleTrackedScroll();
          readingProgress.commitProgress();
        }}
        onMomentumScrollEnd={(event) => {
          if (!isCurrentFocus()) return;
          scrollY.value = event.nativeEvent.contentOffset.y;
          updateHeaderProgress(event.nativeEvent.contentOffset.y);
          handleTrackedScroll();
          readingProgress.commitProgress();
        }}
        contentContainerStyle={{
          paddingTop: navigationHeight + 14,
          paddingBottom: CONTENT_ACTION_BAR_HEIGHT + 36 + actionBarBottom,
        }}
      >
        <View
          className="px-5 bg-transparent"
          onLayout={({ nativeEvent: { layout } }) => {
            const offset = Math.max(
              1,
              layout.y + layout.height - navigationHeight,
            );
            collapseOffset.value = offset;
            onHeaderLayout?.(offset);
            if (focusedRef.current.isFocused)
              updateHeaderProgress(scrollY.value);
          }}
        >
          <BouncyButton
            accessibilityRole="button"
            accessibilityLabel="查看问题"
            onPress={() => {
              const target = answer?.question?.id || questionId;
              if (target) router.push(`/question/${target}`);
            }}
            className="bg-transparent"
          >
            <View className="flex-row items-center gap-1 mb-2 bg-transparent">
              <Text type="secondary" style={{ fontSize: 12, lineHeight: 18 }}>
                来自问题
              </Text>
              <Ionicons
                name="chevron-forward"
                size={12}
                color={secondaryColor}
              />
            </View>
            <Reanimated.View
              sharedTransitionTag={`title-${questionId || answer?.question?.id || id}`}
              sharedTransitionStyle={slowTransition}
            >
              <Text
                style={{
                  fontSize: 21,
                  lineHeight: 29,
                  fontWeight: '700',
                }}
              >
                {answer?.question?.title || initialTitle || '加载中...'}
              </Text>
            </Reanimated.View>
          </BouncyButton>
          <View className="flex-row items-center pt-4 pb-5 justify-between gap-3 bg-transparent">
            <BouncyButton
              onPress={goToProfile}
              className="flex-row items-center flex-1 bg-transparent"
            >
              <StableAvatar
                uri={authorAvatarUrl}
                className="w-9 h-9 rounded-full"
              />
              <View className="ml-2.5 flex-1 bg-transparent">
                <Text
                  style={{
                    fontSize: 15,
                    lineHeight: 22,
                    fontWeight: '600',
                  }}
                  numberOfLines={1}
                >
                  {answer?.author?.name || '知乎用户'}
                </Text>
                {answer?.author?.headline ? (
                  <Text
                    type="secondary"
                    style={{ fontSize: 12, lineHeight: 18 }}
                    numberOfLines={1}
                  >
                    {answer.author.headline}
                  </Text>
                ) : null}
              </View>
            </BouncyButton>
            <FollowButton
              following={Boolean(answer?.author?.is_following)}
              loading={followMutation.isPending}
              disabled={!answer}
              onPress={() => followMutation.mutate()}
            />
          </View>
        </View>

        {queryLoading && !answer ? (
          <AnswerLoadingPlaceholder phase="fetching-answer" />
        ) : isError && !answer && getZhihuErrorStatus(error) !== 404 ? (
          <QueryErrorView
            message="回答加载失败"
            onRetry={() => void refetch()}
          />
        ) : getZhihuErrorStatus(error) === 404 && !answer ? (
          <View className="h-[300px] justify-center items-center px-6 bg-transparent">
            <Ionicons name="compass-outline" size={48} color={secondaryColor} />
            <Text className="text-base font-bold mt-4 mb-2 text-foreground dark:text-foreground-dark">
              你似乎来到了没有知识存在的荒原
            </Text>
            <Text type="secondary" className="text-xs text-center mb-6">
              该回答可能已被删除、失效或暂不可见 喵~
            </Text>
            <BouncyButton
              onPress={() => router.back()}
              className="px-4 py-2 rounded-full"
              style={{ backgroundColor: primaryTransparent }}
            >
              <Text className="text-xs font-bold" style={{ color: linkColor }}>
                返回上一页
              </Text>
            </BouncyButton>
          </View>
        ) : (
          <View className="px-5 pb-2 bg-transparent">
            <ZhihuContent
              content={answer?.content || ''}
              segmentInfos={answer?.segment_infos}
              linkCardInfo={answer?.link_card_info}
              objectId={id}
              type="answer"
              onRefresh={refetch}
              renderPlaceholder={renderContentPlaceholder}
              onLayoutReady={handleContentLayoutReady}
            />
            {/* Meta info */}
            <View
              style={{
                marginTop: 20,
                paddingTop: 12,
              }}
              className="bg-transparent"
            >
              <Text
                style={{
                  fontSize: 12,
                  color: Colors[colorScheme].textSecondary,
                  opacity: 0.65,
                }}
              >
                {[
                  answer?.created_time
                    ? `发布于 ${formatDate(answer.created_time)}`
                    : answer?.created_time_name
                      ? `发布于 ${answer.created_time_name}`
                      : null,
                  answer?.updated_time
                    ? `编辑于 ${formatDate(answer.updated_time)}`
                    : null,
                  answer?.ip_info ? answer.ip_info : null,
                ]
                  .filter(Boolean)
                  .join('  ·  ')}
              </Text>
            </View>
          </View>
        )}
      </Reanimated.ScrollView>

      <ReadingScrollIndicator
        scrollY={scrollY}
        contentHeight={contentHeight}
        viewportHeight={viewportHeight}
        top={navigationHeight + 8}
        bottom={actionBarBottom + CONTENT_ACTION_BAR_HEIGHT + 20}
        visible={isFocused && contentLayoutReady}
      />

      <ReadingProgressNotice
        visible={readingProgress.restoredOffset !== null}
        onBackToTop={readingProgress.scrollToTop}
        onDismiss={readingProgress.dismissRestoreNotice}
        bottomOffset={
          CONTENT_ACTION_BAR_HEIGHT + 24 + actionBarBottom - insets.bottom
        }
      />

      {/* Footer Actions */}
      <ContentActionBar
        bottomInset={insets.bottom}
        leading={
          <SegmentedVoteCapsule
            id={answer?.id ?? ''}
            count={answer?.voteup_count ?? 0}
            voted={
              answer?.relationship?.voting ??
              (answer?.reaction?.relation?.vote === 'UP' ? 1 : 0)
            }
            type="answers"
          />
        }
        trailing={
          <View className="flex-row items-center bg-transparent">
            <ContentActionButton
              accessibilityRole="button"
              accessibilityLabel="评论"
              disabled={!answer}
              className="items-center justify-center ml-2 px-2.5 py-1.5 flex-row bg-transparent"
              onPress={() => router.push(`/comments/${id}?type=answer`)}
            >
              <ThemedIcon
                name="chatbubble-outline"
                size={20}
                colorType="secondary"
              />
              {(answer?.comment_count ?? 0) > 0 && (
                <Text
                  type="secondary"
                  className="ml-1 text-[13px] font-semibold"
                >
                  {answer?.comment_count}
                </Text>
              )}
            </ContentActionButton>
            <MoreActionsButton
              disabled={!answer}
              style={{ marginLeft: 4 }}
              onPress={() => setMenuVisible(true)}
            />
          </View>
        }
      />

      <ShareMenu
        visible={isFocused && menuVisible}
        onClose={() => {
          setMenuVisible(false);
        }}
        type="answer"
        data={
          answer
            ? {
                id: answer.id,
                title: answer.question?.title,
                author: answer.author?.name,
                authorHeadline: answer.author?.headline,
                questionId: answer.question?.id || questionId,
                isCollected: activeCollected,
              }
            : null
        }
        additionalOptions={[
          ...(answer?.relationship?.is_author
            ? [
                {
                  key: 'edit',
                  icon: 'create-outline' as const,
                  label: '编辑回答',
                  disabled: !answer.question?.id && !questionId,
                  onPress: () => {
                    const targetQuestionId = answer.question?.id || questionId;
                    if (targetQuestionId) {
                      router.push(`/question/write/${targetQuestionId}`);
                    }
                  },
                },
              ]
            : []),
          ...(answer?.relationship?.is_author
            ? [
                {
                  key: 'delete',
                  icon: 'trash-outline' as const,
                  label: '删除回答',
                  destructive: true,
                  disabled: deleteMutation.isPending,
                  onPress: handleDelete,
                },
              ]
            : []),
        ]}
      />
      <VoterListModal
        visible={votersVisible}
        onClose={() => setVotersVisible(false)}
        contentType="answer"
        contentId={id}
        count={answer?.voteup_count}
      />
    </View>
  );
};
