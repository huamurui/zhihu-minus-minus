import CookieManager from '@react-native-cookies/cookies';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '@/store/useAuthStore';
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

apiClient.interceptors.request.use(async (config) => {
  const requestId = getRequestId(config);
  console.log(
    `🌐 [API ${requestId}] ${config.method?.toUpperCase()} ${getSafePath(config.url)}`,
  );
  // 优先从 AuthStore 获取，如果没有再尝试从 SecureStore (向下兼容)
  let cookie =
    useAuthStore.getState().cookies ||
    (await SecureStore.getItemAsync('user_cookies')) ||
    '';

  if (!cookie) {
    try {
      const nativeCookies = await CookieManager.get(
        'https://www.zhihu.com',
        true,
      );
      if (nativeCookies) {
        cookie = Object.entries(nativeCookies)
          .map(([name, c]) => `${name}=${c.value}`)
          .join('; ');
      }
    } catch (e) {
      console.warn('获取原生 cookie 失败', e);
    }
  }

  if (cookie) {
    config.headers.Cookie = cookie;
    const dc0 = getDc0(cookie);
    if (dc0) {
      config.headers['X-Udid'] = dc0.split('|')[0]; // 添加 X-Udid 头
      const xsrf = getXsrf(cookie);
      if (xsrf) {
        config.headers['x-xsrftoken'] = xsrf;
      }
      const body = config.data
        ? typeof config.data === 'string'
          ? config.data
          : JSON.stringify(config.data)
        : null;

      const fullUrl = apiClient.getUri(config);
      const zse96 = await signRequest96(fullUrl, body, cookie);
      config.headers['x-zse-96'] = zse96;
      config.headers['x-zse-93'] = ZSE_VERSION;
      config.headers['x-requested-with'] = 'fetch';
      config.headers.Referer = 'https://www.zhihu.com/';
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
