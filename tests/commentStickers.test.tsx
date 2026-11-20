import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import axios from 'axios';
import type { PropsWithChildren } from 'react';
import { type CommentItem, getCommentStickers } from '../src/api/zhihu/comment';
import { useCommentStickers } from '../src/hooks/useCommentQueries';

jest.mock('axios');
jest.mock('../src/api/client', () => ({ __esModule: true, default: {} }));
jest.mock('../src/api/zhihu', () => ({
  getCommentStickers: jest.requireActual('../src/api/zhihu/comment')
    .getCommentStickers,
}));

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/epXXl8AAAAASUVORK5CYII=';
const catalogue = {
  data: {
    data: {
      stickers: [
        { placeholder: '[捂脸]', static_image_url: png },
        {
          placeholder: '[合成]',
          static_image_url: '//pic1.zhimg.com/synthetic.png',
        },
        {
          placeholder: '[脚本]',
          static_image_url: 'data:image/svg+xml,<svg />',
        },
        {
          placeholder: '[损坏]',
          static_image_url: 'data:image/png;base64,aaaa',
        },
        {
          placeholder: '[过大]',
          static_image_url: `data:image/png;base64,iVBORw0KGgo${'A'.repeat(256 * 1024)}`,
        },
        {
          placeholder: '[外部]',
          static_image_url: 'https://outside.example/picture.png',
        },
        null,
      ],
    },
  },
};
const comment = (
  content: string,
  child_comments: CommentItem[] = [],
): CommentItem => ({
  id: 'sample',
  type: 'comment',
  content,
  child_comments,
  child_comment_count: child_comments.length,
  created_time: 0,
  author: {
    member: { id: 'test', name: '合成账号', avatar_url: '', url_token: 'test' },
  },
});

beforeEach(() => jest.clearAllMocks());

test('normalizes only official raster data and CDN links from the public sticker catalogue', async () => {
  jest.mocked(axios.get).mockResolvedValue(catalogue);
  expect(await getCommentStickers()).toEqual({
    '[捂脸]': png,
    '[合成]': 'https://pic1.zhimg.com/synthetic.png',
  });
  expect(axios.get).toHaveBeenCalledWith(
    'https://www.zhihu.com/api/v4/sticker-groups/1114161698310770688',
    expect.objectContaining({ withCredentials: false }),
  );
});

test('root previews and reply details share the same lazy catalogue query', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  jest.mocked(axios.get).mockResolvedValue(catalogue);
  const plain = comment(
    '纯文本 <a class="comment_img" href="https://pic1.zhimg.com/x.jpg">[图片]</a>',
  );
  const host = await renderHook(
    ({ child, parent }: { child?: CommentItem; parent?: CommentItem }) => ({
      root: useCommentStickers([comment(plain.content, child ? [child] : [])]),
      reply: useCommentStickers([], parent),
    }),
    { initialProps: {}, wrapper },
  );
  expect(axios.get).not.toHaveBeenCalled();
  const withSticker = comment('合成楼中楼&lbrack;捂脸&rbrack;');
  await host.rerender({ child: withSticker, parent: withSticker });
  await waitFor(() => expect(host.result.current.root?.['[捂脸]']).toBe(png));
  expect(host.result.current.reply).toBe(host.result.current.root);
  expect(axios.get).toHaveBeenCalledTimes(1);
  await host.unmount();
  const next = await renderHook(() => useCommentStickers([withSticker]), {
    wrapper,
  });
  expect(next.result.current?.['[捂脸]']).toBe(png);
  expect(axios.get).toHaveBeenCalledTimes(1);
  await next.unmount();
  client.clear();
});
