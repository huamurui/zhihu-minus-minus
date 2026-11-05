import { render } from '@testing-library/react-native';
import { HotCard, type HotItem } from '../src/components/HotCard';
import { useSettingsStore } from '../src/store/useSettingsStore';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { Image: jest.requireActual('react-native').Image },
}));
jest.mock('../src/store/useAuthStore', () => ({
  useAuthStore: () => ({ cookies: 'synthetic-session' }),
}));
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/Themed', () => ({
  Text: jest.requireActual('react-native').Text,
  useRuntimeThemeColors: () => ({
    backgroundSecondary: '#ffffff',
    border: '#e5e5ea',
    textTertiary: '#999999',
  }),
}));

const item = (rank: number): HotItem => ({
  id: `hot-${rank}`,
  questionId: `question-${rank}`,
  title: `合成热榜问题 ${rank}`,
  excerpt: '',
  image: null,
  hotValue: '893 万热度',
  rank,
  answerCount: 188,
});

test('a row shows the whole title with only its heat underneath', async () => {
  const host = await render(<HotCard item={item(1)} />);
  expect(host.getByText('合成热榜问题 1').props.numberOfLines).toBeUndefined();
  expect(host.getByText('893 万热度')).toBeTruthy();
  expect(host.queryByText(/个回答/)).toBeNull();
});

test.each([1, 2, 4])('rank %i stays visible beside its title', async (rank) => {
  const host = await render(<HotCard item={item(rank)} />);
  expect(host.getByText(String(rank))).toBeTruthy();
  expect(host.getByText(`合成热榜问题 ${rank}`)).toBeTruthy();
});

describe('surface style', () => {
  const initial = useSettingsStore.getState().surfaceStyle;
  afterEach(() => useSettingsStore.setState({ surfaceStyle: initial }));

  test('layered rows are separate cards without dividers', async () => {
    useSettingsStore.setState({ surfaceStyle: 'layered' });
    const host = await render(<HotCard item={item(1)} />);
    const row = host.getByRole('button');
    expect(row).not.toHaveStyle({ borderBottomWidth: expect.any(Number) });
    expect(row).toHaveStyle({ backgroundColor: '#ffffff' });
  });

  test('flat rows drop the card and are divided by a line', async () => {
    useSettingsStore.setState({ surfaceStyle: 'flat' });
    const host = await render(<HotCard item={item(1)} />);
    const row = host.getByRole('button');
    expect(row).toHaveStyle({
      backgroundColor: 'transparent',
      borderBottomColor: '#e5e5ea',
    });
  });
});
