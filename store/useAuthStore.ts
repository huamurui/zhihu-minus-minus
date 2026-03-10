import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// 适配器：让 Zustand 能用上 Expo 的安全存储
const secureStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) => SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};

interface AuthState {
  cookies: string | null;
  me: any | null; // 存储个人详细信息
  setCookies: (cookies: string) => void;
  setMe: (me: any) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      cookies: null,
      me: null,
      setCookies: (cookies) => set({ cookies }),
      setMe: (me) => set({ me }),
      logout: () => {
        set({ cookies: null, me: null });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => secureStorage),
    }
  )
);