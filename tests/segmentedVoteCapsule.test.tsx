import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { voteContent } from '../api/zhihu/voters';
import { SegmentedVoteCapsule } from '../components/SegmentedVoteCapsule';

jest.mock('../api/zhihu', () => ({
  voteContent: jest.fn(),
  getVoteSuccessMessage: () => '合成结果',
}));
jest.mock('../api/zhihu/voters', () => jest.requireMock('../api/zhihu'));
jest.mock('../features/rich-content', () =>
  jest.requireActual('../features/rich-content/queryPolicy'),
);
jest.mock('../store/useAuthStore', () => ({
  getAuthSessionVersion: () => 1,
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual('react-native').View },
  useAnimatedStyle: (callback: () => unknown) => callback(),
  useSharedValue: (value: number) => ({ value }),
  withSequence: (...values: number[]) => values.at(-1),
  withSpring: (value: number) => value,
  withTiming: (value: number) => value,
}));
jest.mock('../components/VoteTriangle', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    VoteTriangle: ({ direction }: { direction: 'up' | 'down' }) =>
      react.createElement(native.Text, { testID: `vote:${direction}` }),
  };
});
jest.mock('../components/Themed', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  const palette = jest.requireActual<
    typeof import('../constants/designTokens')
  >('../constants/designTokens').colors.light;
  return {
    Text: native.Text,
    useThemeColor: () => palette.primary,
    useRuntimeThemeColors: () => palette,
  };
});
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../components/BouncyButton', () => ({
  BouncyButton:
    jest.requireActual<typeof import('react-native')>('react-native').Pressable,
}));
jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));

const clients: QueryClient[] = [];
const previewKey = ['answer-preview-list', 'synthetic-answer', 1] as const;

interface CachedAnswer {
  id: string;
  type: 'answer';
  voteup_count: number;
  relationship: { voting: number };
}

function CachedVoteCapsule() {
  const { data } = useQuery<{ items: CachedAnswer[] }>({
    queryKey: previewKey,
    queryFn: async () => ({ items: [] }),
    enabled: false,
  });
  const answer = data?.items[0];
  if (!answer) return null;
  return (
    <SegmentedVoteCapsule
      id={answer.id}
      count={answer.voteup_count}
      voted={answer.relationship.voting}
    />
  );
}

function createClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return client;
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

test('downvote response count updates the capsule and its parent without a subscribed content cache', async () => {
  const onVoteChange = jest.fn();
  jest.mocked(voteContent).mockResolvedValueOnce({ voted: -1, voteCount: 6 });
  const host = await render(
    <QueryClientProvider client={createClient()}>
      <SegmentedVoteCapsule
        id="synthetic-answer"
        count={10}
        voted={1}
        onVoteChange={onVoteChange}
      />
    </QueryClientProvider>,
  );
  expect(host.getAllByRole('button')[0]).toBeSelected();
  await fireEvent.press(host.getByRole('button', { name: '反对' }));
  expect(voteContent).toHaveBeenCalledWith(
    'synthetic-answer',
    'answers',
    'down',
  );
  await waitFor(() => {
    expect(host.getByText('6')).toBeTruthy();
    expect(host.getAllByRole('button')[0]).not.toBeSelected();
    expect(host.getByRole('button', { name: '取消反对' })).toBeSelected();
    expect(onVoteChange).toHaveBeenCalledWith(-1, 6);
  });
  expect(onVoteChange).toHaveBeenCalledTimes(1);
  expect(host.getByTestId('vote:up')).toBeTruthy();
});

test.each([
  [10, 9],
  [0, 0],
])('switching from upvote to downvote without a response count changes %d to %d', async (initialCount, expectedCount) => {
  const onVoteChange = jest.fn();
  jest.mocked(voteContent).mockResolvedValueOnce({ voted: -1 });
  const host = await render(
    <QueryClientProvider client={createClient()}>
      <SegmentedVoteCapsule
        id="synthetic-answer"
        count={initialCount}
        voted={1}
        onVoteChange={onVoteChange}
      />
    </QueryClientProvider>,
  );
  await fireEvent.press(host.getByRole('button', { name: '反对' }));
  await waitFor(() => {
    expect(host.getByText(String(expectedCount))).toBeTruthy();
    expect(host.getAllByRole('button')[0]).not.toBeSelected();
    expect(host.getByRole('button', { name: '取消反对' })).toBeSelected();
    expect(onVoteChange).toHaveBeenCalledWith(-1, expectedCount);
  });
});

