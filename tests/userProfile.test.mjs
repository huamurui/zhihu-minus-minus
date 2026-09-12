import assert from 'node:assert/strict';
import test from 'node:test';
import { parseZhihuUrl } from '../utils/url.ts';
import {
  getNextPageOffset,
  getNextRecentActivityCursor,
  getRecentActivityReadBoundary,
  getRecentActivityTargetId,
  isOwnMemberProfile,
  isSameMember,
  normalizeUserFeedType,
} from '../utils/userProfile.ts';

test('matches a member by immutable id or url token', () => {
  const member = { id: 'hash-id', url_token: 'friendly-token' };

  assert.equal(isSameMember('hash-id', member), true);
  assert.equal(isSameMember('friendly-token', member), true);
  assert.equal(isSameMember('another-user', member), false);
});

test('does not treat every loaded profile as the signed-in member', () => {
  const me = { id: 'my-hash-id', url_token: 'my-token' };
  const anotherUser = {
    id: 'another-hash-id',
    url_token: 'another-token',
  };

  assert.equal(isOwnMemberProfile('another-token', me, anotherUser), false);
  assert.equal(isOwnMemberProfile('my-token', me, me), true);
  assert.equal(
    isOwnMemberProfile(
      'my-token',
      { id: 'my-hash-id' },
      { id: 'my-hash-id', url_token: 'my-token' },
    ),
    true,
  );
});

test('normalizes profile content types without treating videos as answers', () => {
  assert.equal(normalizeUserFeedType('answer'), 'answers');
  assert.equal(normalizeUserFeedType('articles'), 'articles');
  assert.equal(normalizeUserFeedType('moments_pin'), 'pins');
  assert.equal(normalizeUserFeedType('zvideo'), 'videos');
  assert.equal(normalizeUserFeedType('videos'), 'videos');
  assert.equal(normalizeUserFeedType('unsupported'), null);
});

test('reads pagination offsets through URLSearchParams', () => {
  assert.equal(
    getNextPageOffset(
      'https://www.zhihu.com/api/v4/members/demo/answers?limit=20&offset=40',
    ),
    40,
  );
  assert.equal(
    getNextPageOffset('/api/v4/items?offset=not-a-number'),
    undefined,
  );
  assert.equal(getNextPageOffset(undefined), undefined);
});

test('reads recent activity timestamp cursors and page numbers', () => {
  assert.deepEqual(
    getNextRecentActivityCursor(
      'https://api.zhihu.com/moments/recent/people/member-id/activities?action=down&offset=1787412683057&page_num=2',
    ),
    { offset: 1787412683057, pageNum: 2 },
  );
  assert.equal(
    getNextRecentActivityCursor(
      '/moments/recent/people/member-id/activities?offset=1787412683057',
    ),
    undefined,
  );
  assert.equal(getNextRecentActivityCursor(undefined), undefined);
});

test('recovers exact oversized pin ids from activity URLs', () => {
  assert.equal(
    getRecentActivityTargetId({
      id: 2077095966344327700,
      type: 'moments_pin',
      url: 'https://www.zhihu.com/pin/2077095966344327531?native=1',
    }),
    '2077095966344327531',
  );
  assert.equal(getRecentActivityTargetId({ id: 123, type: 'answer' }), 123);
});

test('places the read boundary using the entry-time unread snapshot', () => {
  assert.equal(getRecentActivityReadBoundary(5, 7, false), 5);
  assert.equal(getRecentActivityReadBoundary(9, 7, false), undefined);
  assert.equal(getRecentActivityReadBoundary(9, 7, true), 7);
  assert.equal(getRecentActivityReadBoundary(0, 7, true), undefined);
  assert.equal(getRecentActivityReadBoundary(Number.NaN, 7, true), undefined);
});

test('normalizes public Zhihu video links to the internal video route', () => {
  assert.equal(
    parseZhihuUrl('https://www.zhihu.com/zvideo/123456789'),
    '/video/123456789',
  );
  assert.equal(
    parseZhihuUrl('https://oia.zhihu.com/zvideos/987654321'),
    '/video/987654321',
  );
});
