import { QueryClient, QueryObserver } from '@tanstack/react-query';
import type { AnswerDetail } from '../api/zhihu/answer';
import { normalizeZhihuAppQuestionFeeds } from '../api/zhihu/questionFeed';
import { RICH_CONTENT_STALE_TIME } from '../features/rich-content/queryPolicy';
import { seedAnswerDetailFromList } from '../utils/contentCache';

jest.mock('../features/rich-content', () =>
  jest.requireActual('../features/rich-content/queryPolicy'),
);
jest.mock('../store/useAuthStore', () => ({
  getAuthSessionVersion: () => 1,
}));

const clients: QueryClient[] = [];
const queryKey = ['answer-detail', 'list-answer'] as const;

function createClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return client;
}

function createAnswer(overrides: Partial<AnswerDetail> = {}): AnswerDetail {
  return {
    id: 'list-answer',
    question: { id: 'question-id', title: '合成问题', type: 'question' },
    author: {
      id: 'author-id',
      name: '合成作者',
      avatar_url: '',
      type: 'people',
    },
    content: '<p data-pid="paragraph-1">完整正文</p>',
    excerpt: '完整正文',
    created_time: 123,
    updated_time: 456,
    voteup_count: 12,
    comment_count: 3,
    favlists_count: 4,
    relationship: { voting: 1, is_favorited: true, is_author: false },
    segment_infos: [
      {
        pid: 'paragraph-1',
        text: '完整正文',
        marks: [
          {
            start_index: 0,
            end_index: 4,
            seg_info: { like_count: 2, comment_count: 1, is_like: true },
          },
        ],
      },
    ],
    link_card_info: { 'https://example.com/article': '合成链接说明' },
    ...overrides,
  };
}

afterEach(() => {
  for (const client of clients) client.clear();
  clients.length = 0;
});

test('preserves full list answer fields and marks the detail seed for background refresh', () => {
  const client = createClient();
  const answer = createAnswer();

  seedAnswerDetailFromList(client, answer);

  expect(client.getQueryData(queryKey)).toEqual({ ...answer, type: 'answer' });
  expect(client.getQueryState(queryKey)?.dataUpdatedAt).toBe(0);
  expect(answer.type).toBeUndefined();
});

test('does not overwrite an existing detail or refresh its timestamp with older list data', () => {
  const client = createClient();
  const existing = createAnswer({
    type: 'answer',
    content: '<p>较新的详情正文</p>',
    voteup_count: 13,
    relationship: { voting: -1, is_favorited: false },
    can_comment: { status: false, reason: '已关闭评论' },
  });
  client.setQueryData(queryKey, existing, { updatedAt: 123_456 });
  const cached = client.getQueryData(queryKey);

  seedAnswerDetailFromList(client, createAnswer());

  expect(client.getQueryData(queryKey)).toBe(cached);
  expect(client.getQueryData(queryKey)).toEqual(existing);
  expect(client.getQueryState(queryKey)?.dataUpdatedAt).toBe(123_456);
});

test.each<[string, Partial<AnswerDetail>]>([
  ['empty body', { content: '' }],
  ['whitespace body', { content: ' \n\t ' }],
  ['paid answer', { answer_type: 'PAID' }],
  ['lowercase paid answer', { answer_type: 'paid' }],
  ['mixed-case paid answer', { answer_type: 'PaId' }],
  ['paid metadata', { paid_info: { has_purchased: true } }],
  ['empty paid metadata', { paid_info: {} }],
  ['truncated body', { content_need_truncated: true }],
  ['missing question', { question: undefined }],
  ['blank identifier', { id: '  ' }],
])('does not seed %s as complete answer detail', (_label, overrides) => {
  const client = createClient();

  seedAnswerDetailFromList(client, createAnswer(overrides));

  expect(client.getQueryCache().getAll()).toHaveLength(0);
});

test('does not promote a guest summary normalized into HTML to full detail', () => {
  const client = createClient();
  const source = createAnswer();
  const normalized = normalizeZhihuAppQuestionFeeds({
    data: [
      {
        type: 'question_feed_card',
        target_type: 'answer',
        target: {
          id: source.id,
          author: source.author,
          question: source.question,
          big_card_summary: '只有摘要',
        },
      },
    ],
  });
  const summary = normalized.data[0];
  expect(summary.content).toContain('只有摘要');
  expect(summary.content_need_truncated).toBe(true);

  seedAnswerDetailFromList(client, summary);

  expect(client.getQueryCache().getAll()).toHaveLength(0);
});

test('shows seeded content immediately while the detail query refreshes metadata in the background', async () => {
  const client = createClient();
  const answer = createAnswer();
  seedAnswerDetailFromList(client, answer);
  let resolveRequest!: (detail: AnswerDetail) => void;
  const request = new Promise<AnswerDetail>((resolve) => {
    resolveRequest = resolve;
  });
  const fetchDetail = jest.fn(() => request);
  const observer = new QueryObserver(client, {
    queryKey,
    queryFn: fetchDetail,
    staleTime: RICH_CONTENT_STALE_TIME,
  });

  expect(observer.getCurrentResult()).toMatchObject({
    data: { ...answer, type: 'answer' },
    status: 'success',
    isLoading: false,
    isPending: false,
  });

  const states: { hasData: boolean; isLoading: boolean }[] = [];
  let resolveRefresh!: () => void;
  const refreshed = new Promise<void>((resolve) => {
    resolveRefresh = resolve;
  });
  const unsubscribe = observer.subscribe((result) => {
    states.push({ hasData: !!result.data, isLoading: result.isLoading });
    if (result.isSuccess && !result.isFetching) resolveRefresh();
  });

  try {
    expect(fetchDetail).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult()).toMatchObject({
      data: { ...answer, type: 'answer' },
      isFetching: true,
      isLoading: false,
    });

    const detail = createAnswer({
      type: 'answer',
      content: '<p>服务器更新后的完整正文</p>',
      can_comment: { status: false, reason: '已关闭评论' },
      is_copyable: false,
    });
    resolveRequest(detail);
    await refreshed;

    expect(observer.getCurrentResult()).toMatchObject({
      data: detail,
      isFetching: false,
      isLoading: false,
    });
    expect(client.getQueryData(queryKey)).toEqual(detail);
    expect(client.getQueryState(queryKey)?.dataUpdatedAt).toBeGreaterThan(0);
    expect(states.length).toBeGreaterThanOrEqual(2);
    expect(states.every((state) => state.hasData && !state.isLoading)).toBe(
      true,
    );
    expect(fetchDetail).toHaveBeenCalledTimes(1);
  } finally {
    unsubscribe();
    observer.destroy();
  }
});
