import CookieManager from '@preeternal/react-native-cookie-manager';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { shouldImportLegacySession, useAuthStore } from '@/store/useAuthStore';
import { useVerificationStore } from '@/store/useVerificationStore';
import { signRequest96, ZSE_VERSION } from './zse96/index';

const apiClient = axios.create({
  baseURL: 'https://www.zhihu.com/api/v4',
  timeout: 10000,
  // React Native XHR defaults to withCredentials=true. On iOS that makes
  // RCTNetworking load NSHTTPCookieStorage first, then append our signed
  // request's explicit Cookie header, which can send duplicate/stale cookies.
  withCredentials: false,
});

const requestIds = new WeakMap<object, string>();
let requestSequence = 0;

function getSafePath(url?: string) {
  if (!url) return '<unknown>';
  try {
    return new URL(url, 'https://www.zhihu.com').pathname;
  } catch {
    return url.split('?')[0];
  }
}

function getRequestId(config?: object) {
  if (!config) return 'unknown';
  const existing = requestIds.get(config);
  if (existing) return existing;
  requestSequence += 1;
  const requestId = `local-${requestSequence}`;
  requestIds.set(config, requestId);
  return requestId;
}

function getDc0(cookie: string) {
  const match = cookie.match(/d_c0=([^;]+)/);
  return match ? match[1] : null;
}

function getXsrf(cookie: string) {
  const match = cookie.match(/_xsrf=([^;]+)/);
  return match ? match[1] : null;
}

function hasAuthenticationCookie(cookie: string) {
  return /(?:^|;\s*)z_c0=/.test(cookie);
}

apiClient.interceptors.request.use(async (config) => {
  const requestId = getRequestId(config);
  console.log(
    `🌐 [API ${requestId}] ${config.method?.toUpperCase()} ${getSafePath(config.url)}`,
  );
  // The file-backed auth store is the source of truth. Waiting for hydration
  // prevents a stale legacy SecureStore cookie from winning during startup.
  if (!useAuthStore.persist.hasHydrated()) {
    await useAuthStore.persist.rehydrate();
  }

  // A hydrated guest state is authoritative. Legacy cookie stores are read
  // only when no file-backed auth state has ever existed on this install.
  let cookie = useAuthStore.getState().cookies || '';
  const shouldImportLegacyCookie = !cookie && shouldImportLegacySession();

  if (shouldImportLegacyCookie) {
    cookie = (await SecureStore.getItemAsync('user_cookies')) || '';
    if (cookie) {
      useAuthStore.getState().setCookies(cookie);
    }
  }

  if (!cookie) {
    try {
      const nativeCookies = await CookieManager.get(
        'https://www.zhihu.com',
        true,
      );
      if (nativeCookies) {
        const nativeCookie = Object.entries(nativeCookies)
          .map(([name, c]) => `${name}=${c.value}`)
          .join('; ');
        // Anonymous cookies are required by the guest feed. An authenticated
        // native cookie is authoritative only during first-install migration.
        if (
          shouldImportLegacyCookie ||
          !hasAuthenticationCookie(nativeCookie)
        ) {
          cookie = nativeCookie;
          if (
            cookie &&
            shouldImportLegacyCookie &&
            hasAuthenticationCookie(cookie)
          ) {
            useAuthStore.getState().setCookies(cookie);
          }
        }
      }
    } catch {
      console.warn('获取原生 Cookie 失败');
    }
  }

  if (cookie) {
    config.headers.Cookie = cookie;
    const dc0 = getDc0(cookie);
    const xsrf = getXsrf(cookie);
    if (xsrf) {
      config.headers['x-xsrftoken'] = xsrf;
    }
    if (dc0) {
      config.headers['X-Udid'] = dc0.split('|')[0]; // 添加 X-Udid 头
      const body = config.data
        ? typeof config.data === 'string'
          ? config.data
          : JSON.stringify(config.data)
        : null;

      const fullUrl = apiClient.getUri(config);
      const hostname = new URL(fullUrl).hostname;
      // Zhuanlan's draft editor uses its own CSRF/Origin contract and does not
      // require the www.zhihu.com X-ZSE signature.
      if (hostname !== 'zhuanlan.zhihu.com') {
        const zse96 = await signRequest96(fullUrl, body, cookie);
        config.headers['x-zse-96'] = zse96;
        config.headers['x-zse-93'] = ZSE_VERSION;
      }
      config.headers['x-requested-with'] = 'fetch';
      if (!config.headers.Referer) {
        config.headers.Referer =
          hostname === 'zhuanlan.zhihu.com'
            ? 'https://zhuanlan.zhihu.com/write'
            : 'https://www.zhihu.com/';
      }
      config.headers['User-Agent'] =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    const requestId = getRequestId(response.config);
    console.log(
      `✅ [API ${requestId}] ${response.config.method?.toUpperCase()} ${getSafePath(response.config.url)} Status: ${response.status}`,
    );
    return response;
  },
  (error) => {
    const requestId = getRequestId(error.config);
    const method = error.config?.method?.toUpperCase() || '<unknown>';
    const path = getSafePath(error.config?.url);
    if (error.response?.status === 401) {
      console.warn(`⚠️ [API ${requestId}] ${method} ${path} Status: 401`);
    }
    // 处理人机验证 40352
    if (error.response?.data?.error?.code === 40352) {
      const redirectUrl = error.response.data.error.redirect;
      if (redirectUrl) {
        useVerificationStore.getState().setVerification(redirectUrl);
      }
      return Promise.reject(error); // 拦截 40352，不抛出红屏错误
    }

    if (error.response?.status === 404) {
      console.warn(`⚠️ [API ${requestId}] ${method} ${path} Status: 404`);
    } else if (error.response?.status !== 401) {
      console.error(
        `❌ [API ${requestId}] ${method} ${path} Status: ${error.response?.status || 'network-error'}`,
      );
    }
    return Promise.reject(error);
  },
);

export default apiClient;
