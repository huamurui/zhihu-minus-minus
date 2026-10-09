import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import apiClient from '../api/client';
import {
  buildZhihuNextRenderUrl,
  getAnswerPreviewContinuation,
  getNextContentRender,
  getNextRender,
  getStructuredContentContinuation,
  normalizeZhihuAnswerPreviewPage,
  validateZhihuRenderUrl,
} from '../api/zhihu/nextRender';
import { compileZhihuDocument } from '../features/rich-content/compileRichText';
import {
  decodeRichContentDevFixture,
  parseRichContentFixtureManifest,
} from '../features/rich-content/dev/fixtureDecoder';
import nextRenderCollectionFixture from '../features/rich-content/fixtures/cases/next-render-collection-card-ordered-001.json';
import nextRenderSegLikeFixture from '../features/rich-content/fixtures/cases/next-render-seg-like-001.json';
import richContentManifest from '../features/rich-content/fixtures/manifest.json';
import {
  mergeStructuredContentPages,
  normalizeZhihuStructuredContent,
  parseStructuredContentPaging,
} from '../features/rich-content/structuredContent';
import { useAnswerPreviewBody } from '../hooks/useAnswerPreviewBody';
import {
  type AnswerPreviewQueryOptions,
  useAnswerPreviewQuery,
} from '../hooks/useAnswerPreviewQuery';
import { useAuthStore } from '../store/useAuthStore';
import type { ZhihuStructuredContent } from '../types/zhihu';
import { seedAnswerEndorsements } from '../utils/answerEndorsements';
import {
  createAnswerPreviewEntry,
  getAnswerPreviewEntryKey,
  seedAnswerPreviewEntry,
} from '../utils/answerPreviewEntry';

jest.mock('../api/client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock('../features/rich-content', () => ({
  ...jest.requireActual('../features/rich-content/structuredContent'),
  ...jest.requireActual('../features/rich-content/queryPolicy'),
}));

let mockSessionVersion = 1;
jest.mock('../store/useAuthStore', () => {
  const { create } = jest.requireActual('zustand');
  return {
    getAuthSessionVersion: () => mockSessionVersion,
    useAuthStore: create(() => ({ cookies: null })),
  };
});

const OUTER_NEXT =
  'https://api.zhihu.com/next-render?id=answer-a&session_id=synthetic-session&question_feed_cursor=opaque%2Bcursor&page_id=172&limit=5';
const INNER_NEXT =
  'https://api.zhihu.com/next-content-render?offset=20&url_token=answer-a&content_type=answer&version_id=10000000000000000001';
const params = {
  id: '10000000000000000001',
  type: 'answer',
  scenes: 'question_feed',
  collection_id: '10000000000000000002',
  collection_type: 'question',
  question_feed_session_id: '',
  question_feed_cursor: '',
  context_expand: 1,
  is_native: 1,
} as const;

function content(
  ids: string[],
  next = '',
  bodyText = '合成正文',
): ZhihuStructuredContent {
  return {
    paging: JSON.stringify({
      is_end: !next,
      is_start: true,
      next,
      previous: '',
      totals: 0,
    }),
    segments: ids.map((id) => ({
      id,
      type: 'paragraph',
      paragraph: { pid: `${id}-pid`, text: bodyText, marks: [] },
    })),
  };
}

function answer(id: string = params.id, body: unknown = content(['p1'])) {
  return {
    id,
    type: 'answer',
    question: { id: params.collection_id, title: '合成问题' },
    author: {
      id: 'synthetic-author',
      fullname: '合成作者',
      url_token: 'synthetic-author-token',
      avatar: { avatar_image: { day: 'https://example.invalid/avatar.png' } },
      description: '合成签名',
    },
    excerpt: '合成摘要',
    reaction: {
      statistics: { up_vote_count: 7, comment_count: 3, favorites: 2 },
      relation: { vote: 'Up', faved: true, is_author: false },
    },
    structured_content: body,
  };
}

function response(data: unknown[], next = '') {
  return {
    data,
    paging: { is_end: !next, is_start: true, next, previous: '', totals: 0 },
  };
}

function plainAnswer(id: string, body = '<p>合成普通正文</p>') {
  return {
    ...answer(id),
    author: {
      id: 'synthetic-author',
      name: '合成作者',
      url_token: 'synthetic-author-token',
      avatar_url: 'https://example.invalid/avatar.png',
    },
    content: body,
    answer_type: 'NORMAL',
    content_need_truncated: false,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(apiClient.get).mockReset();
  mockSessionVersion = 1;
  useAuthStore.setState({ cookies: null });
});

