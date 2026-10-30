import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import React, {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View as NativeView,
  RefreshControl,
  type ViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { recordReadHistory } from '@/api/zhihu/history';
import type {
  ZhihuPreviewAnswer,
  ZhihuPreviewAnswerMetadata,
  ZhihuPreviewLoginPrompt,
  ZhihuReadingPreviewItem,
} from '@/api/zhihu/nextRender';
import { AnswerEndorsements } from '@/components/AnswerEndorsements';
import { AnswerPreviewFloatingBar } from '@/components/AnswerPreviewFloatingBar';
import { AnswerPreviewPlainBody } from '@/components/AnswerPreviewPlainBody';
import { AnswerPreviewQuestionHeader } from '@/components/AnswerPreviewQuestionHeader';
import {
  CONTENT_ACTION_BAR_HEIGHT,
  getContentActionBarBottom,
} from '@/components/ContentActionBar';
import { useContentCardSurface } from '@/components/contentCardSurface';
import {
  DetailNavigationHeader,
  useDetailNavigationHeight,
} from '@/components/DetailNavigationHeader';
import { FeedCardActionRow } from '@/components/FeedCardActionRow';
import { QueryErrorView } from '@/components/QueryErrorView';
import { ShareMenu } from '@/components/ShareMenu';
import { StableAvatar } from '@/components/StableAvatar';
import { Text, useRuntimeThemeColors, View } from '@/components/Themed';
import { usePaneRouter as useRouter } from '@/features/adaptive-layout/usePaneRouter';
import { ZhihuStructuredContent } from '@/features/rich-content';
import { useAnswerPreviewAutoLoad } from '@/hooks/useAnswerPreviewAutoLoad';
import { useAnswerPreviewBody } from '@/hooks/useAnswerPreviewBody';
import { useAnswerPreviewCollapse } from '@/hooks/useAnswerPreviewCollapse';
import { useAnswerPreviewFloatingBar } from '@/hooks/useAnswerPreviewFloatingBar';
import { useAnswerPreviewQuery } from '@/hooks/useAnswerPreviewQuery';
import { useAnswerReadTouch } from '@/hooks/useAnswerReadTouch';
import { useDetailHeaderState } from '@/hooks/useDetailHeaderState';
import { useListPreload } from '@/hooks/useListPreload';
import { getAuthSessionVersion } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ZhihuStructuredContent as StructuredContent } from '@/types/zhihu';
import {
  formatAnswerPublishInfo,
  shouldShowPreviewQuestion,
} from '@/utils/answerPreviewDisplay';
import {
  type AnswerReadingContext,
  getAnswerReadingRouteParams,
} from '@/utils/answerReadingContext';
import { refreshInfiniteQuery } from '@/utils/query';
import { getZhihuErrorMessage } from '@/utils/zhihuError';
import { BouncyButton } from './BouncyButton';

type PreviewItem = ZhihuReadingPreviewItem;
type PreviewAnswer = Exclude<PreviewItem, ZhihuPreviewLoginPrompt>;
const initialContentIds = new WeakMap<StructuredContent, number>();
let initialContentSequence = 0;
const DEFAULT_ANSWER_CONTEXT: AnswerReadingContext = { scene: 'unknown' };
/** Space between answer cards; also kept above a card scrolled under the header. */
const CARD_GAP = 8;

/** Cache identity is local; neither prose nor opaque continuation URLs become keys. */
function initialContentId(content: StructuredContent): number {
  const existing = initialContentIds.get(content);
  if (existing !== undefined) return existing;
  const identity = ++initialContentSequence;
  initialContentIds.set(content, identity);
  return identity;
}

interface AnswerPreviewCardProps {
  item: PreviewAnswer;
  scope: string;
  sessionVersion: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onMore: () => void;
  onRefresh: () => void;
  showQuestion: boolean;
  onQuestionTitleLayout?: (bottom: number) => void;
  onFooterRef: (
    id: string,
    view: Pick<ViewInstance, 'measureInWindow'> | null,
  ) => void;
  onFooterLayout: () => void;
  onBodyLoader: (id: string, loader: (() => Promise<unknown>) | null) => void;
}

