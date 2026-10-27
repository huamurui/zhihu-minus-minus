import CookieManager from '@preeternal/react-native-cookie-manager';
import { QueryClient } from '@tanstack/react-query';
import axios, {
  AxiosError,
  type AxiosResponse,
  CanceledError,
  type InternalAxiosRequestConfig,
} from 'axios';
import { readAtomically } from '../modules/zhihu-persistence';
import apiClient, {
  hasAuthenticationCookie,
  mergeCookieHeader,
} from '../src/api/client';
import {
  readContents,
  touchAnswerRead,
  touchAnswersRead,
} from '../src/api/zhihu/lastRead';
import type { ZhihuMeInfo } from '../src/api/zhihu/me';
import {
  getAuthSessionVersion,
  saveAuthState,
  useAuthStore,
} from '../src/store/useAuthStore';
import { useCollectionStore } from '../src/store/useCollectionStore';
import { useVerificationStore } from '../src/store/useVerificationStore';
import {
  NATIVE_SESSION_SYNC_TIMEOUT_MS,
  syncNativeSessionCookies,
} from '../src/utils/authSession';

jest.mock('@preeternal/react-native-cookie-manager', () => ({
  __esModule: true,
  default: {
    get: jest.fn(async () => ({})),
    clearAllStores: jest.fn(async () => true),
    set: jest.fn(async () => true),
  },
}));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/',
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  readAsStringAsync: jest.fn(
    async (path: string) =>
      mockAuthFiles.get(path) ?? JSON.stringify({ state: {}, version: 2 }),
  ),
  writeAsStringAsync: jest.fn(async (path: string, value: string) => {
    mockAuthFiles.set(path, value);
  }),
  deleteAsync: jest.fn(async () => undefined),
}));
// Persistence cryptography/native filesystem have dedicated tests; these
// session tests use an in-memory bridge rather than an unavailable device.
const mockAuthFiles = new Map<string, string>();
jest.mock('../src/storage/authEncryption', () => ({
  encryptAuthState: async (value: string) =>
    Buffer.from(value).toString('base64'),
  decryptAuthState: async (value: string) =>
    Buffer.from(value, 'base64').toString(),
  resetAuthEncryptionKey: jest.fn(),
}));
jest.mock('../modules/zhihu-persistence', () => ({
  readAtomically: jest.fn(
    async (path: string) =>
      mockAuthFiles.get(path) ?? JSON.stringify({ state: {}, version: 2 }),
  ),
  writeAtomically: async (path: string, value: string) => {
    mockAuthFiles.set(path, value);
  },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('../src/storage/localAccountData', () => ({
  clearLocalAccountData: jest.fn(async () => undefined),
}));
jest.mock('../src/api/zse96/index', () => ({
  ZSE_VERSION: 'test',
  signRequest96: jest.fn(async () => 'test-signature'),
  hmacSha1Hex: jest.fn(() => 'test-hmac'),
  encryptZseV4: jest.fn((value: string) => value),
}));

// Every credential and profile in this file is synthetic.
const COOKIE_A = 'z_c0=test-account-a';
const COOKIE_B = 'z_c0=test-account-b';
const PROFILE_A = { id: 'test-a', name: 'Test A' } as ZhihuMeInfo;
const PROFILE_B = { id: 'test-b', name: 'Test B' } as ZhihuMeInfo;
const originalAdapter = apiClient.defaults.adapter;

function response(
  config: InternalAxiosRequestConfig,
  data: unknown = {},
  headers: Record<string, string> = {},
): AxiosResponse<unknown> {
  return { config, data, headers, status: 200, statusText: 'OK' };
}

function unauthorized(config: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
    ...response(config),
    status: 401,
    statusText: 'Unauthorized',
  });
}

beforeEach(async () => {
  useVerificationStore.getState().hide();
  await useAuthStore.persist.rehydrate();
  useAuthStore.setState({
    accounts: [],
    activeAccountIndex: -1,
    cookies: null,
    me: null,
  });
  useAuthStore.getState().addAccount(COOKIE_A, PROFILE_A);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

test('answer touch reaches the adapter as Web multipart FormData after Axios transforms', async () => {
  let requests = 0;
  apiClient.defaults.adapter = async (config) => {
    requests += 1;
    expect(apiClient.getUri(config)).toBe(
      'https://www.zhihu.com/lastread/touch',
    );
    expect(config.method).toBe('post');
    expect(config.headers.get('Content-Type')).toBe('multipart/form-data');
    expect(config.data).toBeInstanceOf(FormData);
    expect((config.data as FormData).getAll('items')).toEqual([
      '[["answer","2093868403115155780","touch"]]',
    ]);
    expect((config.data as FormData).getAll('targets')).toEqual([]);
    return response(config);
  };

  await touchAnswerRead('2093868403115155780');
  expect(requests).toBe(1);
});

test('a whole answer batch remains one multipart request after Axios transforms', async () => {
  let requests = 0;
  apiClient.defaults.adapter = async (config) => {
    requests += 1;
    expect(apiClient.getUri(config)).toBe(
      'https://www.zhihu.com/lastread/touch',
    );
    expect(config.headers.get('Content-Type')).toBe('multipart/form-data');
    expect(config.data).toBeInstanceOf(FormData);
    expect((config.data as FormData).getAll('items')).toEqual([
      JSON.stringify([
        ['answer', '2093868403115155780', 'touch'],
        ['answer', '2093868403115155781', 'touch'],
      ]),
    ]);
    return response(config);
  };

  await touchAnswersRead(['2093868403115155780', '2093868403115155781']);
  expect(requests).toBe(1);
});

test('mixed question and answer reads stay one multipart request through the client', async () => {
  let requests = 0;
  apiClient.defaults.adapter = async (config) => {
    requests += 1;
    expect(apiClient.getUri(config)).toBe(
      'https://www.zhihu.com/lastread/touch',
    );
    expect(config.headers.get('Content-Type')).toBe('multipart/form-data');
    expect(config.data).toBeInstanceOf(FormData);
    expect((config.data as FormData).getAll('items')).toEqual([
      JSON.stringify([
        ['question', '7', 'read'],
        ['answer', '2093868403115155780', 'read'],
      ]),
    ]);
    return response(config);
  };

  await readContents([
    { type: 'question', id: '7' },
    { type: 'answer', id: '2093868403115155780' },
  ]);
  expect(requests).toBe(1);
});

test('a read batch cannot reach the adapter after its account switches before interception', async () => {
  const adapter = jest.fn(async (config: InternalAxiosRequestConfig) =>
    response(config),
  );
  apiClient.defaults.adapter = adapter;
  const pending = readContents([
    { type: 'question', id: '7' },
    { type: 'answer', id: '84' },
  ]);
  useAuthStore.getState().setCookies(COOKIE_B);
  useAuthStore.getState().addAccount(COOKIE_B, PROFILE_B);

  await expect(pending).rejects.toBeInstanceOf(CanceledError);
  expect(adapter).not.toHaveBeenCalled();
});

test('answer touch cannot reach the adapter after an account switch before its request interceptor', async () => {
  let requests = 0;
  apiClient.defaults.adapter = async (config) => {
    requests += 1;
    return response(config);
  };

  const pending = touchAnswerRead('42');
  useAuthStore.getState().setCookies(COOKIE_B);
  useAuthStore.getState().addAccount(COOKIE_B, PROFILE_B);

  await expect(pending).rejects.toBeInstanceOf(CanceledError);
  expect(requests).toBe(0);
});

test('answer touch rejects a verification challenge without opening a modal, while normal requests still prompt', async () => {
  apiClient.defaults.adapter = async (config) => {
    throw new AxiosError(
      'Synthetic challenge',
      'ERR_BAD_REQUEST',
      config,
      undefined,
      {
        ...response(config, {
          error: {
            code: 40352,
            redirect: 'https://example.com/synthetic-challenge',
          },
        }),
        status: 403,
        statusText: 'Forbidden',
      },
    );
  };
  await expect(touchAnswerRead('42')).rejects.toMatchObject({
    response: { status: 403 },
  });
  expect(useVerificationStore.getState().isVisible).toBe(false);
  expect(useVerificationStore.getState().verificationUrl).toBeNull();

  await expect(apiClient.get('/test-interactive')).rejects.toMatchObject({
    response: { status: 403 },
  });
  expect(useVerificationStore.getState().isVisible).toBe(true);
  useVerificationStore.getState().hide();
});

test('a delayed rehydrate cannot replace a newer login or discard saved accounts', async () => {
  expect(await saveAuthState()).toBe(true);
  const previousSnapshot = mockAuthFiles.get('file:///test/auth-storage.json');
  expect(previousSnapshot).toBeDefined();
  let releaseRead: (value: string | null) => void = () => {};
  let startRead: () => void = () => {};
  const reading = new Promise<void>((resolve) => {
    startRead = resolve;
  });
  jest.mocked(readAtomically).mockImplementationOnce(() => {
    startRead();
    return new Promise((resolve) => {
      releaseRead = resolve;
    });
  });
  const restoring = useAuthStore.persist.rehydrate();
  await reading;
  useAuthStore.getState().setCookies(COOKIE_B);
  useAuthStore.getState().addAccount(COOKIE_B, PROFILE_B);
  releaseRead(previousSnapshot ?? null);
  await restoring;
  expect(useAuthStore.getState()).toMatchObject({
    cookies: COOKIE_B,
    me: PROFILE_B,
    accounts: [{ me: PROFILE_A }, { me: PROFILE_B }],
  });
  expect(await saveAuthState()).toBe(true);
  await useAuthStore.persist.rehydrate();
  expect(useAuthStore.getState()).toMatchObject({
    cookies: COOKIE_B,
    accounts: [{ me: PROFILE_A }, { me: PROFILE_B }],
  });
});

test.each([0, 1, 2])(
  'restored v%s account subscribers start their first feed request in the committed session',
  async (version) => {
    expect(await saveAuthState()).toBe(true);
    const encryptedSnapshot = mockAuthFiles.get(
      'file:///test/auth-storage.json',
    );
    if (!encryptedSnapshot) throw new Error('测试账号未保存');
    // Legacy versions were plain JSON; v0 predates the saved accounts array.
    const previousSnapshot =
      version === 2
        ? encryptedSnapshot
        : JSON.stringify({
            state: {
              cookies: COOKIE_A,
              me: PROFILE_A,
              ...(version === 1
                ? {
                    accounts: [{ cookies: COOKIE_A, me: PROFILE_A }],
                    activeAccountIndex: 0,
                  }
                : {}),
            },
            version,
          });
    useAuthStore.setState({
      accounts: [],
      activeAccountIndex: -1,
      cookies: null,
      me: null,
    });
    expect(await saveAuthState()).toBe(true);
    // Simulate cold-start memory while keeping the saved account on disk. The
    // request interceptor may start another hydration before this one finishes.
    mockAuthFiles.set('file:///test/auth-storage.json', previousSnapshot);
    mockAuthFiles.set(
      'file:///test/auth-storage.json.backup',
      previousSnapshot,
    );

    let releaseRead: (value: string | null) => void = () => {};
    let startRead: () => void = () => {};
    const reading = new Promise<void>((resolve) => {
      startRead = resolve;
    });
    jest.mocked(readAtomically).mockImplementationOnce(() => {
      startRead();
      return new Promise((resolve) => {
        releaseRead = resolve;
      });
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const data = { items: ['synthetic-restored-feed'] };
    apiClient.defaults.adapter = async (config) => response(config, data);
    const beforeRestore = getAuthSessionVersion();
    let observedSession: number | undefined;
    let feed: Promise<unknown> | undefined;
    const queryKey = ['zhihu-feed', PROFILE_A.id, 'recommend'];
    const stop = useAuthStore.subscribe((state) => {
      if (state.cookies !== COOKIE_A || feed) return;
      observedSession = getAuthSessionVersion();
      feed = client
        .fetchQuery({
          queryKey,
          queryFn: async () => {
            const sessionVersion = getAuthSessionVersion();
            const result = await apiClient.get('/test-restored-feed');
            // The home feed rejects responses belonging to an older session.
            if (sessionVersion !== getAuthSessionVersion())
              throw new Error('登录状态已改变');
            return result.data;
          },
        })
        .catch((error: unknown) => error);
    });
    try {
      const restoring = useAuthStore.persist.rehydrate();
      await reading;
      releaseRead(previousSnapshot);
      await restoring;
      expect(await feed).toEqual(data);
      expect(observedSession).toBeGreaterThan(beforeRestore);
      expect(getAuthSessionVersion()).toBe(observedSession);
      expect(client.getQueryState(queryKey)?.status).toBe('success');
    } finally {
      stop();
      client.clear();
    }
  },
);

test('repeated hydration of the same account preserves its session and collection state', async () => {
  expect(await saveAuthState()).toBe(true);
  useCollectionStore.getState().setCollectedStatus('synthetic-answer', true);
  useCollectionStore
    .getState()
    .updateCollectedCountOffset('synthetic-answer', 1);
  useCollectionStore.getState().openSelector('synthetic-answer', 'answer');
  const sessionVersion = getAuthSessionVersion();
  const collections = useCollectionStore.getState();

  await Promise.all([
    useAuthStore.persist.rehydrate(),
    useAuthStore.persist.rehydrate(),
  ]);
  await useAuthStore.persist.rehydrate();

  expect(getAuthSessionVersion()).toBe(sessionVersion);
  expect(useAuthStore.getState().cookies).toBe(COOKIE_A);
  expect(useCollectionStore.getState()).toBe(collections);
});

test('startup blocks new login until the existing accounts have been restored', async () => {
  expect(await saveAuthState()).toBe(true);
  const previousSnapshot = mockAuthFiles.get('file:///test/auth-storage.json');
  let releaseRead: (value: string | null) => void = () => {};
  let startRead: () => void = () => {};
  const reading = new Promise<void>((resolve) => {
    startRead = resolve;
  });
  jest.mocked(readAtomically).mockImplementationOnce(() => {
    startRead();
    return new Promise((resolve) => {
      releaseRead = resolve;
    });
  });
  const modules: { auth?: typeof import('../src/store/useAuthStore') } = {};
  jest.isolateModules(() => {
    modules.auth = jest.requireActual<
      typeof import('../src/store/useAuthStore')
    >('../src/store/useAuthStore');
  });
  // The native bridge mock is shared across module instances.
  await reading;
  const isolated = modules.auth;
  if (!isolated) throw new Error('隔离账号模块未加载');
  const freshStore = isolated.useAuthStore;
  expect(() => freshStore.getState().setCookies(COOKIE_B)).toThrow(
    '请先恢复已保存账号',
  );
  expect(() => freshStore.getState().addAccount(COOKIE_B, PROFILE_B)).toThrow(
    '请先恢复已保存账号',
  );
  const restored = new Promise<void>((resolve) => {
    const stop = freshStore.persist.onFinishHydration(() => {
      stop();
      resolve();
    });
  });
  releaseRead(previousSnapshot ?? null);
  await restored;
  freshStore.getState().setCookies(COOKIE_B);
  freshStore.getState().addAccount(COOKIE_B, PROFILE_B);
  expect(await isolated.saveAuthState()).toBe(true);
  expect(freshStore.getState()).toMatchObject({
    cookies: COOKIE_B,
    accounts: [{ me: PROFILE_A }, { me: PROFILE_B }],
  });
});

test('rehydration verifies the session again after JSON decoding and before merge', async () => {
  expect(await saveAuthState()).toBe(true);
  const encrypted = mockAuthFiles.get('file:///test/auth-storage.json');
  if (!encrypted) throw new Error('测试账号未保存');
  const originalParse = JSON.parse;
  const previousSnapshot = Buffer.from(
    originalParse(encrypted).data,
    'base64',
  ).toString();
  let decoded = 0;
  const parser = jest
    .spyOn(JSON, 'parse')
    .mockImplementation((text, reviver) => {
      const value = originalParse(text, reviver);
      if (text === previousSnapshot && ++decoded === 2) {
        // First parse validates decrypted storage; the second belongs to
        // createJSONStorage, after the file adapter's generation check.
        useAuthStore.getState().setCookies(COOKIE_B);
        useAuthStore.getState().addAccount(COOKIE_B, PROFILE_B);
      }
      return value;
    });
  await useAuthStore.persist.rehydrate();
  parser.mockRestore();
  expect(decoded).toBe(2);
  expect(useAuthStore.getState()).toMatchObject({
    cookies: COOKIE_B,
    accounts: [{ me: PROFILE_A }, { me: PROFILE_B }],
  });
  expect(await saveAuthState()).toBe(true);
});

test('limits a request to one refresh even though Axios clones retry config', async () => {
  const refreshClient = axios.create();
  const refreshAdapter = jest.fn(async (config: InternalAxiosRequestConfig) =>
    response(
      config,
      config.url?.includes('token/refresh')
        ? { refresh_token: 'test-refresh-token' }
        : {},
    ),
  );
  refreshClient.defaults.adapter = refreshAdapter;
  jest.spyOn(axios, 'create').mockReturnValue(refreshClient);
  let attempts = 0;
  apiClient.defaults.adapter = async (config) => {
    attempts += 1;
    if (attempts <= 2) throw unauthorized(config);
    return response(config);
  };

  await expect(apiClient.get('/test-session')).rejects.toMatchObject({
    response: { status: 401 },
  });
  expect(attempts).toBe(2);
  expect(refreshAdapter).toHaveBeenCalledTimes(2);
});

test.each(['guest', 'logout'] as const)(
  'ignores an old response after switching to %s',
  async (change) => {
    let finish: (() => void) | undefined;
    let started: (() => void) | undefined;
    const adapterStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    apiClient.defaults.adapter = (config) => {
      started?.();
      return new Promise((resolve) => {
        finish = () =>
          resolve(
            response(
              config,
              {},
              {
                'set-cookie': 'z_c0=test-old-response; Path=/',
              },
            ),
          );
      });
    };
    const pending = apiClient.get('/test-session');
    const rejected = expect(pending).rejects.toMatchObject({
      code: 'ERR_CANCELED',
    });
    await adapterStarted;
    if (change === 'guest') useAuthStore.getState().switchAccount(-1);
    else useAuthStore.getState().logout();
    finish?.();
    await rejected;
    expect(useAuthStore.getState().cookies).toBeNull();
  },
);

test('a new login cannot write its response cookies into a saved account', () => {
  useAuthStore.getState().setCookies(COOKIE_B);
  useAuthStore.getState().updateActiveAccountCookies('z_c0=test-b-rotated');
  const state = useAuthStore.getState();
  expect(state.activeAccountIndex).toBe(-1);
  expect(state.me).toBeNull();
  expect(state.accounts[0].cookies).toBe(COOKIE_A);
  useAuthStore.getState().addAccount(COOKIE_B, PROFILE_B);
  expect(useAuthStore.getState().accounts).toHaveLength(2);
});

test('logging out an unverified new session preserves and restores saved accounts', () => {
  useAuthStore.getState().setCookies(COOKIE_B);
  useAuthStore.getState().logout();
  expect(useAuthStore.getState()).toMatchObject({
    accounts: [{ cookies: COOKIE_A, me: PROFILE_A }],
    activeAccountIndex: 0,
    cookies: COOKIE_A,
    me: PROFILE_A,
  });
});

test('removing a saved account preserves an unverified current session and its in-flight response', async () => {
  useAuthStore.getState().setCookies(COOKIE_B);
  let finish: (() => void) | undefined;
  let started: (() => void) | undefined;
  const adapterStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  apiClient.defaults.adapter = (config) => {
    started?.();
    return new Promise((resolve) => {
      finish = () =>
        resolve(
          response(config, {}, { 'set-cookie': 'z_c0=test-b-rotated; Path=/' }),
        );
    });
  };
  const pending = apiClient.get('/test-unverified-session');
  await adapterStarted;
  const sessionVersion = getAuthSessionVersion();
  useAuthStore.getState().removeAccount(0);
  expect(useAuthStore.getState()).toMatchObject({
    accounts: [],
    activeAccountIndex: -1,
    cookies: COOKIE_B,
    me: null,
  });
  expect(getAuthSessionVersion()).toBe(sessionVersion);
  finish?.();
  await pending;
  expect(useAuthStore.getState().cookies).toBe('z_c0=test-b-rotated');
  expect(useAuthStore.getState().accounts).toEqual([]);
});

test('removing the last active account clears and advances the current session', () => {
  const sessionVersion = getAuthSessionVersion();
  useAuthStore.getState().removeAccount(0);
  expect(useAuthStore.getState()).toMatchObject({
    accounts: [],
    activeAccountIndex: -1,
    cookies: null,
    me: null,
  });
  expect(getAuthSessionVersion()).toBeGreaterThan(sessionVersion);
});

test('honors cookie deletion attributes and rejects empty auth tokens', () => {
  expect(hasAuthenticationCookie('z_c0=; d_c0=test')).toBe(false);
  expect(mergeCookieHeader(COOKIE_A, ['z_c0=deleted; Max-Age=0'])).toBe('');
  expect(
    mergeCookieHeader(COOKIE_A, [
      'z_c0=deleted; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ]),
  ).toBe('');
  expect(
    mergeCookieHeader(COOKIE_A, [
      'z_c0=test-live; Max-Age=3600; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ]),
  ).toBe('z_c0=test-live');
});

test.each(['guest', 'logout', 'new-login'] as const)(
  'clears transient collection state on %s session changes',
  (change) => {
    const collections = useCollectionStore.getState();
    collections.setCollectedStatus('synthetic-content', true);
    collections.updateCollectedCountOffset('synthetic-content', 1);
    collections.showToast('synthetic-content', 'answer', 'test');
    collections.openSelector('synthetic-content', 'answer');
    if (change === 'guest') useAuthStore.getState().switchAccount(-1);
    else if (change === 'logout') useAuthStore.getState().logout();
    else useAuthStore.getState().setCookies(COOKIE_B);
    expect(useCollectionStore.getState()).toMatchObject({
      collectedStatusMap: {},
      collectedCountOffsetMap: {},
      toastVisible: false,
      selectorVisible: false,
      selectorContentId: null,
    });
  },
);

test('anonymous response cookies do not convert a guest into an authenticated store session', async () => {
  useAuthStore.getState().switchAccount(-1);
  apiClient.defaults.adapter = async (config) =>
    response(
      config,
      {},
      {
        'set-cookie': 'd_c0=test-guest; Path=/',
      },
    );
  await apiClient.get('/test-guest');
  expect(useAuthStore.getState().cookies).toBeNull();
});

test('a guest request waits for old native credentials to be cleared before reaching the adapter', async () => {
  let finishClear: () => void = () => {};
  let readNativeCookies = 0;
  jest.mocked(CookieManager.clearAllStores).mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        finishClear = () => resolve(true);
      }),
  );
  jest.mocked(CookieManager.get).mockImplementationOnce(async () => {
    readNativeCookies += 1;
    return {};
  });
  const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
    expect(config.headers.get('Cookie')).toBeUndefined();
    return response(config);
  });
  apiClient.defaults.adapter = adapter;
  useAuthStore.getState().switchAccount(-1);
  // A subscriber may start the request in the same setState call stack,
  // before the account action has registered the native synchronization.
  const pendingRequest = apiClient.get('/test-guest-after-login');
  const synchronization = syncNativeSessionCookies(null);
  await Promise.resolve();
  await Promise.resolve();
  expect(readNativeCookies).toBe(0);
  expect(adapter).not.toHaveBeenCalled();
  finishClear();
  await synchronization;
  await pendingRequest;
  expect(readNativeCookies).toBe(1);
  expect(adapter).toHaveBeenCalledTimes(1);
  expect(useAuthStore.getState().cookies).toBeNull();
});

test('a stalled native cleanup cannot keep a guest API request waiting beyond the synchronization deadline', async () => {
  jest.useFakeTimers();
  let finishClear: () => void = () => {};
  jest.mocked(CookieManager.clearAllStores).mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        finishClear = () => resolve(true);
      }),
  );
  const previousReads = jest.mocked(CookieManager.get).mock.calls.length;
  const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
    expect(config.headers.get('Cookie')).toBeUndefined();
    return response(config);
  });
  apiClient.defaults.adapter = adapter;
  useAuthStore.getState().switchAccount(-1);
  const synchronization = syncNativeSessionCookies(null);
  try {
    const pendingRequest = apiClient.get('/test-guest-native-timeout');
    await jest.advanceTimersByTimeAsync(NATIVE_SESSION_SYNC_TIMEOUT_MS - 1);
    expect(adapter).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await pendingRequest;
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(CookieManager.get).toHaveBeenCalledTimes(previousReads);
    // Feed/API reads released by bootstrap's five-second deadline share that
    // same synchronization budget instead of waiting another five seconds.
    const subsequentRequest = apiClient.get('/test-guest-after-timeout');
    await jest.advanceTimersByTimeAsync(0);
    expect(adapter).toHaveBeenCalledTimes(2);
    await subsequentRequest;
    expect(CookieManager.get).toHaveBeenCalledTimes(previousReads);
  } finally {
    finishClear();
    await synchronization;
    jest.useRealTimers();
  }
});