test('normalizes usable answers and login prompts while skipping broken bodies and retaining unknown block text', () => {
  const page = normalizeZhihuAnswerPreviewPage(
    response(
      [
        answer('missing', null),
        answer(),
        answer('invalid-paging', { ...content(['bad']), paging: 'not-json' }),
        { id: 'login-prompt', type: 'login_prompt', description: '登录后继续' },
        answer('unsupported', {
          ...content([]),
          segments: [
            { id: 'unknown', type: 'unobserved-node', text: '保留正文' },
          ],
        }),
      ],
      OUTER_NEXT,
    ),
  );
  expect(page.data[0]).toMatchObject({
    id: params.id,
    author: {
      name: '合成作者',
      avatar_url: 'https://example.invalid/avatar.png',
    },
    question: { id: params.collection_id, title: '合成问题' },
    voteup_count: 7,
    relationship: { voting: 1, is_favorited: true },
    structuredContent: { segments: [{ id: 'p1' }] },
  });
  expect(page.data[1]).toEqual({
    id: 'login-prompt',
    type: 'login_prompt',
    description: '登录后继续',
  });
  expect(page.data[2]).toMatchObject({
    id: 'unsupported',
    structuredContent: {
      segments: [
        { id: 'unknown', type: 'unsupported', fallbackText: '保留正文' },
      ],
    },
  });
  expect(getAnswerPreviewContinuation([page], [])).toEqual({
    next: OUTER_NEXT,
  });
  const emptyPage = normalizeZhihuAnswerPreviewPage(
    response([answer('missing', null)], OUTER_NEXT),
  );
  expect(emptyPage.data).toEqual([]);
  expect(emptyPage.paging.next).toBe(OUTER_NEXT);
  // Preserve the no-progress guard rather than repeatedly fetching unusable pages.
  expect(getAnswerPreviewContinuation([emptyPage], [])).toEqual({
    error: '回答分页没有新增回答，已停止继续加载',
  });
  expect(() =>
    normalizeZhihuAnswerPreviewPage({ ...response([answer()]), paging: null }),
  ).toThrow('回答预览返回结构无效');
});

test('retains plural label metadata across structured and clicked plain answer previews', () => {
  const endorsements = [
    {
      action_url: 'https://www.zhihu.com/column/synthetic-column',
      elements: [
        { type: 'IMAGE', image_key: 'zhicon_icon_24_column_fill' },
        { type: 'TEXT', content: '收录于 · 合成专栏' },
      ],
    },
  ];
  const structuredPage = normalizeZhihuAnswerPreviewPage(
    response([{ ...answer('structured-labels'), endorsements }]),
  );
  expect(structuredPage.data[0]).toMatchObject({
    id: 'structured-labels',
    endorsements,
  });
  const plain = createAnswerPreviewEntry({
    id: 'plain-labels',
    content: '<p>合成普通正文</p>',
    endorsements,
  });
  expect(plain?.endorsements).toBe(endorsements);
  const client = new QueryClient();
  seedAnswerPreviewEntry(client, {
    id: 'plain-labels',
    content: '<p>合成普通正文</p>',
    endorsements,
  });
  expect(
    client.getQueryData(getAnswerPreviewEntryKey('plain-labels', 1)),
  ).toMatchObject({ endorsements });
  expect(
    client.getQueryData(['answer-detail', 'plain-labels']),
  ).toBeUndefined();
  client.clear();

  const malformedPage = normalizeZhihuAnswerPreviewPage(
    response([{ ...answer('malformed-labels'), endorsements: {} }]),
  );
  expect(malformedPage.data[0]).not.toHaveProperty('endorsements');
  expect(
    createAnswerPreviewEntry({
      id: 'plain-invalid-labels',
      content: '<p>合成正文</p>',
      endorsements: '无效标签',
    }),
  ).not.toHaveProperty('endorsements');
  expect(
    createAnswerPreviewEntry({ id: 'thin-labels', endorsements }),
  ).toBeUndefined();
});