function AnswerPreviewStructuredBody({
  item,
  scope,
  sessionVersion,
  expanded,
  onExpandedChange,
  onRefresh,
  onBodyLoader,
  footerContent,
}: Pick<
  AnswerPreviewCardProps,
  | 'scope'
  | 'sessionVersion'
  | 'expanded'
  | 'onExpandedChange'
  | 'onRefresh'
  | 'onBodyLoader'
> & { item: ZhihuPreviewAnswer; footerContent?: ReactNode }) {
  const initialContent = item.structuredContent;
  const sourceId = initialContentId(initialContent);
  const body = useAnswerPreviewBody({
    scope,
    answerId: item.id,
    sessionVersion,
    sourceId,
    initialContent,
    onRefresh,
  });
  const bodyLoader =
    expanded && !body.isLoadingMore ? body.autoLoadMore : undefined;
  useEffect(() => {
    onBodyLoader(item.id, bodyLoader ?? null);
    return () => onBodyLoader(item.id, null);
  }, [item.id, bodyLoader, onBodyLoader]);
  return (
    <ZhihuStructuredContent
      content={body.content}
      documentId={`answer-preview:${sessionVersion}:${item.id}:${sourceId}`}
      objectId={item.id}
      renderer="shared"
      onRefresh={() => void body.refresh()}
      collapseMode="height"
      footerContent={footerContent}
      expanded={expanded}
      onExpandedChange={(nextExpanded) => {
        onExpandedChange(nextExpanded);
        body.onExpandedChange(nextExpanded);
      }}
      hasMore={body.hasMore}
      isLoadingMore={body.isLoadingMore}
      loadMoreError={body.loadMoreError}
      onLoadMore={body.loadMore}
      showLoadMoreControl={false}
      expandLabel="展开回答"
      collapseLabel="收起回答"
      showFallbackNotice={false}
    />
  );
}

const AnswerPreviewCard = React.memo(function AnswerPreviewCard({
  item,
  scope,
  sessionVersion,
  expanded,
  onExpandedChange,
  onMore,
  onRefresh,
  showQuestion,
  onQuestionTitleLayout,
  onFooterRef,
  onFooterLayout,
  onBodyLoader,
}: AnswerPreviewCardProps) {
  const router = useRouter();
  const surface = useContentCardSurface({ radius: 16, gap: CARD_GAP });
  const footerRef = useCallback(
    (view: ViewInstance | null) => onFooterRef(item.id, view),
    [item.id, onFooterRef],
  );
  const footerContent = item.publishInfo ? (
    <View className="bg-transparent">
      {formatAnswerPublishInfo(item.publishInfo).map((line) => (
        <Text key={line} type="secondary" className="text-xs leading-5">
          {line}
        </Text>
      ))}
    </View>
  ) : undefined;

  return (
    <View style={[{ padding: 12 }, surface]}>
      {showQuestion ? (
        <BouncyButton
          accessibilityRole="link"
          disabled={!item.question.id}
          style={{ borderRadius: 12 }}
          onPress={() =>
            router.push({
              pathname: '/question/[id]',
              params: { id: item.question.id },
            })
          }
        >
          <Text
            className="text-lg font-bold mb-3"
            onLayout={({ nativeEvent: { layout } }) =>
              onQuestionTitleLayout?.(12 + layout.y + layout.height)
            }
          >
            {item.question.title}
          </Text>
        </BouncyButton>
      ) : null}
      <BouncyButton
        className="flex-row items-center mb-3"
        style={{ borderRadius: 12 }}
        onPress={() => {
          const memberId = item.author.url_token || item.author.id;
          if (memberId)
            router.push({
              pathname: '/user/[id]',
              params: {
                id: memberId,
                avatar: item.author.avatar_url,
                name: item.author.name,
                ...(item.author.headline
                  ? { headline: item.author.headline }
                  : {}),
              },
            });
        }}
      >
        <StableAvatar
          uri={item.author.avatar_url}
          style={{ width: 32, height: 32, borderRadius: 16 }}
        />
        <View className="ml-2 flex-1 bg-transparent">
          <Text className="font-semibold">{item.author.name}</Text>
          {item.author.headline ? (
            <Text type="secondary" numberOfLines={1} className="text-xs">
              {item.author.headline}
            </Text>
          ) : null}
        </View>
      </BouncyButton>
      <AnswerEndorsements endorsements={item.endorsements} />
      {'structuredContent' in item ? (
        <AnswerPreviewStructuredBody
          item={item}
          scope={scope}
          sessionVersion={sessionVersion}
          expanded={expanded}
          onExpandedChange={onExpandedChange}
          onRefresh={onRefresh}
          onBodyLoader={onBodyLoader}
          footerContent={footerContent}
        />
      ) : (
        <AnswerPreviewPlainBody
          item={item}
          scope={scope}
          expanded={expanded}
          onExpandedChange={onExpandedChange}
          onRefresh={onRefresh}
          footerContent={footerContent}
        />
      )}
      <NativeView
        ref={footerRef}
        collapsable={false}
        onLayout={onFooterLayout}
        className="mt-2 bg-transparent"
      >
        <FeedCardActionRow
          id={item.id}
          voteCount={item.voteup_count}
          voted={item.relationship.voting}
          engagementType="answers"
          commentCount={item.comment_count}
          isCollected={item.relationship.is_favorited}
          collectionCount={item.favlists_count}
          showDownvote
          commentAccessibilityLabel="查看评论"
          onComments={() =>
            router.push(
              `/comments/${item.id}?type=answer&count=${item.comment_count}`,
            )
          }
          onMore={onMore}
        />
      </NativeView>
    </View>
  );
});