test.each(['not-started', 'already-failed', 'fails-during-request'] as const)(
  'first-install native cookie migration respects cleanup state: %s',
  async (cleanupState) => {
    const read = jest.mocked(readAtomically);
    const previousRead = read.getMockImplementation();
    read.mockResolvedValue(null);
    const getCookies = jest.mocked(CookieManager.get);
    getCookies.mockReset().mockResolvedValue({
      z_c0: { name: 'z_c0', value: 'synthetic-legacy-account' },
    });
    let fresh:
      | {
          auth: typeof import('../src/store/useAuthStore');
          session: typeof import('../src/utils/authSession');
          api: typeof import('../src/api/client');
        }
      | undefined;
    jest.isolateModules(() => {
      fresh = {
        auth: jest.requireActual('../src/store/useAuthStore'),
        session: jest.requireActual('../src/utils/authSession'),
        api: jest.requireActual('../src/api/client'),
      };
    });
    try {
      if (!fresh) throw new Error('隔离会话模块未加载');
      const { auth, session, api } = fresh;
      await auth.useAuthStore.persist.rehydrate();
      expect(auth.shouldImportLegacySession()).toBe(true);
      expect(auth.useAuthStore.getState().cookies).toBeNull();
      const adapter = jest.fn(async (config: InternalAxiosRequestConfig) =>
        response(config),
      );
      api.default.defaults.adapter = adapter;
      let failCleanup = () => {};
      let rejection: Promise<void> | undefined;
      if (cleanupState !== 'not-started') {
        jest.mocked(CookieManager.clearAllStores).mockImplementationOnce(
          () =>
            new Promise<boolean>((_resolve, reject) => {
              failCleanup = () =>
                reject(new Error('synthetic cleanup failure'));
            }),
        );
        rejection = expect(
          session.syncNativeSessionCookies(null),
        ).rejects.toThrow('synthetic cleanup failure');
        await Promise.resolve();
        if (cleanupState === 'already-failed') {
          failCleanup();
          await rejection;
        }
      }
      const request = api.default.get('/test-first-install-native-session');
      if (cleanupState === 'fails-during-request') {
        await Promise.resolve();
        expect(adapter).not.toHaveBeenCalled();
        failCleanup();
        await rejection;
      }
      await request;
      const sentCookie = adapter.mock.calls[0]?.[0].headers.get('Cookie');
      if (cleanupState === 'not-started') {
        expect(getCookies).toHaveBeenCalledTimes(1);
        expect(sentCookie).toBe('z_c0=synthetic-legacy-account');
        expect(auth.useAuthStore.getState().cookies).toBe(sentCookie);
      } else {
        expect(getCookies).not.toHaveBeenCalled();
        expect(sentCookie).toBeUndefined();
        expect(auth.useAuthStore.getState().cookies).toBeNull();
        await expect(session.waitForNativeSessionCookies()).resolves.toBe(
          false,
        );

        // The failed readiness result persists for later readers, but a new
        // successful synchronization permits anonymous native cookies again.
        getCookies.mockResolvedValue({
          d_c0: { name: 'd_c0', value: 'synthetic-anonymous-device' },
        });
        await session.syncNativeSessionCookies(null);
        await expect(session.waitForNativeSessionCookies()).resolves.toBe(true);
        await api.default.get('/test-first-install-native-recovered');
        expect(getCookies).toHaveBeenCalledTimes(1);
        expect(adapter.mock.calls[1]?.[0].headers.get('Cookie')).toBe(
          'd_c0=synthetic-anonymous-device',
        );
        expect(auth.useAuthStore.getState().cookies).toBeNull();
      }
    } finally {
      if (previousRead) read.mockImplementation(previousRead);
      getCookies.mockReset().mockResolvedValue({});
    }
  },
);

