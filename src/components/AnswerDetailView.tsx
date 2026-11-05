import Ionicons from '@expo/vector-icons/Ionicons';
import { skipToken, useMutation, useQuery } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import React, { useRef } from 'react';
import {
  Alert,
  type ScrollViewInstance as NativeScrollView,
  type ViewInstance as NativeView,
  Platform,
  View as RawView,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  runOnJS,
  type SharedValue,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type AnswerDetail,
  deleteAnswer,
  getContentCollectionMetadata,
} from '@/api/zhihu';
import { getAllContentCollectionStatus } from '@/api/zhihu/collection';
import { followMember, unfollowMember } from '@/api/zhihu/member';
import { ActionIconCount } from '@/components/ActionIconCount';
import { AnswerEndorsements } from '@/components/AnswerEndorsements';
import { AnswerLoadingPlaceholder } from '@/components/AnswerLoadingPlaceholder';
import { BouncyButton } from '@/components/BouncyButton';
import { CollectionButton } from '@/components/CollectionButton';
import {
  CONTENT_ACTION_BAR_HEIGHT,
  ContentActionBar,
  getContentActionBarBottom,
} from '@/components/ContentActionBar';
import { ContentActionButton } from '@/components/ContentActionButton';
import { ContentRelationshipNotice } from '@/components/ContentRelationshipNotice';
import { useDetailNavigationHeight } from '@/components/DetailNavigationHeader';
import { FollowButton } from '@/components/FollowButton';
import { InitialContentReveal } from '@/components/InitialContentReveal';
import { MoreActionsButton } from '@/components/MoreActionsButton';
import { QueryErrorView } from '@/components/QueryErrorView';
import { ReadingProgressNotice } from '@/components/ReadingProgressNotice';
import { ReadingScrollIndicator } from '@/components/ReadingScrollIndicator';
import { SegmentedVoteCapsule } from '@/components/SegmentedVoteCapsule';
import { ShareMenu } from '@/components/ShareMenu';
import { RetainedAvatar } from '@/components/StableAvatar';
import { Text, ThemedIcon, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { usePaneDimensions } from '@/features/adaptive-layout/PaneContext';
import { TitleTransitionTarget } from '@/features/adaptive-layout/TitleTransition';
import {
  isRichTextNativeAvailable,
  type RichContentLoadingPhase,
  ZhihuContent,
} from '@/features/rich-content';
import { useAnswerDetailQuery } from '@/hooks/useAnswerDetailQuery';
import {
  type AnswerReadSession,
  useAnswerDetailRead,
} from '@/hooks/useAnswerDetailRead';
import { useDoubleTapAction } from '@/hooks/useDoubleTapAction';
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle';
import { useReadingContentMeasurement } from '@/hooks/useReadingContentMeasurement';
import { useReadingProgress } from '@/hooks/useReadingProgress';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { useCollectionStore } from '@/store/useCollectionStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { getAnswerEndorsementsKey } from '@/utils/answerEndorsements';
import { formatDate } from '@/utils/date';
import { calculateDetailHeaderAppearance } from '@/utils/detailHeaderAppearance';
import { getZhihuErrorMessage, getZhihuErrorStatus } from '@/utils/zhihuError';

export interface AnswerEndorsementSource {
  answerId: string;
  sessionVersion: number;
  endorsements: readonly unknown[];
}

interface AnswerDetailViewProps {
  id: string;
  readSession?: AnswerReadSession;
  endorsementSource?: AnswerEndorsementSource;
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

interface AnswerDeleteScope {
  id: string;
  sessionVersion: number;
  scopeVersion: number | undefined;
}

export const AnswerDetailView = ({
  id,
  readSession,
  endorsementSource,
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
  const navigation = useNavigation();
  const sessionVersion = useAuthStore(() => getAuthSessionVersion());
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
    isPending: queryPending,
    isPaused: queryPaused,
    isError,
    error,
    refetch,
    isGuest,
  } = useAnswerDetailQuery(id, {
    enabled: isFocused,
    questionId,
  });
  const isAnswerLoading =
    queryLoading || (queryPending && queryPaused && isFocused);
  const { data: entryEndorsements } = useQuery<readonly unknown[]>({
    queryKey: getAnswerEndorsementsKey(id, sessionVersion),
    queryFn: skipToken,
  });
  // Thin answer lists may contain labels even when the detail response omits them.
  const endorsements =
    answer?.endorsements !== undefined
      ? answer.endorsements
      : endorsementSource?.answerId === id &&
          endorsementSource.sessionVersion === sessionVersion
        ? endorsementSource.endorsements
        : entryEndorsements;

  const richContentRenderer = useSettingsStore(
    (state) => state.richContentRenderer,
  );
  const fontSizeScale = useSettingsStore((state) => state.fontSizeScale);
  const lineHeightScale = useSettingsStore((state) => state.lineHeightScale);
  const dimensions = usePaneDimensions();
  // Reserve the visible reading area during the fetch and native layout so
  // the footer does not jump into view before the measured body replaces it.
  const placeholderHeight =
    Platform.OS === 'android' ? Math.max(200, dimensions.height * 0.55) : 200;
  const renderContentPlaceholder = React.useCallback(
    (phase: RichContentLoadingPhase) => (
      <AnswerLoadingPlaceholder phase={phase} minHeight={placeholderHeight} />
    ),
    [placeholderHeight],
  );
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
  React.useLayoutEffect(() => {
    latestLayoutSource.current = contentLayoutSource;
  }, [contentLayoutSource]);
  const handleContentLayoutReady = React.useCallback(() => {
    if (latestLayoutSource.current === contentLayoutSource)
      setReadyLayoutSource(contentLayoutSource);
  }, [contentLayoutSource]);
  const contentLayoutReady =
    shouldRenderBody &&
    Boolean(answer) &&
    (!waitForNativeLayout || readyLayoutSource === contentLayoutSource);
  useAnswerDetailRead(
    id,
    answer?.question?.id != null ? String(answer.question.id) : questionId,
    isFocused && contentLayoutReady,
    readSession,
  );

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

  const deleteScope = React.useMemo<AnswerDeleteScope>(
    () => ({ id, sessionVersion, scopeVersion }),
    [id, sessionVersion, scopeVersion],
  );
  const currentDeleteScope = useRef<AnswerDeleteScope | null>(deleteScope);
  React.useLayoutEffect(() => {
    currentDeleteScope.current = deleteScope;
    return () => {
      if (currentDeleteScope.current === deleteScope)
        currentDeleteScope.current = null;
    };
  }, [deleteScope]);
  const isCurrentDelete = (attempt: AnswerDeleteScope) =>
    currentDeleteScope.current === attempt &&
    attempt.sessionVersion === getAuthSessionVersion() &&
    (!activeAnswerId || activeAnswerId.value === attempt.id) &&
    (!activeScopeVersion || activeScopeVersion.value === attempt.scopeVersion);
  const deleteMutation = useMutation({
    mutationFn: (attempt: AnswerDeleteScope) => deleteAnswer(attempt.id),
    onSuccess: (_data, attempt) => {
      if (!isCurrentDelete(attempt)) return;
      Alert.alert('删除成功', '你的回答已删除喵！');
      // Dispatch from this route, so a newer list/detail is never popped.
      const target = navigation.getState()?.key;
      if (target) navigation.dispatch({ type: 'GO_BACK', target });
    },
    onError: (err: unknown, attempt) => {
      if (isCurrentDelete(attempt))
        Alert.alert('删除失败', getZhihuErrorMessage(err) || '无法删除回答');
    },
  });

  const handleDelete = () => {
    Alert.alert('确认删除', '确定要删除这个回答吗？此操作不可撤销喵！', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认删除',
        style: 'destructive',
        onPress: () => {
          if (isCurrentDelete(deleteScope)) deleteMutation.mutate(deleteScope);
        },
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

  const { gesture: doubleTapVote, isDoubleTapEnabled } = useDoubleTapAction({
    id,
    type: 'answers',
    commentType: 'answer',
    voted:
      answer?.relationship?.voting ??
      (answer?.reaction?.relation?.vote === 'UP' ? 1 : 0),
    count: answer?.voteup_count ?? 0,
    enabled: isFocused && Boolean(answer),
  });

  const goToProfile = () => {
    const token = answer?.author?.url_token || answer?.author?.id;
    if (token)
      router.push({
        pathname: '/user/[id]',
        params: {
          id: token,
          ...(answer?.author?.avatar_url
            ? { avatar: answer.author.avatar_url }
            : {}),
          ...(answer?.author?.name ? { name: answer.author.name } : {}),
          ...(answer?.author?.headline
            ? { headline: answer.author.headline }
            : {}),
        },
      });
  };

  const linkColor = useThemeColor({}, 'link');
  const primaryTransparent = useThemeColor({}, 'primaryTransparent');
  const secondaryColor = useThemeColor({}, 'textSecondary');
  if (!shouldRenderBody) {
    return <View className="flex-1" />;
  }

  return (
    <View className="flex-1">
      <GestureDetector gesture={doubleTapVote}>
        <RawView collapsable={false} style={{ flex: 1 }}>
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
                  <Text
                    type="secondary"
                    style={{ fontSize: 12, lineHeight: 18 }}
                  >
                    来自问题
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={12}
                    color={secondaryColor}
                  />
                </View>
                <TitleTransitionTarget
                  id={String(questionId || answer?.question?.id || id)}
                  enabled={isFocused}
                >
                  <View>
                    <Text
                      style={{
                        fontSize: 21,
                        lineHeight: 29,
                        fontWeight: '700',
                      }}
                    >
                      {answer?.question?.title || initialTitle || '加载中...'}
                    </Text>
                  </View>
                </TitleTransitionTarget>
              </BouncyButton>
              <View className="flex-row items-center pt-4 pb-5 justify-between gap-3 bg-transparent">
                <BouncyButton
                  onPress={goToProfile}
                  className="flex-row items-center flex-1 bg-transparent"
                  style={{ minHeight: 40 }}
                >
                  <RetainedAvatar
                    key={`${sessionVersion}:${id}`}
                    uri={authorAvatarUrl}
                    ownerId={answer?.author?.id}
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

            {isAnswerLoading && !answer ? (
              <AnswerLoadingPlaceholder
                phase="fetching-answer"
                minHeight={placeholderHeight}
              />
            ) : isError && !answer && getZhihuErrorStatus(error) !== 404 ? (
              <QueryErrorView
                message={isGuest ? getZhihuErrorMessage(error) : '回答加载失败'}
                onRetry={() => void refetch()}
              />
            ) : getZhihuErrorStatus(error) === 404 && !answer ? (
              <View className="h-[300px] justify-center items-center px-6 bg-transparent">
                <Ionicons
                  name="compass-outline"
                  size={48}
                  color={secondaryColor}
                />
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
                  <Text
                    className="text-xs font-bold"
                    style={{ color: linkColor }}
                  >
                    返回上一页
                  </Text>
                </BouncyButton>
              </View>
            ) : (
              <View className="px-5 pb-2 bg-transparent">
                <AnswerEndorsements
                  endorsements={endorsements}
                  enabled={isFocused}
                />
                <ContentRelationshipNotice
                  contentType="answer"
                  contentId={id}
                  enabled={isFocused && Boolean(answer)}
                  voteCount={answer?.voteup_count}
                />
                <InitialContentReveal key={id} ready={contentLayoutReady}>
                  <ZhihuContent
                    suppressDoubleTapSelection={isDoubleTapEnabled}
                    content={answer?.content || ''}
                    segmentInfos={answer?.segment_infos}
                    linkCardInfo={answer?.link_card_info}
                    objectId={id}
                    type="answer"
                    onRefresh={refetch}
                    renderPlaceholder={renderContentPlaceholder}
                    onLayoutReady={handleContentLayoutReady}
                  />
                </InitialContentReveal>
                {isGuest &&
                (answer?.content_need_truncated ||
                  answer?.answer_type?.toUpperCase() === 'PAID' ||
                  answer?.paid_info != null) ? (
                  <View className="mt-4 bg-transparent">
                    <Text type="secondary">当前仅展示游客可见的部分正文</Text>
                    <BouncyButton
                      accessibilityRole="button"
                      accessibilityLabel="登录后查看回答"
                      onPress={() => router.push('/login')}
                      className="py-3"
                    >
                      <Text type="primary">登录后查看回答</Text>
                    </BouncyButton>
                  </View>
                ) : null}
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
        </RawView>
      </GestureDetector>

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
        variant="islands"
        interactiveGlass
        shrinkLeading
        leading={
          <SegmentedVoteCapsule
            id={answer?.id ?? ''}
            count={answer?.voteup_count ?? 0}
            voted={
              answer?.relationship?.voting ??
              (answer?.reaction?.relation?.vote === 'UP' ? 1 : 0)
            }
            type="answers"
            allowCountShrink
          />
        }
        trailing={
          <View className="flex-row items-center bg-transparent">
            <CollectionButton
              id={id}
              type="answer"
              isCollected={activeCollected}
              count={getContentCollectionMetadata(answer).favlistsCount}
              countDisplay="corner"
              disabled={!answer || !isFocused}
            />
            <ContentActionButton
              accessibilityRole="button"
              accessibilityLabel="评论"
              accessibilityValue={
                answer
                  ? { text: `${answer.comment_count ?? 0} 条评论` }
                  : undefined
              }
              disabled={!answer}
              style={{
                width: 44,
                height: 44,
                paddingHorizontal: 0,
                paddingVertical: 0,
              }}
              onPress={() => router.push(`/comments/${id}?type=answer`)}
            >
              <ActionIconCount
                count={
                  (answer?.comment_count ?? 0) > 0
                    ? answer?.comment_count
                    : undefined
                }
              >
                <ThemedIcon
                  name="chatbubble-outline"
                  size={20}
                  colorType="secondary"
                />
              </ActionIconCount>
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
    </View>
  );
};
