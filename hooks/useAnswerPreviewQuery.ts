import {
  skipToken,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useMemo, useRef } from 'react';
import { type AnswerDetail, getAnswer } from '@/api/zhihu/answer';
import {
  buildZhihuNextRenderUrl,
  getAnswerPreviewContinuation,
  getNextRender,
  type ZhihuNextRenderScene,
  type ZhihuPlainPreviewAnswer,
  type ZhihuReadingPreviewItem,
} from '@/api/zhihu/nextRender';
import {
  getRichContentQueryKey,
  hasReusableAnswerDetail,
} from '@/features/rich-content';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { getAnswerEndorsementsKey } from '@/utils/answerEndorsements';
import {
  createAnswerPreviewEntry,
  getAnswerPreviewEntryKey,
} from '@/utils/answerPreviewEntry';

export interface AnswerPreviewQueryOptions {
  answerId: string;
  scene?: ZhihuNextRenderScene;
  questionId?: string;
  sessionId?: string;
  cursor?: string;
  enabled?: boolean;
}

export function useAnswerPreviewQuery({
  answerId,
  scene = 'unknown',
  questionId = '',
  sessionId = '',
  cursor = '',
  enabled = true,
}: AnswerPreviewQueryOptions) {
  const sessionVersion = useAuthStore(() => getAuthSessionVersion());
  const queryClient = useQueryClient();
  const openingSession = useRef(sessionVersion);
  const currentSelection = useRef({ answerId, sessionVersion });
  currentSelection.current = { answerId, sessionVersion };
  const initialUrl = useMemo(
    () =>
      buildZhihuNextRenderUrl({
        id: answerId,
        type: 'answer',
        context_expand: 1,
        is_native: 1,
        ...(scene === 'question_feed'
          ? {
              scenes: scene,
              collection_id: questionId,
              collection_type: 'question',
              question_feed_session_id: sessionId,
              question_feed_cursor: cursor,
            }
          : { scenes: scene }),
      }),
    [answerId, scene, questionId, sessionId, cursor],
  );
  const queryKey = useMemo(
    () => ['answer-preview-list', initialUrl, sessionVersion] as const,
    [initialUrl, sessionVersion],
  );
  const selectedQueryKey = useMemo(
    () => getAnswerPreviewEntryKey(answerId, sessionVersion),
    [answerId, sessionVersion],
  );
  const cachedEndorsements = useQuery<readonly unknown[]>({
    queryKey: getAnswerEndorsementsKey(answerId, sessionVersion),
    queryFn: skipToken,
    enabled: false,
    staleTime: Infinity,
  });
  const initialEntry = useMemo(() => {
    const entry =
      queryClient.getQueryData<ZhihuPlainPreviewAnswer>(selectedQueryKey);
    if (entry?.id === answerId) return entry;
    // Canonical detail keys predate session-aware preview keys. Do not reuse
    // one while this observer is crossing an account boundary.
    if (openingSession.current !== sessionVersion) return undefined;
    const detail = queryClient.getQueryData<AnswerDetail>(
      getRichContentQueryKey('answers', answerId),
    );
    if (
      !detail ||
      !hasReusableAnswerDetail({ ...detail, type: detail.type ?? 'answer' })
    )
      return undefined;
    const cachedEntry = createAnswerPreviewEntry(detail);
    return cachedEntry?.id === answerId ? cachedEntry : undefined;
  }, [queryClient, selectedQueryKey, answerId, sessionVersion]);
  const selected = useQuery({
    queryKey: selectedQueryKey,
    queryFn: async ({ signal }) => {
      if (getAuthSessionVersion() !== sessionVersion)
        throw new Error('登录状态已变化');
      const detail = await getAnswer(answerId, undefined, { signal });
      if (getAuthSessionVersion() !== sessionVersion)
        throw new Error('登录状态已变化');
      const entry = createAnswerPreviewEntry(detail);
      if (entry?.id !== answerId) throw new Error('回答正文返回结构无效');
      const previous =
        queryClient.getQueryData<ZhihuPlainPreviewAnswer>(selectedQueryKey);
      if (
        entry.endorsements === undefined &&
        previous?.id === answerId &&
        Array.isArray(previous.endorsements)
      ) {
        return { ...entry, endorsements: previous.endorsements };
      }
      return entry;
    },
    initialData: initialEntry,
    enabled: enabled && Boolean(answerId) && !initialEntry,
    staleTime: Infinity,
  });
  const refetchSelected = useCallback(() => {
    if (
      currentSelection.current.answerId !== answerId ||
      currentSelection.current.sessionVersion !== sessionVersion ||
      getAuthSessionVersion() !== sessionVersion
    )
      return Promise.resolve(undefined);
    return selected.refetch();
  }, [answerId, sessionVersion, selected.refetch]);
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      getNextRender(pageParam, { signal, sessionVersion }),
    initialPageParam: initialUrl,
    getNextPageParam: (_latest, pages, _latestParam, pageParams) =>
      getAnswerPreviewContinuation(pages, pageParams).next,
    enabled: enabled && Boolean(answerId),
    staleTime: 5 * 60 * 1000,
  });
  const selectedAnswer = useMemo(() => {
    if (
      !selected.data ||
      selected.data.endorsements !== undefined ||
      sessionVersion !== getAuthSessionVersion()
    )
      return selected.data;
    let endorsements: readonly unknown[] | undefined;
    for (const page of query.data?.pages ?? []) {
      for (const item of page.data) {
        if (
          item.type === 'answer' &&
          item.id === answerId &&
          Array.isArray(item.endorsements)
        )
          endorsements = item.endorsements;
      }
    }
    if (endorsements === undefined) endorsements = cachedEndorsements.data;
    return endorsements === undefined
      ? selected.data
      : { ...selected.data, endorsements };
  }, [
    selected.data,
    query.data,
    cachedEndorsements.data,
    answerId,
    sessionVersion,
  ]);
  const items = useMemo<ZhihuReadingPreviewItem[]>(() => {
    const latestItems = new Map<
      string,
      NonNullable<typeof query.data>['pages'][number]['data'][number]
    >();
    for (const page of query.data?.pages ?? [])
      for (const item of page.data) {
        if (item.type === 'answer' && item.id === answerId) continue;
        latestItems.set(`${item.type}:${item.id}`, item);
      }
    if (!selectedAnswer) return [...latestItems.values()];
    return [selectedAnswer, ...latestItems.values()];
  }, [query.data, selectedAnswer, answerId]);
  const paginationError = query.data
    ? getAnswerPreviewContinuation(query.data.pages, query.data.pageParams)
        .error
    : undefined;
  return {
    ...query,
    items,
    queryKey,
    sessionVersion,
    paginationError,
    selectedAnswer,
    selectedQueryKey,
    selectedIsPending: selected.isPending,
    selectedIsError: selected.isError,
    selectedError: selected.error,
    selectedIsRefetching: selected.isRefetching,
    refetchSelected,
  };
}
