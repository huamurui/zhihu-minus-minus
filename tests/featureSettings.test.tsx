import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import FeatureSettings from '../src/app/settings/features';
import {
  type AppSettings,
  useSettingsStore,
} from '../src/store/useSettingsStore';

jest.mock(
  '@expo/vector-icons/Ionicons',
  () => jest.requireActual('react-native').View,
);
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/utils/haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));
jest.mock('../src/store/useSettingsStore', () => ({
  useSettingsStore: jest
    .requireActual('zustand')
    .create((set: (settings: Partial<AppSettings>) => void) => ({
      enableBrowseHistory: true,
      enablePrivateMessaging: false,
      doubleTapAction: undefined,
      updateSettings: set,
    })),
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: ReactNode }) => children,
}));

beforeEach(() => {
  useSettingsStore.setState({
    enableBrowseHistory: true,
    enablePrivateMessaging: false,
    doubleTapAction: undefined,
  });
});

test('each double-tap chip applies immediately without a save step', async () => {
  const host = await render(<FeatureSettings />);

  // Nothing selected while the action is still unset.
  expect(useSettingsStore.getState().doubleTapAction).toBeUndefined();
  expect(host.getByRole('radio', { name: '点赞' })).toBeTruthy();

  await fireEvent.press(host.getByRole('radio', { name: '点赞' }));
  expect(useSettingsStore.getState().doubleTapAction).toBe('like');

  await fireEvent.press(host.getByRole('radio', { name: '评论区' }));
  expect(useSettingsStore.getState().doubleTapAction).toBe('comments');

  await fireEvent.press(host.getByRole('radio', { name: '关闭' }));
  expect(useSettingsStore.getState().doubleTapAction).toBe('off');
});

test.each([
  ['列表预加载', '提前加载下一页，会略微增加流量和耗电。'],
  [
    '多页同时加载',
    '同时请求后面几页，会略微增加流量和耗电，也可能更容易触发知乎验证。',
  ],
])('the %s question mark shows and hides its note', async (label, note) => {
  const host = await render(<FeatureSettings />);
  const help = host.getByRole('button', { name: `${label}说明` });
  expect(host.queryByText(note)).toBeNull();
  await fireEvent.press(help);
  expect(host.getByText(note)).toBeTruthy();
  expect(help).toBeExpanded();
  await fireEvent.press(help);
  expect(host.queryByText(note)).toBeNull();
});
