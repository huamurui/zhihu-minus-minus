import { render, screen } from '@testing-library/react-native';
import { UnreadBadge } from '../src/components/UnreadBadge';
import { useSettingsStore } from '../src/store/useSettingsStore';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../src/store/useSettingsStore', () => ({
  useSettingsStore: jest.requireActual('zustand').create(() => ({
    primaryColor: null,
    readingBackground: 'default',
    textContrast: 'standard',
    surfaceStyle: 'layered',
    fontSizeScale: 1,
    lineHeightScale: 1.5,
    unreadBadgeStyle: 'count',
  })),
}));
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));

test.each([
  ['count', 'corner'],
  ['tinted', 'corner'],
  ['count', 'inline'],
  ['tinted', 'inline'],
] as const)('%s style shows a capped number (%s)', async (style, placement) => {
  useSettingsStore.setState({ unreadBadgeStyle: style });
  await render(<UnreadBadge count={120} placement={placement} />);
  expect(screen.getByText('99+')).toBeTruthy();
  expect(screen.getByLabelText('99+ 条未读')).toBeTruthy();
});

test.each(['corner', 'inline'] as const)(
  'dot style keeps the unread signal without a number (%s)',
  async (placement) => {
    useSettingsStore.setState({ unreadBadgeStyle: 'dot' });
    await render(<UnreadBadge count={3} placement={placement} />);
    expect(screen.queryByText('3')).toBeNull();
    expect(screen.getByLabelText('3 条未读')).toBeTruthy();
  },
);

test('hidden style and zero counts render nothing', async () => {
  useSettingsStore.setState({ unreadBadgeStyle: 'hidden' });
  const hidden = await render(<UnreadBadge count={5} placement="corner" />);
  expect(hidden.toJSON()).toBeNull();
  useSettingsStore.setState({ unreadBadgeStyle: 'count' });
  const empty = await render(<UnreadBadge count={0} placement="inline" />);
  expect(empty.toJSON()).toBeNull();
});
