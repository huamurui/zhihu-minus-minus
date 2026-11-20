import assert from 'node:assert/strict';
import { act, renderHook } from '@testing-library/react-native';
import type { LayoutChangeEvent, MeasureOnSuccessCallback } from 'react-native';
import { useReadingContentMeasurement } from '../src/hooks/useReadingContentMeasurement';
import { useReadingProgress } from '../src/hooks/useReadingProgress';
import { useProgressStore } from '../src/store/useProgressStore';
import {
  calculateReadingProgress,
  resolveReadingProgressOffset,
} from '../src/utils/readingProgress';

// Keep the retained implementation covered while production pauses this feature.
jest.mock('../src/constants/readingProgress', () => ({
  ENABLE_READING_PROGRESS: true,
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  readAsStringAsync: jest.fn(async () => null),
  writeAsStringAsync: jest.fn(async () => undefined),
}));

test('does not retain a position near the start', () => {
  assert.deepEqual(calculateReadingProgress(100, 2000, 500), {
    status: 'at-start',
  });
});

describe('source-paired actual Native reading measurements', () => {
  const contentKey = 'answer:actual-layout-regression';
  const savedEntry = {
    offset: 1200,
    fraction: 0.4,
    scrollableDistance: 3000,
    updatedAt: 123,
  };
  const viewport = {
    nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 800 } },
  } as LayoutChangeEvent;
  const sourceA = { content: '<p>Feed 正文</p>' };
  const sourceB = { content: '<p data-pid="new">详情正文</p>' };

  interface HostProps {
    source: object;
    ready: boolean;
    enabled: boolean;
  }

  async function renderHost(initialProps: HostProps) {
    const scrollTo = jest.fn();
    const onContentMeasured = jest.fn();
    const scrollRef = { current: { scrollTo } };
    const measurements: MeasureOnSuccessCallback[] = [];
    const contentRef = {
      current: {
        measure: jest.fn((callback: MeasureOnSuccessCallback) => {
          measurements.push(callback);
        }),
      },
    };
    const host = await renderHook(
      ({ source, ready, enabled }: HostProps) => {
        const progress = useReadingProgress({
          contentKey,
          layoutSource: source,
          ready,
          enabled,
          scrollRef,
          onContentMeasured,
        });
        const onHostContentSizeChange = useReadingContentMeasurement({
          enabled,
          ready,
          contentRef,
          beginMeasurement: progress.beginContentMeasurement,
          onContentSizeChange: progress.onContentSizeChange,
        });
        return { ...progress, onHostContentSizeChange };
      },
      { initialProps },
    );
    await act(() => host.result.current.onLayout(viewport));
    const complete = async (index: number, height = 3800) => {
      await act(() => measurements[index](0, 0, 320, height, 0, 0));
    };
    return {
      ...host,
      scrollTo,
      onContentMeasured,
      contentRef,
      measurements,
      complete,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(useProgressStore.persist, 'hasHydrated').mockReturnValue(true);
    useProgressStore.setState({ progress: { [contentKey]: savedEntry } });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('never certifies the first placeholder and proactively measures after the body-ready commit', async () => {
    const host = await renderHost({
      source: sourceA,
      ready: false,
      enabled: true,
    });
    await act(() => {
      host.result.current.onHostContentSizeChange(320, 480);
      jest.advanceTimersByTime(1000);
    });
    expect(host.measurements).toHaveLength(0);
    expect(host.scrollTo).not.toHaveBeenCalled();
    expect(useProgressStore.getState().progress[contentKey]).toEqual(
      savedEntry,
    );
    await host.rerender({ source: sourceA, ready: true, enabled: true });
    expect(host.measurements).toHaveLength(1);
    await act(() => jest.advanceTimersByTime(200));
    expect(host.scrollTo).not.toHaveBeenCalled();
    await host.complete(0);
    await act(() => jest.advanceTimersByTime(180));
    expect(host.scrollTo).toHaveBeenLastCalledWith({
      y: 1200,
      animated: false,
    });
  });

  it('restores after a same-height replacement that cancels the first restore timer and emits no new size event', async () => {
    const host = await renderHost({
      source: sourceA,
      ready: true,
      enabled: true,
    });
    await host.complete(0);
    await act(() => jest.advanceTimersByTime(100));
    await host.rerender({ source: sourceB, ready: false, enabled: true });
    await act(() => jest.advanceTimersByTime(200));
    expect(host.scrollTo).not.toHaveBeenCalled();
    // The old body remains mounted at 3800px; revealing B has the same height.
    await host.rerender({ source: sourceB, ready: true, enabled: true });
    expect(host.measurements).toHaveLength(2);
    await host.complete(1, 3800);
    await act(() => jest.advanceTimersByTime(180));
    expect(host.scrollTo).toHaveBeenCalledTimes(1);
    expect(host.scrollTo).toHaveBeenLastCalledWith({
      y: 1200,
      animated: false,
    });
  });

  it('recovers when the real content-size event arrived before ready without requiring it to fire again', async () => {
    const host = await renderHost({
      source: sourceA,
      ready: false,
      enabled: true,
    });
    await act(() => host.result.current.onHostContentSizeChange(320, 3800));
    expect(host.measurements).toHaveLength(0);
    await host.rerender({ source: sourceA, ready: true, enabled: true });
    await host.complete(0);
    await act(() => jest.advanceTimersByTime(180));
    expect(host.scrollTo).toHaveBeenLastCalledWith({
      y: 1200,
      animated: false,
    });
  });

  it.each(['before', 'after'] as const)(
    'pairs a verified actual measurement whose callback completes %s ready commits',
    async (timing) => {
      const scrollTo = jest.fn();
      const scrollRef = { current: { scrollTo } };
      const progress = await renderHook(
        ({ ready }: { ready: boolean }) =>
          useReadingProgress({
            contentKey,
            layoutSource: sourceA,
            ready,
            scrollRef,
          }),
        { initialProps: { ready: false } },
      );
      await act(() => progress.result.current.onLayout(viewport));
      const complete = progress.result.current.beginContentMeasurement();
      expect(complete).not.toBeNull();
      if (timing === 'before') await act(() => complete?.(320, 3800));
      await progress.rerender({ ready: true });
      if (timing === 'after') await act(() => complete?.(320, 3800));
      await act(() => jest.advanceTimersByTime(180));
      expect(scrollTo).toHaveBeenLastCalledWith({ y: 1200, animated: false });
    },
  );

  it('rejects a late callback from a replaced content source', async () => {
    const host = await renderHost({
      source: sourceA,
      ready: true,
      enabled: true,
    });
    await host.rerender({ source: sourceB, ready: false, enabled: true });
    await host.rerender({ source: sourceB, ready: true, enabled: true });
    await host.complete(0, 9999);
    await act(() => jest.advanceTimersByTime(200));
    expect(host.scrollTo).not.toHaveBeenCalled();
    await host.complete(1);
    await act(() => jest.advanceTimersByTime(180));
    expect(host.scrollTo).toHaveBeenLastCalledWith({
      y: 1200,
      animated: false,
    });
  });

  it('rejects a measurement requested before blur even after the same source regains focus', async () => {
    const host = await renderHost({
      source: sourceA,
      ready: true,
      enabled: true,
    });
    await host.rerender({ source: sourceA, ready: true, enabled: false });
    await act(() => host.result.current.onHostContentSizeChange(320, 9999));
    await host.complete(0, 9999);
    expect(host.onContentMeasured).not.toHaveBeenCalled();
    await host.rerender({ source: sourceA, ready: true, enabled: true });
    await host.complete(0, 9999);
    await act(() => jest.advanceTimersByTime(200));
    expect(host.scrollTo).not.toHaveBeenCalled();
    await host.complete(1);
    await act(() => jest.advanceTimersByTime(180));
    expect(host.scrollTo).toHaveBeenLastCalledWith({
      y: 1200,
      animated: false,
    });
  });

  it('reports accepted content sizes and actual measurements while rejecting a replaced source', async () => {
    const host = await renderHost({
      source: sourceA,
      ready: true,
      enabled: true,
    });
    const outgoingSizeHandler = host.result.current.onHostContentSizeChange;
    await host.rerender({ source: sourceB, ready: false, enabled: true });
    await host.complete(0, 9999);
    await act(() => outgoingSizeHandler(320, 9999));
    expect(host.onContentMeasured).not.toHaveBeenCalled();

    await host.rerender({ source: sourceB, ready: true, enabled: true });
    await host.complete(1, 4100);
    expect(host.onContentMeasured).toHaveBeenLastCalledWith(320, 4100);
    await act(() => host.result.current.onHostContentSizeChange(320, 4200));
    expect(host.onContentMeasured).toHaveBeenLastCalledWith(320, 4200);
    expect(host.onContentMeasured).toHaveBeenCalledTimes(2);
  });

  it('rejects an older pending measurement after a new same-source size event', async () => {
    const host = await renderHost({
      source: sourceA,
      ready: true,
      enabled: true,
    });
    await act(() => host.result.current.onHostContentSizeChange(320, 4200));
    expect(host.measurements).toHaveLength(2);
    await host.complete(0, 1000);
    await act(() => jest.advanceTimersByTime(200));
    expect(host.scrollTo).not.toHaveBeenCalled();
    await host.complete(1, 4200);
    await act(() => jest.advanceTimersByTime(180));
    expect(host.scrollTo).toHaveBeenLastCalledWith({
      y: 1360,
      animated: false,
    });
  });

  it('keeps newly reported size geometry for saving while an older measure callback arrives late', async () => {
    const host = await renderHost({
      source: sourceA,
      ready: true,
      enabled: true,
    });
    await host.complete(0);
    await act(() => jest.advanceTimersByTime(180));
    await act(() => host.result.current.onHostContentSizeChange(320, 4200));
    await act(() => host.result.current.onHostContentSizeChange(320, 4800));
    await host.complete(1, 3800);
    await act(() => {
      host.result.current.onScroll(1600);
      jest.advanceTimersByTime(1200);
    });
    expect(useProgressStore.getState().progress[contentKey]).toEqual(
      expect.objectContaining({ offset: 1600, scrollableDistance: 4000 }),
    );
    expect(host.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('keeps the saved position when scrolling to the end of a partially laid out replacement', async () => {
    const host = await renderHost({
      source: sourceA,
      ready: true,
      enabled: true,
    });
    await host.complete(0);
    await act(() => jest.advanceTimersByTime(180));
    await host.rerender({ source: sourceB, ready: false, enabled: true });
    await act(() => {
      host.result.current.onHostContentSizeChange(320, 1400);
      host.result.current.onScroll(600);
      host.result.current.commitProgress();
      jest.advanceTimersByTime(1200);
    });
    expect(useProgressStore.getState().progress[contentKey]).toEqual(
      savedEntry,
    );

    await host.rerender({ source: sourceB, ready: true, enabled: true });
    await host.complete(1, 4200);
    await act(() => host.result.current.commitProgress());
    expect(useProgressStore.getState().progress[contentKey]).toEqual(
      expect.objectContaining({ offset: 600, scrollableDistance: 3400 }),
    );
  });

  it('never restores a second time after an already-restored body is replaced', async () => {
    const host = await renderHost({
      source: sourceA,
      ready: true,
      enabled: true,
    });
    await host.complete(0);
    await act(() => jest.advanceTimersByTime(180));
    await host.rerender({ source: sourceB, ready: false, enabled: true });
    await host.rerender({ source: sourceB, ready: true, enabled: true });
    await host.complete(1, 4200);
    await act(() => jest.advanceTimersByTime(500));
    expect(host.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('rejects a callback after unmount', async () => {
    const host = await renderHost({
      source: sourceA,
      ready: true,
      enabled: true,
    });
    await host.unmount();
    await host.complete(0, 9999);
    await act(() => jest.advanceTimersByTime(200));
    expect(host.scrollTo).not.toHaveBeenCalled();
  });

  it('rejects a measurement from an earlier content key even when its layout token is reused', async () => {
    const nextKey = 'answer:another-actual-layout';
    useProgressStore.setState({
      progress: { [contentKey]: savedEntry, [nextKey]: savedEntry },
    });
    const scrollTo = jest.fn();
    const scrollRef = { current: { scrollTo } };
    const progress = await renderHook(
      ({ key }: { key: string }) =>
        useReadingProgress({
          contentKey: key,
          layoutSource: sourceA,
          ready: true,
          scrollRef,
        }),
      { initialProps: { key: contentKey } },
    );
    await act(() => progress.result.current.onLayout(viewport));
    const oldComplete = progress.result.current.beginContentMeasurement();
    await progress.rerender({ key: nextKey });
    await act(() => oldComplete?.(320, 9999));
    await act(() => jest.advanceTimersByTime(200));
    expect(scrollTo).not.toHaveBeenCalled();
    const currentComplete = progress.result.current.beginContentMeasurement();
    await act(() => {
      currentComplete?.(320, 3800);
      jest.advanceTimersByTime(180);
    });
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 1200, animated: false });
  });

  it('keeps the ordinary ready/content-size path when native measurement is disabled', async () => {
    const scrollTo = jest.fn();
    const scrollRef = { current: { scrollTo } };
    const measure = jest.fn();
    const contentRef = { current: { measure } };
    const progress = await renderHook(() => {
      const reading = useReadingProgress({ contentKey, scrollRef });
      const onHostContentSizeChange = useReadingContentMeasurement({
        enabled: false,
        ready: true,
        contentRef,
        beginMeasurement: reading.beginContentMeasurement,
        onContentSizeChange: reading.onContentSizeChange,
      });
      return { ...reading, onHostContentSizeChange };
    });
    await act(() => {
      progress.result.current.onLayout(viewport);
      progress.result.current.onHostContentSizeChange(320, 3800);
      jest.advanceTimersByTime(180);
    });
    expect(measure).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 1200, animated: false });
  });

  it('reports restored and top offsets without requiring a native scroll event', async () => {
    const scrollTo = jest.fn();
    const onProgrammaticScroll = jest.fn();
    const scrollRef = { current: { scrollTo } };
    const host = await renderHook(() =>
      useReadingProgress({
        contentKey,
        scrollRef,
        onProgrammaticScroll,
      }),
    );
    await act(() => {
      host.result.current.onLayout(viewport);
      host.result.current.onContentSizeChange(320, 3800);
      jest.advanceTimersByTime(180);
    });
    expect(onProgrammaticScroll).toHaveBeenLastCalledWith(1200);
    expect(onProgrammaticScroll.mock.invocationCallOrder[0]).toBeGreaterThan(
      scrollTo.mock.invocationCallOrder[0],
    );

    await act(() => host.result.current.scrollToTop());
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: true });
    expect(onProgrammaticScroll).toHaveBeenLastCalledWith(0);
    expect(onProgrammaticScroll.mock.invocationCallOrder[1]).toBeGreaterThan(
      scrollTo.mock.invocationCallOrder[1],
    );
    expect(host.result.current.restoredOffset).toBeNull();
    expect(useProgressStore.getState().progress[contentKey]).toBeUndefined();
  });

  it('records fallback reflow while disabled and restores using that size without a new focus size event', async () => {
    const scrollTo = jest.fn();
    const onContentMeasured = jest.fn();
    const onProgrammaticScroll = jest.fn();
    const scrollRef = { current: { scrollTo } };
    const host = await renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useReadingProgress({
          contentKey,
          enabled,
          scrollRef,
          onContentMeasured,
          onProgrammaticScroll,
        }),
      { initialProps: { enabled: false } },
    );
    await act(() => {
      host.result.current.onLayout(viewport);
      host.result.current.onContentSizeChange(320, 3800);
      host.result.current.onContentSizeChange(320, 4800);
      jest.advanceTimersByTime(200);
    });
    expect(onContentMeasured).toHaveBeenLastCalledWith(320, 4800);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(onProgrammaticScroll).not.toHaveBeenCalled();
    expect(useProgressStore.getState().progress[contentKey]).toEqual(
      savedEntry,
    );

    await host.rerender({ enabled: true });
    await act(() => jest.advanceTimersByTime(180));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 1600, animated: false });
    expect(onProgrammaticScroll).toHaveBeenLastCalledWith(1600);
  });

  it('keeps fallback reflow geometry after blur without restoring a mounted page twice', async () => {
    const scrollTo = jest.fn();
    const onContentMeasured = jest.fn();
    const scrollRef = { current: { scrollTo } };
    const host = await renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useReadingProgress({
          contentKey,
          enabled,
          scrollRef,
          onContentMeasured,
        }),
      { initialProps: { enabled: true } },
    );
    await act(() => {
      host.result.current.onLayout(viewport);
      host.result.current.onContentSizeChange(320, 3800);
      jest.advanceTimersByTime(180);
    });
    await host.rerender({ enabled: false });
    await act(() => host.result.current.onContentSizeChange(320, 4800));
    expect(onContentMeasured).toHaveBeenLastCalledWith(320, 4800);

    await host.rerender({ enabled: true });
    await act(() => {
      host.result.current.onScroll(1600);
      jest.advanceTimersByTime(1200);
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(useProgressStore.getState().progress[contentKey]).toEqual(
      expect.objectContaining({ offset: 1600, scrollableDistance: 4000 }),
    );
  });

  it('uses the latest offset callback without restarting a pending restore', async () => {
    const scrollTo = jest.fn();
    const scrollRef = { current: { scrollTo } };
    const originalCallback = jest.fn();
    const latestCallback = jest.fn();
    const host = await renderHook(
      ({ callback }: { callback: (offset: number) => void }) =>
        useReadingProgress({
          contentKey,
          scrollRef,
          onProgrammaticScroll: callback,
        }),
      { initialProps: { callback: originalCallback } },
    );
    await act(() => {
      host.result.current.onLayout(viewport);
      host.result.current.onContentSizeChange(320, 3800);
      jest.advanceTimersByTime(100);
    });
    await host.rerender({ callback: latestCallback });
    await act(() => jest.advanceTimersByTime(80));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(originalCallback).not.toHaveBeenCalled();
    expect(latestCallback).toHaveBeenCalledWith(1200);
  });

  it('does not report a restore or top action from an old identity or disabled page', async () => {
    const nextKey = 'answer:disabled-offset-report';
    const nextEntry = { ...savedEntry, offset: 1800, fraction: 0.6 };
    useProgressStore.setState({
      progress: { [contentKey]: savedEntry, [nextKey]: nextEntry },
    });
    const scrollTo = jest.fn();
    const scrollRef = { current: { scrollTo } };
    const onProgrammaticScroll = jest.fn();
    const host = await renderHook(
      ({ key, enabled }: { key: string; enabled: boolean }) =>
        useReadingProgress({
          contentKey: key,
          enabled,
          scrollRef,
          onProgrammaticScroll,
        }),
      { initialProps: { key: contentKey, enabled: true } },
    );
    await act(() => {
      host.result.current.onLayout(viewport);
      host.result.current.onContentSizeChange(320, 3800);
      jest.advanceTimersByTime(100);
    });
    const outgoingTop = host.result.current.scrollToTop;
    await host.rerender({ key: nextKey, enabled: true });
    await act(() => {
      outgoingTop();
      jest.advanceTimersByTime(200);
    });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(onProgrammaticScroll).not.toHaveBeenCalled();
    expect(useProgressStore.getState().progress[contentKey]).toEqual(
      savedEntry,
    );

    await act(() => {
      host.result.current.onContentSizeChange(320, 3800);
      jest.advanceTimersByTime(100);
    });
    await host.rerender({ key: nextKey, enabled: false });
    await act(() => {
      host.result.current.scrollToTop();
      jest.advanceTimersByTime(200);
    });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(onProgrammaticScroll).not.toHaveBeenCalled();
    expect(useProgressStore.getState().progress[nextKey]).toEqual(nextEntry);
  });

  it('saves the outgoing content before restoring another identity in the same hook', async () => {
    const nextKey = 'answer:next-identity';
    const nextEntry = { ...savedEntry, offset: 1800, fraction: 0.6 };
    useProgressStore.setState({
      progress: { [contentKey]: savedEntry, [nextKey]: nextEntry },
    });
    const scrollTo = jest.fn();
    const host = await renderHook(
      ({ key }: { key: string }) =>
        useReadingProgress({
          contentKey: key,
          scrollRef: { current: { scrollTo } },
        }),
      { initialProps: { key: contentKey } },
    );
    await act(() => {
      host.result.current.onLayout(viewport);
      host.result.current.onContentSizeChange(320, 3800);
      jest.advanceTimersByTime(180);
    });
    await act(() => host.result.current.onScroll(1500));
    await host.rerender({ key: nextKey });
    expect(useProgressStore.getState().progress[contentKey]?.offset).toBe(1500);
    expect(useProgressStore.getState().progress[nextKey]).toEqual(nextEntry);
    await act(() => {
      host.result.current.onContentSizeChange(320, 3800);
      jest.advanceTimersByTime(180);
    });
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 1800, animated: false });
  });

  it('rejects an old source size handler without changing the current body geometry for saving', async () => {
    const host = await renderHost({
      source: sourceA,
      ready: true,
      enabled: true,
    });
    await host.complete(0);
    await act(() => jest.advanceTimersByTime(180));
    const oldSizeHandler = host.result.current.onHostContentSizeChange;
    await host.rerender({ source: sourceB, ready: false, enabled: true });
    await host.rerender({ source: sourceB, ready: true, enabled: true });
    await host.complete(1, 4200);
    await act(() => {
      oldSizeHandler(320, 1000);
      host.result.current.onScroll(1600);
      jest.advanceTimersByTime(1200);
    });
    expect(useProgressStore.getState().progress[contentKey]).toEqual(
      expect.objectContaining({ offset: 1600, scrollableDistance: 3400 }),
    );
    expect(host.scrollTo).toHaveBeenCalledTimes(1);
  });
});

