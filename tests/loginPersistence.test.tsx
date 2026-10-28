import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import LoginScreen from '../src/app/login';

const mockCookieGet = jest.fn();
const mockGetMe = jest.fn();
const mockSyncNativeSession = jest.fn();
const mockSaveAuthState = jest.fn<Promise<boolean>, []>();
const mockShowToast = jest.fn();
const mockHideVerification = jest.fn();
const mockQueryClient = { clear: jest.fn() };
const mockRouter = {
  back: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn(() => true),
};
let mockSessionVersion = 0;
const mockAuthState = {
  cookies: null as string | null,
  setCookies: jest.fn<void, [string]>(),
  addAccount: jest.fn<void, [string, unknown]>(),
};

jest.mock('@preeternal/react-native-cookie-manager', () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockCookieGet(...args) },
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => mockRouter,
}));
jest.mock('react-native-webview', () => ({
  WebView: (props: Record<string, unknown>) =>
    jest
      .requireActual('react')
      .createElement(jest.requireActual('react-native').View, {
        ...props,
        testID: 'login-webview',
      }),
}));
jest.mock('../src/api/zhihu', () => ({ getMe: () => mockGetMe() }));
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
  saveAuthState: () => mockSaveAuthState(),
  useAuthStore: { getState: () => mockAuthState },
}));
jest.mock('../src/store/useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      useNativeIOSBottomTabs: false,
      primaryColor: null,
      readingBackground: 'default',
      textContrast: 'standard',
      surfaceStyle: 'layered',
    }),
  },
}));
jest.mock('../src/store/useVerificationStore', () => ({
  useVerificationStore: {
    getState: () => ({ hide: mockHideVerification }),
  },
}));
jest.mock('../src/utils/authSession', () => ({
  finishNativeLoginFlow: jest.fn(),
  syncNativeSessionCookies: (...args: unknown[]) =>
    mockSyncNativeSession(...args),
}));
jest.mock('../src/utils/toast', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../src/components/Themed', () => {
  const native = jest.requireActual('react-native');
  return { Text: native.Text, View: native.View, useThemeColor: () => '#00f' };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSessionVersion = 0;
  mockAuthState.cookies = null;
  mockAuthState.setCookies.mockImplementation((cookies) => {
    mockAuthState.cookies = cookies;
    mockSessionVersion += 1;
  });
  mockAuthState.addAccount.mockImplementation((cookies) => {
    mockAuthState.cookies = cookies;
    mockSessionVersion += 1;
  });
  mockCookieGet.mockResolvedValue({
    z_c0: { name: 'z_c0', value: 'synthetic-session' },
  });
  mockGetMe.mockResolvedValue({ id: 'synthetic-member', name: '合成账号' });
  // A failed native synchronization may have cleared its cookie jar. Retry
  // must persist the captured in-memory session without reading that jar again.
  mockSyncNativeSession.mockRejectedValue(
    new Error('synthetic native synchronization failure'),
  );
  mockSaveAuthState.mockReset();
  mockSaveAuthState.mockResolvedValueOnce(false);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

async function beginFailedLogin() {
  const host = await render(<LoginScreen />);
  await fireEvent(host.getByTestId('login-webview'), 'message', {
    nativeEvent: { data: 'd_c0=synthetic-device' },
  });
  await waitFor(() => {
    expect(host.getByText('登录状态保存失败，点此重试')).toBeTruthy();
  });
  expect(mockSaveAuthState).toHaveBeenCalledTimes(1);
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(mockQueryClient.clear).not.toHaveBeenCalled();
  expect(mockHideVerification).not.toHaveBeenCalled();
  return host;
}

test('retry saves the captured session after native synchronization and disk persistence fail', async () => {
  mockSaveAuthState.mockResolvedValueOnce(true);
  const host = await beginFailedLogin();
  const capturedSession = mockAuthState.cookies;
  expect(capturedSession).toContain('synthetic-session');
  // Reproduce the empty native jar left by the failed synchronization.
  mockCookieGet.mockResolvedValue({});
  await fireEvent.press(host.getByText('登录状态保存失败，点此重试'));
  await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
  expect(mockSaveAuthState).toHaveBeenCalledTimes(2);
  expect(mockCookieGet).toHaveBeenCalledTimes(1);
  expect(mockGetMe).toHaveBeenCalledTimes(1);
  expect(mockSyncNativeSession).toHaveBeenCalledTimes(1);
  expect(mockAuthState.cookies).toBe(capturedSession);
  expect(mockQueryClient.clear).toHaveBeenCalledTimes(1);
  expect(mockHideVerification).toHaveBeenCalledTimes(1);
  expect(host.queryByText('登录状态保存失败，点此重试')).toBeNull();
  await host.unmount();
});

test('retry does not save or navigate after the failed session has changed', async () => {
  mockSaveAuthState.mockResolvedValueOnce(true);
  const host = await beginFailedLogin();
  mockSessionVersion += 1;
  mockAuthState.cookies = 'z_c0=synthetic-next-session';
  await fireEvent.press(host.getByText('登录状态保存失败，点此重试'));
  expect(mockSaveAuthState).toHaveBeenCalledTimes(1);
  expect(mockCookieGet).toHaveBeenCalledTimes(1);
  expect(mockGetMe).toHaveBeenCalledTimes(1);
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(mockQueryClient.clear).not.toHaveBeenCalled();
  expect(mockHideVerification).not.toHaveBeenCalled();
  expect(mockShowToast).toHaveBeenLastCalledWith('登录会话已变化，请重新登录');
  expect(host.queryByText('登录状态保存失败，点此重试')).toBeNull();
  await host.unmount();
});

test('a session change during retry persistence prevents late successful navigation', async () => {
  let finishSaving: (saved: boolean) => void = () => {};
  mockSaveAuthState.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishSaving = resolve;
      }),
  );
  const host = await beginFailedLogin();
  await fireEvent.press(host.getByText('登录状态保存失败，点此重试'));
  await waitFor(() => expect(mockSaveAuthState).toHaveBeenCalledTimes(2));
  await act(() => {
    mockSessionVersion += 1;
    mockAuthState.cookies = 'z_c0=synthetic-next-session';
    finishSaving(true);
  });
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(mockQueryClient.clear).not.toHaveBeenCalled();
  expect(mockHideVerification).not.toHaveBeenCalled();
  expect(mockCookieGet).toHaveBeenCalledTimes(1);
  expect(mockGetMe).toHaveBeenCalledTimes(1);
  await host.unmount();
});

