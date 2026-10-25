import { runInNewContext } from 'node:vm';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { Ref } from 'react';
import { AppState, Linking } from 'react-native';
import type { WebViewProps } from 'react-native-webview';
import { LoginWebView } from '../src/components/LoginWebView';
import {
  getQqQrLoginUrl,
  isZhihuLoginCompletionUrl,
  LOGIN_COOKIE_SCRIPT,
  QQ_DESKTOP_USER_AGENT,
  ZHIHU_SIGN_IN_URL,
} from '../src/utils/loginWebView';

const mockInjectJavaScript = jest.fn();
const mockReload = jest.fn();
const mockShowToast = jest.fn();
const mockMount = jest.fn();
const mockUnmount = jest.fn();

jest.mock('react-native-webview', () => ({
  WebView: ({ ref, ...props }: WebViewProps & { ref: Ref<unknown> }) => {
    const React = jest.requireActual('react');
    React.useImperativeHandle(ref, () => ({
      injectJavaScript: mockInjectJavaScript,
      reload: mockReload,
    }));
    React.useEffect(() => {
      mockMount();
      return mockUnmount;
    }, []);
    return React.createElement(jest.requireActual('react-native').View, {
      ...props,
      testID: 'login-webview',
    });
  },
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/Themed', () => {
  const native = jest.requireActual('react-native');
  return { Text: native.Text, View: native.View, useThemeColor: () => '#00f' };
});
jest.mock('../src/utils/toast', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

// Synthetic OAuth inputs, including nested encoding and an opaque state.
const authorizeUrl =
  'https://graph.qq.com/oauth2.0/authorize?client_id=synthetic&response_type=code&redirect_uri=https%3A%2F%2Fwww.zhihu.com%2Foauth%2Fcallback%2Fqq%3Fnext%3D%252F&state=synthetic%2B%2F%3D%26&scope=get_user_info&display=mobile';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

test('QR mode changes only presentation, retaining the OAuth identity and callback', () => {
  const original = new URL(authorizeUrl);
  const result = getQqQrLoginUrl(authorizeUrl);
  expect(result).not.toBeNull();
  const desktop = new URL(result ?? '');
  expect(desktop.searchParams.get('display')).toBe('pc');
  original.searchParams.delete('display');
  desktop.searchParams.delete('display');
  expect(desktop.href).toBe(original.href);
  expect(getQqQrLoginUrl(result ?? '')).toBe(result);
});

test.each([
  'https://graph.qq.com.evil.example/oauth2.0/authorize',
  'https://graph.qq.com@evil.example/oauth2.0/authorize',
  'https://synthetic@graph.qq.com/oauth2.0/authorize',
  'http://graph.qq.com/oauth2.0/authorize',
  'https://graph.qq.com:8443/oauth2.0/authorize',
  'https://graph.qq.com/oauth2.0/token',
  ZHIHU_SIGN_IN_URL,
  'not a URL',
])('does not rewrite a non-QQ-authorize URL: %s', (url) => {
  expect(getQqQrLoginUrl(url)).toBeNull();
});

test.each([
  'https://www.zhihu.com',
  'https://www.zhihu.com/',
  'https://www.zhihu.com/?utm_id=synthetic#synthetic',
])('accepts a completed Zhihu homepage: %s', (url) => {
  expect(isZhihuLoginCompletionUrl(url)).toBe(true);
});

test.each([
  authorizeUrl,
  ZHIHU_SIGN_IN_URL,
  'http://www.zhihu.com/',
  'https://www.zhihu.com.evil.example/',
  'https://synthetic@www.zhihu.com/',
  'about:blank',
])('never captures cookies from another page: %s', (url) => {
  expect(isZhihuLoginCompletionUrl(url)).toBe(false);
  const postMessage = jest.fn();
  const readCookies = jest.fn(() => 'synthetic');
  const document = Object.defineProperty({}, 'cookie', { get: readCookies });
  runInNewContext(LOGIN_COOKIE_SCRIPT, {
    URL,
    window: { location: new URL(url), ReactNativeWebView: { postMessage } },
    document,
  });
  expect(readCookies).not.toHaveBeenCalled();
  expect(postMessage).not.toHaveBeenCalled();
});

test('the injected script reads homepage cookies even with callback query parameters', () => {
  const postMessage = jest.fn();
  runInNewContext(LOGIN_COOKIE_SCRIPT, {
    URL,
    window: {
      location: new URL('https://www.zhihu.com/?utm_id=synthetic'),
      ReactNativeWebView: { postMessage },
    },
    document: { cookie: 'd_c0=synthetic-device' },
  });
  expect(postMessage).toHaveBeenCalledWith('d_c0=synthetic-device');
});

async function renderQrLogin() {
  const onCookies = jest.fn();
  const host = await render(<LoginWebView onCookies={onCookies} />);
  expect(host.getByTestId('login-webview').props.userAgent).toBeUndefined();
  expect(host.getByTestId('login-webview').props.source).toEqual({
    uri: ZHIHU_SIGN_IN_URL,
  });
  let allowed = true;
  await act(() => {
    allowed = host
      .getByTestId('login-webview')
      .props.onShouldStartLoadWithRequest({ url: authorizeUrl });
  });
  expect(allowed).toBe(false);
  expect(host.getByText('QQ 扫码登录')).toBeTruthy();
  const webview = host.getByTestId('login-webview');
  expect(webview.props.source).toEqual({ uri: getQqQrLoginUrl(authorizeUrl) });
  expect(webview.props.userAgent).toBe(QQ_DESKTOP_USER_AGENT);
  expect(webview.props.sharedCookiesEnabled).toBe(true);
  expect(webview.props.thirdPartyCookiesEnabled).toBe(true);
  expect(webview.props.incognito).toBe(false);
  return { host, onCookies };
}

test('QQ authorization mounts with a desktop UA and does not loop on the rewritten URL', async () => {
  const { host } = await renderQrLogin();
  expect(mockMount).toHaveBeenCalledTimes(2);
  let allowed = false;
  await act(() => {
    allowed = host
      .getByTestId('login-webview')
      .props.onShouldStartLoadWithRequest({
        url: getQqQrLoginUrl(authorizeUrl),
      });
  });
  expect(allowed).toBe(true);
  expect(mockMount).toHaveBeenCalledTimes(2);
  await host.unmount();
});

test('QQ popups use the in-app QR flow rather than an external browser', async () => {
  const host = await render(<LoginWebView onCookies={jest.fn()} />);
  expect(
    host.getByTestId('login-webview').props.setSupportMultipleWindows,
  ).toBe(false);
  await fireEvent(host.getByTestId('login-webview'), 'openWindow', {
    nativeEvent: { targetUrl: authorizeUrl },
  });
  expect(host.getByText('QQ 扫码登录')).toBeTruthy();
  expect(host.getByTestId('login-webview').props.source.uri).toBe(
    getQqQrLoginUrl(authorizeUrl),
  );
  await fireEvent(host.getByTestId('login-webview'), 'openWindow', {
    nativeEvent: { targetUrl: 'https://www.zhihu.com/?utm_id=synthetic' },
  });
  expect(host.getByTestId('login-webview').props.source.uri).toBe(
    'https://www.zhihu.com/?utm_id=synthetic',
  );
  expect(Linking.openURL).not.toHaveBeenCalled();
  await host.unmount();
});

test.each([
  'wtloginmqq://ptlogin/qlogin?p=synthetic',
  'mqqapi://synthetic',
  'mqqopensdkapi://synthetic',
  'intent://synthetic#Intent;scheme=wtloginmqq;end',
  'googlechrome://synthetic',
])(
  'QR login blocks external handoff and explains what to do: %s',
  async (url) => {
    const { host } = await renderQrLogin();
    const webview = host.getByTestId('login-webview');
    expect(webview.props.originWhitelist).toEqual(['*']);
    let allowed = true;
    await act(() => {
      allowed = webview.props.onShouldStartLoadWithRequest({ url });
    });
    expect(allowed).toBe(false);
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      '请使用 QQ 扫描二维码，确认授权后返回本应用',
    );
    await host.unmount();
  },
);

test('returning from QQ preserves the QR challenge and stops listening on unmount', async () => {
  const remove = jest.fn();
  const listener = jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove });
  const { host } = await renderQrLogin();
  const source = host.getByTestId('login-webview').props.source;
  await act(() => {
    listener.mock.calls[0][1]('background');
    listener.mock.calls[0][1]('active');
  });
  expect(mockInjectJavaScript).toHaveBeenCalledWith(LOGIN_COOKIE_SCRIPT);
  expect(mockReload).not.toHaveBeenCalled();
  expect(mockMount).toHaveBeenCalledTimes(2);
  expect(host.getByTestId('login-webview').props.source).toEqual(source);
  await host.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});

