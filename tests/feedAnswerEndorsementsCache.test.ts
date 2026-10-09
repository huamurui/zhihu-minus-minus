import { QueryClient } from '@tanstack/react-query';
import type { AnswerDetail } from '../api/zhihu/answer';
import type { FeedItem } from '../api/zhihu/feed';
import type { ZhihuEndorsement } from '../types/zhihu';
import { getAnswerEndorsementsKey } from '../utils/answerEndorsements';
import {
  getAnswerPreviewEntryKey,
  seedAnswerPreviewEntry,
} from '../utils/answerPreviewEntry';
import {
  seedAnswerDetailFromList,
  seedRichContentFromFeedItem,
} from '../utils/contentCache';

jest.mock('../store/useAuthStore', () => ({
  getAuthSessionVersion: () => 1,
}));

jest.mock('../features/rich-content', () =>
  jest.requireActual('../features/rich-content/queryPolicy'),
);

const endorsements: ZhihuEndorsement[] = [
  { elements: [{ type: 'TEXT', content: '收录于 · 合成专栏' }] },
];

function answer(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: 'synthetic-feed-answer',
    type: 'answers',
    questionId: 'synthetic-question',
    title: '合成问题',
    author: { id: 'synthetic-author', name: '合成作者', avatar: '' },
    excerpt: '合成摘要',
    content: '<p>合成完整正文</p>',
    endorsements,
    image: null,
    voteCount: 5,
    commentCount: 2,
    voted: 0,
    ...overrides,
  };
}

const clients: QueryClient[] = [];
function createClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return client;
}
afterEach(() => {
  for (const client of clients) client.clear();
  clients.length = 0;
});

test('complete answer seeds retain labels alongside their ordinary body cache', () => {
  const client = createClient();
  seedRichContentFromFeedItem(client, answer());
  expect(
    client.getQueryData(['answer-detail', 'synthetic-feed-answer']),
  ).toMatchObject({
    content: '<p>合成完整正文</p>',
    endorsements,
  });
  expect(
    client.getQueryState(['answer-detail', 'synthetic-feed-answer'])
      ?.dataUpdatedAt,
  ).toBe(0);
  expect(
    client.getQueryData(getAnswerEndorsementsKey('synthetic-feed-answer', 1)),
  ).toEqual(endorsements);

  const source = answer({ id: 'synthetic-preview-answer' });
  seedAnswerPreviewEntry(client, source);
  expect(
    client.getQueryData(getAnswerPreviewEntryKey(source.id, 1)),
  ).toMatchObject({ content: source.content, endorsements });
  expect(client.getQueryData(getAnswerEndorsementsKey(source.id, 1))).toEqual(
    endorsements,
  );
  expect(client.getQueryData(['answer-detail', source.id])).toBeUndefined();
});

test('thin feed, list, and preview entries cache labels without certifying a full body', () => {
  const client = createClient();
  const feed = answer({ id: 'synthetic-thin-feed', content: undefined });
  // Model the sparse list response without inventing body metadata.
  const list = { id: 'synthetic-thin-list', endorsements } as AnswerDetail;
  const preview = {
    id: 'synthetic-thin-preview',
    type: 'answer',
    endorsements,
  };
  seedRichContentFromFeedItem(client, feed);
  seedAnswerDetailFromList(client, list);
  seedAnswerPreviewEntry(client, preview);

  for (const source of [feed, list, preview]) {
    const id = String(source.id);
    expect(client.getQueryData(getAnswerEndorsementsKey(id, 1))).toEqual(
      endorsements,
    );
    expect(client.getQueryData(['answer-detail', id])).toBeUndefined();
    expect(
      client.getQueryData(getAnswerPreviewEntryKey(id, 1)),
    ).toBeUndefined();
  }
});

test('non-answer entries do not seed answer metadata or preview bodies', () => {
  const client = createClient();
  const source = answer({ type: 'pins' });
  seedRichContentFromFeedItem(client, source);
  seedAnswerPreviewEntry(client, source);
  expect(
    client.getQueryData(getAnswerEndorsementsKey(source.id, 1)),
  ).toBeUndefined();
  expect(
    client.getQueryData(getAnswerPreviewEntryKey(source.id, 1)),
  ).toBeUndefined();
});

test('an explicitly empty clicked label list replaces metadata without filling the body cache', () => {
  const client = createClient();
  const id = 'synthetic-empty-label-answer';
  seedAnswerPreviewEntry(client, { id, type: 'answer', endorsements });
  seedAnswerPreviewEntry(client, { id, type: 'answer', endorsements: [] });
  expect(client.getQueryData(getAnswerEndorsementsKey(id, 1))).toEqual([]);
  expect(client.getQueryData(getAnswerPreviewEntryKey(id, 1))).toBeUndefined();
});