test('late CookieManager reads cannot replace a session selected during capture', async () => {
  let finishRead: (cookies: unknown) => void = () => {};
  mockCookieGet.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRead = resolve;
      }),
  );
  const host = await render(<LoginScreen />);
  await fireEvent(host.getByTestId('login-webview'), 'message', {
    nativeEvent: { data: 'd_c0=synthetic' },
  });
  await act(() => {
    mockSessionVersion += 1;
    finishRead({ z_c0: { name: 'z_c0', value: 'synthetic-obsolete' } });
  });
  expect(mockAuthState.setCookies).not.toHaveBeenCalled();
  expect(mockSyncNativeSession).not.toHaveBeenCalled();
  expect(mockSaveAuthState).not.toHaveBeenCalled();
  await host.unmount();
});

test('cancelled login ignores late native cookie capture', async () => {
  let finishRead: (cookies: unknown) => void = () => {};
  mockCookieGet.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRead = resolve;
      }),
  );
  const host = await render(<LoginScreen />);
  await fireEvent(host.getByTestId('login-webview'), 'message', {
    nativeEvent: { data: 'd_c0=synthetic' },
  });
  await fireEvent.press(host.getByText('取消'));
  await act(() =>
    finishRead({ z_c0: { name: 'z_c0', value: 'synthetic-obsolete' } }),
  );
  expect(mockAuthState.setCookies).not.toHaveBeenCalled();
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
  expect(mockSaveAuthState).not.toHaveBeenCalled();
  await host.unmount();
});

test('unmounted login cannot finish an in-flight profile request', async () => {
  let finishProfile: (profile: unknown) => void = () => {};
  mockGetMe.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishProfile = resolve;
      }),
  );
  const host = await render(<LoginScreen />);
  await fireEvent(host.getByTestId('login-webview'), 'message', {
    nativeEvent: { data: 'd_c0=synthetic' },
  });
  await waitFor(() => expect(mockGetMe).toHaveBeenCalledTimes(1));
  await host.unmount();
  await act(() => finishProfile({ id: 'synthetic-member' }));
  expect(mockAuthState.addAccount).not.toHaveBeenCalled();
  expect(mockSaveAuthState).not.toHaveBeenCalled();
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(mockQueryClient.clear).not.toHaveBeenCalled();
});
