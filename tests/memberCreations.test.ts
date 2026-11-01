import { fetchMemberCreations } from '../src/api/zhihu/moments';
import { getNextCreationsUrl } from '../src/hooks/useMemberCreations';
import {
  toMemberCreation,
  type ZhihuCreationEntry,
} from '../src/utils/memberCreations';

const mockGet = jest.fn();
jest.mock('../src/api/client', () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockGet(...args) },
}));

/** A synthetic `moments_feed` entry wrapping one piece of content. */
function entry(target: Record<string, unknown>): ZhihuCreationEntry {
  return { type: 'moments_feed', target };
}

test.each([
  ['answer', 'answers'],
  ['article', 'articles'],
  ['pin', 'pins'],
])('a %s renders in the %s tab as its own list returns it', (type, kind) => {
  const target = { id: '42', type, title: '合成内容', voteup_count: 3 };
  expect(toMemberCreation(entry(target))).toEqual({ kind, item: target });
});

test.each([
  ['other content types', { id: '42', type: 'zvideo' }],
  ['content without an ID', { type: 'answer' }],
])('skips %s', (_case, target) => {
  expect(toMemberCreation(entry(target))).toBeNull();
});

describe('paging', () => {
  const page = (next: string, isEnd = false, count = 1) => ({
    data: Array.from({ length: count }, () =>
      entry({ id: '42', type: 'answer' }),
    ),
    paging: { is_end: isEnd, next },
  });
  const NEXT = 'https://api.zhihu.com/moments/m/origin?offset=1:10002';

  test('follows the server cursor', () => {
    expect(getNextCreationsUrl(page(NEXT), null)).toBe(NEXT);
  });

  test.each([
    ['the server ends the list', page(NEXT, true), null],
    ['the cursor repeats', page(NEXT), NEXT],
    ['a page comes back empty', page(NEXT, false, 0), null],
  ])('stops when %s', (_case, response, current) => {
    expect(getNextCreationsUrl(response, current)).toBeUndefined();
  });
});

test('the first page asks the App profile endpoint, later pages the cursor', async () => {
  mockGet.mockResolvedValue({ data: { data: [], paging: { is_end: true } } });
  await fetchMemberCreations('member-hash');
  expect(mockGet).toHaveBeenLastCalledWith(
    expect.stringMatching(
      /^https:\/\/api\.zhihu\.com\/moments\/member-hash\/origin\?.*limit=20/,
    ),
    expect.objectContaining({
      headers: expect.objectContaining({
        'x-api-version': '3.0.93',
        'x-page-id': '10164',
      }),
    }),
  );
  await fetchMemberCreations('member-hash', 'https://api.zhihu.com/next');
  expect(mockGet).toHaveBeenLastCalledWith(
    'https://api.zhihu.com/next',
    expect.anything(),
  );
});

test('extracts actionText and actionTime from creation entries', () => {
  const target = { id: '42', type: 'pin', content: '内容' };
  const direct = toMemberCreation({
    type: 'moments_feed',
    action_text: '发布了想法',
    created_time: 1770156705,
    target,
  });
  expect(direct).toEqual({
    kind: 'pins',
    item: target,
    actionText: '发布了想法',
    actionTime: 1770156705,
  });

  const fromSource = toMemberCreation({
    type: 'moments_feed',
    source: {
      action_text: '发表了文章',
      action_time: 1770156705000,
    },
    target: { id: '43', type: 'article' },
  });
  expect(fromSource).toEqual({
    kind: 'articles',
    item: { id: '43', type: 'article' },
    actionText: '发表了文章',
    actionTime: 1770156705,
  });
});

test('recovers exact pin id from url when target id exceeds safe integer range', () => {
  const pin = toMemberCreation({
    type: 'moments_feed',
    target: {
      id: 2077095966344327700,
      url: 'https://www.zhihu.com/pin/2077095966344327531',
      type: 'pin',
    },
  });
  expect(pin).toEqual({
    kind: 'pins',
    item: {
      id: '2077095966344327531',
      url: 'https://www.zhihu.com/pin/2077095966344327531',
      type: 'pin',
    },
  });
});
