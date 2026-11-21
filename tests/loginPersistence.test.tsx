import { runInNewContext } from 'node:vm';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import LoginScreen from '../src/app/login';

const mockInject = jest.fn();
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
const signedInCookies = {
  z_c0: { name: 'z_c0', value: 'synthetic-session' },
};
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
jest.mock('react-native-webview', () => {
  const React: typeof import('react') = jest.requireActual('react');
  return {
    WebView: React.forwardRef((props: Record<string, unknown>, ref) => {
      React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInject }));
      return React.createElement(jest.requireActual('react-native').View, {
        ...props,
        testID: 'login-webview',
      });
    }),
  };
});
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
  mockCookieGet.mockReset().mockResolvedValue(signedInCookies);
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
  await fireEvent(host.getByTestId('login-webview'), 'navigationStateChange', {
    url: 'https://www.zhihu.com/',
    loading: false,
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
  await fireEvent(host.getByTestId('login-webview'), 'navigationStateChange', {
    url: 'https://www.zhihu.com/',
    loading: false,
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
  await fireEvent(host.getByTestId('login-webview'), 'navigationStateChange', {
    url: 'https://www.zhihu.com/',
    loading: false,
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
  await fireEvent(host.getByTestId('login-webview'), 'navigationStateChange', {
    url: 'https://www.zhihu.com/',
    loading: false,
  });
  await waitFor(() => expect(mockGetMe).toHaveBeenCalledTimes(1));
  await host.unmount();
  await act(() => finishProfile({ id: 'synthetic-member' }));
  expect(mockAuthState.addAccount).not.toHaveBeenCalled();
  expect(mockSaveAuthState).not.toHaveBeenCalled();
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(mockQueryClient.clear).not.toHaveBeenCalled();
});

test.each(['ios', 'android'] as const)(
  '%s switches between the normal and desktop Zhihu sign-in pages',
  async (platform) => {
    const original = Platform.OS;
    Platform.OS = platform;
    try {
      const host = await render(<LoginScreen />);
      const originalPage = host.getByTestId('login-webview');
      expect(originalPage.props.userAgent).toBeUndefined();
      const oldNavigation = originalPage.props.onNavigationStateChange;

      await fireEvent.press(host.getByRole('button', { name: '扫码登录' }));
      const desktop = host.getByTestId('login-webview');
      expect(desktop.props.source).toEqual({
        uri: 'https://www.zhihu.com/signin',
      });
      expect(desktop.props.contentMode).toBe('desktop');
      if (platform === 'android') {
        expect(desktop.props.userAgent).toContain('X11');
      }
      await act(() =>
        oldNavigation({ url: 'https://www.zhihu.com/', loading: false }),
      );
      expect(mockCookieGet).not.toHaveBeenCalled();

      await fireEvent(desktop, 'load', {
        nativeEvent: { url: 'https://www.zhihu.com/signin' },
      });
      const meta = { content: 'width=device-width,initial-scale=1' };
      const context = {
        location: { origin: 'https://www.zhihu.com', pathname: '/signin' },
        document: { querySelector: () => meta },
        window: {
          visualViewport: { width: 375, scale: 1 },
          addEventListener: jest.fn(),
        },
      };
      runInNewContext(mockInject.mock.lastCall?.[0], context);
      const width = Number(/width=(\d+)/.exec(meta.content)?.[1]);
      expect(width).toBeGreaterThan(375);
      expect(meta.content).toContain('user-scalable=yes');
      const initialScale = () =>
        Number(/initial-scale=([\d.]+)/.exec(meta.content)?.[1]);
      expect(width * initialScale()).toBeCloseTo(375);
      context.window.visualViewport.width = 667;
      context.window.addEventListener.mock.calls[0][1]();
      expect(width * initialScale()).toBeCloseTo(667);
      meta.content = 'original';
      context.location.origin = 'https://other.example';
      runInNewContext(mockInject.mock.lastCall?.[0], context);
      expect(meta.content).toEqual('original');

      await fireEvent.press(host.getByRole('button', { name: '手机登录' }));
      const mobile = host.getByTestId('login-webview');
      expect(mobile.props.contentMode).toBe('mobile');
      expect(mobile.props.userAgent).toBeUndefined();
      mockInject.mockClear();
      await fireEvent(mobile, 'load', {
        nativeEvent: { url: 'https://www.zhihu.com/signin' },
      });
      expect(mockInject).not.toHaveBeenCalled();
      expect(mockCookieGet).not.toHaveBeenCalled();
      await host.unmount();
    } finally {
      Platform.OS = original;
    }
  },
);

test('QR sign-in finishes on the official homepage using only native cookies', async () => {
  mockSaveAuthState.mockReset().mockResolvedValue(true);
  const host = await render(<LoginScreen />);
  await fireEvent.press(host.getByText('扫码登录'));
  const web = host.getByTestId('login-webview');
  expect(web.props.onMessage).toBeUndefined();

  for (const url of [
    'https://www.zhihu.com/signin',
    'https://www.zhihu.com.example/',
    'http://www.zhihu.com/',
    'https://www.zhihu.com/account/',
    'about:blank',
  ]) {
    await fireEvent(web, 'navigationStateChange', { url, loading: false });
  }
  await fireEvent(web, 'navigationStateChange', {
    url: 'https://www.zhihu.com/',
    loading: true,
  });
  expect(mockCookieGet).not.toHaveBeenCalled();

  await fireEvent(web, 'load', {
    nativeEvent: { url: 'https://www.zhihu.com/?from=signin', loading: true },
  });
  await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
  expect(mockCookieGet).toHaveBeenCalledWith('https://www.zhihu.com', true);
  expect(mockAuthState.setCookies).toHaveBeenCalledTimes(1);
  expect(mockSaveAuthState).toHaveBeenCalledTimes(1);
  await host.unmount();
});

describe('Android mobile login redirects', () => {
  const originalPlatform = Platform.OS;
  const homepage = { url: 'https://www.zhihu.com/', loading: true };

  beforeEach(() => {
    Platform.OS = 'android';
    jest.useFakeTimers();
    mockSaveAuthState.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    Platform.OS = originalPlatform;
    jest.useRealTimers();
  });

  test('captures on homepage navigation even if another page finishes the redirect', async () => {
    const read = Promise.withResolvers<unknown>();
    mockCookieGet.mockReturnValueOnce(read.promise);
    const host = await render(<LoginScreen />);
    const web = host.getByTestId('login-webview');
    await fireEvent(web, 'navigationStateChange', homepage);
    expect(mockCookieGet).toHaveBeenCalledTimes(1);
    expect(mockRouter.back).not.toHaveBeenCalled();

    await fireEvent(web, 'load', {
      nativeEvent: { url: 'https://www.zhihu.com/follow', loading: false },
    });
    await act(() => read.resolve(signedInCookies));
    expect(mockSaveAuthState).toHaveBeenCalledTimes(1);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    await host.unmount();
  });

  test('retries an empty native store after the final homepage event', async () => {
    mockCookieGet.mockResolvedValueOnce({});
    const host = await render(<LoginScreen />);
    await fireEvent(host.getByTestId('login-webview'), 'load', {
      nativeEvent: homepage,
    });
    expect(mockCookieGet).toHaveBeenCalledTimes(1);
    expect(mockRouter.back).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTimeAsync(60_000));
    expect(mockAuthState.setCookies).toHaveBeenCalledTimes(1);
    expect(mockSaveAuthState).toHaveBeenCalledTimes(1);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    await host.unmount();
  });

  test('overlapping homepage notifications complete a single login', async () => {
    const read = Promise.withResolvers<unknown>();
    mockCookieGet.mockReturnValueOnce(read.promise);
    const host = await render(<LoginScreen />);
    const web = host.getByTestId('login-webview');
    await fireEvent(web, 'navigationStateChange', homepage);
    expect(mockCookieGet).toHaveBeenCalledTimes(1);
    await fireEvent(web, 'load', { nativeEvent: homepage });
    await fireEvent(web, 'navigationStateChange', {
      ...homepage,
      loading: false,
    });
    await act(() => read.resolve(signedInCookies));
    await act(() => jest.advanceTimersByTimeAsync(60_000));
    expect(mockCookieGet).toHaveBeenCalledTimes(1);
    expect(mockAuthState.setCookies).toHaveBeenCalledTimes(1);
    expect(mockSaveAuthState).toHaveBeenCalledTimes(1);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    await host.unmount();
  });

  test('stops retrying if the native session never appears', async () => {
    mockCookieGet.mockResolvedValue({});
    const host = await render(<LoginScreen />);
    await fireEvent(
      host.getByTestId('login-webview'),
      'navigationStateChange',
      homepage,
    );
    await act(() => jest.advanceTimersByTimeAsync(60_000));
    const reads = mockCookieGet.mock.calls.length;
    expect(reads).toBeGreaterThan(1);
    await act(() => jest.advanceTimersByTimeAsync(60_000));
    expect(mockCookieGet).toHaveBeenCalledTimes(reads);
    expect(mockAuthState.setCookies).not.toHaveBeenCalled();
    expect(mockSaveAuthState).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
    await host.unmount();
  });

  test.each(['cancel', 'switch mode', 'change account', 'unmount'] as const)(
    '%s stops pending cookie retries',
    async (action) => {
      mockCookieGet.mockResolvedValueOnce({});
      const host = await render(<LoginScreen />);
      await fireEvent(
        host.getByTestId('login-webview'),
        'navigationStateChange',
        homepage,
      );
      expect(mockCookieGet).toHaveBeenCalledTimes(1);
      switch (action) {
        case 'cancel':
          await fireEvent.press(host.getByText('取消'));
          break;
        case 'switch mode':
          await fireEvent.press(host.getByText('扫码登录'));
          expect(host.getByTestId('login-webview').props.contentMode).toBe(
            'desktop',
          );
          break;
        case 'change account':
          mockSessionVersion += 1;
          break;
        case 'unmount':
          await host.unmount();
          break;
      }
      await act(() => jest.advanceTimersByTimeAsync(60_000));
      expect(mockCookieGet).toHaveBeenCalledTimes(1);
      expect(mockAuthState.setCookies).not.toHaveBeenCalled();
      expect(mockSaveAuthState).not.toHaveBeenCalled();
      expect(mockRouter.back).toHaveBeenCalledTimes(
        action === 'cancel' ? 1 : 0,
      );
      if (action !== 'unmount') await host.unmount();
    },
  );
});
