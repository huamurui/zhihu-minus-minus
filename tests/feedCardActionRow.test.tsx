import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { voteContent } from '../src/api/zhihu';
import type { ZhihuPreviewAnswerMetadata } from '../src/api/zhihu/nextRender';
import { voteContent as downvoteContent } from '../src/api/zhihu/voters';
import { AnswerPreviewFloatingBar } from '../src/components/AnswerPreviewFloatingBar';
import type { CollectionButton } from '../src/components/CollectionButton';
import { getContentActionBarBottom } from '../src/components/ContentActionBar';
import { FeedCardActionRow } from '../src/components/FeedCardActionRow';

const mockCollectionButton = jest.fn(
  (_props: ComponentProps<typeof CollectionButton>) => {},
);
const mockRouterPush = jest.fn();
const mockWindowDimensions = jest.fn(() => ({
  width: 393,
  height: 852,
  scale: 3,
  fontScale: 1,
}));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindowDimensions(),
}));

jest.mock('../src/components/CollectionButton', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    CollectionButton: (props: ComponentProps<typeof CollectionButton>) => {
      mockCollectionButton(props);
      return react.createElement(native.Pressable, {
        accessibilityRole: 'button',
        accessibilityLabel: '收藏',
        testID: `collection:${props.type}:${props.id}`,
      });
    },
  };
});

jest.mock('../src/api/zhihu', () => ({
  voteContent: jest.fn(),
  getVoteSuccessMessage: () => '合成结果',
}));
jest.mock('../src/api/zhihu/voters', () => ({
  voteContent: jest.fn(),
  getVoteSuccessMessage: () => '合成结果',
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({}),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));
jest.mock('react-native-reanimated', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: { View: native.View },
    useSharedValue: <T,>(value: T) => react.useRef({ value }).current,
    useAnimatedStyle: (callback: () => unknown) => callback(),
    withSequence: (...values: number[]) => values.at(-1),
    withSpring: (value: number) => value,
    withTiming: (value: number) => value,
  };
});
jest.mock('expo-blur', () => ({
  BlurView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return ({ name, size }: { name: string; size: number }) =>
    react.createElement(native.Text, {
      testID: `icon:${name}`,
      style: { fontSize: size },
    });
});
jest.mock('../src/components/VoteTriangle', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    VoteTriangle: ({ size, direction }: { size: number; direction: string }) =>
      react.createElement(native.Text, {
        testID: direction === 'down' ? 'downvote-icon' : 'vote-icon',
        style: { fontSize: size },
      }),
  };
});
jest.mock('../src/components/Themed', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Text: native.Text,
    View: native.View,
    ThemedIcon: ({ name, size }: { name: string; size: number }) =>
      react.createElement(native.Text, {
        testID: `icon:${name}`,
        style: { fontSize: size },
      }),
    useThemeColor: () => '#1364cc',
    useRuntimeThemeColors: () => ({
      shadow: '#000000',
      textSecondary: '#1364cc',
      link: '#1364cc',
      contentOverlayStrong: '#ffffff',
      contentBorder: '#cccccc',
    }),
  };
});
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton:
    jest.requireActual<typeof import('react-native')>('react-native').Pressable,
}));
jest.mock('../src/utils/contentCache', () => ({
  updateContentInteractionCaches: jest.fn(),
}));
jest.mock('../src/utils/toast', () => ({ showToast: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  mockWindowDimensions.mockReturnValue({
    width: 393,
    height: 852,
    scale: 3,
    fontScale: 1,
  });
});

test('inline actions vote on the current answer and open comments and more', async () => {
  const onComments = jest.fn();
  const onMore = jest.fn();
  const onVoteChange = jest.fn();
  jest.mocked(voteContent).mockResolvedValue({ voted: 1, voteCount: 20 });
  const host = await render(
    <FeedCardActionRow
      id="answer-a"
      voteCount={19}
      voted={0}
      engagementType="answers"
      commentCount={7}
      isCollected
      collectionCount={12}
      commentAccessibilityLabel="查看评论"
      onVoteChange={onVoteChange}
      onComments={onComments}
      onMore={onMore}
    />,
  );
  expect(host.queryByTestId('downvote-icon')).toBeNull();
  expect(mockCollectionButton).toHaveBeenLastCalledWith({
    id: 'answer-a',
    type: 'answer',
    isCollected: true,
    count: 12,
    variant: 'inline',
  });
  expect(
    host
      .getAllByRole('button')
      .map((button) => button.props.accessibilityLabel)
      .slice(-3),
  ).toEqual(['收藏', '查看评论', '更多操作']);
  const commentButton = host.getByRole('button', { name: '查看评论' });
  const moreButton = host.getByRole('button', { name: '更多操作' });
  await fireEvent.press(commentButton);
  expect(onComments).toHaveBeenCalledTimes(1);
  await fireEvent.press(moreButton);
  expect(onMore).toHaveBeenCalledTimes(1);
  await fireEvent.press(host.getAllByRole('button')[0]);
  expect(voteContent).toHaveBeenCalledWith('answer-a', 'answers', 'up');
  await waitFor(() => expect(onVoteChange).toHaveBeenCalledWith(1, 20));
});

test('preview downvote actions follow the current answer', async () => {
  const props = {
    id: 'answer-a',
    voteCount: 19,
    voted: 0,
    engagementType: 'answers' as const,
    commentCount: 7,
    showDownvote: true,
    onComments: jest.fn(),
    onMore: jest.fn(),
  };
  const host = await render(<FeedCardActionRow {...props} />);
  expect(host.getByRole('button', { name: '反对' })).toBeTruthy();
  await host.rerender(
    <FeedCardActionRow {...props} id="answer-b" voted={-1} isCollected />,
  );
  expect(mockCollectionButton).toHaveBeenLastCalledWith({
    id: 'answer-b',
    type: 'answer',
    isCollected: true,
    count: undefined,
    variant: 'inline',
  });
  expect(host.queryByTestId('collection:answer:answer-a')).toBeNull();
  jest.mocked(downvoteContent).mockResolvedValue({ voted: 0, voteCount: 19 });
  await fireEvent.press(host.getByRole('button', { name: '取消反对' }));
  expect(downvoteContent).toHaveBeenCalledWith(
    'answer-b',
    'answers',
    'neutral',
  );
  await waitFor(() =>
    expect(host.getByRole('button', { name: '反对' })).toBeTruthy(),
  );
});

test.each(['articles', 'pins', 'questions'] as const)(
  '%s inline actions offer collection only for supported content',
  async (engagementType) => {
    const host = await render(
      <FeedCardActionRow
        id="current-content"
        voteCount={0}
        voted={0}
        engagementType={engagementType}
        commentCount={0}
        onComments={jest.fn()}
        onMore={jest.fn()}
      />,
    );
    if (engagementType === 'articles') {
      expect(mockCollectionButton).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 'current-content', type: 'article' }),
      );
      expect(host.getByRole('button', { name: '收藏' })).toBeTruthy();
    } else {
      expect(mockCollectionButton).not.toHaveBeenCalled();
      expect(host.queryByRole('button', { name: '收藏' })).toBeNull();
    }
  },
);

