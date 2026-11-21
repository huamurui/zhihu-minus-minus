import * as FileSystem from 'expo-file-system/legacy';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ZhihuMeInfo } from '@/api/zhihu/me';
import { readAtomically, writeAtomically } from '@/modules/zhihu-persistence';
import {
  decryptAuthState,
  encryptAuthState,
  resetAuthEncryptionKey,
} from '@/storage/authEncryption';
import { createAuthPersistenceQueue } from '@/storage/authPersistenceQueue';
import { createEncryptedAuthStorage } from '@/storage/encryptedAuthStorage';
import { clearLocalAccountData } from '@/storage/localAccountData';
import { resolveLocalAccountKey } from '@/utils/localAccount';
import { useAuthPersistenceStatus } from './useAuthPersistenceStatus';
import { useCollectionStore } from './useCollectionStore';

// 适配器：多账号 Cookie/资料使用 FileSystem，避免把大 payload 放入 SecureStore。
const AUTH_STORAGE_PATH = `${FileSystem.documentDirectory}auth-storage.json`;
let authStorageExistedOnFirstRead: boolean | undefined;
let authSessionVersion = 0;
let authHydratedOnce = false;

function advanceAuthSession(): void {
  authSessionVersion += 1;
  // Explicit session choices must never re-import a stale legacy cookie.
  authStorageExistedOnFirstRead = true;
  useCollectionStore.getState().resetSession();
}

/** In-memory boundary for requests belonging to a selected login session. */
export function getAuthSessionVersion(): number {
  return authSessionVersion;
}

/** Only a missing auth file is eligible for the one-time legacy cookie import. */
export function shouldImportLegacySession() {
  return authStorageExistedOnFirstRead === false;
}

const encryptedStorage = createEncryptedAuthStorage({
  read: (slot) =>
    readAtomically(
      slot === 'primary' ? AUTH_STORAGE_PATH : `${AUTH_STORAGE_PATH}.backup`,
    ),
  writeAtomically: (slot, value) =>
    writeAtomically(
      slot === 'primary' ? AUTH_STORAGE_PATH : `${AUTH_STORAGE_PATH}.backup`,
      value,
    ),
  encrypt: encryptAuthState,
  decrypt: decryptAuthState,
  onPresence: (present) => {
    if (present) authStorageExistedOnFirstRead = true;
    else authStorageExistedOnFirstRead ??= false;
  },
  onFailure: (failed) => useAuthPersistenceStatus.getState().setFailed(failed),
});

const authPersistence = createAuthPersistenceQueue({
  write: (value) => encryptedStorage.setItem(value),
  remove: () => encryptedStorage.removeItem(),
  onFailure: () => console.error('保存登录状态失败'),
});

/** Retry the complete current snapshot and await all preceding persistence. */
export async function saveAuthState(): Promise<boolean> {
  try {
    await encryptedStorage.ensureWritable();
  } catch {
    return false;
  }
  useAuthStore.setState({});
  return authPersistence.wait();
}

export async function retryAuthPersistence(): Promise<boolean> {
  const restoringSession = getAuthSessionVersion();
  if (!authHydratedOnce || !encryptedStorage.hasReadableSnapshot()) {
    await useAuthStore.persist.rehydrate();
    if (!authHydratedOnce || !encryptedStorage.hasReadableSnapshot())
      return false;
    // A changed session advances the version before publishing restored state.
  }
  if (
    restoringSession !== getAuthSessionVersion() &&
    !useAuthStore.persist.hasHydrated()
  )
    return false;
  return saveAuthState();
}

/** Explicit account reset, never invoked by hydration or automatic migration. */
export async function resetSavedAuthState(): Promise<boolean> {
  advanceAuthSession();
  const resettingSession = getAuthSessionVersion();
  // Key rotation belongs to the same queue as every preceding/following save.
  await authPersistence.perform(async () => {
    if (getAuthSessionVersion() !== resettingSession)
      throw new Error('会话已变化');
    await encryptedStorage.reset(resetAuthEncryptionKey);
    if (getAuthSessionVersion() !== resettingSession) return;
    authHydratedOnce = true;
    useAuthStore.setState({
      accounts: [],
      activeAccountIndex: -1,
      cookies: null,
      me: null,
    });
  });
  const saved = await authPersistence.wait();
  return saved && getAuthSessionVersion() === resettingSession;
}

const fileStorage = {
  getItem: async (_name: string) => {
    const readingSession = getAuthSessionVersion();
    const snapshot = await encryptedStorage.getItem();
    if (readingSession !== getAuthSessionVersion())
      throw new Error('会话已变化，未应用旧账号快照');
    return snapshot;
  },
  setItem: (_name: string, value: string) => authPersistence.write(value),
  removeItem: (_name: string) => authPersistence.remove(),
};

