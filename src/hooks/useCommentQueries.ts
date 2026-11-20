import {
  type InfiniteData,
  type QueryKey,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  type AnswerSegmentCommentTarget,
  type CommentItem,
  getAnswerCommentsV5,
  getArticleCommentsV5,
  getChildCommentsV5,
  getCommentStickers,
  getPinCommentsV5,
  getQuestionCommentsV5,
  getSegmentComments,
  type ZhihuCommentResponse,
} from '@/api/zhihu';
import { parseCommentContent } from '@/utils/commentContent';
import { refreshInfiniteQuery } from '@/utils/query';

function containsSticker(content: string | undefined): boolean {
  // HTML may encode the opening bracket with a numeric or a named entity.
  if (!content || !(content.includes('[') || content.includes('&')))
    return false;
  return parseCommentContent(content).some(
    (part) => part.kind === 'placeholder',
  );
}

/** One shared catalogue for comment lists and replies. Plain comments render immediately. */
export function useCommentStickers(
  comments: CommentItem[],
  parent?: CommentItem,
) {
  const parentContent = parent?.content;
  const enabled = useMemo(
    () =>
      containsSticker(parentContent) ||
      comments.some(
        (comment) =>
          containsSticker(comment.content) ||
          comment.child_comments
            ?.slice(0, 2)
            .some((child) => containsSticker(child.content)),
      ),
    [comments, parentContent],
  );
  return useQuery({
    queryKey: ['comment-stickers', '1114161698310770688'],
    queryFn: ({ signal }) => getCommentStickers(signal),
    enabled,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  }).data;
}

// V5 cursors can be opaque strings; preserve their URL encoding for the API.
function nextCommentOffset(page: ZhihuCommentResponse) {
  if (page.paging?.is_end) return undefined;
  const offset = page.paging?.next?.match(/[?&]offset=([^&#]*)/)?.[1];
  return offset || undefined;
}

function useCommentQuery({
  queryKey,
  queryPage,
  enabled = true,
}: {
  queryKey: QueryKey;
  queryPage: (offset: string) => Promise<ZhihuCommentResponse>;
  enabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const query = useInfiniteQuery<
    ZhihuCommentResponse,
    Error,
    InfiniteData<ZhihuCommentResponse, string>,
    QueryKey,
    string
  >({
    queryKey,
    queryFn: ({ pageParam }) => queryPage(pageParam),
    initialPageParam: '',
    enabled,
    getNextPageParam: (lastPage, _pages, _lastOffset, pageParams) => {
      const next = nextCommentOffset(lastPage);
      return next && !pageParams.includes(next) ? next : undefined;
    },
  });
  const pages = query.data?.pages;
  const comments = useMemo(() => {
    const seen = new Set<string>();
    return (pages?.flatMap((page) => page.data || []) || []).filter(
      (comment) => {
        const id = String(comment.id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      },
    );
  }, [pages]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshInfiniteQuery(queryClient, queryKey);
    } finally {
      setRefreshing(false);
    }
  };
  return { ...query, comments, refresh, refreshing };
}

export function useCommentListQuery({
  id,
  type,
  segmentId,
  segmentTarget,
  orderBy,
}: {
  id: string;
  type: string;
  segmentId?: string;
  segmentTarget: AnswerSegmentCommentTarget | null;
  orderBy: 'score' | 'ts';
}) {
  return useCommentQuery({
    queryKey: ['comments', id, type, segmentId, orderBy],
    enabled: Boolean(id) && (segmentId === undefined || segmentTarget !== null),
    queryPage: async (pageParam) => {
      if (segmentId !== undefined) {
        if (!segmentTarget) throw new Error('知识点评论目标无效');
        const offset = Number(pageParam || 0);
        if (!Number.isSafeInteger(offset) || offset < 0)
          throw new Error('知识点评论分页位置无效');
        const response = await getSegmentComments(
          segmentTarget.answerId,
          segmentTarget.segmentIds.join(','),
          offset,
        );
        return {
          data: response.data || [],
          paging: response.paging || {
            is_end: true,
            is_start: true,
            next: '',
            previous: '',
            totals: response.data?.length || 0,
          },
        };
      }
      const fetchComments =
        type === 'question'
          ? getQuestionCommentsV5
          : type === 'article'
            ? getArticleCommentsV5
            : type === 'pin'
              ? getPinCommentsV5
              : getAnswerCommentsV5;
      return fetchComments(id, 20, pageParam, orderBy);
    },
  });
}

export function useCommentRepliesQuery(id: string) {
  return useCommentQuery({
    queryKey: ['replies', id],
    enabled: Boolean(id),
    queryPage: (offset) => getChildCommentsV5(id, 20, offset),
  });
}
