import { act, fireEvent, render } from '@testing-library/react-native';
import type React from 'react';
import { Profiler } from 'react';
import { type FeedItem, voteContent } from '../src/api/zhihu';
import type { CollectionButton } from '../src/components/CollectionButton';
import { CreationCard } from '../src/components/CreationCard';
import { FeedCard } from '../src/components/FeedCard';
import { seedAnswerPreviewEntry } from '../src/utils/answerPreviewEntry';
import type {
  AnswerReadingContext,
  AnswerReadingRouteParams,
} from '../src/utils/answerReadingContext';
import { updateContentInteractionCaches } from '../src/utils/contentCache';

interface MenuProps {
  visible: boolean;
  type: string;
  data: {
    id: string | number;
    questionId?: string | number;
    isCollected?: boolean;
  };
  additionalOptions?: Array<{ key: string; onPress: () => unknown }>;
}

let mockShareMenuProps: MenuProps;
const mockUseContentActions = jest.fn();
const mockCopy = jest.fn();
const mockPush = jest.fn();
const mockCollectionButton = jest.fn(
  (_props: React.ComponentProps<typeof CollectionButton>) => {},
);

jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  const react = jest.requireActual('react');
  const View = react.forwardRef((props: object, ref: React.Ref<unknown>) => {
    react.useImperativeHandle(ref, () => ({
      measureInWindow: (callback: (...frame: number[]) => void) =>
        callback(0, 0, 320, 160),
    }));
    return react.createElement(native.View, props);
  });
  return new Proxy(native, {
    get: (target, key) => (key === 'View' ? View : target[key]),
  });
});
jest.mock('../src/api/zhihu', () => ({
  ...jest.requireActual('../src/api/zhihu/contentCollection'),
  voteContent: jest.fn(),
  getVoteSuccessMessage: () => '合成成功',
  getContentVoteCount: () => 0,
  getContentVoteState: () => 0,
}));
jest.mock('../src/api/client', () => ({ hasAuthenticationCookie: () => true }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../src/components/CollectionButton', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    CollectionButton: (
      props: React.ComponentProps<typeof CollectionButton>,
    ) => {
      mockCollectionButton(props);
      return react.createElement(native.Pressable, {
        accessibilityRole: 'button',
        accessibilityLabel: '收藏',
        testID: `collection:${props.type}:${props.id}`,
      });
    },
  };
});
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: jest.requireActual('react-native').View,
    Image: jest.requireActual('react-native').Image,
  },
  SharedTransition: { duration: () => ({}) },
}));
jest.mock('../src/store/useAuthStore', () => ({
  useAuthStore: () => ({ cookies: 'synthetic-session' }),
}));
jest.mock('../src/store/useCollectionStore', () => ({
  useCollectionStore: (selector: (state: object) => unknown) =>
    selector({ collectedStatusMap: {}, collectedCountOffsetMap: {} }),
}));
jest.mock('../src/hooks/useContentActions', () => ({
  useContentActions: (options: unknown) => {
    mockUseContentActions(options);
    return {
      actions: [
        {
          key: 'copy-link',
          label: '复制链接',
          icon: 'link-outline',
          onPress: mockCopy,
        },
      ],
    };
  },
}));
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../src/components/Themed', () => {
  const native = jest.requireActual('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useThemeColor: () => '#123456',
    useRuntimeThemeColors: () => ({
      backgroundSecondary: '#123456',
      border: '#123456',
    }),
  };
});
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/FeedCardPreview', () => ({
  FeedCardPreview: () => null,
}));
jest.mock('../src/components/FeedExcerpt', () => ({ FeedExcerpt: () => null }));
jest.mock('../src/components/ShareMenu', () => ({
  ShareMenu: (props: MenuProps) => {
    mockShareMenuProps = props;
    return props.visible
      ? jest
          .requireActual('react')
          .createElement(
            jest.requireActual('react-native').Text,
            null,
            `更多:${props.data.id}`,
          )
      : null;
  },
}));
jest.mock('../src/features/rich-content', () => ({ ZhihuContent: () => null }));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: jest.requireActual('react-native').View,
}));
jest.mock('../src/components/LikeButton', () => ({
  LikeButton: ({ count, voted }: { count: number; voted: number }) =>
    jest
      .requireActual('react')
      .createElement(
        jest.requireActual('react-native').Text,
        null,
        `vote:${voted}/${count}`,
      ),
}));
jest.mock('../src/components/CustomContextMenu', () => ({
  CustomContextMenu: ({
    options,
  }: {
    options: Array<{ key: string; title: string; onPress: () => void }>;
  }) =>
    options.map((option) =>
      jest.requireActual('react').createElement(
        jest.requireActual('react-native').Pressable,
        {
          key: option.key,
          onPress: () => {
            void option.onPress();
          },
        },
        jest
          .requireActual('react')
          .createElement(
            jest.requireActual('react-native').Text,
            null,
            option.title,
          ),
      ),
    ),
}));
jest.mock('../src/utils/contentCache', () => ({
  seedRichContentFromFeedItem: jest.fn(),
  updateContentInteractionCaches: jest.fn(),
}));
jest.mock('../src/utils/answerPreviewEntry', () => ({
  seedAnswerPreviewEntry: jest.fn(),
}));
jest.mock('../src/utils/haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));
jest.mock('../src/utils/toast', () => ({ showToast: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

const baseItem: FeedItem = {
  id: 'original',
  type: 'answers',
  title: '合成原卡片',
  excerpt: '',
  author: { id: 'author', name: '合成作者', avatar: '' },
  image: null,
  voteCount: 10,
  commentCount: 0,
  voted: 0,
};

test('recycled feed images switch sources without replaying the Android fade', async () => {
  const first = {
    ...baseItem,
    author: { ...baseItem.author, avatar: 'https://example.test/a.jpg' },
    image: 'https://example.test/first.jpg',
  };
  const host = await render(<FeedCard item={first} />);
  const images = () => host.container.queryAll((node) => node.type === 'Image');
  expect(images().map((image) => image.props.fadeDuration)).toEqual([0, 0]);
  expect(images().map((image) => image.props.source?.uri)).toEqual([
    first.author.avatar,
    first.image,
  ]);

  const second = {
    ...first,
    id: 'next',
    author: { ...first.author, avatar: 'https://example.test/b.jpg' },
    image: 'https://example.test/second.jpg',
  };
  await host.rerender(<FeedCard item={second} />);
  expect(images().map((image) => image.props.source?.uri)).toEqual([
    second.author.avatar,
    second.image,
  ]);
  expect(images().map((image) => image.props.fadeDuration)).toEqual([0, 0]);
});

test('an anonymous author without an identity cannot open an empty profile route', async () => {
  const host = await render(
    <FeedCard
      item={{
        ...baseItem,
        author: { id: '', name: '匿名用户', avatar: '' },
      }}
    />,
  );
  expect(host.getByText('匿名用户')).toBeDisabled();
  await fireEvent.press(host.getByText('匿名用户'));
  expect(mockPush).not.toHaveBeenCalledWith(
    expect.objectContaining({ pathname: '/user/[id]' }),
  );
});

test.each([
  { id: 'answer-author-id', url_token: undefined },
  { id: 'answer-author-id', url_token: 'answer-author-token' },
])('an author profile opens using its own identity: %j', async (author) => {
  const host = await render(
    <FeedCard
      item={{ ...baseItem, author: { ...baseItem.author, ...author } }}
    />,
  );
  await fireEvent.press(host.getByText('合成作者'));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/user/[id]',
    params: { id: author.url_token || author.id, avatar: '', name: '合成作者' },
  });
});

test('a recycled card shows the new item in the same commit', async () => {
  // A follow-up update after each recycle commit chains with FlashList's own
  // layout updates; a large page append then exceeds React's update depth.
  let commits = 0;
  const onRender = () => {
    commits += 1;
  };
  const host = await render(
    <Profiler id="card" onRender={onRender}>
      <FeedCard item={baseItem} />
    </Profiler>,
  );
  commits = 0;
  await host.rerender(
    <Profiler id="card" onRender={onRender}>
      <FeedCard
        item={{ ...baseItem, id: 'recycled', voteCount: 42, voted: 1 }}
      />
    </Profiler>,
  );
  expect(host.getByText('vote:1/42')).toBeTruthy();
  expect(commits).toBe(1);
});

test('the action line still opens the author profile when the author row is hidden', async () => {
  const host = await render(
    <FeedCard
      item={{
        ...baseItem,
        actionText: '合成作者 回答了问题',
        hideAuthor: true,
      }}
    />,
  );
  await fireEvent.press(host.getByRole('link', { name: '查看合成作者的主页' }));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/user/[id]',
    params: { id: 'author', avatar: '', name: '合成作者' },
  });
});

