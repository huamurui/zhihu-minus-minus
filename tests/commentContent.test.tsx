import { fireEvent, render } from '@testing-library/react-native';
import { Pressable } from 'react-native';
import { CommentContent } from '../src/components/CommentContent';
import { parseCommentContent } from '../src/utils/commentContent';

const mockPush = jest.fn();
const mockPreview = jest.fn((_props: unknown) => null);
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('../src/components/Themed', () => ({
  Text: jest.requireActual('react-native').Text,
  View: jest.requireActual('react-native').View,
  useThemeColor: () => '#2580ff',
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/ImagePreviewModal', () => ({
  ImagePreviewModal: (props: unknown) => mockPreview(props),
}));

const sticker = 'https://pic1.zhimg.com/synthetic-sticker.png';
const image1 = 'https://pic2.zhimg.com/synthetic-comment-1.jpg';
const image2 = 'https://pic3.zhimg.com/synthetic-comment-2.jpg';
const html = `<p>开头 &amp; <img class="sticker" alt="[微笑]" src="${sticker}"><a class="member_mention" href="//www.zhihu.com/people/demo-member">@合成用户</a><br>末尾</p><a href="${image1}" class='comment_img other'>查看图片</a><a class="comment_img" href="${image2}">[图片]</a>`;

beforeEach(() => jest.clearAllMocks());

test('preserves order, decoded text and media labels for display and copying', () => {
  const parts = parseCommentContent(html);
  expect(parts.map((part) => part.kind)).toEqual([
    'text',
    'emoji',
    'mention',
    'text',
    'image',
    'image',
  ]);
  expect(parts.map((part) => part.text).join('')).toBe(
    '开头 & [微笑]@合成用户\n末尾\n[图片][图片]',
  );
  expect(
    parseCommentContent('<p>第一段</p><p>第二段 &lt;符号&gt;</p>')[0].text,
  ).toBe('第一段\n第二段 <符号>');
});

test('unsupported or unsafe markup retains readable text without creating media or navigation', () => {
  const parts = parseCommentContent(
    `<a href="https://outside.example/people/abc">@甲</a><a href="https://bad@www.zhihu.com/people/abc">@乙</a><a href="javascript:alert(1)">@丙</a><img class="sticker" src="file:///local" alt="[微笑]"><img class="sticker"><img alt="图注" src="https://pic1.zhimg.com.example/a"><a class="comment_img" href="data:abc">[图片]</a><script>秘密</script>`,
  );
  expect(parts).toEqual([
    { kind: 'text', text: '@甲@乙@丙[微笑][表情]图注[图片]' },
  ]);
});

test('mentions work in nested replies and gallery indexes exclude inline stickers', async () => {
  const openReplies = jest.fn();
  const host = await render(
    <Pressable onPress={openReplies}>
      <CommentContent htmlContent={html} width={300} />
    </Pressable>,
  );
  const event = { stopPropagation: jest.fn() };
  await fireEvent.press(host.getByText('@合成用户'), event);
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/user/[id]',
    params: { id: 'demo-member' },
  });
  expect(event.stopPropagation).toHaveBeenCalled();
  expect(openReplies).not.toHaveBeenCalled();
  await fireEvent.press(host.getByLabelText('查看评论图片 2'), event);
  expect(mockPreview).toHaveBeenCalledWith(
    expect.objectContaining({
      visible: true,
      imageUrls: [image1, image2],
      initialIndex: 1,
    }),
  );
});

test('an unavailable sticker keeps its label and a recycled comment can show its new sticker', async () => {
  const host = await render(<CommentContent htmlContent={html} width={300} />);
  const stickerNode = host.container.queryAll(
    (node) => node.type === 'Image' && node.props.source?.uri === sticker,
  )[0];
  expect(stickerNode).toBeDefined();
  await fireEvent(stickerNode, 'error', {
    nativeEvent: { error: 'fixture image unavailable' },
  });
  expect(host.getByText('[微笑]')).toBeVisible();
  await host.rerender(
    <CommentContent htmlContent={html.replace(sticker, image1)} width={300} />,
  );
  expect(host.queryByText('[微笑]')).toBeNull();
});

test('an open gallery keeps its original images when the list recycles the comment row', async () => {
  const host = await render(<CommentContent htmlContent={html} width={300} />);
  const event = { stopPropagation: jest.fn() };
  await fireEvent.press(host.getByLabelText('查看评论图片 2'), event);
  const originalGallery = { imageUrls: [image1, image2], initialIndex: 1 };
  expect(mockPreview).toHaveBeenLastCalledWith(
    expect.objectContaining(originalGallery),
  );

  await host.rerender(
    <CommentContent htmlContent={`<img src="${image1}">`} width={300} />,
  );
  expect(mockPreview).toHaveBeenLastCalledWith(
    expect.objectContaining(originalGallery),
  );
});

test('a generic image label opens a gallery unless the element explicitly marks a sticker', async () => {
  const markup = `<img src="${image1}" alt="[图片]"><img class="sticker" src="${sticker}" alt="[图片]">`;
  const host = await render(
    <CommentContent htmlContent={markup} width={300} />,
  );
  await fireEvent.press(host.getByLabelText('查看评论图片 1'), {
    stopPropagation: jest.fn(),
  });
  expect(mockPreview).toHaveBeenCalledWith(
    expect.objectContaining({ imageUrls: [image1], initialIndex: 0 }),
  );
});

test('V5 bracket stickers resolve from the catalogue without replacing ordinary bracket text', async () => {
  const markup =
    '<p>[捂脸][捂脸]和[合成术语] <a href="http://www.zhihu.com/people/demo-member" class="member_mention">@合成用户</a></p>';
  const host = await render(
    <CommentContent htmlContent={markup} width={300} />,
  );
  expect(host.getByText(/\[捂脸\]\[捂脸\]/)).toBeVisible();
  await host.rerender(
    <CommentContent
      htmlContent={markup}
      stickers={{ '[捂脸]': sticker }}
      width={300}
    />,
  );
  const images = host.container.queryAll(
    (node) => node.type === 'Image' && node.props.source?.uri === sticker,
  );
  expect(images).toHaveLength(2);
  expect(host.getByText(/合成术语/)).toBeVisible();
  expect(host.queryByLabelText('查看评论图片 1')).toBeNull();
  await fireEvent(images[0], 'error');
  expect(host.getByText(/\[捂脸\]/)).toBeVisible();
});

test('profile mentions support a single decoded Unicode or punctuated token', () => {
  for (const token of ['合成.用户', 'member~name', '成员 42']) {
    const [part] = parseCommentContent(
      `<a href="/people/${encodeURIComponent(token)}">@示例</a>`,
    );
    expect(part).toMatchObject({ kind: 'mention', member: token });
  }
  for (const path of [
    '/people/bad%2Fpath',
    '/people/bad%3Fquery',
    '/people/bad%252Fpath',
    '/people/%E0%A4',
    '/people/name/followers',
  ]) {
    expect(parseCommentContent(`<a href="${path}">@示例</a>`)).toEqual([
      { kind: 'text', text: '@示例' },
    ]);
  }
});