test('returning to other methods restores the mobile login page', async () => {
  const { host } = await renderQrLogin();
  await fireEvent.press(host.getByText('返回其他登录方式'));
  expect(host.queryByText('QQ 扫码登录')).toBeNull();
  expect(host.getByTestId('login-webview').props.source.uri).toBe(
    ZHIHU_SIGN_IN_URL,
  );
  expect(host.getByTestId('login-webview').props.userAgent).toBeUndefined();
  await host.unmount();
});

test('only the completed Zhihu page can send cookies to the login session', async () => {
  const { host, onCookies } = await renderQrLogin();
  await fireEvent(host.getByTestId('login-webview'), 'message', {
    nativeEvent: { url: authorizeUrl, data: 'synthetic-qq-cookie' },
  });
  expect(onCookies).not.toHaveBeenCalled();
  await fireEvent(host.getByTestId('login-webview'), 'message', {
    nativeEvent: {
      url: 'https://www.zhihu.com/?utm_id=synthetic',
      data: 'd_c0=synthetic-device',
    },
  });
  expect(onCookies).toHaveBeenCalledWith('d_c0=synthetic-device');
  await host.unmount();
});

test('homepage navigation still captures cookies without a full page reload', async () => {
  const host = await render(<LoginWebView onCookies={jest.fn()} />);
  await fireEvent(host.getByTestId('login-webview'), 'navigationStateChange', {
    url: 'https://www.zhihu.com/?utm_id=synthetic',
  });
  expect(mockInjectJavaScript).toHaveBeenCalledWith(LOGIN_COOKIE_SCRIPT);
  await host.unmount();
});