test('opening an author passes the known avatar, name and headline to the profile', async () => {
  const host = await render(
    <FeedCard
      item={{
        ...baseItem,
        author: {
          ...baseItem.author,
          avatar: 'https://example.com/avatar.jpg',
          headline: '合成简介',
        },
      }}
    />,
  );
  await fireEvent.press(host.getByText('合成作者'));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/user/[id]',
    params: {
      id: 'author',
      avatar: 'https://example.com/avatar.jpg',
      name: '合成作者',
      headline: '合成简介',
    },
  });
});

test('a context-menu vote remains attached to its original item after recycling and ignores duplicate taps', async () => {
  let finish: (result: Awaited<ReturnType<typeof voteContent>>) => void =
    () => {};
  jest.mocked(voteContent).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const item: FeedItem = {
    id: 'original',
    type: 'answers',
    title: '合成原卡片',
    excerpt: '',
    author: { id: 'author', name: '合成作者', avatar: '' },
    image: null,
    voteCount: 10,
    commentCount: 0,
    voted: 0,
  };
  const host = await render(<FeedCard item={item} />);
  await fireEvent(host.getByText('合成原卡片'), 'longPress');
  await fireEvent.press(host.getByText('赞同'));
  await fireEvent.press(host.getByText('赞同'));
  expect(voteContent).toHaveBeenCalledTimes(1);
  await host.rerender(
    <FeedCard item={{ ...item, id: 'next', title: '合成新卡片' }} />,
  );
  expect(host.queryByText('赞同')).toBeNull();
  await act(() => finish({ voted: 1, voteCount: 11 }));
  expect(host.getByText('vote:0/10')).toBeTruthy();
  expect(updateContentInteractionCaches).toHaveBeenCalledWith(
    expect.anything(),
    { type: 'answers', id: 'original', voted: 1, voteCount: 11 },
  );
});

