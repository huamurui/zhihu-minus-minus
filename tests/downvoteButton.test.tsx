import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { voteContent } from '../api/zhihu/voters';
import { DownvoteButton } from '../components/DownvoteButton';
import { LikeButton } from '../components/LikeButton';

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
    VoteTriangle: ({
      size,
      color,
      direction,
    }: {
      size: number;
      color: string;
      direction: 'up' | 'down';
    }) =>
      react.createElement(native.Text, {
        testID: `vote:${direction}`,
        style: { fontSize: size, color },
      }),
  };
});
jest.mock('../components/Themed', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { Text: native.Text, useThemeColor: () => '#1364cc' };
});
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../components/BouncyButton', () => ({
  BouncyButton:
    jest.requireActual<typeof import('react-native')>('react-native').Pressable,
}));
jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));

const previewKey = ['answer-preview-list', 'synthetic-answer', 1] as const;
const clients: QueryClient[] = [];

interface CachedAnswer {
  id: string;
  type: 'answer';
  voteup_count: number;
  relationship: { voting: number };
}

function CachedVoteButtons() {
  const { data } = useQuery<{ items: CachedAnswer[] }>({
    queryKey: previewKey,
    queryFn: async () => ({ items: [] }),
    enabled: false,
  });
  const answer = data?.items[0];
  if (!answer) return null;
  return (
    <>
      <LikeButton
        id={answer.id}
        count={answer.voteup_count}
        voted={answer.relationship.voting}
        variant="ghost"
      />
      <DownvoteButton
        id={answer.id}
        voted={answer.relationship.voting}
        variant="ghost"
      />
    </>
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

test('preview cache keeps upvote and downvote mutually exclusive when downvote is toggled', async () => {
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
  jest.mocked(voteContent).mockResolvedValueOnce({ voted: -1, voteCount: 9 });
  const host = await render(
    <QueryClientProvider client={client}>
      <CachedVoteButtons />
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
    expect(host.getAllByRole('button')[0]).not.toBeSelected();
    expect(host.getByRole('button', { name: '取消反对' })).toBeSelected();
    expect(host.getByText('9')).toBeTruthy();
  });
  expect(client.getQueryData(previewKey)).toMatchObject({
    items: [{ voteup_count: 9, relationship: { voting: -1 } }],
  });

  jest.mocked(voteContent).mockResolvedValueOnce({ voted: 0, voteCount: 9 });
  await fireEvent.press(host.getByRole('button', { name: '取消反对' }));
  expect(voteContent).toHaveBeenLastCalledWith(
    'synthetic-answer',
    'answers',
    'neutral',
  );
  await waitFor(() => {
    expect(host.getByRole('button', { name: '反对' })).not.toBeSelected();
    expect(host.getAllByRole('button')[0]).not.toBeSelected();
  });
});
