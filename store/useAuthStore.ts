import * as FileSystem from 'expo-file-system/legacy';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ZhihuMeInfo } from '@/api/zhihu/me';
import { clearLocalAccountData } from '@/storage/localAccountData';
import { resolveLocalAccountKey } from '@/utils/localAccount';

// 适配器：使用 Expo FileSystem 代替 SecureStore 存储大数据
// Android SecureStore 有 2048 字节的硬限制，存储多个账号信息时极易导致崩溃
const AUTH_STORAGE_PATH = `${FileSystem.documentDirectory}auth-storage.json`;
let authStorageExistedOnFirstRead: boolean | undefined;

/** Only a missing auth file is eligible for the one-time legacy cookie import. */
export function shouldImportLegacySession() {
  return authStorageExistedOnFirstRead === false;
}

const fileStorage = {
  getItem: async (_name: string) => {
    try {
      const info = await FileSystem.getInfoAsync(AUTH_STORAGE_PATH);
      authStorageExistedOnFirstRead ??= info.exists;
      if (info.exists) {
        return await FileSystem.readAsStringAsync(AUTH_STORAGE_PATH);
      }
      return null;
    } catch (e) {
      // A read failure must not make an old native cookie authoritative.
      authStorageExistedOnFirstRead ??= true;
      console.error('读取存储失败:', e);
      return null;
    }
  },
  setItem: async (_name: string, value: string) => {
    try {
      await FileSystem.writeAsStringAsync(AUTH_STORAGE_PATH, value);
      authStorageExistedOnFirstRead = true;
    } catch (e) {
      console.error('写入存储失败:', e);
    }
  },
  removeItem: async (_name: string) => {
    try {
      await FileSystem.deleteAsync(AUTH_STORAGE_PATH, { idempotent: true });
    } catch (e) {
      console.error('删除存储失败:', e);
    }
  },
};

export interface Account {
  cookies: string;
  me: ZhihuMeInfo;
  last_updated?: number; // 添加更新时间戳
}

// 账号被移除时同步清理其本地数据（如浏览曝光记录）
// 清理失败时数据仍会随保留期自动过期，因此只告警不阻塞
const removeAccountLocalData = (account: Account | undefined) => {
  const accountKey = resolveLocalAccountKey(account?.me, true);
  if (!accountKey) return;
  void clearLocalAccountData(accountKey).catch((error) => {
    console.warn('清除已移除账号的本地数据失败', error);
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

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accounts: [],
      activeAccountIndex: -1,
      cookies: null,
      me: null,

      setCookies: (cookies) => {
        set({ cookies });
      },

      updateActiveAccountCookies: (cookies) => {
        const { accounts, activeAccountIndex } = get();
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
        const { accounts } = get();
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
        if (index === -1) {
          set({
            activeAccountIndex: -1,
            cookies: null,
            me: null,
          });
          return;
        }
        const { accounts } = get();
        if (index >= 0 && index < accounts.length) {
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
        const { accounts, activeAccountIndex } = get();
        if (index >= 0 && index < accounts.length) {
          removeAccountLocalData(accounts[index]);
          const newAccounts = accounts.filter((_, i) => i !== index);
          let newIndex = activeAccountIndex;
          if (activeAccountIndex === index) {
            newIndex = newAccounts.length > 0 ? 0 : -1;
          } else if (activeAccountIndex > index) {
            newIndex -= 1;
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
          set({
            accounts: [],
            activeAccountIndex: -1,
            cookies: null,
            me: null,
          });
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => fileStorage),
      version: 2, // 升级版本以支持 last_updated 结构（虽然是可选的）
      migrate: (persistedState: unknown, version: number) => {
        const state = normalizePersistedAuthState(persistedState);
        if (version === 0) {
          if (state.cookies && state.me) {
            return {
              ...state,
              accounts: [{ cookies: state.cookies, me: state.me }],
              activeAccountIndex: 0,
            };
          }
          return {
            ...state,
            accounts: [],
            activeAccountIndex: -1,
          };
        }
        if (version === 1) {
          // v1 -> v2: 主要是增加了 last_updated，现有数据继续使用即可
          return state as AuthState;
        }
        return state as AuthState;
      },
    },
  ),
);
