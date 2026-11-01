import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import {
  getRecentMemberActivities,
  type ZhihuMember,
  type ZhihuMemberActivity,
} from '../src/api/zhihu/member';
import { useUserCreations } from '../src/hooks/useUserCreations';
import {
  deduplicateUserCreations,
  getNextUserCreationsCursor,
  toUserCreationFeedItem,
  type UserCreationsPage,
} from '../src/utils/userCreations';
import { getNextRecentActivityCursor } from '../src/utils/userProfile';

jest.mock('../src/api/zhihu/member', () => ({
  getRecentMemberActivities: jest.fn(),
}));

const member: ZhihuMember = {
  id: 'member-id',
  type: 'people',
  url_token: 'friendly-token',
  name: '合成作者',
  avatar_url: '',
};

const activity = (id: string): ZhihuMemberActivity => ({
  id: `event-${id}`,
  target: {
    id,
    type: 'answer',
    question: { id: 'question-id', title: '合成问题' },
  },
});

function page(ids: string[], next = ''): UserCreationsPage {
  return {
    data: ids.map(activity),
    paging: {
      is_end: !next,
      is_start: false,
      next,
      previous: '',
      totals: ids.length,
    },
  };
}

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
afterEach(() => jest.restoreAllMocks());

test('refresh requests a new timestamp and only resets the current member after overlapping pagination', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(2000);
  jest
    .mocked(getRecentMemberActivities)
    .mockResolvedValueOnce(page(['one'], '/activities?offset=1000&page_num=2'))
    .mockResolvedValueOnce(page(['one', 'two']))
    .mockResolvedValueOnce(page(['new']));
  const { client, wrapper } = setupClient();
  const otherKey = ['user-recent-published-activities', 'other-member'];
  const untouched = { pages: [page(['other'])], pageParams: [null] };
  client.setQueryData(otherKey, untouched);
  const host = await renderHook(() => useUserCreations(member), { wrapper });
  await waitFor(() => expect(host.result.current.hasNextPage).toBe(true));
  expect(host.result.current.queryKey).toEqual([
    'user-recent-published-activities',
    'member-id',
  ]);
  expect(getRecentMemberActivities).toHaveBeenLastCalledWith(
    'member-id',
    { offset: 2000, pageNum: 1 },
    expect.objectContaining({ aborted: false }),
  );
  await act(async () => {
    await host.result.current.fetchNextPage();
  });
  await waitFor(() =>
    expect(host.result.current.feedItems.map((item) => item.id)).toEqual([
      'one',
      'two',
    ]),
  );
  expect(getRecentMemberActivities).toHaveBeenLastCalledWith(
    'member-id',
    { offset: 1000, pageNum: 2 },
    expect.objectContaining({ aborted: false }),
  );
  now.mockReturnValue(3000);
  await act(async () => {
    await host.result.current.refresh();
  });
  await waitFor(() =>
    expect(host.result.current.feedItems.map((item) => item.id)).toEqual([
      'new',
    ]),
  );
  expect(getRecentMemberActivities).toHaveBeenLastCalledWith(
    'member-id',
    { offset: 3000, pageNum: 1 },
    expect.objectContaining({ aborted: false }),
  );
  expect(host.result.current.data?.pageParams).toEqual([null]);
  expect(client.getQueryData(otherKey)).toEqual(untouched);
  await host.unmount();
  client.clear();
});

test('waits for immutable member identity and cancels requests when leaving the member', async () => {
  jest
    .mocked(getRecentMemberActivities)
    .mockImplementation(() => new Promise(() => {}));
  const { client, wrapper } = setupClient();
  const host = await renderHook(
    ({ value }: { value: ZhihuMember | undefined }) => useUserCreations(value),
    { initialProps: { value: undefined as ZhihuMember | undefined }, wrapper },
  );
  expect(getRecentMemberActivities).not.toHaveBeenCalled();
  await host.rerender({ value: member });
  await waitFor(() =>
    expect(getRecentMemberActivities).toHaveBeenCalledTimes(1),
  );
  const signal = jest.mocked(getRecentMemberActivities).mock.calls[0][2];
  expect(signal?.aborted).toBe(false);
  await host.rerender({ value: { ...member, id: 'another-member' } });
  await waitFor(() => expect(signal?.aborted).toBe(true));
  expect(host.result.current.feedItems).toEqual([]);
  await host.unmount();
  client.clear();
});

test('rejects malformed timestamps, repeated pages and cursors that move toward newer content', () => {
  for (const [offset, pageNum] of [
    ['12junk', '2'],
    ['12', '2junk'],
    ['-12', '2'],
    ['12', '0'],
    ['12.5', '2'],
    ['', '2'],
    [String(Number.MAX_SAFE_INTEGER + 1), '2'],
    ['12', String(Number.MAX_SAFE_INTEGER + 1)],
  ]) {
    expect(
      getNextRecentActivityCursor(
        `/activities?offset=${offset}&page_num=${pageNum}`,
      ),
    ).toBeUndefined();
  }
  const previous = { offset: 1000, pageNum: 2 };
  for (const next of [
    '/activities?offset=1000&page_num=2',
    '/activities?offset=500&page_num=1',
    '/activities?offset=1500&page_num=3',
  ]) {
    expect(
      getNextUserCreationsCursor(page(['one'], next), previous, [
        null,
        previous,
      ]),
    ).toBeUndefined();
  }
  expect(
    getNextUserCreationsCursor(
      page(['one'], '/activities?offset=1000&page_num=3'),
      previous,
      [null, previous],
    ),
  ).toEqual({ offset: 1000, pageNum: 3 });
  expect(
    getNextUserCreationsCursor(
      page([], '/activities?offset=500&page_num=3'),
      previous,
      [null, previous],
    ),
  ).toBeUndefined();
});