test.each(['answers', 'articles', 'pins', 'questions', 'videos'] as const)(
  'a %s feed card exposes its more entry and collection for supported content',
  async (type) => {
    const host = await render(
      <FeedCard item={{ ...baseItem, type, questionId: 'question' }} />,
    );
    if (type === 'answers' || type === 'articles') {
      expect(mockCollectionButton).toHaveBeenLastCalledWith({
        id: 'original',
        type: type === 'answers' ? 'answer' : 'article',
        isCollected: undefined,
        count: undefined,
        variant: 'inline',
      });
      expect(
        host
          .getAllByRole('button')
          .map((button) => button.props.accessibilityLabel)
          .slice(-3),
      ).toEqual(['收藏', '评论', '更多操作']);
    } else {
      expect(host.queryByRole('button', { name: '收藏' })).toBeNull();
    }
    expect(mockUseContentActions).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    );
    const stopPropagation = jest.fn();
    await fireEvent.press(host.getByRole('button', { name: '更多操作' }), {
      stopPropagation,
    });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(host.getByText('更多:original')).toBeTruthy();
    expect(mockShareMenuProps.data).toMatchObject({
      id: 'original',
      questionId: 'question',
      isCollected: undefined,
    });
    await host.rerender(
      <FeedCard
        item={{ ...baseItem, type, id: 'next', title: '合成新卡片' }}
      />,
    );
    expect(host.queryByText('更多:original')).toBeNull();
    expect(host.queryByText('更多:next')).toBeNull();
    if (type === 'answers' || type === 'articles') {
      expect(mockCollectionButton).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 'next' }),
      );
    }
  },
);

test('feed collection actions receive the current list state and refreshed count', async () => {
  const host = await render(
    <FeedCard item={{ ...baseItem, isCollected: true, favlistsCount: 0 }} />,
  );
  expect(mockCollectionButton).toHaveBeenLastCalledWith(
    expect.objectContaining({
      id: baseItem.id,
      isCollected: true,
      count: 0,
    }),
  );
  await host.rerender(
    <FeedCard item={{ ...baseItem, isCollected: false, favlistsCount: 12 }} />,
  );
  expect(mockCollectionButton).toHaveBeenLastCalledWith(
    expect.objectContaining({
      id: baseItem.id,
      isCollected: false,
      count: 12,
    }),
  );
});