test('canceling downvote without a response count keeps the current upvote count', async () => {
  const onVoteChange = jest.fn();
  jest.mocked(voteContent).mockResolvedValueOnce({ voted: 0 });
  const host = await render(
    <QueryClientProvider client={createClient()}>
      <SegmentedVoteCapsule
        id="synthetic-answer"
        count={10}
        voted={-1}
        onVoteChange={onVoteChange}
      />
    </QueryClientProvider>,
  );
  await fireEvent.press(host.getByRole('button', { name: '取消反对' }));
  expect(voteContent).toHaveBeenCalledWith(
    'synthetic-answer',
    'answers',
    'neutral',
  );
  await waitFor(() => {
    expect(host.getByText('10')).toBeTruthy();
    expect(host.getByRole('button', { name: '反对' })).not.toBeSelected();
    expect(host.getAllByRole('button')[0]).not.toBeSelected();
    expect(onVoteChange).toHaveBeenCalledWith(0, 10);
  });
});

test('a capsule subscribed to the content cache preserves the fallback count after its props update', async () => {
  const client = createClient();
  client.setQueryData(previewKey, {
    items: [
      {
        id: 'synthetic-answer',
        type: 'answer',
        voteup_count: 10,
        relationship: { voting: 1 },
      },
    ],
  });
  jest.mocked(voteContent).mockResolvedValueOnce({ voted: -1 });
  const host = await render(
    <QueryClientProvider client={client}>
      <CachedVoteCapsule />
    </QueryClientProvider>,
  );
  await fireEvent.press(host.getByRole('button', { name: '反对' }));
  await waitFor(() => {
    expect(client.getQueryData(previewKey)).toMatchObject({
      items: [{ voteup_count: 9, relationship: { voting: -1 } }],
    });
    expect(host.getByText('9')).toBeTruthy();
    expect(host.getAllByRole('button')[0]).not.toBeSelected();
    expect(host.getByRole('button', { name: '取消反对' })).toBeSelected();
  });
});

test.each([
  '10',
  '1万',
])('a string count %s remains unchanged when the downvote response omits its count', async (count) => {
  const onVoteChange = jest.fn();
  jest.mocked(voteContent).mockResolvedValueOnce({ voted: -1 });
  const host = await render(
    <QueryClientProvider client={createClient()}>
      <SegmentedVoteCapsule
        id="synthetic-answer"
        count={count}
        voted={1}
        onVoteChange={onVoteChange}
      />
    </QueryClientProvider>,
  );
  await fireEvent.press(host.getByRole('button', { name: '反对' }));
  await waitFor(() => {
    expect(host.getByRole('button', { name: '取消反对' })).toBeSelected();
    expect(host.getAllByRole('button')[0]).not.toBeSelected();
    expect(host.getByText(count)).toBeTruthy();
  });
  expect(onVoteChange).not.toHaveBeenCalled();
});

test('a server count replaces a string count and reaches the external callback', async () => {
  const onVoteChange = jest.fn();
  jest
    .mocked(voteContent)
    .mockResolvedValueOnce({ voted: -1, voteCount: 12500 });
  const host = await render(
    <QueryClientProvider client={createClient()}>
      <SegmentedVoteCapsule
        id="synthetic-answer"
        count="1万"
        onVoteChange={onVoteChange}
      />
    </QueryClientProvider>,
  );
  await fireEvent.press(host.getByRole('button', { name: '反对' }));
  await waitFor(() => {
    expect(host.getByText('12500')).toBeTruthy();
    expect(onVoteChange).toHaveBeenCalledWith(-1, 12500);
  });
});