test('non-engagement cards retain their more action without vote or comment controls', async () => {
  const onMore = jest.fn();
  const host = await render(
    <FeedCardActionRow
      id="question-a"
      voteCount={0}
      voted={0}
      engagementType={null}
      commentCount={0}
      onComments={jest.fn()}
      onMore={onMore}
    />,
  );
  expect(host.queryByTestId('vote-icon')).toBeNull();
  expect(host.queryByTestId('icon:chatbubble-outline')).toBeNull();
  expect(mockCollectionButton).not.toHaveBeenCalled();
  expect(host.getAllByRole('button')).toHaveLength(1);
  await fireEvent.press(host.getByRole('button', { name: '更多操作' }));
  expect(onMore).toHaveBeenCalledTimes(1);
});

test('floating bar keeps collection before comments with or without answer collapse', async () => {
  const answer: ZhihuPreviewAnswerMetadata = {
    id: 'answer-a',
    type: 'answer',
    question: { id: 'question-a', title: '合成问题' },
    author: { id: '', name: '', url_token: '', avatar_url: '', headline: '' },
    excerpt: '',
    voteup_count: 19,
    comment_count: 7,
    favlists_count: 0,
    relationship: { is_author: false, is_favorited: false, voting: 0 },
  };
  const onCollapse = jest.fn();
  const onMore = jest.fn();
  const host = await render(
    <AnswerPreviewFloatingBar
      answer={answer}
      visible
      bottomInset={0}
      onCollapse={onCollapse}
      onMore={onMore}
    />,
  );
  expect(mockCollectionButton).toHaveBeenLastCalledWith({
    id: answer.id,
    type: 'answer',
    isCollected: false,
    count: 0,
    countDisplay: 'corner',
    disabled: false,
  });
  const actionLabels = host
    .getAllByRole('button')
    .map((button) => button.props.accessibilityLabel);
  expect(actionLabels.indexOf('收藏') + 1).toBe(
    actionLabels.indexOf('7 条回答评论'),
  );
  await fireEvent.press(host.getByRole('button', { name: '收起当前回答' }));
  expect(onCollapse).toHaveBeenCalledWith(answer.id);
  const nextAnswer = {
    ...answer,
    id: 'answer-b',
    relationship: { ...answer.relationship, is_favorited: true },
  };
  await host.rerender(
    <AnswerPreviewFloatingBar
      answer={nextAnswer}
      visible
      bottomInset={0}
      canCollapse={false}
      onCollapse={onCollapse}
      onMore={onMore}
    />,
  );
  expect(mockCollectionButton).toHaveBeenLastCalledWith({
    id: nextAnswer.id,
    type: 'answer',
    isCollected: true,
    count: 0,
    countDisplay: 'corner',
    disabled: false,
  });
  expect(host.queryByTestId('collection:answer:answer-a')).toBeNull();
  expect(host.queryByRole('button', { name: '收起当前回答' })).toBeNull();
  expect(host.getByRole('button', { name: '7 条回答评论' })).toBeTruthy();
  await fireEvent.press(host.getByRole('button', { name: '回答更多操作' }));
  expect(onMore).toHaveBeenCalledWith(nextAnswer);
});

