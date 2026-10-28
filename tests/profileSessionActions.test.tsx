import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PressableProps } from 'react-native';
import ProfileScreen from '../src/app/(tabs)/profile';
import { persistAuthStateWithFeedback } from '../src/utils/authPersistenceFeedback';
import { syncNativeSessionCookies } from '../src/utils/authSession';

const mockVerify = jest.fn();
const mockClearCookies = jest.fn();
const mockPush = jest.fn();
const mockSwitch = jest.fn();
let mockSession = 0;
const mockAuthState = {
  cookies: 'z_c0=synthetic-account',
  activeAccountIndex: 0,
  accounts: [
    { cookies: 'z_c0=synthetic-first', me: { id: 'first', name: '第一账号' } },
    {
      cookies: 'z_c0=synthetic-second',
      me: { id: 'second', name: '第二账号' },
    },
  ],
  switchAccount: mockSwitch,
  removeAccount: jest.fn(),
  logout: jest.fn(),
};
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSession,
  useAuthStore: Object.assign(() => mockAuthState, {
    getState: () => mockAuthState,
  }),
}));
jest.mock('../src/api/session', () => ({
  verifyZhihuSession: (...args: unknown[]) => mockVerify(...args),
}));
jest.mock('../src/api/zhihu', () => ({
  getMe: jest.fn(),
  getMemberWithFallback: jest.fn(),
}));
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, refetch: jest.fn() }),
  useQueryClient: () => ({ clear: jest.fn() }),
}));
jest.mock('@preeternal/react-native-cookie-manager', () => ({
  __esModule: true,
  default: { clearAllStores: () => mockClearCookies() },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../src/components/overlays/BottomSheet', () => ({
  BottomSheet: ({
    visible,
    children,
  }: {
    visible: boolean;
    children: React.ReactNode;
  }) => (visible ? children : null),
}));
jest.mock('../src/components/AuthStorageNotice', () => ({
  AuthStorageNotice: () => null,
}));
jest.mock('../src/components/StableAvatar', () => ({
  StableAvatar: () => null,
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: ({ onPress, ...props }: PressableProps) =>
    jest
      .requireActual('react')
      .createElement(jest.requireActual('react-native').Pressable, {
        ...props,
        onPress: (
          event: Parameters<NonNullable<PressableProps['onPress']>>[0],
        ) => {
          void onPress?.(event);
        },
      }),
}));
jest.mock('../src/components/Themed', () => {
  const native = jest.requireActual('react-native');
  return { Text: native.Text, View: native.View, useThemeColor: () => '#00f' };
});
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../src/store/useSettingsStore', () => ({
  useSettingsStore: Object.assign(() => ({}), {
    getState: () => ({
      primaryColor: null,
      readingBackground: 'default',
      textContrast: 'standard',
      surfaceStyle: 'layered',
    }),
  }),
}));
jest.mock('../src/store/useVerificationStore', () => ({
  useVerificationStore: { getState: () => ({ hide: jest.fn() }) },
}));
jest.mock('../src/utils/authPersistenceFeedback', () => ({
  persistAuthStateWithFeedback: jest.fn(),
}));
jest.mock('../src/utils/authSession', () => ({
  beginNativeLoginFlow: jest.fn(),
  finishNativeLoginFlow: jest.fn(),
  syncNativeSessionCookies: jest.fn(),
}));
jest.mock('../src/utils/haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = 0;
});

test('account verification finishing after a session change cannot switch accounts', async () => {
  let finish: (value: unknown) => void = () => {};
  mockVerify.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const host = await render(<ProfileScreen />);
  await fireEvent.press(host.getByText('切换账号'));
  await fireEvent.press(host.getByText('第二账号'));
  expect(mockVerify).toHaveBeenCalledTimes(1);
  await act(() => {
    mockSession += 1;
    finish({ cookies: 'z_c0=synthetic-verified', me: { id: 'second' } });
  });
  expect(mockSwitch).not.toHaveBeenCalled();
  await host.unmount();
});

test('switching to guest begins native cleanup before waiting for account persistence', async () => {
  let finishSave: (saved: boolean) => void = () => {};
  jest.mocked(persistAuthStateWithFeedback).mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        finishSave = resolve;
      }),
  );
  const host = await render(<ProfileScreen />);
  await fireEvent.press(host.getByText('切换账号'));
  await fireEvent.press(host.getByText('游客模式 (未登录)'));
  expect(mockSwitch).toHaveBeenCalledWith(-1, undefined);
  expect(syncNativeSessionCookies).toHaveBeenCalledWith(null);
  expect(persistAuthStateWithFeedback).toHaveBeenCalledTimes(1);
  await act(() => finishSave(true));
  await host.unmount();
});

test('adding an account ignores duplicate presses and stale completion navigation', async () => {
  let finish: () => void = () => {};
  mockClearCookies.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const host = await render(<ProfileScreen />);
  await fireEvent.press(host.getByText('切换账号'));
  await fireEvent.press(host.getByText('添加账号'));
  await fireEvent.press(host.getByText('切换账号'));
  await fireEvent.press(host.getByText('添加账号'));
  expect(mockClearCookies).toHaveBeenCalledTimes(1);
  await act(() => {
    mockSession += 1;
    finish();
  });
  expect(mockPush).not.toHaveBeenCalled();
  await host.unmount();
});

test('an unchanged verified account can still be selected', async () => {
  const verified = { cookies: 'z_c0=synthetic-verified', me: { id: 'second' } };
  mockVerify.mockResolvedValue(verified);
  const host = await render(<ProfileScreen />);
  await fireEvent.press(host.getByText('切换账号'));
  await fireEvent.press(host.getByText('第二账号'));
  await waitFor(() => expect(mockSwitch).toHaveBeenCalledWith(1, verified));
  await host.unmount();
});