// JSON parsing/migration adds async steps after the file read. Keep the read
// generation on the parsed object and verify again at the actual merge.
const restoredSessionVersions = new WeakMap<object, number>();
const jsonStorage = createJSONStorage<AuthState>(() => fileStorage);
if (!jsonStorage) throw new Error('账号存储适配器不可用');
const sessionStorage = {
  ...jsonStorage,
  getItem: async (name: string) => {
    const readingSession = getAuthSessionVersion();
    const snapshot = await jsonStorage.getItem(name);
    if (snapshot?.state && typeof snapshot.state === 'object')
      restoredSessionVersions.set(snapshot.state, readingSession);
    return snapshot;
  },
};

function assertAuthStateReady(): void {
  if (!authHydratedOnce || !encryptedStorage.hasReadableSnapshot())
    throw new Error('请先恢复已保存账号，再修改登录状态');
}

export interface Account {
  cookies: string;
  me: ZhihuMeInfo;
  last_updated?: number; // 添加更新时间戳
}

// 账号被移除时同步清理其本地数据（如浏览曝光记录）
// 清理异步执行，不阻塞账号操作；失败后仍有仓储过期与容量清理。
const removeAccountLocalData = (account: Account | undefined) => {
  const accountKey = resolveLocalAccountKey(account?.me, true);
  if (!accountKey) return;
  void clearLocalAccountData(accountKey).catch(() => {
    console.warn('清除已移除账号的本地数据失败');
  });
};

interface AuthState {
  accounts: Account[];
  activeAccountIndex: number;
  cookies: string | null;
  me: ZhihuMeInfo | null; // 存储个人详细信息
  setCookies: (cookies: string) => void;
  updateActiveAccountCookies: (cookies: string) => void;
  setMe: (me: ZhihuMeInfo) => void;
  addAccount: (cookies: string, me: ZhihuMeInfo) => void;
  switchAccount: (
    index: number,
    verifiedSession?: { cookies: string; me: ZhihuMeInfo },
  ) => void;
  removeAccount: (index: number) => void;
  logout: () => void;
}

interface PersistedAuthState {
  accounts?: Account[];
  activeAccountIndex?: number;
  cookies?: string | null;
  me?: ZhihuMeInfo | null;
}

function normalizePersistedAuthState(value: unknown): PersistedAuthState {
  return value && typeof value === 'object'
    ? (value as PersistedAuthState)
    : {};
}