test('renders all captured answers with seg_like annotations without losing prose, bold marks or paging boundaries', () => {
  const source = nextRenderSegLikeFixture;
  const original = JSON.stringify(source);
  const page = normalizeZhihuAnswerPreviewPage(source);
  const answers = page.data.filter((item) => item.type === 'answer');
  expect(answers).toHaveLength(5);
  expect(
    answers.map((item) => item.structuredContent?.segments.length),
  ).toEqual([2, 11, 8, 10, 8]);
  expect(page.paging.is_end).toBe(false);
  expect(getAnswerPreviewContinuation([page], [])).toEqual({
    next: source.paging.next,
  });
  let retainedBoldMarks = 0;
  let annotationMarks = 0;
  for (const [index, item] of answers.entries()) {
    const body = item.structuredContent;
    if (!body) throw new Error('Expected renderable captured answer');
    const rawSegments = source.data[index].structured_content.segments;
    for (const [segmentIndex, segment] of body.segments.entries()) {
      if (segment.type !== 'paragraph')
        throw new Error('Expected captured paragraph');
      const raw = rawSegments[segmentIndex].paragraph;
      expect(segment.paragraph.text).toBe(raw.text);
      expect(segment.paragraph.marks).toEqual(raw.marks);
      annotationMarks += raw.marks.filter(
        (mark) => mark.type === 'seg_like',
      ).length;
      retainedBoldMarks += segment.paragraph.marks.filter(
        (mark) => mark.type === 'bold',
      ).length;
    }
    const document = normalizeZhihuStructuredContent(body, {
      documentId: `captured-answer:${item.id}`,
    });
    const compilation = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 25.5,
    });
    expect(compilation.diagnostics).toEqual([]);
    expect(
      compilation.parts
        .flatMap((part) => (part.type === 'flow' ? [part.flow.text] : []))
        .join('\n'),
    ).toBe(rawSegments.map((segment) => segment.paragraph.text).join('\n'));
    const paging = parseStructuredContentPaging(body.paging);
    expect(paging.is_end).toBe(true);
    expect(paging.next).not.toBe('');
    expect(getStructuredContentContinuation([body], [])).toEqual({});
  }
  expect(annotationMarks).toBe(4);
  expect(retainedBoldMarks).toBe(6);
  const summary = parseRichContentFixtureManifest(richContentManifest).find(
    (entry) => entry.id === 'next-render-seg-like-001',
  );
  if (!summary) throw new Error('Expected registered next-render fixture');
  const devFixture = decodeRichContentDevFixture(summary, source);
  expect(devFixture.structuredContent).toEqual(answers[0].structuredContent);
  expect(devFixture.content).toBe('');
  expect(devFixture.objectId).toBe(source.data[0].id);
  expect(devFixture.rendererType).toBe('answer');
  expect(JSON.stringify(source)).toBe(original);
  const collectionPage = normalizeZhihuAnswerPreviewPage(
    nextRenderCollectionFixture,
  );
  expect(collectionPage.data).toHaveLength(5);
  let cards = 0;
  let orderedLists = 0;
  for (const item of collectionPage.data) {
    if (item.type !== 'answer')
      throw new Error('Expected captured collection answer');
    const document = normalizeZhihuStructuredContent(item.structuredContent);
    for (const block of document.blocks) {
      if (block.type === 'linkCard') {
        cards += 1;
        expect(block.title).toBe('合成课程卡片');
        expect(block.url).toBe(
          'https://www.zhihu.com/xen/market/remix/paid_column/10000000000000000998',
        );
      }
      if (block.type === 'list' && block.ordered) {
        orderedLists += 1;
        expect(block.items).toHaveLength(6);
      }
    }
    expect(
      compileZhihuDocument(document, { fontSize: 17, lineHeight: 25.5 })
        .diagnostics,
    ).toEqual([]);
  }
  expect(cards).toBe(1);
  expect(orderedLists).toBe(1);
  expect(apiClient.get).not.toHaveBeenCalled();
});

test('requests complete server continuation URLs with stable headers and refuses other origins or endpoints', async () => {
  const initial = new URL(buildZhihuNextRenderUrl(params));
  expect(initial.searchParams.get('id')).toBe(params.id);
  expect(initial.searchParams.get('question_feed_session_id')).toBe('');
  expect(initial.searchParams.get('question_feed_cursor')).toBe('');
  expect(
    new URL(
      buildZhihuNextRenderUrl({
        id: params.id,
        type: 'answer',
        context_expand: 1,
        is_native: 1,
      }),
    ).searchParams.get('scenes'),
  ).toBe('unknown');
  for (const scene of ['unknown', 'recommend', 'profile_answer'] as const) {
    const sceneUrl = new URL(
      buildZhihuNextRenderUrl({ ...params, scenes: scene }),
    );
    expect(Object.fromEntries(sceneUrl.searchParams)).toEqual({
      id: params.id,
      type: 'answer',
      scenes: scene,
      context_expand: '1',
      is_native: '1',
    });
  }
  const get = jest.mocked(apiClient.get);
  get.mockResolvedValueOnce({ data: response([answer()]) });
  await getNextRender(OUTER_NEXT);
  expect(get).toHaveBeenLastCalledWith(OUTER_NEXT, {
    signal: undefined,
    headers: { 'x-api-version': '3.0.93', 'x-page-id': '172' },
  });
  get.mockResolvedValueOnce({ data: content(['p2']) });
  expect(await getNextContentRender(INNER_NEXT)).toEqual(content(['p2']));
  expect(get).toHaveBeenLastCalledWith(INNER_NEXT, expect.any(Object));
  const requestCount = get.mock.calls.length;
  for (const url of [
    'https://example.invalid/next-content-render',
    'http://api.zhihu.com/next-content-render',
    'https://api.zhihu.com/answers/1',
    'https://user:password@api.zhihu.com/next-content-render',
  ])
    await expect(getNextContentRender(url)).rejects.toThrow('分页地址无效');
  expect(get).toHaveBeenCalledTimes(requestCount);
});

test('keeps the two pagination layers separate and detects loops or unchanged pages while honoring completion first', () => {
  const firstOuter = normalizeZhihuAnswerPreviewPage(
    response([answer('answer-a')], OUTER_NEXT),
  );
  expect(getAnswerPreviewContinuation([firstOuter], [])).toEqual({
    next: OUTER_NEXT,
  });
  expect(
    getAnswerPreviewContinuation([firstOuter], [OUTER_NEXT]),
  ).toMatchObject({ error: expect.stringContaining('重复') });
  const duplicateOuter = normalizeZhihuAnswerPreviewPage(
    response([answer('answer-a')], `${OUTER_NEXT}&page=2`),
  );
  expect(
    getAnswerPreviewContinuation([firstOuter, duplicateOuter], []),
  ).toMatchObject({ error: expect.stringContaining('没有新增') });

  const firstInner = content(['p1'], INNER_NEXT);
  expect(getStructuredContentContinuation([firstInner], [])).toEqual({
    next: INNER_NEXT,
  });
  expect(
    getStructuredContentContinuation([firstInner], [INNER_NEXT]),
  ).toMatchObject({ error: expect.stringContaining('重复') });
  const duplicateInner = content(['p1'], `${INNER_NEXT}&page=2`);
  expect(
    getStructuredContentContinuation([firstInner, duplicateInner], []),
  ).toMatchObject({ error: expect.stringContaining('没有新增或更新') });
  const updatedInner = content(
    ['p1', 'p2'],
    `${INNER_NEXT}&page=2`,
    '更新正文',
  );
  expect(
    getStructuredContentContinuation([firstInner, updatedInner], []),
  ).toEqual({ next: `${INNER_NEXT}&page=2` });
  expect(
    mergeStructuredContentPages([firstInner, updatedInner]).segments.map(
      (segment) => segment.id,
    ),
  ).toEqual(['p1', 'p2']);
  const ended = content(['p1']);
  ended.paging = JSON.stringify({
    is_end: true,
    is_start: false,
    next: 'https://example.invalid/ignored',
    previous: '',
    totals: 0,
  });
  expect(getStructuredContentContinuation([ended], [])).toEqual({});
});

