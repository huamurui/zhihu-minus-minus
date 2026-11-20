import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { getAnswerCommentsV5, getChildCommentsV5 } from '../src/api/zhihu';
import type {
  CommentItem,
  ZhihuCommentResponse,
} from '../src/api/zhihu/comment';
import {
  useCommentListQuery,
  useCommentRepliesQuery,
} from '../src/hooks/useCommentQueries';
import {
  parseParentComment,
  serializeParentComment,
} from '../src/utils/commentRoute';

jest.mock('../src/api/zhihu', () => ({
  getAnswerCommentsV5: jest.fn(),
  getArticleCommentsV5: jest.fn(),
  getQuestionCommentsV5: jest.fn(),
  getPinCommentsV5: jest.fn(),
  getSegmentComments: jest.fn(),
  getChildCommentsV5: jest.fn(),
}));

const comment = (id: string): CommentItem => ({
  id,
  type: 'comment',
  content: '合成评论 100% 与 %20',
  created_time: 1,
  author: {
    member: {
      id: 'author',
      url_token: 'author',
      name: '合成用户',
      avatar_url: '',
    },
  },
  child_comments: [],
  child_comment_count: 0,
});
const page = (ids: string[], next = ''): ZhihuCommentResponse => ({
  data: ids.map(comment),
  paging: {
    is_end: !next,
    is_start: false,
    next,
    previous: '',
    totals: ids.length,
  },
});

function setupClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return {
    client,
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => jest.clearAllMocks());

test('answer comments use V5 sorting and opaque cursors, deduplicate overlaps and stop repeated cursors', async () => {
  jest
    .mocked(getAnswerCommentsV5)
    .mockResolvedValueOnce(
      page(['a'], '/root_comment?end_offset=wrong&offset=next%2Bcursor'),
    )
    .mockResolvedValueOnce(
      page(['a', 'b'], '/root_comment?offset=next%2Bcursor'),
    )
    .mockResolvedValueOnce(page(['latest']));
  const { client, wrapper } = setupClient();
  const host = await renderHook(
    ({ orderBy }: { orderBy: 'score' | 'ts' }) =>
      useCommentListQuery({
        id: 'answer',
        type: 'answer',
        segmentTarget: null,
        orderBy,
      }),
    { initialProps: { orderBy: 'score' as 'score' | 'ts' }, wrapper },
  );
  await waitFor(() => expect(host.result.current.hasNextPage).toBe(true));
  const initialComments = host.result.current.comments;
  await host.rerender({ orderBy: 'score' });
  expect(host.result.current.comments).toBe(initialComments);
  expect(getAnswerCommentsV5).toHaveBeenLastCalledWith(
    'answer',
    20,
    '',
    'score',
  );
  await act(async () => {
    await host.result.current.fetchNextPage();
  });
  await waitFor(() =>
    expect(host.result.current.comments.map((item) => item.id)).toEqual([
      'a',
      'b',
    ]),
  );
  expect(getAnswerCommentsV5).toHaveBeenLastCalledWith(
    'answer',
    20,
    'next%2Bcursor',
    'score',
  );
  expect(host.result.current.hasNextPage).toBe(false);
  await host.rerender({ orderBy: 'ts' });
  await waitFor(() =>
    expect(host.result.current.comments[0]?.id).toBe('latest'),
  );
  expect(getAnswerCommentsV5).toHaveBeenLastCalledWith('answer', 20, '', 'ts');
  await host.unmount();
  client.clear();
});

test('refresh resets only the current thread to the first page and does not refresh all cached pages', async () => {
  jest
    .mocked(getChildCommentsV5)
    .mockResolvedValueOnce(page(['one'], '/replies?offset=20'))
    .mockResolvedValueOnce(page(['two']))
    .mockResolvedValueOnce(page(['new']));
  const { client, wrapper } = setupClient();
  client.setQueryData(['replies', 'other'], {
    pages: [page(['untouched'])],
    pageParams: [''],
  });
  const host = await renderHook(() => useCommentRepliesQuery('root'), {
    wrapper,
  });
  await waitFor(() => expect(host.result.current.hasNextPage).toBe(true));
  await act(async () => {
    await host.result.current.fetchNextPage();
  });
  await waitFor(() => expect(host.result.current.comments).toHaveLength(2));
  await act(async () => {
    await host.result.current.refresh();
  });
  await waitFor(() =>
    expect(host.result.current.comments.map((item) => item.id)).toEqual([
      'new',
    ]),
  );
  expect(
    jest.mocked(getChildCommentsV5).mock.calls.map((call) => call[2]),
  ).toEqual(['', '20', '']);
  expect(client.getQueryData(['replies', 'other'])).toEqual({
    pages: [page(['untouched'])],
    pageParams: [''],
  });
  await host.unmount();
  client.clear();
});

test('reply route preserves already decoded percent signs and rejects malformed or unrelated parent comments', () => {
  expect(
    parseParentComment(serializeParentComment(comment('root'), 1), 'root', 1)
      ?.content,
  ).toBe('合成评论 100% 与 %20');
  for (const parent of [
    'null',
    '{}',
    '{',
    serializeParentComment(comment('other'), 1),
    JSON.stringify({
      sessionVersion: 1,
      comment: { id: 'root', content: 'text', author: {} },
    }),
  ]) {
    expect(parseParentComment(parent, 'root', 1)).toBeNull();
  }
});