function migratedAuthState(
  original: unknown,
  migrated: PersistedAuthState,
): AuthState {
  if (original && typeof original === 'object') {
    const readingSession = restoredSessionVersions.get(original);
    if (readingSession !== undefined)
      restoredSessionVersions.set(migrated, readingSession);
  }
  return migrated as AuthState;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accounts: [],
      activeAccountIndex: -1,
      cookies: null,
      me: null,

      setCookies: (cookies) => {
        assertAuthStateReady();
        if (cookies === get().cookies) return;
        advanceAuthSession();
        // A captured login is not yet associated with its verified profile.
        // Keep saved accounts intact until addAccount resolves the identity.
        set({ cookies, activeAccountIndex: -1, me: null });
      },

      updateActiveAccountCookies: (cookies) => {
        const { accounts, activeAccountIndex } = get();
        if (!cookies && get().cookies) advanceAuthSession();
        if (activeAccountIndex < 0 || activeAccountIndex >= accounts.length) {
          set({ cookies });
          return;
        }
        const nextAccounts = [...accounts];
        nextAccounts[activeAccountIndex] = {
          ...nextAccounts[activeAccountIndex],
          cookies,
          last_updated: Date.now(),
        };
        set({ accounts: nextAccounts, cookies });
      },

      setMe: (me) => {
        const { accounts, activeAccountIndex } = get();
        if (activeAccountIndex >= 0) {
          const newAccounts = [...accounts];
          newAccounts[activeAccountIndex] = {
            ...newAccounts[activeAccountIndex],
            me,
          };
          set({ accounts: newAccounts, me });
        } else {
          set({ me });
        }
      },

      addAccount: (cookies, me) => {
        assertAuthStateReady();
        const current = get();
        // setCookies already selected this session. The profile tab may finish
        // identifying it before the login screen's own request or native sync.
        if (
          cookies !== current.cookies ||
          current.activeAccountIndex !== -1 ||
          current.me !== null
        ) {
          advanceAuthSession();
        }
        const { accounts } = current;
        // 优先使用不可变的 id，后退到 url_token 或 name
        const id = me?.id || me?.url_token || me?.name;
        const existingIndex = accounts.findIndex(
          (a) => (a.me?.id || a.me?.url_token || a.me?.name) === id,
        );

        const last_updated = Date.now();

        if (existingIndex >= 0) {
          const newAccounts = [...accounts];
          newAccounts[existingIndex] = { cookies, me, last_updated };
          set({
            accounts: newAccounts,
            activeAccountIndex: existingIndex,
            cookies,
            me,
          });
        } else {
          const newAccounts = [...accounts, { cookies, me, last_updated }];
          set({
            accounts: newAccounts,
            activeAccountIndex: newAccounts.length - 1,
            cookies,
            me,
          });
        }
      },

      switchAccount: (index, verifiedSession) => {
        assertAuthStateReady();
        if (index === -1) {
          advanceAuthSession();
          set({
            activeAccountIndex: -1,
            cookies: null,
            me: null,
          });
          return;
        }
        const { accounts } = get();
        if (index >= 0 && index < accounts.length) {
          advanceAuthSession();
          const account = accounts[index];
          const nextAccount = verifiedSession
            ? {
                ...account,
                cookies: verifiedSession.cookies,
                me: verifiedSession.me,
                last_updated: Date.now(),
              }
            : account;
          const nextAccounts = verifiedSession
            ? accounts.map((item, accountIndex) =>
                accountIndex === index ? nextAccount : item,
              )
            : accounts;
          set({
            accounts: nextAccounts,
            activeAccountIndex: index,
            cookies: nextAccount.cookies,
            me: nextAccount.me,
          });
        }
      },

      removeAccount: (index) => {
        assertAuthStateReady();
        const { accounts, activeAccountIndex } = get();
        if (index >= 0 && index < accounts.length) {
          if (activeAccountIndex === index) advanceAuthSession();
          removeAccountLocalData(accounts[index]);
          const newAccounts = accounts.filter((_, i) => i !== index);
          let newIndex = activeAccountIndex;
          if (activeAccountIndex === index) {
            newIndex = newAccounts.length > 0 ? 0 : -1;
          } else if (activeAccountIndex > index) {
            newIndex -= 1;
          }

          if (activeAccountIndex !== index) {
            // Removing a saved account does not replace the current session,
            // which may be a captured login awaiting profile verification.
            set({ accounts: newAccounts, activeAccountIndex: newIndex });
            return;
          }

          const activeAccount = newIndex >= 0 ? newAccounts[newIndex] : null;
          set({
            accounts: newAccounts,
            activeAccountIndex: newIndex,
            cookies: activeAccount?.cookies || null,
            me: activeAccount?.me || null,
          });
        }
      },

      logout: () => {
        assertAuthStateReady();
        advanceAuthSession();
        const { accounts, activeAccountIndex } = get();
        if (activeAccountIndex >= 0) {
          removeAccountLocalData(accounts[activeAccountIndex]);
          const newAccounts = accounts.filter(
            (_, i) => i !== activeAccountIndex,
          );
          const newIndex = newAccounts.length > 0 ? 0 : -1;
          const activeAccount = newIndex >= 0 ? newAccounts[newIndex] : null;
          set({
            accounts: newAccounts,
            activeAccountIndex: newIndex,
            cookies: activeAccount?.cookies || null,
            me: activeAccount?.me || null,
          });
        } else {
          // A captured login can exist before its profile is verified. Logging
          // out that temporary session must preserve previously saved accounts.
          const activeAccount = accounts[0] ?? null;
          set({
            accounts,
            activeAccountIndex: activeAccount ? 0 : -1,
            cookies: activeAccount?.cookies || null,
            me: activeAccount?.me || null,
          });
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: sessionStorage,
      version: 2, // 升级版本以支持 last_updated 结构（虽然是可选的）
      merge: (persistedState, currentState) => {
        if (persistedState && typeof persistedState === 'object') {
          const readingSession = restoredSessionVersions.get(persistedState);
          if (
            readingSession !== undefined &&
            readingSession !== getAuthSessionVersion()
          )
            throw new Error('会话已变化，未应用旧账号快照');
        }
        const nextState = {
          ...currentState,
          ...normalizePersistedAuthState(persistedState),
        };
        // Zustand publishes the merged state before its async hydration callback.
        // Advance now so subscribers cannot start requests with restored cookies
        // and an old session version, then discard those responses at startup.
        if (nextState.cookies !== currentState.cookies) advanceAuthSession();
        return nextState;
      },
      onRehydrateStorage: () => (state) => {
        if (state) authHydratedOnce = true;
      },
      migrate: (persistedState: unknown, version: number) => {
        const state = normalizePersistedAuthState(persistedState);
        if (version === 0) {
          if (state.cookies && state.me) {
            return migratedAuthState(persistedState, {
              ...state,
              accounts: [{ cookies: state.cookies, me: state.me }],
              activeAccountIndex: 0,
            });
          }
          return migratedAuthState(persistedState, {
            ...state,
            accounts: [],
            activeAccountIndex: -1,
          });
        }
        if (version === 1) {
          // v1 -> v2: 主要是增加了 last_updated，现有数据继续使用即可
          return migratedAuthState(persistedState, state);
        }
        return migratedAuthState(persistedState, state);
      },
    },
  ),
);