test('the preview hook follows server cursors and isolates explicit scene and account contexts', async () => {
  const get = jest.mocked(apiClient.get);
  const feedResponses = [
    response([answer('answer-a')], OUTER_NEXT),
    response([answer('answer-b')]),
    response([answer('new-account-answer')]),
  ];
  get.mockImplementation(async (url) => {
    const pathname = new URL(String(url), 'https://api.zhihu.com').pathname;
    if (pathname.startsWith('/answers/'))
      return {
        data: plainAnswer(decodeURIComponent(pathname.split('/').at(-1) ?? '')),
      };
    const data = feedResponses.shift();
    if (!data) throw new Error('Unexpected synthetic feed request');
    return { data };
  });
  const feedCalls = () =>
    get.mock.calls.filter(
      ([url]) =>
        new URL(String(url), 'https://api.zhihu.com').pathname ===
        '/next-render',
    );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const options: AnswerPreviewQueryOptions = {
    answerId: 'answer-a',
    questionId: 'question-a',
  };
  const host = await renderHook(useAnswerPreviewQuery, {
    initialProps: options,
    wrapper,
  });
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  expect(
    Object.fromEntries(new URL(String(feedCalls()[0][0])).searchParams),
  ).toEqual({
    id: options.answerId,
    type: 'answer',
    scenes: 'unknown',
    context_expand: '1',
    is_native: '1',
  });
  await act(async () => {
    await host.result.current.fetchNextPage();
  });
  expect(feedCalls()[1][0]).toBe(OUTER_NEXT);
  await waitFor(() =>
    expect(host.result.current.items.map((item) => item.id)).toEqual([
      'answer-a',
      'answer-b',
    ]),
  );
  await act(async () => {
    mockSessionVersion = 2;
    useAuthStore.setState({ cookies: 'synthetic-new-session' });
  });
  await waitFor(() => {
    expect(host.result.current.items.map((item) => item.id)).toEqual([
      'answer-a',
      'new-account-answer',
    ]);
  });
  expect(host.result.current.queryKey[2]).toBe(2);

  const unknownKey = host.result.current.queryKey;
  const unknownRequestCount = get.mock.calls.length;
  await host.rerender({
    ...options,
    questionId: 'other-question',
    sessionId: 'synthetic-session',
    cursor: 'synthetic-cursor',
  });
  expect(host.result.current.queryKey).toEqual(unknownKey);
  expect(get).toHaveBeenCalledTimes(unknownRequestCount);

  feedResponses.push(response([answer('recommend-answer')]));
  await host.rerender({ ...options, scene: 'recommend' });
  await waitFor(() =>
    expect(
      host.result.current.items.some((item) => item.id === 'recommend-answer'),
    ).toBe(true),
  );
  expect(
    new URL(host.result.current.queryKey[1]).searchParams.get('scenes'),
  ).toBe('recommend');
  expect(host.result.current.queryKey).not.toEqual(unknownKey);

  feedResponses.push(response([answer('profile-answer')]));
  await host.rerender({ ...options, scene: 'profile_answer' });
  await waitFor(() =>
    expect(
      host.result.current.items.some((item) => item.id === 'profile-answer'),
    ).toBe(true),
  );
  const profileKey = host.result.current.queryKey;
  expect(new URL(profileKey[1]).searchParams.get('scenes')).toBe(
    'profile_answer',
  );
  const profileRequestCount = get.mock.calls.length;
  await host.rerender({
    ...options,
    scene: 'profile_answer',
    questionId: 'other-question',
    sessionId: 'synthetic-session',
    cursor: 'synthetic-cursor',
  });
  expect(host.result.current.queryKey).toEqual(profileKey);
  expect(get).toHaveBeenCalledTimes(profileRequestCount);

  feedResponses.push(response([answer('question-answer')]));
  await host.rerender({
    ...options,
    scene: 'question_feed',
    questionId: 'other-question',
    sessionId: 'synthetic-session',
    cursor: 'synthetic-cursor',
  });
  await waitFor(() =>
    expect(
      host.result.current.items.some((item) => item.id === 'question-answer'),
    ).toBe(true),
  );
  expect(
    Object.fromEntries(new URL(host.result.current.queryKey[1]).searchParams),
  ).toEqual({
    id: options.answerId,
    type: 'answer',
    scenes: 'question_feed',
    collection_id: 'other-question',
    collection_type: 'question',
    question_feed_session_id: 'synthetic-session',
    question_feed_cursor: 'synthetic-cursor',
    context_expand: '1',
    is_native: '1',
  });
  await host.unmount();
  client.clear();
});

