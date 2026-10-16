import { create } from 'zustand';

interface DoubleTapSetupState {
  visible: boolean;
  show: () => void;
  hide: () => void;
}

/** Drives the one-time double-tap action picker from the gesture layer. */
export const useDoubleTapSetupStore = create<DoubleTapSetupState>((set) => ({
  visible: false,
  show: () => set({ visible: true }),
  hide: () => set({ visible: false }),
}));