test('recommendation feedback remains attached to the menu item and updates after recycling', async () => {
  const onUninterested = jest.fn(async () => {});
  const host = await render(
    <FeedCard
      item={baseItem}
      tab="recommend"
      onUninterested={onUninterested}
    />,
  );
  const originalAction = mockShareMenuProps.additionalOptions?.find(
    (option) => option.key === 'uninterested',
  );
  expect(originalAction).toBeDefined();
  expect(mockUseContentActions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      additionalOptions: [expect.objectContaining({ key: 'uninterested' })],
    }),
  );
  const nextItem = { ...baseItem, id: 'next', title: '合成下个推荐' };
  await host.rerender(
    <FeedCard
      item={nextItem}
      tab="recommend"
      onUninterested={onUninterested}
    />,
  );
  await originalAction?.onPress();
  expect(onUninterested).toHaveBeenLastCalledWith(baseItem);
  await mockShareMenuProps.additionalOptions
    ?.find((option) => option.key === 'uninterested')
    ?.onPress();
  expect(onUninterested).toHaveBeenLastCalledWith(nextItem);
  await host.rerender(
    <FeedCard
      item={{ ...nextItem, isIdStable: false }}
      tab="recommend"
      onUninterested={onUninterested}
    />,
  );
  expect(mockShareMenuProps.additionalOptions).toEqual([]);
});

test('feed previews use the shared action builder with the current content identity', async () => {
  const host = await render(
    <FeedCard item={{ ...baseItem, questionId: 'question' }} />,
  );
  await fireEvent(host.getByText('合成原卡片'), 'longPress');
  expect(mockUseContentActions).toHaveBeenLastCalledWith({
    type: 'answer',
    enabled: true,
    data: expect.objectContaining({
      id: 'original',
      questionId: 'question',
      isCollected: undefined,
    }),
  });
  await fireEvent.press(host.getByText('复制链接'));
  expect(mockCopy).toHaveBeenCalledTimes(1);
});

test.each(['created_time', 'updated_time'] as const)(
  'feed navigation seeds the refreshed %s when other card fields are unchanged',
  async (field) => {
    const item = { ...baseItem, created_time: 100, updated_time: 200 };
    const host = await render(<FeedCard item={item} />);
    const refreshed = { ...item, [field]: 300 };
    await host.rerender(<FeedCard item={refreshed} />);
    await fireEvent.press(host.getByText('合成原卡片'));

    expect(seedAnswerPreviewEntry).toHaveBeenLastCalledWith(
      expect.any(Object),
      refreshed,
    );
  },
);

test('recycled card navigation updates answer context with the same item reference and leaves article routes alone', async () => {
  const host = await render(<FeedCard item={baseItem} />);
  await fireEvent.press(host.getByText('合成原卡片'));
  expect(seedAnswerPreviewEntry).toHaveBeenLastCalledWith(
    expect.any(Object),
    baseItem,
  );
  expect(mockPush).toHaveBeenLastCalledWith({
    pathname: '/answer/[id]',
    params: {
      id: baseItem.id,
      title: baseItem.title,
      questionId: undefined,
      answerScene: 'unknown',
    },
  });
  for (const tab of ['recommend', 'local', 'following']) {
    await host.rerender(<FeedCard item={baseItem} tab={tab} />);
    await fireEvent.press(host.getByText('合成原卡片'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/answer/[id]',
      params: expect.objectContaining({
        id: baseItem.id,
        source: 'feed',
        tab,
        answerScene: tab === 'following' ? 'unknown' : 'recommend',
      }),
    });
  }
  const contexts: Array<{
    context: AnswerReadingContext;
    route: AnswerReadingRouteParams;
  }> = [
    {
      context: {
        scene: 'profile_answer',
        memberId: 'owner-a',
        memberSort: 'created',
      },
      route: {
        answerScene: 'profile_answer',
        memberId: 'owner-a',
        memberSort: 'created',
      },
    },
    {
      context: {
        scene: 'profile_answer',
        memberId: 'owner-a',
        memberSort: 'voteups',
      },
      route: {
        answerScene: 'profile_answer',
        memberId: 'owner-a',
        memberSort: 'voteups',
      },
    },
    {
      context: {
        scene: 'profile_answer',
        memberId: 'owner-b',
        memberSort: 'voteups',
      },
      route: {
        answerScene: 'profile_answer',
        memberId: 'owner-b',
        memberSort: 'voteups',
      },
    },
    {
      context: { scene: 'question_feed' },
      route: { answerScene: 'question_feed' },
    },
  ];
  for (const { context, route } of contexts) {
    await host.rerender(<FeedCard item={baseItem} answerContext={context} />);
    await fireEvent.press(host.getByText('合成原卡片'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/answer/[id]',
      params: {
        id: baseItem.id,
        title: baseItem.title,
        questionId: undefined,
        ...route,
      },
    });
  }
  const article: FeedItem = { ...baseItem, type: 'articles' };
  for (const { context } of contexts.slice(0, 2)) {
    await host.rerender(<FeedCard item={article} answerContext={context} />);
    await fireEvent.press(host.getByText('合成原卡片'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/article/[id]',
      params: { id: article.id, title: article.title, questionId: undefined },
    });
  }
  await host.unmount();
});

