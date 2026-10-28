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