export interface AnswerPreviewListProps {
  answerId: string;
  questionId?: string;
  title?: string;
  sortBy?: string;
  answerContext?: AnswerReadingContext;
}

/** Entered after a normal answer card; list and each body page independently. */
export function AnswerPreviewList({
  answerId,
  questionId,
  title,
  sortBy,
  answerContext = DEFAULT_ANSWER_CONTEXT,
}: AnswerPreviewListProps) {
  const router = useRouter();
  const listPreload = useListPreload(0.5);
  const colors = useRuntimeThemeColors();
  const insets = useSafeAreaInsets();
  const actionBarBottom = getContentActionBarBottom(insets.bottom);
  const navigationHeight = useDetailNavigationHeight();
  const queryClient = useQueryClient();
  const query = useAnswerPreviewQuery({
    answerId,
    questionId,
    scene: answerContext.scene,
  });
  const listRef = useRef<FlashListRef<PreviewItem>>(null);
  const scope = JSON.stringify([
    query.sessionVersion,
    answerId,
    answerContext.scene,
    answerContext.scene === 'question_feed' ? questionId : null,
    answerContext.scene === 'profile_answer' ? answerContext.memberId : null,
    answerContext.scene === 'profile_answer' ? answerContext.memberSort : null,
  ]);
  const selectedSettledScope = useRef<string | null>(null);
  useEffect(() => {
    if (!query.selectedIsPending) selectedSettledScope.current = scope;
  }, [scope, query.selectedIsPending]);
  const waitingForFirstAnswer =
    query.selectedIsPending && selectedSettledScope.current !== scope;
  const [refreshingScope, setRefreshingScope] = useState<string | null>(null);
  const enableBrowseHistory = useSettingsStore(
    (state) => state.enableBrowseHistory,
  );
  const recordedHistory = useRef({ scope, ids: new Set<string>() });
  const recordAnswer = useCallback(
    (id: string) => {
      if (
        !enableBrowseHistory ||
        getAuthSessionVersion() !== query.sessionVersion
      )
        return;
      if (recordedHistory.current.scope !== scope)
        recordedHistory.current = { scope, ids: new Set() };
      if (recordedHistory.current.ids.has(id)) return;
      recordedHistory.current.ids.add(id);
      recordReadHistory({ content_token: id, content_type: 'answer' });
    },
    [enableBrowseHistory, scope, query.sessionVersion],
  );
  useEffect(() => recordAnswer(answerId), [recordAnswer, answerId]);
  const [expandedState, setExpandedState] = useState({
    scope,
    ids: new Set([answerId]),
  });
  useEffect(() => {
    setExpandedState((current) =>
      current.scope === scope ? current : { scope, ids: new Set([answerId]) },
    );
  }, [answerId, scope]);
  const expandedIds = useMemo(
    () =>
      expandedState.scope === scope ? expandedState.ids : new Set([answerId]),
    [answerId, expandedState, scope],
  );
  const visibleScope = useMemo(() => ({ scope }), [scope]);
  const currentVisibleScope = useRef(visibleScope);
  currentVisibleScope.current = visibleScope;
  const [visibleAnswers, setVisibleAnswers] = useState({
    scope: visibleScope,
    ids: new Set<string>(),
  });
  const readAnswerIds = useMemo(
    () =>
      visibleAnswers.scope === visibleScope
        ? query.items.flatMap((item) =>
            item.type === 'answer' &&
            visibleAnswers.ids.has(item.id) &&
            expandedIds.has(item.id)
              ? [item.id]
              : [],
          )
        : [],
    [expandedIds, query.items, visibleAnswers, visibleScope],
  );
  useAnswerReadTouch(
    readAnswerIds,
    !waitingForFirstAnswer && getAuthSessionVersion() === query.sessionVersion,
  );
  const floatingBar = useAnswerPreviewFloatingBar({
    scope,
    items: query.items,
    expandedIds,
    navigationHeight: insets.top + navigationHeight,
  });
  const autoLoad = useAnswerPreviewAutoLoad({
    scope,
    expandedIds,
    navigationHeight: insets.top + navigationHeight,
  });
  const handleViewableItemsChanged = useCallback(
    (info: Parameters<typeof floatingBar.onViewableItemsChanged>[0]) => {
      if (currentVisibleScope.current !== visibleScope) return;
      const ids = new Set(
        info.viewableItems.flatMap(({ item, isViewable }) =>
          item.type === 'answer' && isViewable !== false ? [item.id] : [],
        ),
      );
      setVisibleAnswers((current) =>
        current.scope === visibleScope &&
        current.ids.size === ids.size &&
        [...ids].every((id) => current.ids.has(id))
          ? current
          : { scope: visibleScope, ids },
      );
      floatingBar.onViewableItemsChanged(info);
      autoLoad.onViewableItemsChanged(info);
    },
    [
      visibleScope,
      floatingBar.onViewableItemsChanged,
      autoLoad.onViewableItemsChanged,
    ],
  );
  const handleFooterRef = useCallback(
    (id: string, view: Pick<ViewInstance, 'measureInWindow'> | null) => {
      floatingBar.registerFooter(id, view);
      autoLoad.registerFooter(id, view);
    },
    [floatingBar.registerFooter, autoLoad.registerFooter],
  );
  const handleFooterLayout = useCallback(() => {
    floatingBar.onFooterLayout();
    autoLoad.onFooterLayout();
  }, [floatingBar.onFooterLayout, autoLoad.onFooterLayout]);
  const headerState = useDetailHeaderState(scope);
  const collapseAnswer = useAnswerPreviewCollapse({
    listRef,
    scope,
    // Leave the card gap visible below the header, as between cards.
    viewOffset: insets.top + navigationHeight + CARD_GAP,
  });
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      headerState.onScrollOffset(event.nativeEvent.contentOffset.y);
      floatingBar.onScroll(event);
      autoLoad.onScroll(event);
      collapseAnswer.onScroll();
    },
    [
      headerState.onScrollOffset,
      floatingBar.onScroll,
      autoLoad.onScroll,
      collapseAnswer.onScroll,
    ],
  );
  const handleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      headerState.onScrollOffset(event.nativeEvent.contentOffset.y);
      floatingBar.onScrollEnd(event);
      autoLoad.onScrollEnd(event);
    },
    [headerState.onScrollOffset, floatingBar.onScrollEnd, autoLoad.onScrollEnd],
  );
  const handleTitleLayout = useCallback(
    (bottom: number) => {
      // Title coordinates are local to the list header, following its 4px inset.
      headerState.onHeaderLayout(Math.max(1, 4 + bottom));
    },
    [headerState.onHeaderLayout],
  );
  const [menuState, setMenuState] = useState<{
    scope: string;
    item: ZhihuPreviewAnswerMetadata;
  } | null>(null);
  const activeMenu = menuState?.scope === scope ? menuState.item : null;
  const openDetail = useCallback(
    (id: string, itemQuestionId?: string, itemTitle?: string) => {
      router.push({
        pathname: '/answer/[id]',
        params: {
          id,
          readingMode: 'detail',
          ...getAnswerReadingRouteParams(answerContext),
          ...(itemQuestionId ? { questionId: itemQuestionId } : {}),
          ...(itemTitle ? { title: itemTitle } : {}),
          ...(sortBy ? { sortBy } : {}),
        },
      });
    },
    [router, sortBy, answerContext],
  );
  const refreshBody = useCallback(
    (id: string) => {
      if (id === answerId) void query.refetchSelected();
      else
        void queryClient.invalidateQueries({
          queryKey: query.queryKey,
          exact: true,
        });
    },
    [queryClient, answerId, query.refetchSelected, query.queryKey],
  );
  const refreshPreview = useCallback(
    () =>
      Promise.all([
        refreshInfiniteQuery(queryClient, query.queryKey),
        query.refetchSelected(),
      ]),
    [queryClient, query.queryKey, query.refetchSelected],
  );
  const changeExpanded = useCallback(
    (id: string, expanded: boolean) => {
      if (currentVisibleScope.current !== visibleScope) return;
      if (expanded) recordAnswer(id);
      const applyExpanded = () => {
        if (currentVisibleScope.current !== visibleScope) return;
        setExpandedState((current) => {
          const ids = new Set(
            current.scope === scope ? current.ids : [answerId],
          );
          if (expanded) ids.add(id);
          else ids.delete(id);
          return { scope, ids };
        });
      };
      const index = expanded
        ? -1
        : query.items.findIndex(
            (item) => item.type === 'answer' && item.id === id,
          );
      if (index < 0) applyExpanded();
      else collapseAnswer.collapse(index, applyExpanded);
    },
    [
      recordAnswer,
      scope,
      visibleScope,
      answerId,
      query.items,
      collapseAnswer.collapse,
    ],
  );
  const selectedQuestion =
    query.items.find(
      (item): item is PreviewAnswer =>
        item.type === 'answer' && item.id === answerId,
    )?.question ??
    query.items.find((item): item is PreviewAnswer => item.type === 'answer')
      ?.question;
  const contextQuestionId =
    answerContext.scene === 'question_feed'
      ? questionId || selectedQuestion?.id
      : undefined;
  const screenTitle = contextQuestionId
    ? title || selectedQuestion?.title || '回答预览'
    : floatingBar.activeAnswer?.question.title ||
      selectedQuestion?.title ||
      title ||
      '回答预览';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <DetailNavigationHeader
        title={screenTitle}
        collapsed={headerState.collapsed}
        progress={headerState.headerProgress}
        onBack={() => router.back()}
        onTitlePress={() =>
          listRef.current?.scrollToOffset({ offset: 0, animated: true })
        }
      />
      {waitingForFirstAnswer ? (
        <ActivityIndicator
          style={{ marginTop: insets.top + navigationHeight + 40 }}
          color={colors.link}
        />
      ) : query.selectedIsError && query.isError && query.items.length === 0 ? (
        <View style={{ marginTop: insets.top + navigationHeight }}>
          <QueryErrorView
            message={getZhihuErrorMessage(query.selectedError)}
            onRetry={() => void refreshPreview()}
          />
          <BouncyButton
            onPress={() => openDetail(answerId, questionId, title)}
            className="items-center py-3"
          >
            <Text style={{ color: colors.link }}>进入所选回答详情</Text>
          </BouncyButton>
        </View>
      ) : (
        <FlashList<PreviewItem>
          key={scope}
          ref={listRef}
          // Cards change height as answers and images measure, and every
          // correction redraws the indicator; the home feed hides it too.
          showsVerticalScrollIndicator={false}
          data={query.items}
          onViewableItemsChanged={handleViewableItemsChanged}
          viewabilityConfig={floatingBar.viewabilityConfig}
          onScroll={handleScroll}
          onScrollBeginDrag={collapseAnswer.onScrollBeginDrag}
          onScrollEndDrag={handleScrollEnd}
          onMomentumScrollEnd={handleScrollEnd}
          onCommitLayoutEffect={collapseAnswer.onCommitLayout}
          scrollEventThrottle={16}
          keyExtractor={(item) => `${item.type}:${item.id}`}
          getItemType={(item) => item.type}
          contentContainerStyle={{
            paddingHorizontal: 6,
            paddingTop: insets.top + navigationHeight + 4,
            paddingBottom: actionBarBottom + CONTENT_ACTION_BAR_HEIGHT + 20,
          }}
          renderItem={({ item, index }) =>
            item.type === 'login_prompt' ? (
              <View
                className="items-center p-3 rounded-2xl mb-2"
                style={{ backgroundColor: colors.backgroundSecondary }}
              >
                <Text type="secondary" className="mb-3 text-center">
                  {item.description || '登录后继续阅读更多回答'}
                </Text>
                <BouncyButton onPress={() => router.push('/login')}>
                  <Text style={{ color: colors.link }}>去登录</Text>
                </BouncyButton>
              </View>
            ) : (
              <AnswerPreviewCard
                item={item}
                scope={scope}
                sessionVersion={query.sessionVersion}
                expanded={expandedIds.has(item.id)}
                onExpandedChange={(expanded) =>
                  changeExpanded(item.id, expanded)
                }
                onMore={() => setMenuState({ scope, item })}
                onRefresh={() => refreshBody(item.id)}
                showQuestion={shouldShowPreviewQuestion(
                  query.items,
                  index,
                  contextQuestionId,
                )}
                onQuestionTitleLayout={
                  !contextQuestionId && index === 0
                    ? handleTitleLayout
                    : undefined
                }
                onFooterRef={handleFooterRef}
                onFooterLayout={handleFooterLayout}
                onBodyLoader={autoLoad.registerLoader}
              />
            )
          }
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetching && !query.isError)
              void query.fetchNextPage({ cancelRefetch: false });
          }}
          {...listPreload}
          refreshControl={
            <RefreshControl
              refreshing={refreshingScope === scope}
              onRefresh={() => {
                setExpandedState({ scope, ids: new Set([answerId]) });
                setRefreshingScope(scope);
                const finishRefresh = () =>
                  setRefreshingScope((current) =>
                    current === scope ? null : current,
                  );
                void refreshPreview().then(finishRefresh, finishRefresh);
              }}
              tintColor={colors.link}
              colors={[colors.link]}
            />
          }
          ListHeaderComponent={
            contextQuestionId ||
            query.selectedIsError ||
            query.selectedIsPending ? (
              <>
                {contextQuestionId ? (
                  <AnswerPreviewQuestionHeader
                    key={contextQuestionId}
                    id={contextQuestionId}
                    title={screenTitle}
                    onTitleLayout={handleTitleLayout}
                  />
                ) : null}
                {query.selectedIsPending ? (
                  <ActivityIndicator
                    style={{ paddingVertical: 20 }}
                    color={colors.link}
                  />
                ) : query.selectedIsError ? (
                  <QueryErrorView
                    compact
                    message={`所选回答加载失败：${getZhihuErrorMessage(query.selectedError)}`}
                    onRetry={() => void query.refetchSelected()}
                  />
                ) : null}
              </>
            ) : null
          }
          ListEmptyComponent={
            !query.selectedIsError && !query.selectedIsPending ? (
              <Text type="secondary" className="text-center py-10">
                暂无可预览的回答
              </Text>
            ) : null
          }
          ListFooterComponent={
            query.isPending || query.isFetchingNextPage ? (
              <ActivityIndicator
                style={{ paddingVertical: 20 }}
                color={colors.link}
              />
            ) : query.isError ? (
              <QueryErrorView
                compact
                message={`后续回答加载失败：${getZhihuErrorMessage(query.error)}`}
                onRetry={() =>
                  void (query.isFetchNextPageError
                    ? query.fetchNextPage()
                    : query.refetch())
                }
              />
            ) : query.paginationError ? (
              <Text type="secondary" className="text-center py-5">
                {query.paginationError}
              </Text>
            ) : query.items.length > 0 && !query.hasNextPage ? (
              <Text type="secondary" className="text-center py-5">
                没有更多回答了
              </Text>
            ) : null
          }
        />
      )}
      <AnswerPreviewFloatingBar
        answer={floatingBar.activeAnswer}
        visible={floatingBar.visible}
        bottomInset={insets.bottom}
        canCollapse={
          floatingBar.activeAnswer !== null &&
          expandedIds.has(floatingBar.activeAnswer.id)
        }
        onCollapse={(id) => changeExpanded(id, false)}
        onMore={(item) => setMenuState({ scope, item })}
      />
      <ShareMenu
        visible={Boolean(activeMenu)}
        onClose={() => setMenuState(null)}
        type="answer"
        data={
          activeMenu
            ? {
                id: activeMenu.id,
                title: activeMenu.question.title,
                questionId: activeMenu.question.id,
                author: activeMenu.author.name,
                authorHeadline: activeMenu.author.headline,
                excerpt: activeMenu.excerpt,
                isCollected: activeMenu.relationship.is_favorited,
              }
            : null
        }
      />
    </View>
  );
}
