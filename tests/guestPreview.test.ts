import { QueryClient } from '@tanstack/react-query';
import type { FeedItem } from '../src/api/zhihu';
import {
  createGuestPreviewParams,
  guestPreviewBodyKey,
} from '../src/utils/guestPreview';

const item: FeedItem = {
  type: 'answers',
  id: '42',
  title: '标题',
  excerpt: '公开摘要',
  author: { id: 'a', name: '作者', avatar: '' },
  image: null,
  voteCount: 1,
  commentCount: 2,
  voted: 0,
  content: '<p>合成正文</p>'.repeat(1000),
};

test('native guest navigation carries the summary and retains the full body in the originating session', () => {
  const client = new QueryClient();
  const params = createGuestPreviewParams(client, item, 3, 'android');
  expect(JSON.parse(params.item)).toMatchObject({
    id: item.id,
    excerpt: item.excerpt,
  });
  expect(JSON.parse(params.item)).not.toHaveProperty('content');
  expect(params.bodySession).toBe('3');
  expect(client.getQueryData(guestPreviewBodyKey(3, 'answers', '42'))).toBe(
    item.content,
  );
  expect(
    client.getQueryData(guestPreviewBodyKey(4, 'answers', '42')),
  ).toBeUndefined();
  expect(
    client.getQueryData(guestPreviewBodyKey(3, 'articles', '42')),
  ).toBeUndefined();
  client.clear();
});

test('web reloads and cards with unstable identities keep inline segment content', () => {
  const client = new QueryClient();
  const segmented = {
    ...item,
    content: [{ type: 'text', content: '合成段落' }],
  };
  for (const params of [
    createGuestPreviewParams(client, segmented, 1, 'web'),
    createGuestPreviewParams(
      client,
      { ...segmented, isIdStable: false },
      1,
      'android',
    ),
  ]) {
    expect(params.bodySession).toBeUndefined();
    expect(JSON.parse(params.item).content).toEqual(segmented.content);
  }
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});
