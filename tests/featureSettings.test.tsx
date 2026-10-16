import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import FeatureSettings from '../app/settings/features';
import { type AppSettings, useSettingsStore } from '../store/useSettingsStore';

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
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../utils/haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));
jest.mock('../store/useSettingsStore', () => ({
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
  expect(host.getByRole('button', { name: '双击正文：点赞' })).toBeTruthy();

  await fireEvent.press(host.getByRole('button', { name: '双击正文：点赞' }));
  expect(useSettingsStore.getState().doubleTapAction).toBe('like');

  await fireEvent.press(host.getByRole('button', { name: '双击正文：评论区' }));
  expect(useSettingsStore.getState().doubleTapAction).toBe('comments');

  await fireEvent.press(host.getByRole('button', { name: '双击正文：关闭' }));
  expect(useSettingsStore.getState().doubleTapAction).toBe('off');
});
