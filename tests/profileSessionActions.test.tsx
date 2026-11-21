import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  type PressableProps,
  RefreshControl,
  type RefreshControlProps,
} from 'react-native';
import ProfileScreen from '../src/app/(tabs)/profile';
import { persistAuthStateWithFeedback } from '../src/utils/authPersistenceFeedback';
import { syncNativeSessionCookies } from '../src/utils/authSession';

const mockVerify = jest.fn();
const mockClearCookies = jest.fn();
const mockPush = jest.fn();
const mockSwitch = jest.fn();
const mockMe = {
  id: 'first',
  url_token: 'first-profile',
  name: '第一账号',
  avatar_url: 'https://example.invalid/avatar.png',
};
const mockRefetchMe = jest.fn();
const mockMembers = new Map<string, { cover_url?: string }>();
let mockMeData: typeof mockMe | undefined;
let mockMeError = false;
let mockMeFetching = false;
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
jest.mock('react-native-reanimated', () => {
  const native = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: native.Animated,
    useSharedValue: (value: unknown) => ({ value }),
    useDerivedValue: (read: () => unknown) => ({ value: read() }),
    useAnimatedStyle: (read: () => unknown) => read(),
    useAnimatedScrollHandler: (handle: unknown) => handle,
    useReducedMotion: () => false,
    interpolate: () => 1,
    Extrapolation: { CLAMP: 'clamp' },
  };
});
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
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    queryKey[0] === 'me'
      ? {
          data: mockMeData,
          isError: mockMeError,
          isFetching: mockMeFetching,
          refetch: mockRefetchMe,
        }
      : { data: mockMembers.get(queryKey[1]) },
  useQueryClient: () => ({ clear: jest.fn() }),
}));
jest.mock('@preeternal/react-native-cookie-manager', () => ({
  __esModule: true,
  default: { clearAllStores: () => mockClearCookies() },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useIsFocused: () => true,
}));
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
  return {
    Text: native.Text,
    View: native.View,
    useThemeColor: () => '#00f',
    useRuntimeThemeColors: () =>
      jest.requireActual('../src/constants/Colors').default.light,
  };
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
  mockAuthState.cookies = mockAuthState.accounts[0].cookies;
  mockMeData = mockMe;
  mockMeError = false;
  mockMeFetching = false;
  mockMembers.clear();
  mockRefetchMe.mockResolvedValue({ data: undefined });
  mockSession = 0;
});

test('the profile header opens the active member, settings, and account switcher', async () => {
  const host = await render(<ProfileScreen />);
  await fireEvent.press(
    host.getByRole('button', { name: '第一账号，查看个人主页' }),
  );
  expect(mockPush).toHaveBeenLastCalledWith('/user/first-profile');
  await fireEvent.press(host.getByRole('button', { name: '设置' }));
  expect(mockPush).toHaveBeenLastCalledWith('/settings');
  await fireEvent.press(host.getByRole('button', { name: '切换账号' }));
  expect(host.getByText('第二账号')).toBeOnTheScreen();
});

test('the guest profile header opens login', async () => {
  mockAuthState.cookies = '';
  mockMeData = undefined;
  const host = await render(<ProfileScreen />);
  await fireEvent.press(host.getByRole('button', { name: '点击登录' }));
  expect(mockPush).toHaveBeenCalledWith('/login');
});

test('switching accounts clears the previous cover while the next member loads', async () => {
  const firstCover = 'https://example.invalid/first-cover.jpg';
  const secondCover = 'https://example.invalid/second-cover.jpg';
  mockMembers.set(mockMe.url_token, { cover_url: firstCover });
  const host = await render(<ProfileScreen />);
  const coverSources = () =>
    host.container
      .queryAll((node) => node.type === 'Image')
      .map((image) => image.props.source.uri);
  expect(coverSources()).toContain(firstCover);

  mockMeData = {
    ...mockMe,
    ...mockAuthState.accounts[1].me,
    url_token: 'second-profile',
  };
  await host.rerender(<ProfileScreen />);
  expect(coverSources()).toEqual([]);
  expect(
    host.getByRole('button', { name: '第二账号，查看个人主页' }),
  ).toBeOnTheScreen();
  mockMembers.set(mockMeData.url_token, { cover_url: secondCover });
  await host.rerender(<ProfileScreen />);
  expect(coverSources()).toContain(secondCover);
  expect(coverSources()).not.toContain(firstCover);
});

test('a failed cover leaves the profile usable and a replacement cover can load', async () => {
  const failedCover = 'https://example.invalid/failed-cover.jpg';
  mockMembers.set(mockMe.url_token, { cover_url: failedCover });
  const host = await render(<ProfileScreen />);
  const images = () => host.container.queryAll((node) => node.type === 'Image');
  const [cover] = images();
  expect(cover?.props.source.uri).toBe(failedCover);
  await fireEvent(cover, 'error', {
    nativeEvent: { error: 'Synthetic cover failure' },
  });
  expect(images()).toHaveLength(0);
  await fireEvent.press(
    host.getByRole('button', { name: '第一账号，查看个人主页' }),
  );
  expect(mockPush).toHaveBeenCalledWith('/user/first-profile');
  const newCover = 'https://example.invalid/new-cover.jpg';
  mockMembers.set(mockMe.url_token, { cover_url: newCover });
  await host.rerender(<ProfileScreen />);
  expect(images().map((image) => image.props.source.uri)).toContain(newCover);
});

test('a failed signed-in profile can retry without opening login', async () => {
  mockMeData = undefined;
  mockMeError = true;
  const host = await render(<ProfileScreen />);
  expect(host.queryByRole('button', { name: '点击登录' })).toBeNull();
  await fireEvent.press(host.getByRole('button', { name: '重新加载' }));
  expect(mockRefetchMe).toHaveBeenCalledTimes(1);
  expect(mockPush).not.toHaveBeenCalled();
});

test('only a pull gesture starts the native refresh indicator', async () => {
  mockMeFetching = true;
  const { promise, resolve } = Promise.withResolvers<{ data: undefined }>();
  mockRefetchMe.mockReturnValueOnce(promise);
  await render(<ProfileScreen />);
  // React Native's Jest preset exposes the mounted control for native gestures.
  const { latestRef } = RefreshControl as typeof RefreshControl & {
    latestRef: { props: RefreshControlProps };
  };
  expect(latestRef.props.refreshing).toBe(false);
  await act(() => latestRef.props.onRefresh?.());
  expect(latestRef.props.refreshing).toBe(true);
  await act(() => resolve({ data: undefined }));
  expect(latestRef.props.refreshing).toBe(false);
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
