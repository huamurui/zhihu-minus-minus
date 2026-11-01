import { act, renderHook } from '@testing-library/react-native';
import { useEndReachedPagination } from '../src/hooks/useEndReachedPagination';

describe('useEndReachedPagination state machine', () => {
  it('triggers immediate fetch when idle and active', async () => {
    const onFetchNextPage = jest.fn().mockResolvedValue({ status: 'started' });
    const host = await renderHook(() =>
      useEndReachedPagination({
        isActive: true,
        hasNextPage: true,
        isFetchNextPageError: false,
        isBusy: false,
        cursor: 'cursor-1',
        onFetchNextPage,
      }),
    );

    await act(async () => {
      host.result.current.handleEndReached();
    });

    expect(onFetchNextPage).toHaveBeenCalledTimes(1);
    expect(host.result.current.isPendingIntent).toBe(false);
  });

  it('records pending intent when touched while busy refreshing and resumes when idle', async () => {
    const onFetchNextPage = jest.fn().mockResolvedValue({ status: 'started' });
    let isBusy = true;
    const host = await renderHook(() =>
      useEndReachedPagination({
        isActive: true,
        hasNextPage: true,
        isFetchNextPageError: false,
        isBusy,
        cursor: 'cursor-1',
        onFetchNextPage,
      }),
    );

    // 1. Touched bottom while busy
    await act(async () => {
      host.result.current.handleEndReached();
    });
    expect(onFetchNextPage).not.toHaveBeenCalled();
    expect(host.result.current.isPendingIntent).toBe(true);

    // 2. Refresh finished (isBusy becomes false)
    isBusy = false;
    await act(async () => {
      host.rerender({});
    });

    expect(onFetchNextPage).toHaveBeenCalledTimes(1);
    expect(host.result.current.isPendingIntent).toBe(false);
  });

  it('records pending intent when fetch callback reports blocked and resumes once conditions recover', async () => {
    let callCount = 0;
    const onFetchNextPage = jest.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { status: 'blocked', reason: 'busy' };
      }
      return { status: 'started' };
    });

    let isBusy = false;
    const host = await renderHook(() =>
      useEndReachedPagination({
        isActive: true,
        hasNextPage: true,
        isFetchNextPageError: false,
        isBusy,
        cursor: 'cursor-1',
        onFetchNextPage,
      }),
    );

    await act(async () => {
      host.result.current.handleEndReached();
    });

    expect(onFetchNextPage).toHaveBeenCalledTimes(1);
    expect(host.result.current.isPendingIntent).toBe(true);

    // Temporarily marked busy in query
    isBusy = true;
    await act(async () => {
      host.rerender({});
    });
    expect(onFetchNextPage).toHaveBeenCalledTimes(1);

    // Conditions recover
    isBusy = false;
    await act(async () => {
      host.rerender({});
    });
    expect(onFetchNextPage).toHaveBeenCalledTimes(2);
    expect(host.result.current.isPendingIntent).toBe(false);
  });

  it('cancels pending intent and does not duplicate request when app enters background', async () => {
    const onFetchNextPage = jest.fn().mockResolvedValue({ status: 'started' });
    let isActive = true;
    let isBusy = true;
    const host = await renderHook(() =>
      useEndReachedPagination({
        isActive,
        hasNextPage: true,
        isFetchNextPageError: false,
        isBusy,
        cursor: 'cursor-1',
        onFetchNextPage,
      }),
    );

    await act(async () => {
      host.result.current.handleEndReached();
    });
    expect(host.result.current.isPendingIntent).toBe(true);

    // App enters background
    isActive = false;
    await act(async () => {
      host.rerender({});
    });
    expect(host.result.current.isPendingIntent).toBe(false);

    // Becomes active again while still on cursor-1: stale intent was cleared, no automatic repeat!
    isActive = true;
    isBusy = false;
    await act(async () => {
      host.rerender({});
    });
    expect(onFetchNextPage).not.toHaveBeenCalled();
  });

  it('rapid multiple end-reached invocations only request once and cancel expired intent on cursor change', async () => {
    const onFetchNextPage = jest.fn().mockResolvedValue({ status: 'started' });
    let isBusy = false;
    let cursor: string | number = 'cursor-1';
    const host = await renderHook(() =>
      useEndReachedPagination({
        isActive: true,
        hasNextPage: true,
        isFetchNextPageError: false,
        isBusy,
        cursor,
        onFetchNextPage,
      }),
    );

    // Rapid calls
    await act(async () => {
      host.result.current.handleEndReached();
    });
    isBusy = true; // request now in flight
    await act(async () => {
      host.rerender({});
    });

    await act(async () => {
      host.result.current.handleEndReached();
      host.result.current.handleEndReached();
    });
    expect(onFetchNextPage).toHaveBeenCalledTimes(1);

    // Next page arrived -> cursor changes to cursor-2 and isBusy becomes false
    cursor = 'cursor-2';
    isBusy = false;
    await act(async () => {
      host.rerender({});
    });

    // Old intent for cursor-1 was expired, so no duplicate fetch!
    expect(onFetchNextPage).toHaveBeenCalledTimes(1);
    expect(host.result.current.isPendingIntent).toBe(false);
  });

  it('cancels pending intent when user switches tab or triggers refresh', async () => {
    const onFetchNextPage = jest.fn().mockResolvedValue({ status: 'started' });
    let isActive = true;
    const host = await renderHook(() =>
      useEndReachedPagination({
        isActive,
        hasNextPage: true,
        isFetchNextPageError: false,
        isBusy: true,
        cursor: 'cursor-1',
        onFetchNextPage,
      }),
    );

    await act(async () => {
      host.result.current.handleEndReached();
    });
    expect(host.result.current.isPendingIntent).toBe(true);

    // User pulls to refresh -> cancelPendingIntent called
    await act(async () => {
      host.result.current.cancelPendingIntent();
    });
    expect(host.result.current.isPendingIntent).toBe(false);

    // Or tab switches
    await act(async () => {
      host.result.current.handleEndReached();
    });
    expect(host.result.current.isPendingIntent).toBe(true);

    isActive = false;
    await act(async () => {
      host.rerender({});
    });
    expect(host.result.current.isPendingIntent).toBe(false);
  });

  it('does not request more when hasNextPage is false or in error state', async () => {
    const onFetchNextPage = jest.fn().mockResolvedValue({ status: 'started' });
    const host = await renderHook(
      ({
        hasNextPage,
        isFetchNextPageError,
      }: {
        hasNextPage: boolean;
        isFetchNextPageError: boolean;
      }) =>
        useEndReachedPagination({
          isActive: true,
          hasNextPage,
          isFetchNextPageError,
          isBusy: false,
          cursor: 'cursor-1',
          onFetchNextPage,
        }),
      {
        initialProps: { hasNextPage: false, isFetchNextPageError: false },
      },
    );

    await act(async () => {
      host.result.current.handleEndReached();
    });
    expect(onFetchNextPage).not.toHaveBeenCalled();

    await act(async () => {
      host.rerender({ hasNextPage: true, isFetchNextPageError: true });
    });
    await act(async () => {
      host.result.current.handleEndReached();
    });
    expect(onFetchNextPage).not.toHaveBeenCalled();
  });

  it('synchronously locks cursor during in-flight fetch preventing parallel dispatch', async () => {
    let resolveFetch: (() => void) | undefined;
    const onFetchNextPage = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = () => resolve({ status: 'started' });
        }),
    );

    const host = await renderHook(() =>
      useEndReachedPagination({
        isActive: true,
        hasNextPage: true,
        isFetchNextPageError: false,
        isBusy: false,
        cursor: 'cursor-1',
        onFetchNextPage,
      }),
    );

    // First call triggers dispatch
    await act(async () => {
      host.result.current.handleEndReached();
    });
    expect(onFetchNextPage).toHaveBeenCalledTimes(1);

    // Immediate second call before promise resolves
    await act(async () => {
      host.result.current.handleEndReached();
    });
    expect(onFetchNextPage).toHaveBeenCalledTimes(1);

    // Complete the fetch
    await act(async () => {
      resolveFetch?.();
    });
    expect(onFetchNextPage).toHaveBeenCalledTimes(1);
  });

  describe('resting near end zone', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('triggers limited resting follow-up loads when list remains near end after fetch settles', async () => {
      const onFetchNextPage = jest
        .fn()
        .mockResolvedValue({ status: 'started' });
      let offset = 1000;
      const listRef = {
        current: {
          getAbsoluteLastScrollOffset: () => offset,
          getWindowSize: () => ({ height: 800 }),
          getChildContainerDimensions: () => ({ height: 1200 }),
          getFirstItemOffset: () => 0,
        },
      };

      const host = await renderHook(
        ({ busy }: { busy: boolean }) =>
          useEndReachedPagination({
            isActive: true,
            hasNextPage: true,
            isFetchNextPageError: false,
            isBusy: busy,
            cursor: 'cursor-1',
            onFetchNextPage,
            listRef,
            endReachedThreshold: 0.5,
          }),
        { initialProps: { busy: true } },
      );

      const finishLoad = async () => {
        await act(async () => {
          host.rerender({ busy: true });
        });
        await act(async () => {
          host.rerender({ busy: false });
        });
        await act(async () => {
          jest.runOnlyPendingTimers();
        });
      };

      // Initial load finishes
      await finishLoad();
      expect(onFetchNextPage).toHaveBeenCalledTimes(1);

      // Follow-up 2
      await finishLoad();
      expect(onFetchNextPage).toHaveBeenCalledTimes(2);

      // Follow-up 3
      await finishLoad();
      expect(onFetchNextPage).toHaveBeenCalledTimes(3);

      // Exceeds max resting follow-ups (3) without moving scroll offset -> should not fetch again
      await finishLoad();
      expect(onFetchNextPage).toHaveBeenCalledTimes(3);

      // Moving scroll offset resets resting follow-up count
      offset = 1200;
      await finishLoad();
      expect(onFetchNextPage).toHaveBeenCalledTimes(4);
    });
  });
});