test('a response arriving after the login session changes is rejected before normalization', async () => {
  let finish: (value: { data: unknown }) => void = () => undefined;
  jest.mocked(apiClient.get).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const request = getNextRender(params, { sessionVersion: 1 });
  mockSessionVersion = 2;
  finish({ data: response([answer()]) });
  await expect(request).rejects.toThrow('登录状态已变化');
});

test('refreshes loaded body reactions without resetting the first page and rejects recycled or expired callbacks', async () => {
  const secondPage = (liked: boolean): ZhihuStructuredContent => ({
    ...content([]),
    segments: [
      {
        id: 'p2',
        type: 'paragraph',
        paragraph: {
          pid: 'p2-pid',
          text: '合成正文',
          marks: [
            {
              type: 'seg_like',
              start_index: 0,
              end_index: 4,
              seg_like: {
                is_like: liked,
                count: liked ? 1 : 0,
                comment_count: 0,
                is_span: false,
                my_comment_count: 0,
                seg_ids: ['synthetic-segment'],
              },
            },
          ],
        },
      },
    ],
  });
  const get = jest.mocked(apiClient.get);
  get.mockResolvedValueOnce({ data: secondPage(false) });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const initialContent = content(['p1'], INNER_NEXT);
  const onRefresh = jest.fn();
  const options = {
    scope: 'scope-a',
    answerId: 'answer-a',
    sessionVersion: 1,
    sourceId: 1,
    initialContent,
    onRefresh,
  };
  const host = await renderHook(useAnswerPreviewBody, {
    initialProps: options,
    wrapper,
  });
  const oldExpand = host.result.current.onExpandedChange;
  const oldLoadMore = host.result.current.loadMore;
  const oldAutoLoadMore = host.result.current.autoLoadMore;
  expect(oldAutoLoadMore).toBeDefined();
  await act(async () => {
    const request = oldAutoLoadMore?.();
    oldExpand(true);
    await request;
  });
  await waitFor(() =>
    expect(
      host.result.current.content.segments.map((segment) => segment.id),
    ).toEqual(['p1', 'p2']),
  );
  expect(host.result.current.hasMore).toBe(false);
  expect(host.result.current.autoLoadMore).toBeUndefined();
  expect(get).toHaveBeenCalledTimes(1);

  get.mockResolvedValueOnce({ data: secondPage(true) });
  const oldRefresh = host.result.current.refresh;
  await act(async () => oldRefresh());
  await waitFor(() => {
    const segment = host.result.current.content.segments[1];
    expect(segment.type).toBe('paragraph');
    if (segment.type === 'paragraph')
      expect(segment.paragraph.marks[0]).toMatchObject({
        seg_like: { is_like: true, count: 1 },
      });
  });
  expect(
    client.getQueryData<{ pages: ZhihuStructuredContent[] }>([
      'answer-preview-content',
      1,
      'answer-a',
      1,
    ])?.pages[0],
  ).toBe(initialContent);
  expect(onRefresh).toHaveBeenCalledTimes(1);

  get.mockRejectedValueOnce({ response: { status: 400 } });
  await act(async () => host.result.current.refresh());
  await waitFor(() => expect(host.result.current.loadMoreError).toBeTruthy());
  expect(host.result.current.hasMore).toBe(false);
  expect(host.result.current.loadMore).toBeDefined();
  expect(host.result.current.autoLoadMore).toBeUndefined();
  expect(host.result.current.content.segments).toHaveLength(2);
  expect(onRefresh).toHaveBeenCalledTimes(2);
  get.mockResolvedValueOnce({ data: secondPage(true) });
  await act(async () => host.result.current.loadMore?.());
  await waitFor(() =>
    expect(host.result.current.loadMoreError).toBeUndefined(),
  );
  expect(onRefresh).toHaveBeenCalledTimes(3);

  get.mockResolvedValueOnce({
    data: { ...secondPage(true), paging: initialContent.paging },
  });
  await act(async () => host.result.current.refresh());
  await waitFor(() =>
    expect(host.result.current.loadMoreError).toContain('重复'),
  );
  expect(host.result.current.autoLoadMore).toBeUndefined();
  expect(host.result.current.loadMore).toBeDefined();
  get.mockResolvedValueOnce({ data: secondPage(true) });
  await act(async () => host.result.current.loadMore?.());
  await waitFor(() =>
    expect(host.result.current.loadMoreError).toBeUndefined(),
  );
  const refreshCount = onRefresh.mock.calls.length;
  expect(refreshCount).toBe(5);

  let finish: (value: { data: unknown }) => void = () => undefined;
  get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let pendingRefresh: Promise<void> = Promise.resolve();
  await act(async () => {
    pendingRefresh = host.result.current.refresh();
  });
  await waitFor(() => expect(host.result.current.isLoadingMore).toBe(true));
  const requestCount = get.mock.calls.length;
  const nextContent = content(['other-p1'], INNER_NEXT);
  await host.rerender({
    ...options,
    scope: 'scope-b',
    answerId: 'answer-b',
    sourceId: 2,
    initialContent: nextContent,
  });
  await act(async () => {
    finish({ data: secondPage(false) });
    await pendingRefresh;
    await oldRefresh();
    oldExpand(true);
    oldLoadMore?.();
    await oldAutoLoadMore?.();
  });
  expect(get).toHaveBeenCalledTimes(requestCount);
  expect(onRefresh).toHaveBeenCalledTimes(refreshCount);
  expect(
    host.result.current.content.segments.map((segment) => segment.id),
  ).toEqual(['other-p1']);
  const nextAutoLoadMore = host.result.current.autoLoadMore;
  expect(nextAutoLoadMore).toBeDefined();
  get.mockRejectedValueOnce(new Error('synthetic-body-next-page-failure'));
  await act(async () => {
    await nextAutoLoadMore?.();
  });
  await waitFor(() => expect(host.result.current.loadMoreError).toBeTruthy());
  expect(host.result.current.autoLoadMore).toBeUndefined();
  expect(host.result.current.loadMore).toBeDefined();
  const failedRequestCount = get.mock.calls.length;
  await act(async () => {
    await nextAutoLoadMore?.();
  });
  expect(get).toHaveBeenCalledTimes(failedRequestCount);
  get.mockResolvedValueOnce({ data: secondPage(false) });
  await act(async () => host.result.current.loadMore?.());
  await waitFor(() =>
    expect(host.result.current.content.segments).toHaveLength(2),
  );
  expect(host.result.current.loadMoreError).toBeUndefined();
  expect(host.result.current.autoLoadMore).toBeUndefined();
  const completedRequestCount = get.mock.calls.length;
  await act(async () => {
    mockSessionVersion = 2;
    await host.result.current.refresh();
    host.result.current.onExpandedChange(true);
    host.result.current.loadMore?.();
    await nextAutoLoadMore?.();
  });
  expect(get).toHaveBeenCalledTimes(completedRequestCount);
  expect(onRefresh).toHaveBeenCalledTimes(refreshCount);
  await host.unmount();
  client.clear();
});

