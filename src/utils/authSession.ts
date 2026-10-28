import CookieManager from '@preeternal/react-native-cookie-manager';
import * as SecureStore from 'expo-secure-store';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { createNativeSessionSynchronizer } from './nativeSessionSync';

export const LEGACY_COOKIE_STORAGE_KEY = 'user_cookies';
const SECURE_STORE_SAFE_COOKIE_LENGTH = 2000;
const synchronize = createNativeSessionSynchronizer({
  isCurrent: (version) => getAuthSessionVersion() === version,
  getCookies: () => useAuthStore.getState().cookies,
  clear: () => CookieManager.clearAllStores(),
  setCookie: (name, value) =>
    CookieManager.set(
      'https://www.zhihu.com',
      { name, value, domain: '.zhihu.com', path: '/', secure: true },
      true,
    ),
  saveLegacy: (cookies) =>
    cookies && cookies.length < SECURE_STORE_SAFE_COOKIE_LENGTH
      ? SecureStore.setItemAsync(LEGACY_COOKIE_STORAGE_KEY, cookies)
      : SecureStore.deleteItemAsync(LEGACY_COOKIE_STORAGE_KEY),
});
let pendingSynchronization: Promise<boolean> = Promise.resolve(true);
let synchronizationStartedAt = 0;
export const NATIVE_SESSION_SYNC_TIMEOUT_MS = 5000;

// A login WebView owns the jar until it closes. Its partially written cookies
// must not be imported into the still-selected app account.
let nativeLoginVersion: number | undefined;
let nativeCookieReadGeneration = 0;

export function beginNativeLoginFlow(): void {
  nativeLoginVersion = getAuthSessionVersion();
  nativeCookieReadGeneration += 1;
}

export function getNativeCookieReadGeneration(): number | undefined {
  return nativeLoginVersion === undefined
    ? nativeCookieReadGeneration
    : undefined;
}

export function isNativeCookieReadCurrent(generation: number): boolean {
  return (
    nativeLoginVersion === undefined &&
    generation === nativeCookieReadGeneration
  );
}

export function finishNativeLoginFlow(): void {
  if (nativeLoginVersion === undefined) return;
  const restore = nativeLoginVersion === getAuthSessionVersion();
  nativeLoginVersion = undefined;
  nativeCookieReadGeneration += 1;
  if (restore) void syncNativeSessionCookies(null).catch(() => undefined);
}

/** Readers must not use the old native jar while a selected session is mirrored. */
export async function waitForNativeSessionCookies(): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const settled = async () => {
    let pending: Promise<boolean>;
    let ready: boolean;
    do {
      pending = pendingSynchronization;
      ready = await pending;
    } while (pending !== pendingSynchronization);
    return ready;
  };
  try {
    // Axios has not reached its transport timeout while this interceptor waits.
    // On timeout callers can browse without reading the possibly stale jar.
    return await Promise.race([
      settled(),
      new Promise<false>((resolve) => {
        timeout = setTimeout(
          () => resolve(false),
          Math.max(
            0,
            NATIVE_SESSION_SYNC_TIMEOUT_MS -
              (Date.now() - synchronizationStartedAt),
          ),
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

/** Zustand is authoritative; obsolete native writes stop at each async boundary. */
export function syncNativeSessionCookies(
  _cookies: string | null,
): Promise<void> {
  // The caller's snapshot may rotate while it awaits account persistence.
  // Always mirror the selected session, including its latest response cookies.
  const pending = synchronize(getAuthSessionVersion());
  // The initiating UI receives the rejection. Readers retain a failure result
  // and skip the stale native jar until a later synchronization succeeds.
  synchronizationStartedAt = Date.now();
  pendingSynchronization = pending.then(
    () => true,
    () => false,
  );
  return pending;
}