test('ordinary creation cards navigate to answers and reset their more menu after identity recycling', async () => {
  const item = {
    id: 'original',
    title: '合成原创作',
    content: '合成正文'.repeat(40),
    question: { id: 'question', title: '合成问题' },
  };
  const host = await render(<CreationCard item={item} type="answer" />);
  expect(mockCollectionButton).toHaveBeenLastCalledWith({
    id: 'original',
    type: 'answer',
    isCollected: undefined,
    count: undefined,
    variant: 'inline',
  });
  expect(
    host
      .getAllByRole('button')
      .map((button) => button.props.accessibilityLabel)
      .slice(-3),
  ).toEqual(['收藏', '评论', '更多操作']);
  expect(host.queryByText('展开全文')).toBeNull();
  await fireEvent.press(host.getByText('合成原创作'));
  expect(seedAnswerPreviewEntry).toHaveBeenCalledWith(expect.any(Object), {
    ...item,
    type: 'answer',
  });
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/answer/[id]',
    params: {
      id: 'original',
      title: '合成原创作',
      questionId: 'question',
      answerScene: 'unknown',
    },
  });
  mockPush.mockClear();
  const stopPropagation = jest.fn();
  await fireEvent.press(host.getByRole('button', { name: '更多操作' }), {
    stopPropagation,
  });
  expect(stopPropagation).toHaveBeenCalledTimes(1);
  expect(mockPush).not.toHaveBeenCalled();
  expect(host.getByText('更多:original')).toBeTruthy();
  expect(mockShareMenuProps.data).toMatchObject({
    questionId: 'question',
    isCollected: undefined,
  });
  await host.rerender(
    <CreationCard item={{ ...item, id: 'next' }} type="answer" />,
  );
  expect(host.queryByText('更多:next')).toBeNull();
  expect(host.queryByText('收起回答')).toBeNull();
  expect(host.queryByText('展开全文')).toBeNull();
  expect(mockCollectionButton).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 'next', type: 'answer' }),
  );
});

test.each(['article', 'pin', 'question', 'video'] as const)(
  '%s creation cards expose collection only for supported content',
  async (type) => {
    const host = await render(
      <CreationCard
        item={{
          id: 'creation',
          title: '合成创作',
          relationship: { is_favorited: true },
          favlists_count: 12,
        }}
        type={type}
      />,
    );
    if (type === 'article') {
      expect(mockCollectionButton).toHaveBeenLastCalledWith({
        id: 'creation',
        type: 'article',
        isCollected: true,
        count: 12,
        variant: 'inline',
      });
    } else {
      expect(host.queryByRole('button', { name: '收藏' })).toBeNull();
      expect(mockCollectionButton).not.toHaveBeenCalled();
    }
  },
);

test.each(['lens', 'zvideo', undefined] as const)(
  'video feed cards route with their source %s and retain the legacy default',
  async (source) => {
    const item: FeedItem = { ...baseItem, type: 'videos', videoSource: source };
    const host = await render(<FeedCard item={item} />);
    await fireEvent.press(host.getByText('合成原卡片'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/video/[id]',
      params: { id: item.id, title: item.title, source: source || 'zvideo' },
    });
  },
);

test('a memoized video card with the same ID switches its playback namespace', async () => {
  const item: FeedItem = { ...baseItem, type: 'videos', videoSource: 'lens' };
  const host = await render(<FeedCard item={item} />);
  await fireEvent.press(host.getByText('合成原卡片'));
  expect(mockPush).toHaveBeenLastCalledWith(
    expect.objectContaining({
      params: expect.objectContaining({ source: 'lens' }),
    }),
  );
  await host.rerender(<FeedCard item={{ ...item, videoSource: 'zvideo' }} />);
  await fireEvent.press(host.getByText('合成原卡片'));
  expect(mockPush).toHaveBeenLastCalledWith(
    expect.objectContaining({
      params: expect.objectContaining({ source: 'zvideo' }),
    }),
  );
});

test.each([
  ['video', 'lens'],
  ['zvideo', 'zvideo'],
  [undefined, 'zvideo'],
] as const)(
  'collection creation cards retain raw video type %s when routing',
  async (rawType, source) => {
    const item = {
      id: '2088306465639604943',
      type: rawType,
      title: '收藏视频',
    };
    const host = await render(<CreationCard item={item} type="video" />);
    await fireEvent.press(host.getByText('收藏视频'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/video/[id]',
      params: { id: item.id, title: item.title, source },
    });
  },
);