test('uses labels from a thin clicked source without seeding its body or requiring it in the first preview page', async () => {
  const get = jest.mocked(apiClient.get);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const selectedId = 'thin-selected-labels';
  const endorsements = [
    { elements: [{ type: 'TEXT', content: '合成无正文来源标签' }] },
  ];
  seedAnswerEndorsements(client, { id: selectedId, endorsements });
  expect(client.getQueryData(['answer-detail', selectedId])).toBeUndefined();
  expect(
    client.getQueryData(getAnswerPreviewEntryKey(selectedId, 1)),
  ).toBeUndefined();
  get.mockImplementation(async (url) => ({
    data: String(url).startsWith('/answers/')
      ? plainAnswer(selectedId, '<p>合成接口获取正文</p>')
      : response([answer('first-page-other-answer')]),
  }));
  const host = await renderHook(useAnswerPreviewQuery, {
    initialProps: { answerId: selectedId },
    wrapper,
  });
  await waitFor(() =>
    expect(host.result.current.selectedAnswer).toMatchObject({
      content: '<p>合成接口获取正文</p>',
      endorsements,
    }),
  );
  expect(get).toHaveBeenCalledTimes(2);
  expect(client.getQueryData(['answer-detail', selectedId])).toBeUndefined();
  await host.unmount();
  client.clear();
});

test('uses matching preview page labels without replacing the selected body and honors empty detail labels and account scope', async () => {
  const get = jest.mocked(apiClient.get);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const selectedId = 'selected-labels-answer';
  const initialBody = '<p>合成所选正文</p>';
  const pageLabels = [
    { elements: [{ type: 'TEXT', content: '合成分页标签' }] },
  ];
  seedAnswerPreviewEntry(client, {
    id: selectedId,
    content: initialBody,
    voteup_count: 12,
    relationship: { voting: -1 },
  });
  seedAnswerEndorsements(client, {
    id: selectedId,
    endorsements: [
      { elements: [{ type: 'TEXT', content: '合成点击来源标签' }] },
    ],
  });
  let detailLabels: unknown[] | undefined;
  let includeSelected = true;
  get.mockImplementation(async (url) => ({
    data: String(url).startsWith('/answers/')
      ? { ...plainAnswer(selectedId), endorsements: detailLabels }
      : response([
          includeSelected
            ? { ...answer(selectedId), endorsements: pageLabels }
            : answer('new-account-other-answer'),
        ]),
  }));
  const host = await renderHook(useAnswerPreviewQuery, {
    initialProps: { answerId: selectedId },
    wrapper,
  });
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  expect(host.result.current.selectedAnswer).toMatchObject({
    content: initialBody,
    voteup_count: 12,
    relationship: { voting: -1 },
    endorsements: pageLabels,
  });
  expect(host.result.current.selectedAnswer).not.toHaveProperty(
    'structuredContent',
  );

  detailLabels = [];
  await act(async () => host.result.current.refetchSelected());
  await waitFor(() =>
    expect(host.result.current.selectedAnswer?.endorsements).toEqual([]),
  );

  detailLabels = undefined;
  includeSelected = false;
  await act(() => {
    mockSessionVersion = 2;
    useAuthStore.setState({ cookies: 'synthetic-label-session' });
  });
  await waitFor(() => {
    expect(host.result.current.selectedQueryKey).toEqual(
      getAnswerPreviewEntryKey(selectedId, 2),
    );
    expect(host.result.current.selectedAnswer?.content).toBe(
      '<p>合成普通正文</p>',
    );
  });
  expect(host.result.current.selectedAnswer?.endorsements).toBeUndefined();
  await host.unmount();
  client.clear();
});

