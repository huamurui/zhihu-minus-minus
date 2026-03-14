import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const secureStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) =>
    SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};

interface SearchState {
  history: string[];
  addHistory: (query: string) => void;
  removeHistory: (query: string) => void;
  clearHistory: () => void;
}

export const useSearchStore = create<SearchState>()(
  persist(
    (set) => ({
      history: [],
      addHistory: (query) => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) return;
        set((state) => {
          // 将新搜索词置顶，并去重
          const newHistory = [
            trimmedQuery,
            ...state.history.filter((h) => h !== trimmedQuery),
          ].slice(0, 20);
          return { history: newHistory };
        });
      },
      removeHistory: (query) => {
        set((state) => ({
          history: state.history.filter((h) => h !== query),
        }));
      },
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'search-history-storage',
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);
