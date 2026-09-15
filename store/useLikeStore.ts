import { create } from 'zustand';

interface LikeState {
  likedStatusMap: Record<string, boolean>; // id -> isLiked
  setLikedStatus: (id: string | number, status: boolean) => void;
}

export const useLikeStore = create<LikeState>((set) => ({
  likedStatusMap: {},
  setLikedStatus: (id, status) =>
    set((state) => ({
      likedStatusMap: {
        ...state.likedStatusMap,
        [id.toString()]: status,
      },
    })),
}));
