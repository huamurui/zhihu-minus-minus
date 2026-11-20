import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { createAnswerSelectionComment } from '@/api/zhihu/comment';
import type { BottomSheet } from '@/components/overlays/BottomSheet';
import type { TextSelectionInfo } from '@/features/rich-content/bridge';
import { SelectionCommentSheet } from '@/features/rich-content/components/SelectionCommentSheet';

jest.mock('@/api/zhihu/comment', () => ({
  createAnswerSelectionComment: jest.fn(),
}));
jest.mock('@/api/zhihu/image', () => ({ uploadImage: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').View,
}));
jest.mock('@/components/overlays/BottomSheet', () => ({
  BottomSheet: ({
    children,
    onClose,
    subtitle,
  }: ComponentProps<typeof BottomSheet>) => {
    const { Text, View } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <View>
        <Text>{subtitle}</Text>
        <Text onPress={onClose}>关闭</Text>
        {children}
      </View>
    );
  },
}));
jest.mock('@/components/Themed', () => {
  const { Text, View } = jest.requireActual('react-native');
  return { Text, View, useRuntimeThemeColors: () => ({}) };
});
jest.mock('@/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('@/constants/Colors', () => ({
  __esModule: true,
  default: { light: {} },
}));
jest.mock('@/utils/zhihuError', () => ({
  getZhihuErrorMessage: () => '请稍后重试',
}));

const selection: TextSelectionInfo = {
  text: '选中😀的原文',
  startParagraphId: 'p-one',
  endParagraphId: 'p-one',
  startOffset: 1,
  endOffset: 8,
};

function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  const onClose = jest.fn();
  const onPosted = jest.fn();
  const view = (excerpt: TextSelectionInfo | null = selection) => (
    <QueryClientProvider client={client}>
      {excerpt && (
        <SelectionCommentSheet
          answerId="42"
          selection={excerpt}
          onClose={onClose}
          onPosted={onPosted}
        />
      )}
    </QueryClientProvider>
  );
  return { client, view, onClose, onPosted };
}

beforeEach(() => jest.resetAllMocks());

it('quotes the source and focuses the input without creating a comment when cancelled', async () => {
  const { view, onClose, onPosted } = setup();
  const host = await render(view());
  expect(host.getByText(selection.text)).toBeTruthy();
  const input = host.getByPlaceholderText('写下你的评论…');
  expect(input.props.autoFocus).toBe(true);
  await fireEvent.changeText(input, '没有发布的评论');
  await fireEvent.press(host.getByText('关闭'));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(createAnswerSelectionComment).not.toHaveBeenCalled();
  expect(onPosted).not.toHaveBeenCalled();
});

it('retains the draft after an error and marks only this answer’s segment discussions stale after retry', async () => {
  jest
    .mocked(createAnswerSelectionComment)
    .mockRejectedValueOnce(new Error('synthetic failure'))
    .mockResolvedValueOnce({ id: 'comment-id' });
  const { client, view, onPosted } = setup();
  const segments = ['comments', '42', 'answer', '123', 'score'];
  const root = ['comments', '42', 'answer', undefined, 'score'];
  const otherAnswer = ['comments', '43', 'answer', '123', 'score'];
  for (const key of [segments, root, otherAnswer]) client.setQueryData(key, []);
  const host = await render(view());
  const input = () => host.getByPlaceholderText('写下你的评论…');
  await fireEvent.changeText(input(), '  输入的评论  ');
  await fireEvent.press(host.getByLabelText('发布评论'));
  expect(await host.findByText('发布失败，请稍后重试')).toBeTruthy();
  expect(input().props.value).toBe('  输入的评论  ');
  expect(client.getQueryState(segments)?.isInvalidated).toBe(false);
  expect(onPosted).not.toHaveBeenCalled();
  await fireEvent.press(host.getByLabelText('发布评论'));
  await waitFor(() => expect(onPosted).toHaveBeenCalledTimes(1));
  expect(createAnswerSelectionComment).toHaveBeenCalledTimes(2);
  expect(createAnswerSelectionComment).toHaveBeenLastCalledWith(
    '42',
    selection,
    '输入的评论',
  );
  expect(client.getQueryState(segments)?.isInvalidated).toBe(true);
  expect(client.getQueryState(root)?.isInvalidated).toBe(false);
  expect(client.getQueryState(otherAnswer)?.isInvalidated).toBe(false);
});

it('ignores a late success in another draft after closing the pending composer', async () => {
  let finish!: (result: { id: string }) => void;
  jest.mocked(createAnswerSelectionComment).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { client, view, onClose, onPosted } = setup();
  const segments = ['comments', '42', 'answer', '123', 'ts'];
  client.setQueryData(segments, []);
  const host = await render(view());
  const input = () => host.getByPlaceholderText('写下你的评论…');
  await fireEvent.changeText(input(), '已点击发布的草稿');
  let pending: Promise<void> | undefined;
  await act(() => {
    pending = host.getByLabelText('发布评论').props.onPress();
  });
  await waitFor(() =>
    expect(createAnswerSelectionComment).toHaveBeenCalledTimes(1),
  );
  await fireEvent.press(host.getByText('关闭'));
  expect(onClose).toHaveBeenCalledTimes(1);
  await host.rerender(view(null));
  await host.rerender(view({ ...selection, text: '另一段原文', endOffset: 6 }));
  await fireEvent.changeText(input(), '正在编辑的新草稿');
  await act(async () => {
    finish({ id: 'older-comment' });
    await pending;
  });
  expect(onPosted).not.toHaveBeenCalled();
  expect(input().props.value).toBe('正在编辑的新草稿');
  expect(client.getQueryState(segments)?.isInvalidated).toBe(true);
});