test('keeps clicked plain text first without extra requests and safely falls back across refreshes and sessions', async () => {
  const get = jest.mocked(apiClient.get);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const initialBody = '<p data-pid="synthetic-pid">合成所选正文</p>';
  const segmentInfos = [
    { pid: 'synthetic-pid', text: '合成所选正文', marks: [] },
  ];
  const linkCardInfo = { 'synthetic-card': '合成卡片' };
  seedAnswerPreviewEntry(client, {
    id: 'selected-answer',
    type: 'answers',
    content: initialBody,
    questionId: 'question-source',
    titleString: '合成问题',
    author: {
      id: 'synthetic-author',
      name: '合成作者',
      avatar: 'https://example.invalid/avatar.png',
    },
    excerpt: '合成摘要',
    voteCount: 7,
    commentCount: 3,
    favlistsCount: 2,
    voted: 1,
    answerType: 'PAID',
    contentNeedTruncated: true,
    segment_infos: segmentInfos,
    link_card_info: linkCardInfo,
  });
  const initialKey = getAnswerPreviewEntryKey('selected-answer', 1);
  expect(client.getQueryData(initialKey)).toMatchObject({
    content: initialBody,
    answerType: 'PAID',
    contentNeedTruncated: true,
    segmentInfos,
    linkCardInfo,
    relationship: { voting: 1 },
  });
  expect(
    client.getQueryData(['answer-detail', 'selected-answer']),
  ).toBeUndefined();
  seedAnswerPreviewEntry(client, { id: 'empty-answer', content: '  ' });
  expect(
    client.getQueryData(getAnswerPreviewEntryKey('empty-answer', 1)),
  ).toBeUndefined();
  const contentArray = [{ type: 'text', content: '合成数组正文' }];
  expect(
    createAnswerPreviewEntry({ id: 'array-answer', content: contentArray })
      ?.content,
  ).toBe(contentArray);

  const opaqueNext =
    'https://API.ZHIHU.COM/next-render?cursor=synthetic%2Fcursor+space&offset=5&cursor=second%2Bcursor';
  expect(validateZhihuRenderUrl(opaqueNext, '/next-render')).toBe(opaqueNext);
  const feedResponses: Array<ReturnType<typeof response> | Error> = [
    response([answer('other-answer')], opaqueNext),
    response([
      answer('selected-answer', content(['wrong-body'])),
      answer('other-answer'),
      answer('last-answer'),
    ]),
    response([answer('profile-other')]),
    new Error('synthetic-feed-failure'),
    response([answer('selected-answer'), answer('new-account-other')]),
  ];
  let selectedRequests = 0;
  let failSelected = false;
  let wrongId = false;
  let finishLate: ((value: { data: unknown }) => void) | undefined;
  let deferSelected = false;
  get.mockImplementation(async (url) => {
    const pathname = new URL(String(url), 'https://api.zhihu.com').pathname;
    if (pathname.startsWith('/answers/')) {
      selectedRequests += 1;
      if (deferSelected) {
        deferSelected = false;
        return new Promise((resolve) => {
          finishLate = resolve;
        });
      }
      if (failSelected) throw { response: { status: 403 } };
      return {
        data: plainAnswer(
          wrongId ? 'different-answer' : 'selected-answer',
          `<p>合成已刷新正文 ${mockSessionVersion}</p>`,
        ),
      };
    }
    const data = feedResponses.shift();
    if (data instanceof Error) throw data;
    if (!data) throw new Error('Unexpected synthetic feed request');
    return { data };
  });
  const options: AnswerPreviewQueryOptions = { answerId: 'selected-answer' };
  const host = await renderHook(useAnswerPreviewQuery, {
    initialProps: options,
    wrapper,
  });
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  expect(host.result.current.selectedIsPending).toBe(false);
  expect(selectedRequests).toBe(0);
  expect(host.result.current.selectedQueryKey).toEqual(initialKey);
  expect(host.result.current.items.map((item) => item.id)).toEqual([
    'selected-answer',
    'other-answer',
  ]);
  expect(host.result.current.items[0]).toBe(host.result.current.selectedAnswer);
  expect(host.result.current.selectedAnswer?.content).toBe(initialBody);
  await act(async () => {
    await host.result.current.fetchNextPage();
  });
  expect(get).toHaveBeenCalledWith(opaqueNext, expect.any(Object));
  await waitFor(() =>
    expect(host.result.current.items.map((item) => item.id)).toEqual([
      'selected-answer',
      'other-answer',
      'last-answer',
    ]),
  );
  expect(host.result.current.selectedAnswer?.content).toBe(initialBody);
  expect(selectedRequests).toBe(0);

  await host.rerender({ ...options, scene: 'profile_answer' });
  await waitFor(() =>
    expect(
      host.result.current.items.some((item) => item.id === 'profile-other'),
    ).toBe(true),
  );
  expect(host.result.current.selectedQueryKey).toEqual(initialKey);
  expect(selectedRequests).toBe(0);
  await host.rerender({
    ...options,
    scene: 'question_feed',
    questionId: 'question-source',
  });
  await waitFor(() => expect(host.result.current.isError).toBe(true));
  expect(host.result.current.selectedIsError).toBe(false);
  expect(host.result.current.items).toEqual([
    host.result.current.selectedAnswer,
  ]);
  const oldRefetch = host.result.current.refetchSelected;

  failSelected = true;
  await act(async () => {
    await host.result.current.refetchSelected();
  });
  await waitFor(() => expect(host.result.current.selectedIsError).toBe(true));
  expect(host.result.current.selectedAnswer?.content).toBe(initialBody);
  failSelected = false;
  await act(async () => {
    await host.result.current.refetchSelected();
  });
  await waitFor(() => expect(host.result.current.selectedIsError).toBe(false));
  expect(host.result.current.selectedAnswer?.content).toBe(
    '<p>合成已刷新正文 1</p>',
  );
  expect(
    client.getQueryData(['answer-detail', 'selected-answer']),
  ).toBeUndefined();

  // A canonical cache from the previous account must not initialize this new session.
  client.setQueryData(
    ['answer-detail', 'selected-answer'],
    plainAnswer('selected-answer', '<p>合成旧会话正文</p>'),
  );
  failSelected = true;
  await act(async () => {
    mockSessionVersion = 2;
    useAuthStore.setState({ cookies: 'synthetic-other-session' });
  });
  await waitFor(() => {
    expect(host.result.current.selectedIsError).toBe(true);
    expect(host.result.current.isSuccess).toBe(true);
  });
  expect(host.result.current.selectedAnswer).toBeUndefined();
  expect(host.result.current.selectedQueryKey).toEqual(
    getAnswerPreviewEntryKey('selected-answer', 2),
  );
  expect(host.result.current.items.map((item) => item.id)).toEqual([
    'new-account-other',
  ]);
  const requestCount = get.mock.calls.length;
  await act(async () => {
    await oldRefetch();
  });
  expect(get).toHaveBeenCalledTimes(requestCount);
  failSelected = false;
  await act(async () => {
    await host.result.current.refetchSelected();
  });
  await waitFor(() => expect(host.result.current.selectedIsError).toBe(false));
  expect(host.result.current.items[0]).toBe(host.result.current.selectedAnswer);
  expect(host.result.current.selectedAnswer?.content).toBe(
    '<p>合成已刷新正文 2</p>',
  );
  expect(
    get.mock.calls.some(([url]) =>
      String(url).startsWith('/answers/selected-answer?include='),
    ),
  ).toBe(true);
  expect(
    get.mock.calls.some(([url]) => String(url).includes('/answers/v2/')),
  ).toBe(false);

  wrongId = true;
  await act(async () => {
    await host.result.current.refetchSelected();
  });
  await waitFor(() =>
    expect(host.result.current.selectedError?.message).toBe(
      '回答正文返回结构无效',
    ),
  );
  expect(host.result.current.selectedAnswer?.id).toBe('selected-answer');
  wrongId = false;
  deferSelected = true;
  await act(async () => {
    const request = host.result.current.refetchSelected();
    expect(finishLate).toBeDefined();
    feedResponses.push(response([answer('third-account-other')]));
    mockSessionVersion = 3;
    useAuthStore.setState({ cookies: 'synthetic-third-session' });
    finishLate?.({
      data: plainAnswer('selected-answer', '<p>合成迟到正文</p>'),
    });
    await request;
  });
  await waitFor(() =>
    expect(host.result.current.selectedAnswer?.content).toBe(
      '<p>合成已刷新正文 3</p>',
    ),
  );
  expect(
    client.getQueryData(getAnswerPreviewEntryKey('selected-answer', 2)),
  ).toMatchObject({ content: '<p>合成已刷新正文 2</p>' });
  await host.unmount();

  // A valid canonical detail can initialize a fresh observer without another detail request.
  client.setQueryData(
    ['answer-detail', 'canonical-answer'],
    plainAnswer('canonical-answer', '<p>合成缓存正文</p>'),
  );
  feedResponses.push(response([]));
  deferSelected = false;
  const countBeforeCanonical = selectedRequests;
  const canonical = await renderHook(useAnswerPreviewQuery, {
    initialProps: { answerId: 'canonical-answer' },
    wrapper,
  });
  await waitFor(() => expect(canonical.result.current.isSuccess).toBe(true));
  expect(canonical.result.current.selectedAnswer?.content).toBe(
    '<p>合成缓存正文</p>',
  );
  expect(canonical.result.current.selectedQueryKey).toEqual(
    getAnswerPreviewEntryKey('canonical-answer', 3),
  );
  expect(selectedRequests).toBe(countBeforeCanonical);
  await canonical.unmount();
  client.clear();
});