test('normalizes mixed creations without losing exact pin identity or member fallback metadata', () => {
  const pin: ZhihuMemberActivity = {
    id: 'pin-event',
    source: { action_text: '发布了想法' },
    target: {
      id: 2077095966344327700,
      url: 'https://www.zhihu.com/pin/2077095966344327531',
      type: 'moments_pin',
      content: [
        { type: 'text', own_text: '<p>合成文字</p>' },
        { type: 'image', url: 'https://example.com/synthetic.png' },
      ],
      reaction_count: 7,
      reaction_relation: { vote: 1 },
      reaction: { statistics: { comments: 4, favorites: 2 } },
    },
  };
  expect(toUserCreationFeedItem(pin, member)).toMatchObject({
    id: '2077095966344327531',
    type: 'pins',
    excerpt: '合成文字',
    author: { id: 'member-id', name: '合成作者' },
    image: 'https://example.com/synthetic.png',
    voteCount: 7,
    voted: 1,
    commentCount: 4,
    favlistsCount: 2,
  });
  expect(
    toUserCreationFeedItem(
      {
        ...pin,
        target: { ...pin.target, comment_count: 0, favlists_count: 0 },
      },
      member,
    ),
  ).toMatchObject({ commentCount: 0, favlistsCount: 0 });
  expect(toUserCreationFeedItem(activity('answer'), member)).toMatchObject({
    questionId: 'question-id',
    type: 'answers',
    title: '合成问题',
  });
  expect(
    toUserCreationFeedItem({ target: { id: 'video', type: 'zvideo' } }, member),
  ).toMatchObject({ type: 'videos' });
  expect(
    toUserCreationFeedItem(
      { target: { id: 'unknown', type: 'unknown' } },
      member,
    ),
  ).toBeNull();
  expect(
    deduplicateUserCreations([
      pin,
      { ...pin, id: 'updated-event', target: { ...pin.target, type: 'pin' } },
      activity('answer'),
    ]),
  ).toHaveLength(2);
});

test('creation cards preserve API collection state and count without inventing unavailable values', () => {
  const collected: ZhihuMemberActivity = {
    target: {
      ...activity('collected-answer').target,
      reaction: {
        relation: { faved: true },
        statistics: { favorites: 6 },
      },
    },
  };
  expect(toUserCreationFeedItem(collected, member)).toMatchObject({
    isCollected: true,
    favlistsCount: 6,
  });
  expect(
    toUserCreationFeedItem(
      {
        target: {
          ...activity('uncollected-answer').target,
          relationship: { is_favorited: false },
          favlists_count: 0,
          favorite_count: 4,
        },
      },
      member,
    ),
  ).toMatchObject({ isCollected: false, favlistsCount: 0 });
  const unknown = toUserCreationFeedItem(activity('unknown-answer'), member);
  expect(unknown?.isCollected).toBeUndefined();
  expect(unknown?.favlistsCount).toBeUndefined();
});

test.each([
  ['video', 'lens'],
  ['videos', 'lens'],
  ['zvideo', 'zvideo'],
  ['zvideos', 'zvideo'],
] as const)(
  'recent creations preserve raw video type %s as source %s',
  (type, videoSource) => {
    expect(
      toUserCreationFeedItem(
        { target: { id: '2088306465639604943', type } },
        member,
      ),
    ).toMatchObject({ id: '2088306465639604943', type: 'videos', videoSource });
  },
);

test('formats actionText and timestamps for recent published activities', () => {
  const now = 1793513195 * 1000 + 10 * 60 * 1000;
  jest.spyOn(Date, 'now').mockReturnValue(now);

  const itemWithTime = toUserCreationFeedItem(
    {
      source: {
        action_text: '发布了想法',
        action_time: 1793513195,
      },
      target: {
        id: 'pin-1',
        type: 'pin',
        content: [{ type: 'text', own_text: '测试想法' }],
      },
    },
    member,
  );
  expect(itemWithTime).toMatchObject({
    actionText: '发布了想法 · 10分钟前',
    created_time: 1793513195,
    updated_time: 1793513195,
  });

  const itemWithoutText = toUserCreationFeedItem(
    {
      source: {
        action_time: 1793513195,
      },
      target: {
        id: 'answer-1',
        type: 'answer',
        title: '回答标题',
      },
    },
    member,
  );
  expect(itemWithoutText).toMatchObject({
    actionText: '回答了问题 · 10分钟前',
    created_time: 1793513195,
  });

  const itemWithActorName = toUserCreationFeedItem(
    {
      source: {
        action_text: '合成作者发布了想法',
        action_time: 1793513195,
        actor: { name: '合成作者' },
      },
      target: {
        id: 'pin-2',
        type: 'pin',
      },
    },
    member,
  );
  expect(itemWithActorName).toMatchObject({
    actionText: '合成作者 发布了想法 · 10分钟前',
  });

  jest.restoreAllMocks();
});
