import CookieManager from '@preeternal/react-native-cookie-manager';
import axios, { type AxiosError, type AxiosResponse } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { shouldImportLegacySession, useAuthStore } from '@/store/useAuthStore';
import { useVerificationStore } from '@/store/useVerificationStore';
import {
  encryptZseV4,
  hmacSha1Hex,
  signRequest96,
  ZSE_VERSION,
} from './zse96/index';

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
const retriedRequests = new WeakSet<object>();
const refreshPromises = new Map<string, Promise<boolean>>();

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

function getHeaderValue(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const headerObject = headers as Record<string, unknown> & {
    get?: (headerName: string) => unknown;
  };
  const getterValue = headerObject.get?.(name);
  if (typeof getterValue === 'string') return getterValue;
  if (Array.isArray(getterValue)) {
    const values = getterValue.filter(
      (value): value is string => typeof value === 'string',
    );
    if (values.length > 0) return values.join(',');
  }
  const directValue =
    headerObject[name] ??
    headerObject[name.toLowerCase()] ??
    headerObject[name.toUpperCase()];
  if (typeof directValue === 'string') return directValue;
  if (Array.isArray(directValue)) {
    const values = directValue.filter(
      (value): value is string => typeof value === 'string',
    );
    if (values.length > 0) return values.join(',');
  }
  return undefined;
}

export function getSetCookieHeaders(headers: unknown): string[] {
  if (!headers || typeof headers !== 'object') return [];
  const headerObject = headers as Record<string, unknown> & {
    get?: (headerName: string) => unknown;
  };
  const value =
    headerObject.get?.('set-cookie') ??
    headerObject['set-cookie'] ??
    headerObject['Set-Cookie'];
  const values = Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === 'string' && item.length > 0,
      )
    : typeof value === 'string' && value.length > 0
      ? [value]
      : [];
  return values.flatMap((item) =>
    item.split(/,(?=\s*[^;,=\s]+=[^;]*)/).map((part) => part.trim()),
  );
}

