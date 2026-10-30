import { act, renderHook } from '@testing-library/react-native';
import {
  MAX_RESTING_FOLLOW_UPS,
  PRELOAD_END_THRESHOLD,
  useListPreload,
  useLoadMoreNearEnd,
} from '../src/hooks/useListPreload';
import { useSettingsStore } from '../src/store/useSettingsStore';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

test('keeps each list threshold when preloading is off', async () => {
  useSettingsStore.setState({ enableListPreload: false });
  const { result } = await renderHook(() => useListPreload(0.3));
  expect(result.current).toEqual({ onEndReachedThreshold: 0.3 });
});

test('requests pages screens ahead and hides the scroll bar when preloading is on', async () => {
  useSettingsStore.setState({ enableListPreload: true });
  const { result } = await renderHook(() => useListPreload(0.5));
  expect(result.current).toEqual({
    onEndReachedThreshold: PRELOAD_END_THRESHOLD,
    showsVerticalScrollIndicator: false,
  });
});

function fakeList(geometry: { offset: number; content: number }) {
  return {
    getAbsoluteLastScrollOffset: () => geometry.offset,
    getWindowSize: () => ({ width: 400, height: 1000 }),
    getChildContainerDimensions: () => ({
      width: 400,
      height: geometry.content,
    }),
    getFirstItemOffset: () => 0,
  };
}

describe('useLoadMoreNearEnd', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function settle(
    geometry: { offset: number; content: number },
    loadMore: jest.Mock,
  ) {
    const listRef = { current: fakeList(geometry) };
    const hook = await renderHook(
      ({ loading }: { loading: boolean }) =>
        useLoadMoreNearEnd({ listRef, threshold: 2, loading, loadMore }),
      { initialProps: { loading: true } },
    );
    const finishLoad = async () => {
      await hook.rerender({ loading: true });
      await hook.rerender({ loading: false });
      await act(async () => jest.runOnlyPendingTimers());
    };
    return finishLoad;
  }

  test('asks again when a load settles inside the end zone', async () => {
    const loadMore = jest.fn();
    const finishLoad = await settle({ offset: 4000, content: 6000 }, loadMore);
    await finishLoad();
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  test('stays quiet when a load leaves the list far from its end', async () => {
    const loadMore = jest.fn();
    const finishLoad = await settle({ offset: 0, content: 6000 }, loadMore);
    await finishLoad();
    expect(loadMore).not.toHaveBeenCalled();
  });

  test('stops after a few follow-ups while the list rests at one offset', async () => {
    const loadMore = jest.fn();
    const geometry = { offset: 5000, content: 6000 };
    const finishLoad = await settle(geometry, loadMore);
    for (let i = 0; i < MAX_RESTING_FOLLOW_UPS + 2; i += 1) await finishLoad();
    expect(loadMore).toHaveBeenCalledTimes(MAX_RESTING_FOLLOW_UPS);

    geometry.offset = 5100;
    await finishLoad();
    expect(loadMore).toHaveBeenCalledTimes(MAX_RESTING_FOLLOW_UPS + 1);
  });
});
