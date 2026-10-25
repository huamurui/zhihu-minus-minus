export const ZHIHU_SIGN_IN_URL = 'https://www.zhihu.com/signin';

export const QQ_DESKTOP_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export function getQqQrLoginUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.origin !== 'https://graph.qq.com' ||
      url.pathname !== '/oauth2.0/authorize' ||
      url.username ||
      url.password
    ) {
      return null;
    }
    // Keep Zhihu's client, callback and state; only change QQ's presentation.
    url.searchParams.set('display', 'pc');
    return url.href;
  } catch {
    return null;
  }
}

export function isZhihuLoginCompletionUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === 'https://www.zhihu.com' &&
      !url.username &&
      !url.password &&
      url.pathname === '/'
    );
  } catch {
    return false;
  }
}

// Also used on foregrounding: resume the existing QR page, never reload its
// challenge or read QQ's document.cookie into the Zhihu session.
export const LOGIN_COOKIE_SCRIPT = `
  (function () {
    var url = new URL(window.location.href);
    if (url.origin === 'https://www.zhihu.com' && !url.username && !url.password && url.pathname === '/') {
      window.ReactNativeWebView.postMessage(document.cookie);
    }
  })();
  true;
`;