export function mergeCookieHeader(
  existingCookie: string,
  setCookieHeaders: readonly string[],
): string {
  const cookies = new Map<string, string>();
  for (const assignment of existingCookie.split(';')) {
    const separator = assignment.indexOf('=');
    if (separator <= 0) continue;
    const name = assignment.slice(0, separator).trim();
    const value = assignment.slice(separator + 1).trim();
    if (name && value) cookies.set(name, value);
  }

  for (const header of setCookieHeaders) {
    const firstPart = header.split(';', 1)[0]?.trim();
    if (!firstPart) continue;
    const separator = firstPart.indexOf('=');
    if (separator <= 0) continue;
    const name = firstPart.slice(0, separator).trim();
    const value = firstPart.slice(separator + 1).trim();
    if (!name) continue;
    if (!value) cookies.delete(name);
    else cookies.set(name, value);
  }

  return Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

export async function buildZhihuAuthHeaders(
  url: string,
  cookie: string,
  body: string | null = null,
): Promise<Record<string, string>> {
  if (!cookie) return {};
  const headers: Record<string, string> = { Cookie: cookie };
  const dc0 = getDc0(cookie);
  const xsrf = getXsrf(cookie);
  if (xsrf) headers['x-xsrftoken'] = xsrf;
  if (!dc0) return headers;

  headers['X-Udid'] = dc0.split('|')[0] ?? dc0;
  const hostname = new URL(url, 'https://www.zhihu.com').hostname;
  if (hostname !== 'zhuanlan.zhihu.com') {
    headers['x-zse-96'] = await signRequest96(url, body, cookie);
    headers['x-zse-93'] = ZSE_VERSION;
  }
  headers['x-requested-with'] = 'fetch';
  headers.Referer =
    hostname === 'zhuanlan.zhihu.com'
      ? 'https://zhuanlan.zhihu.com/write'
      : 'https://www.zhihu.com/';
  headers['User-Agent'] =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
  return headers;
}

function hasAuthenticationCookie(cookie: string) {
  return /(?:^|;\s*)z_c0=/.test(cookie);
}

function getStringField(value: unknown, field: string): string | null {
  if (!value || typeof value !== 'object') return null;
  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === 'string' && fieldValue.length > 0
    ? fieldValue
    : null;
}

function persistResponseCookies(
  response: AxiosResponse<unknown>,
  requestCookie?: string,
) {
  const setCookieHeaders = getSetCookieHeaders(response.headers);
  if (setCookieHeaders.length === 0) return requestCookie ?? '';

  const authState = useAuthStore.getState();
  const currentCookie = authState.cookies || '';
  const cookieAtRequest =
    requestCookie || getHeaderValue(response.config?.headers, 'Cookie');
  if (cookieAtRequest && currentCookie && cookieAtRequest !== currentCookie) {
    // A different account was selected while this request was in flight.
    // Do not let the old response overwrite the new account's session.
    return currentCookie;
  }

  const mergedCookie = mergeCookieHeader(
    cookieAtRequest || currentCookie,
    setCookieHeaders,
  );
  // Persist deletions too (for example `z_c0=; Max-Age=0`), otherwise a
  // logged-out session could remain usable from the file-backed store.
  if (mergedCookie !== currentCookie) {
    authState.updateActiveAccountCookies(mergedCookie);
  }
  return mergedCookie;
}

async function performZhihuSessionRefresh(cookie: string): Promise<boolean> {
  if (!hasAuthenticationCookie(cookie)) return false;
  const accountIndexAtStart = useAuthStore.getState().activeAccountIndex;

  const refreshClient = axios.create({
    baseURL: 'https://www.zhihu.com',
    timeout: 10000,
    withCredentials: false,
  });
  const commonHeaders = {
    Cookie: cookie,
    Origin: 'https://www.zhihu.com',
    Referer: 'https://www.zhihu.com/signin',
    'x-requested-with': 'fetch',
  };

  try {
    const tokenResponse = await refreshClient.post<unknown>(
      '/api/account/prod/token/refresh',
      undefined,
      {
        headers: {
          ...commonHeaders,
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
      },
    );
    const tokenCookie = persistResponseCookies(tokenResponse, cookie);
    if (useAuthStore.getState().activeAccountIndex !== accountIndexAtStart) {
      return false;
    }
    const refreshToken = getStringField(tokenResponse.data, 'refresh_token');
    if (!refreshToken) return false;
    // Account switching can happen while the first refresh request is in
    // flight. Do not exchange the old account's token after that switch.
    if (useAuthStore.getState().activeAccountIndex !== accountIndexAtStart) {
      return false;
    }

    const timestamp = Date.now();
    const formData = [
      ['client_id', 'c3cef7c66a1843f8b3a9e6a1e3160e20'],
      ['grant_type', 'refresh_token'],
      ['timestamp', String(timestamp)],
      ['source', 'com.zhihu.web'],
      [
        'signature',
        hmacSha1Hex(
          'd1b964811afb40118a12068ff74a12f4',
          `refresh_tokenc3cef7c66a1843f8b3a9e6a1e3160e20com.zhihu.web${timestamp}`,
        ),
      ],
      ['refresh_token', refreshToken],
    ]
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
      )
      .join('&');

    const oauthResponse = await refreshClient.post<unknown>(
      '/api/v3/oauth/sign_in',
      encryptZseV4(formData),
      {
        headers: {
          ...commonHeaders,
          Cookie: tokenCookie || cookie,
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'x-zse-83': '3_3.0',
        },
      },
    );
    if (useAuthStore.getState().activeAccountIndex !== accountIndexAtStart) {
      return false;
    }
    const finalCookie = persistResponseCookies(
      oauthResponse,
      tokenCookie || cookie,
    );
    return hasAuthenticationCookie(
      useAuthStore.getState().cookies || finalCookie || tokenCookie || cookie,
    );
  } catch {
    return false;
  }
}

function refreshZhihuSession(cookie: string): Promise<boolean> {
  const existing = refreshPromises.get(cookie);
  if (existing) return existing;

  const promise = performZhihuSessionRefresh(cookie).finally(() => {
    refreshPromises.delete(cookie);
  });
  refreshPromises.set(cookie, promise);
  return promise;
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
    const body = config.data
      ? typeof config.data === 'string'
        ? config.data
        : JSON.stringify(config.data)
      : null;
    const fullUrl = apiClient.getUri(config);
    const configuredReferer = getHeaderValue(config.headers, 'Referer');
    const authHeaders = await buildZhihuAuthHeaders(fullUrl, cookie, body);
    if (configuredReferer) authHeaders.Referer = configuredReferer;
    Object.assign(config.headers, authHeaders);
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    persistResponseCookies(response);
    const requestId = getRequestId(response.config);
    console.log(
      `✅ [API ${requestId}] ${response.config.method?.toUpperCase()} ${getSafePath(response.config.url)} Status: ${response.status}`,
    );
    return response;
  },
  async (error: AxiosError<unknown>) => {
    const requestId = getRequestId(error.config);
    const method = error.config?.method?.toUpperCase() || '<unknown>';
    const path = getSafePath(error.config?.url);
    if (error.response?.status === 401) {
      const requestCookie = getHeaderValue(error.config?.headers, 'Cookie');
      if (error.config && requestCookie && !retriedRequests.has(error.config)) {
        retriedRequests.add(error.config);
        if (await refreshZhihuSession(requestCookie)) {
          return apiClient.request(error.config);
        }
      }
      persistResponseCookies(error.response, requestCookie);
      console.warn(`⚠️ [API ${requestId}] ${method} ${path} Status: 401`);
    } else if (error.response) {
      persistResponseCookies(error.response);
    }
    // 处理人机验证 40352
    const responseData = error.response?.data;
    const verificationError =
      responseData &&
      typeof responseData === 'object' &&
      'error' in responseData &&
      responseData.error &&
      typeof responseData.error === 'object'
        ? responseData.error
        : null;
    const verificationCode =
      verificationError &&
      'code' in verificationError &&
      typeof verificationError.code === 'number'
        ? verificationError.code
        : undefined;
    if (verificationCode === 40352) {
      const redirectUrl =
        verificationError &&
        'redirect' in verificationError &&
        typeof verificationError.redirect === 'string'
          ? verificationError.redirect
          : undefined;
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
