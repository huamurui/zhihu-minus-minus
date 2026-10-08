import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import PagerView from 'react-native-pager-view';
import { getAnswer } from '@/api/zhihu';
import { recordReadHistory } from '@/api/zhihu/history';
import { AnswerDetailView } from '@/components/AnswerDetailView';
import { AnswerLoadingPlaceholder } from '@/components/AnswerLoadingPlaceholder';
import { AnswerPreviewList } from '@/components/AnswerPreviewList';
import { DetailNavigationHeader } from '@/components/DetailNavigationHeader';
import { ShareMenu } from '@/components/ShareMenu';
import { View } from '@/components/Themed';
import { RICH_CONTENT_STALE_TIME } from '@/features/rich-content';
import { useAnswerHeaderState } from '@/hooks/useAnswerHeaderState';
import { useAnswerPagerSource } from '@/hooks/useAnswerPagerSource';
import { useNeighborAnswerPrefetch } from '@/hooks/useNeighborAnswerPrefetch';
import { useSettingsStore } from '@/store/useSettingsStore';
import { getAnswerReadingContext } from '@/utils/answerReadingContext';
import { getZhihuErrorStatus } from '@/utils/zhihuError';

export default function AnswerScreen() {
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    questionId?: string;
    sortBy?: string;
    readingMode?: string;
    answerScene?: string;
    memberId?: string;
    memberSort?: string;
  }>();
  const mode = useSettingsStore((state) => state.answerReadingMode);
  const answerContext = getAnswerReadingContext(params);
  if (params.readingMode !== 'detail' && mode === 'preview-list') {
    return (
      <AnswerPreviewList
        answerId={params.id}
        questionId={params.questionId}
        title={params.title}
        sortBy={params.sortBy}
        answerContext={answerContext}
      />
    );
  }
  return <AnswerDetailScreen />;
}

function AnswerDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    questionId?: string;
    sortBy?: string;
    answerScene?: string;
    memberId?: string;
    memberSort?: string;
  }>();
  const { id, questionId: propQuestionId, sortBy = 'default' } = params;
  const answerContext = getAnswerReadingContext(params);
  const router = useRouter();

  // 锁定初始 ID，避免滑动时 URL 参数改变导致重新触发 top-level loading
  const [initialEntry] = useState({
    id,
    title: params.title,
    questionId: propQuestionId,
  });
  const initialId = initialEntry.id;
  const initialTitle = initialEntry.title;

  const enableBrowseHistory = useSettingsStore((s) => s.enableBrowseHistory);

  const recordedIds = useRef(new Set<string>());

  useEffect(() => {
    if (enableBrowseHistory && initialId) {
      recordReadHistory({ content_token: initialId, content_type: 'answer' });
      recordedIds.current.add(initialId);
    }
  }, [enableBrowseHistory, initialId]);

  // 先获取选中回答，默认切换同题回答，明确的用户来源切换该用户的回答。
  const { data: initialAnswer, isLoading: loadingInitial } = useQuery({
    queryKey: ['answer-detail', initialId],
    queryFn: ({ signal }) => getAnswer(initialId, undefined, { signal }),
    enabled: !!initialId,
    staleTime: RICH_CONTENT_STALE_TIME,
    retry: (failureCount, err) =>
      getZhihuErrorStatus(err) === 404 ? false : failureCount < 2,
  });

  const questionId =
    answerContext.scene === 'question_feed'
      ? propQuestionId || initialAnswer?.question?.id
      : initialAnswer?.question?.id || initialEntry.questionId;

  const {
    data: answersData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    pagerKey,
    isQuestionSource,
  } = useAnswerPagerSource({
    initialId,
    questionId,
    sortBy,
    context: answerContext,
    initialAnswer,
  });
  const questionIdsByAnswer = useMemo(() => {
    const ids = new Map<string, string>();
    for (const page of answersData?.pages ?? []) {
      for (const item of page.data) {
        if (item.question?.id != null)
          ids.set(String(item.id), String(item.question.id));
      }
    }
    if (initialAnswer?.question?.id != null)
      ids.set(initialId, String(initialAnswer.question.id));
    return ids;
  }, [answersData, initialAnswer, initialId]);
  const [selection, setSelection] = useState({
    pagerKey,
    answerId: initialId,
  });
  const selectedId =
    selection.pagerKey === pagerKey ? selection.answerId : initialId;
  const pagerRef = useRef<PagerView>(null);

  // 3. 构建 ID 列表
  const latestAnswerIds = useMemo(() => {
    const listIds: string[] =
      answersData?.pages
        .flatMap((page) => page.data)
        .map((item) => item.id.toString()) || [];

    let combined = listIds;
    // 确保初始 ID 在列表中
    if (initialId && !listIds.includes(initialId)) {
      combined = [initialId, ...listIds];
    }
    // 列表刷新暂时未返回正在阅读的答案时，继续保留该页与它的正文。
    if (selectedId && !combined.includes(selectedId)) {
      combined = [...combined, selectedId];
    }

    // 使用 Set 去重
    return Array.from(new Set(combined));
  }, [answersData, initialId, selectedId]);

  type PageMotion = 'idle' | 'dragging' | 'settling';
  const [pageMotion, setPageMotion] = useState<{
    pagerKey: string;
    state: PageMotion;
  }>({ pagerKey, state: 'idle' });
  const motion =
    pageMotion.pagerKey === pagerKey
      ? pageMotion
      : { pagerKey, state: 'idle' as const };
  const currentMotion = useRef(motion);
  currentMotion.current = motion;
  const committedPages = useRef({ pagerKey, ids: latestAnswerIds });
  // 手势期间不改变 native position 对应的答案；结束后再应用最新 API 顺序。
  const answerIds =
    motion.state !== 'idle' && committedPages.current.pagerKey === pagerKey
      ? committedPages.current.ids
      : latestAnswerIds;
  useLayoutEffect(() => {
    if (motion.state === 'idle')
      committedPages.current = { pagerKey, ids: answerIds };
  }, [answerIds, motion.state, pagerKey]);

  const initialPage = useMemo(() => {
    const index = answerIds.indexOf(initialId);
    return index >= 0 ? index : 0;
  }, [answerIds, initialId]);

  const currentPage = Math.max(0, answerIds.indexOf(selectedId));
  const currentId = answerIds[currentPage];
  const headerState = useAnswerHeaderState(pagerKey, currentId);
  const { data: currentAnswer } = useQuery({
    queryKey: ['answer-detail', currentId],
    queryFn: ({ signal }) => getAnswer(currentId, undefined, { signal }),
    enabled: !!currentId,
    staleTime: RICH_CONTENT_STALE_TIME,
    retry: (failureCount, err) =>
      getZhihuErrorStatus(err) === 404 ? false : failureCount < 2,
  });
  const headerQuestionId =
    currentAnswer?.question?.id ||
    questionIdsByAnswer.get(currentId) ||
    (isQuestionSource || currentId === initialId ? questionId : undefined);
  const headerTitle =
    currentAnswer?.question?.title ||
    (isQuestionSource || currentId === initialId
      ? initialAnswer?.question?.title || initialTitle
      : undefined);
  const pageListKey = JSON.stringify(answerIds);
  const currentPager = useRef({ pagerKey, pageListKey });
  currentPager.current = { pagerKey, pageListKey };
  const synchronizedPager = useRef<{
    pagerKey: string;
    pageListKey: string;
    index: number;
  } | null>(null);
  const nativePage = useRef({ pagerKey, pageListKey, index: currentPage });
  const pendingPage = useRef<{
    pagerKey: string;
    pageListKey: string;
    index: number;
  } | null>(null);

  useLayoutEffect(() => {
    const previous = synchronizedPager.current;
    synchronizedPager.current = { pagerKey, pageListKey, index: currentPage };
    if (previous?.pagerKey !== pagerKey) {
      pendingPage.current = null;
      nativePage.current = { pagerKey, pageListKey, index: currentPage };
      setPageMotion((current) =>
        current.pagerKey === pagerKey ? current : { pagerKey, state: 'idle' },
      );
      setSelection((current) =>
        current.pagerKey === pagerKey
          ? current
          : { pagerKey, answerId: initialId },
      );
      return;
    }
    if (previous.pageListKey === pageListKey) return;

    // API 顺序可以改变；按答案 ID 重新定位，不能把旧 index 解释为另一答案。
    pendingPage.current =
      previous.index === currentPage
        ? null
        : { pagerKey, pageListKey, index: currentPage };
    nativePage.current = { pagerKey, pageListKey, index: currentPage };
    pagerRef.current?.setPageWithoutAnimation(currentPage);
  }, [currentPage, initialId, pageListKey, pagerKey]);

  const [menuTarget, setMenuTarget] = useState<{
    pagerKey: string;
    answerId: string;
    scopeVersion: number;
  } | null>(null);
  useEffect(() => {
    setMenuTarget((target) =>
      target &&
      (target.pagerKey !== pagerKey ||
        target.answerId !== currentId ||
        target.scopeVersion !== headerState.scopeVersion)
        ? null
        : target,
    );
  }, [currentId, pagerKey, headerState.scopeVersion]);

  useNeighborAnswerPrefetch(answerIds, currentPage);

  useEffect(() => {
    if (
      enableBrowseHistory &&
      currentId &&
      !recordedIds.current.has(currentId)
    ) {
      recordReadHistory({ content_token: currentId, content_type: 'answer' });
      recordedIds.current.add(currentId);
    }
  }, [enableBrowseHistory, currentId]);

  const selectAnswer = (answerId: string) => {
    setMenuTarget(null);
    headerState.restore(answerId);
    setSelection({ pagerKey, answerId });
    if (answerId !== currentId)
      router.setParams(
        isQuestionSource
          ? { id: answerId }
          : {
              id: answerId,
              questionId: questionIdsByAnswer.get(answerId),
              title: undefined,
            },
      );
  };

  if (loadingInitial && !initialAnswer) {
    return (
      <View className="flex-1 justify-center items-center">
        <Stack.Screen options={{ headerShown: false, title: '回答' }} />
        <AnswerLoadingPlaceholder phase="fetching-answer" />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <Stack.Screen options={{ headerShown: false, title: '回答' }} />

      <DetailNavigationHeader
        title={headerTitle || '加载中...'}
        collapsed={headerState.collapsed}
        progress={headerState.headerProgress}
        onBack={() => router.back()}
        onTitlePress={() => {
          const target = headerQuestionId;
          if (target) router.push(`/question/${target}`);
        }}
        onMore={
          headerQuestionId && currentId
            ? () => {
                if (
                  headerState.activeAnswerId.value !== currentId ||
                  headerState.activeScopeVersion.value !==
                    headerState.scopeVersion
                )
                  return;
                setMenuTarget({
                  pagerKey,
                  answerId: currentId,
                  scopeVersion: headerState.scopeVersion,
                });
              }
            : undefined
        }
        author={
          currentAnswer?.author
            ? {
                name: currentAnswer.author.name || '知乎用户',
                avatarUrl: currentAnswer.author.avatar_url,
                onPress: () => {
                  const token =
                    currentAnswer.author.url_token || currentAnswer.author.id;
                  if (token) router.push(`/user/${token}`);
                },
              }
            : undefined
        }
      />

      <PagerView
        ref={pagerRef}
        key={pagerKey}
        style={{ flex: 1 }}
        initialPage={initialPage}
        offscreenPageLimit={1}
        onPageScrollStateChanged={(event) => {
          if (
            currentPager.current.pagerKey !== pagerKey ||
            currentPager.current.pageListKey !== pageListKey
          )
            return;
          const state = event.nativeEvent.pageScrollState;
          if (state !== 'idle' && state !== 'dragging' && state !== 'settling')
            return;
          if (state !== 'idle') {
            // settling 也涵盖未经过 dragging 的辅助功能翻页。
            pendingPage.current = null;
          } else if (currentMotion.current.state !== 'idle') {
            const page = nativePage.current;
            if (
              page.pagerKey === pagerKey &&
              page.pageListKey === pageListKey
            ) {
              const settledId = answerIds[page.index];
              if (settledId) selectAnswer(settledId);
            }
          }
          currentMotion.current = { pagerKey, state };
          setPageMotion({ pagerKey, state });
        }}
        onPageScroll={(event) => {
          if (
            currentPager.current.pagerKey !== pagerKey ||
            currentPager.current.pageListKey !== pageListKey
          )
            return;
          const { position, offset } = event.nativeEvent;
          if (!Number.isInteger(position) || !Number.isFinite(offset)) return;
          if (Math.abs(offset) > 0.001) {
            // 实际移动证明一次新导航已开始；无动画定位不会产生中间 offset。
            pendingPage.current = null;
            if (currentMotion.current.state === 'idle') {
              currentMotion.current = { pagerKey, state: 'settling' };
              setPageMotion({ pagerKey, state: 'settling' });
            }
          } else if (answerIds[position]) {
            const pending = pendingPage.current;
            if (
              pending?.pagerKey === pagerKey &&
              pending.pageListKey === pageListKey
            ) {
              if (position !== pending.index) return;
              pendingPage.current = null;
            }
            nativePage.current = { pagerKey, pageListKey, index: position };
          }
        }}
        onPageSelected={(e) => {
          if (
            currentPager.current.pagerKey !== pagerKey ||
            currentPager.current.pageListKey !== pageListKey
          )
            return;
          const newIndex = e.nativeEvent.position;
          if (!Number.isInteger(newIndex) || !answerIds[newIndex]) return;
          const pending = pendingPage.current;
          if (
            pending?.pagerKey === pagerKey &&
            pending.pageListKey === pageListKey
          ) {
            if (newIndex !== pending.index) return;
            pendingPage.current = null;
          }
          const newId = answerIds[newIndex];
          if (newId) {
            nativePage.current = { pagerKey, pageListKey, index: newIndex };
            selectAnswer(newId);
          }

          // 如果滑到了最后几个，预加载下一页 ID
          if (
            newIndex >= answerIds.length - 3 &&
            hasNextPage &&
            !isFetchingNextPage
          ) {
            fetchNextPage();
          }
        }}
      >
        {answerIds.map((aid, index) => (
          <View key={aid} className="flex-1">
            <AnswerDetailView
              id={aid}
              initialTitle={aid === initialId ? initialTitle : undefined}
              questionId={
                questionIdsByAnswer.get(aid) ||
                (isQuestionSource || aid === initialId
                  ? String(questionId ?? '') || undefined
                  : undefined)
              }
              isFocused={index === currentPage}
              isPreloading={Math.abs(index - currentPage) === 1}
              headerProgress={headerState.headerProgress}
              activeAnswerId={headerState.activeAnswerId}
              activeScrollY={headerState.activeScrollY}
              activeScopeVersion={headerState.activeScopeVersion}
              scopeVersion={headerState.scopeVersion}
              onScroll={(y) => headerState.onScroll(aid, y)}
              onHeaderLayout={(offset) =>
                headerState.onHeaderLayout(aid, offset)
              }
            />
          </View>
        ))}
      </PagerView>
      <ShareMenu
        visible={
          menuTarget?.pagerKey === pagerKey &&
          menuTarget.answerId === currentId &&
          menuTarget.scopeVersion === headerState.scopeVersion
        }
        onClose={() =>
          setMenuTarget((target) =>
            target?.pagerKey === pagerKey &&
            target.answerId === currentId &&
            target.scopeVersion === headerState.scopeVersion
              ? null
              : target,
          )
        }
        type="question"
        data={
          headerQuestionId
            ? {
                id: headerQuestionId,
                title: headerTitle,
              }
            : null
        }
      />
    </View>
  );
}