test('other login methods retain external app opening, with sanitized failures', async () => {
  jest
    .mocked(Linking.openURL)
    .mockRejectedValueOnce(new Error('synthetic-private-url'));
  const host = await render(<LoginWebView onCookies={jest.fn()} />);
  await fireEvent(
    host.getByTestId('login-webview'),
    'shouldStartLoadWithRequest',
    {
      url: 'weixin://synthetic',
    },
  );
  expect(Linking.openURL).toHaveBeenCalledWith('weixin://synthetic');
  expect(mockShowToast).toHaveBeenCalledWith(
    '无法打开登录应用，请选择其他登录方式',
  );
  expect(console.warn).not.toHaveBeenCalled();
  await host.unmount();
});

test('navigation and load errors never log OAuth data or raw native error details', async () => {
  const { host } = await renderQrLogin();
  await fireEvent(host.getByTestId('login-webview'), 'navigationStateChange', {
    url: authorizeUrl,
  });
  expect(console.log).toHaveBeenCalledWith(
    '🌐 导航至:',
    'https://graph.qq.com/oauth2.0/authorize',
  );
  await fireEvent(host.getByTestId('login-webview'), 'error', {
    nativeEvent: { url: authorizeUrl, description: 'synthetic-private-error' },
  });
  expect(console.warn).toHaveBeenCalledWith('登录页面加载失败');
  const errorView = await render(
    host.getByTestId('login-webview').props.renderError(),
  );
  await fireEvent.press(errorView.getByText('重新加载'));
  expect(mockReload).toHaveBeenCalledTimes(1);
  await errorView.unmount();
  await host.unmount();
});