test('clears the active auth session when z_c0 is deleted but anonymous cookies remain', async () => {
  apiClient.defaults.adapter = async (config) =>
    response(
      config,
      {},
      {
        'set-cookie': 'z_c0=deleted; Max-Age=0, d_c0=test-guest; Path=/',
      },
    );
  await apiClient.get('/test-session-deletion');
  expect(useAuthStore.getState().cookies).toBe('');
  expect(useAuthStore.getState().accounts[0].cookies).toBe('');
});

function riskControlled(config: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError(
    'Synthetic risk control',
    'ERR_BAD_REQUEST',
    config,
    undefined,
    {
      ...response(config, {
        error: {
          code: 40362,
          message: '您当前请求存在异常，暂时限制本次访问。',
        },
      }),
      status: 403,
      statusText: 'Forbidden',
    },
  );
}

const SIGNING_HEADERS = [
  'x-zse-96',
  'x-zse-93',
  'X-Udid',
  'x-xsrftoken',
  'x-requested-with',
  'Referer',
];

describe('Zhihu risk control (40362)', () => {
  beforeEach(() => {
    // A device cookie makes the client sign requests.
    useAuthStore
      .getState()
      .setCookies(`${COOKIE_A}; d_c0=test-device|1; _xsrf=test-xsrf`);
  });

  test('retries a signed request once with only the cookie and user agent', async () => {
    const sent: InternalAxiosRequestConfig['headers'][] = [];
    apiClient.defaults.adapter = async (config) => {
      sent.push(config.headers);
      if (sent.length === 1) throw riskControlled(config);
      return response(config, { paging: {}, data: [] });
    };

    await expect(apiClient.get('/test-followers')).resolves.toMatchObject({
      status: 200,
    });
    expect(sent).toHaveLength(2);
    for (const name of SIGNING_HEADERS) expect(sent[0].get(name)).toBeTruthy();
    for (const name of SIGNING_HEADERS) expect(sent[1].get(name)).toBeFalsy();
    expect(sent[1].get('Cookie')).toContain('z_c0=test-account-a');
    expect(sent[1].get('User-Agent')).toBeTruthy();
  });

  test('gives up after the one unsigned retry', async () => {
    let attempts = 0;
    apiClient.defaults.adapter = async (config) => {
      attempts += 1;
      throw riskControlled(config);
    };

    await expect(apiClient.get('/test-followers')).rejects.toMatchObject({
      response: { status: 403, data: { error: { code: 40362 } } },
    });
    expect(attempts).toBe(2);
  });

  test('does not retry a request that was never signed', async () => {
    useAuthStore.getState().setCookies(COOKIE_A);
    let attempts = 0;
    apiClient.defaults.adapter = async (config) => {
      attempts += 1;
      throw riskControlled(config);
    };

    await expect(apiClient.get('/test-followers')).rejects.toMatchObject({
      response: { status: 403 },
    });
    expect(attempts).toBe(1);
  });
});