test.each([
  { width: 320, fontScale: 1 },
  { width: 360, fontScale: 1 },
  { width: 430, fontScale: 1.4 },
  { width: 430, fontScale: 1 },
])(
  'floating actions remain usable at width $width and font scale $fontScale',
  async ({ width, fontScale }) => {
    mockWindowDimensions.mockReturnValue({
      width,
      height: 852,
      scale: 3,
      fontScale,
    });
    const answer: ZhihuPreviewAnswerMetadata = {
      id: 'answer-large-counts',
      type: 'answer',
      question: { id: 'question-a', title: '合成问题' },
      author: {
        id: '',
        name: '',
        url_token: '',
        avatar_url: '',
        headline: '',
      },
      excerpt: '',
      voteup_count: 123456,
      comment_count: 9876,
      favlists_count: 12345,
      relationship: { is_author: false, is_favorited: false, voting: 0 },
    };
    const onCollapse = jest.fn();
    const onMore = jest.fn();
    jest.mocked(voteContent).mockResolvedValue({
      voted: 1,
      voteCount: answer.voteup_count + 1,
    });
    jest.mocked(downvoteContent).mockResolvedValue({ voted: -1 });
    const host = await render(
      <AnswerPreviewFloatingBar
        answer={answer}
        visible
        bottomInset={0}
        onCollapse={onCollapse}
        onMore={onMore}
      />,
    );

    expect(host.getByRole('button', { name: '收藏' })).toBeTruthy();
    expect(mockCollectionButton).toHaveBeenLastCalledWith(
      expect.objectContaining({
        count: 12345,
        countDisplay: 'corner',
      }),
    );
    expect(host.getByTestId('vote-icon')).toBeTruthy();
    expect(host.getByTestId('downvote-icon')).toBeTruthy();
    expect(host.getByText('9876')).toBeTruthy();
    await fireEvent.press(
      host.getByRole('button', { name: '9876 条回答评论' }),
    );
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/comments/[id]',
      params: { id: answer.id, type: 'answer', count: 9876 },
    });
    await fireEvent.press(host.getByRole('button', { name: '赞同，123456' }));
    await waitFor(() =>
      expect(voteContent).toHaveBeenCalledWith(answer.id, 'answers', 'up'),
    );
    await fireEvent.press(host.getByRole('button', { name: '反对' }));
    await waitFor(() =>
      expect(downvoteContent).toHaveBeenCalledWith(
        answer.id,
        'answers',
        'down',
      ),
    );
    await fireEvent.press(host.getByRole('button', { name: '回答更多操作' }));
    expect(onMore).toHaveBeenCalledWith(answer);
    await fireEvent.press(host.getByRole('button', { name: '收起当前回答' }));
    expect(onCollapse).toHaveBeenCalledWith(answer.id);
  },
);

test('floating actions stay above the safe area and requested offset', () => {
  for (const [inset, offset] of [
    [0, 0],
    [8, 0],
    [12, 0],
    [34, 0],
    [8, 10],
    [34, 10],
  ]) {
    const bottom = getContentActionBarBottom(inset, offset);
    expect(Number.isFinite(bottom)).toBe(true);
    expect(bottom).toBeGreaterThanOrEqual(inset + offset);
  }
});