test('retains an unfinished reading position', () => {
  assert.deepEqual(calculateReadingProgress(600, 2000, 500, 123), {
    status: 'active',
    entry: {
      offset: 600,
      fraction: 0.4,
      scrollableDistance: 1500,
      updatedAt: 123,
    },
  });
});

test('treats a position near the end as completed', () => {
  assert.deepEqual(calculateReadingProgress(1450, 2000, 500), {
    status: 'complete',
  });
});

test('uses the exact offset when layout is stable', () => {
  const offset = resolveReadingProgressOffset(
    {
      offset: 600,
      fraction: 0.4,
      scrollableDistance: 1500,
      updatedAt: 123,
    },
    2020,
    500,
  );
  assert.equal(offset, 600);
});

test('uses the relative position after a material layout change', () => {
  const offset = resolveReadingProgressOffset(
    {
      offset: 600,
      fraction: 0.4,
      scrollableDistance: 1500,
      updatedAt: 123,
    },
    2500,
    500,
  );
  assert.equal(offset, 800);
});

test('supports legacy entries that only contain an offset', () => {
  const offset = resolveReadingProgressOffset(
    { offset: 600, updatedAt: 123 },
    2500,
    500,
  );
  assert.equal(offset, 600);
});

describe('reading position while Native V2 stages its first layout', () => {
  const contentKey = 'answer:layout-regression';
  const savedEntry = {
    offset: 1200,
    fraction: 0.4,
    scrollableDistance: 3000,
    updatedAt: 123,
  };
  const viewport = {
    nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 800 } },
  } as LayoutChangeEvent;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(useProgressStore.persist, 'hasHydrated').mockReturnValue(true);
    useProgressStore.setState({ progress: { [contentKey]: savedEntry } });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('preserves a saved position through a slow short placeholder and restores from the revealed body', async () => {
    const scrollTo = jest.fn();
    const scrollRef = { current: { scrollTo } };
    const { result, rerender } = await renderHook(
      ({ ready }: { ready: boolean }) =>
        useReadingProgress({ contentKey, ready, scrollRef }),
      { initialProps: { ready: false } },
    );
    await act(() => {
      result.current.onLayout(viewport);
      // Cached answer data is available, but its 200px native placeholder plus
      // header/footer is shorter than the viewport for more than 180ms.
      result.current.onContentSizeChange(320, 480);
      jest.advanceTimersByTime(1000);
    });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(result.current.restoredOffset).toBeNull();
    expect(useProgressStore.getState().progress[contentKey]).toEqual(
      savedEntry,
    );

    await rerender({ ready: true });
    await act(() => jest.advanceTimersByTime(200));
    // Readiness alone cannot consume the previously measured placeholder.
    expect(scrollTo).not.toHaveBeenCalled();
    await act(() => {
      result.current.onContentSizeChange(320, 3800);
      jest.advanceTimersByTime(180);
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 1200, animated: false });
    expect(result.current.restoredOffset).toBe(1200);
  });

  it('cancels an old restore timer and requires a new measurement after readiness is revoked', async () => {
    const scrollTo = jest.fn();
    const scrollRef = { current: { scrollTo } };
    const { result, rerender } = await renderHook(
      ({ ready }: { ready: boolean }) =>
        useReadingProgress({ contentKey, ready, scrollRef }),
      { initialProps: { ready: true } },
    );
    await act(() => {
      result.current.onLayout(viewport);
      result.current.onContentSizeChange(320, 3800);
      jest.advanceTimersByTime(100);
    });
    await rerender({ ready: false });
    await act(() => {
      result.current.onContentSizeChange(320, 480);
      jest.advanceTimersByTime(200);
    });
    expect(scrollTo).not.toHaveBeenCalled();
    await rerender({ ready: true });
    await act(() => jest.advanceTimersByTime(200));
    expect(scrollTo).not.toHaveBeenCalled();
    await act(() => {
      result.current.onContentSizeChange(320, 3800);
      jest.advanceTimersByTime(180);
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 1200, animated: false });
  });

  it('never scrolls on the first load when no saved position exists', async () => {
    useProgressStore.setState({ progress: {} });
    const scrollTo = jest.fn();
    const scrollRef = { current: { scrollTo } };
    const { result, rerender } = await renderHook(
      ({ ready }: { ready: boolean }) =>
        useReadingProgress({ contentKey, ready, scrollRef }),
      { initialProps: { ready: false } },
    );
    await act(() => {
      result.current.onLayout(viewport);
      result.current.onContentSizeChange(320, 480);
      jest.advanceTimersByTime(1000);
    });
    await rerender({ ready: true });
    await act(() => {
      result.current.onContentSizeChange(320, 3800);
      jest.advanceTimersByTime(200);
    });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(result.current.restoredOffset).toBeNull();
  });
});
