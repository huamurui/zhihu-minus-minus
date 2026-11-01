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

  it('does not record pending intent if cursor changes while blocked fetch is in flight', async () => {
    let resolveFetch!: (value: unknown) => void;
    const onFetchNextPage = jest.fn().mockImplementation(() => {
      return new Promise((resolve) => {
        resolveFetch = resolve;
      });
    });

    let cursor = 'cursor-1';
    const host = await renderHook(
      ({ currentCursor }: { currentCursor: string }) =>
        useEndReachedPagination({
          isActive: true,
          hasNextPage: true,
          isFetchNextPageError: false,
          isBusy: false,
          cursor: currentCursor,
          onFetchNextPage,
        }),
      { initialProps: { currentCursor: cursor } },
    );

    await act(async () => {
      host.result.current.handleEndReached();
    });
    expect(onFetchNextPage).toHaveBeenCalledTimes(1);

    // While fetch is in flight, cursor advances / resets (e.g. refresh)
    cursor = 'cursor-2';
    await act(async () => {
      host.rerender({ currentCursor: cursor });
    });

    // Old fetch returns blocked
    await act(async () => {
      resolveFetch({ status: 'blocked', reason: 'busy' });
    });

    // Stale blocked response does NOT record pending intent on cursor-1
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

  it('cancelling pending intent invalidates pending async callbacks and prevents resurrection', async () => {
    let resolveBlocked: ((value: unknown) => void) | undefined;
    const onFetchNextPage = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBlocked = resolve;
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

    // 1. User reaches end
    await act(async () => {
      host.result.current.handleEndReached();
    });
    expect(onFetchNextPage).toHaveBeenCalledTimes(1);

    // 2. User refreshes or cancels intent before fetch resolves
    await act(async () => {
      host.result.current.cancelPendingIntent();
    });
    expect(host.result.current.isPendingIntent).toBe(false);

    // 3. Stale async fetch resolves with blocked status
    await act(async () => {
      resolveBlocked?.({ status: 'blocked', reason: 'busy' });
    });

    // Should NOT resurrect pending intent because generation was invalidated
    expect(host.result.current.isPendingIntent).toBe(false);
  });

  describe('resting near end zone', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('does not trigger follow-up loads on initial load settling while near end', async () => {
      const onFetchNextPage = jest
        .fn()
        .mockResolvedValue({ status: 'started' });
      const listRef = {
        current: {
          getAbsoluteLastScrollOffset: () => 1000,
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
            itemCount: 10,
            listRef,
            endReachedThreshold: 0.5,
          }),
        { initialProps: { busy: true } },
      );

      // Initial load finishes (busy -> false) without user touching end
      await act(async () => {
        host.rerender({ busy: false });
      });
      await act(async () => {
        jest.runOnlyPendingTimers();
      });

      expect(onFetchNextPage).not.toHaveBeenCalled();
    });

    it('does not trigger follow-up loads when pull-to-refresh settles near end', async () => {
      const onFetchNextPage = jest
        .fn()
        .mockResolvedValue({ status: 'started' });
      const listRef = {
        current: {
          getAbsoluteLastScrollOffset: () => 1000,
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
            itemCount: 10,
            listRef,
            endReachedThreshold: 0.5,
          }),
        { initialProps: { busy: false } },
      );

      // Refresh starts
      await act(async () => {
        host.result.current.cancelPendingIntent();
        host.rerender({ busy: true });
      });

      // Refresh ends
      await act(async () => {
        host.rerender({ busy: false });
      });
      await act(async () => {
        jest.runOnlyPendingTimers();
      });

      expect(onFetchNextPage).not.toHaveBeenCalled();
    });

    it('does not trigger follow-up loads when end-reached fetch successfully yields new items', async () => {
      const onFetchNextPage = jest
        .fn()
        .mockResolvedValue({ status: 'started' });
      const listRef = {
        current: {
          getAbsoluteLastScrollOffset: () => 1000,
          getWindowSize: () => ({ height: 800 }),
          getChildContainerDimensions: () => ({ height: 1200 }),
          getFirstItemOffset: () => 0,
        },
      };

      const host = await renderHook(
        ({ busy, itemCount }: { busy: boolean; itemCount: number }) =>
          useEndReachedPagination({
            isActive: true,
            hasNextPage: true,
            isFetchNextPageError: false,
            isBusy: busy,
            cursor: 'cursor-1',
            onFetchNextPage,
            itemCount,
            listRef,
            endReachedThreshold: 0.5,
          }),
        { initialProps: { busy: false, itemCount: 10 } },
      );

      // User reaches end
      await act(async () => {
        host.result.current.handleEndReached();
      });
      expect(onFetchNextPage).toHaveBeenCalledTimes(1);

      // Fetch in flight
      await act(async () => {
        host.rerender({ busy: true, itemCount: 10 });
      });

      // Fetch finished with more items (10 -> 20)
      await act(async () => {
        host.rerender({ busy: false, itemCount: 20 });
      });
      await act(async () => {
        jest.runOnlyPendingTimers();
      });

      // No auto follow-up because new items were added!
      expect(onFetchNextPage).toHaveBeenCalledTimes(1);
    });

    it('triggers limited resting follow-up loads up to max 3 when end-reached fetch yields no new items', async () => {
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
        ({ busy, itemCount }: { busy: boolean; itemCount: number }) =>
          useEndReachedPagination({
            isActive: true,
            hasNextPage: true,
            isFetchNextPageError: false,
            isBusy: busy,
            cursor: 'cursor-1',
            onFetchNextPage,
            itemCount,
            listRef,
            endReachedThreshold: 0.5,
          }),
        { initialProps: { busy: false, itemCount: 10 } },
      );

      // 1. User reaches end
      await act(async () => {
        host.result.current.handleEndReached();
      });
      expect(onFetchNextPage).toHaveBeenCalledTimes(1);

      const finishPagingWithoutNewItems = async () => {
        await act(async () => {
          host.rerender({ busy: true, itemCount: 10 });
        });
        await act(async () => {
          host.rerender({ busy: false, itemCount: 10 });
        });
        await act(async () => {
          jest.runOnlyPendingTimers();
        });
      };

      // Paging 1 finishes without new items -> triggers resting follow-up 1
      await finishPagingWithoutNewItems();
      expect(onFetchNextPage).toHaveBeenCalledTimes(2);

      // Follow-up 1 finishes without new items -> triggers resting follow-up 2
      await finishPagingWithoutNewItems();
      expect(onFetchNextPage).toHaveBeenCalledTimes(3);

      // Follow-up 2 finishes without new items -> triggers resting follow-up 3
      await finishPagingWithoutNewItems();
      expect(onFetchNextPage).toHaveBeenCalledTimes(4);

      // Follow-up 3 finishes without new items -> MAX_RESTING_FOLLOW_UPS (3) reached, stops!
      await finishPagingWithoutNewItems();
      expect(onFetchNextPage).toHaveBeenCalledTimes(4);

      // Subsequent handleEndReached at the exact same scroll offset does not reset budget
      await act(async () => {
        host.result.current.handleEndReached();
      });
      await finishPagingWithoutNewItems();
      expect(onFetchNextPage).toHaveBeenCalledTimes(4);

      // Moving scroll offset resets resting follow-up budget
      offset = 1250;
      await act(async () => {
        host.result.current.handleEndReached();
      });
      expect(onFetchNextPage).toHaveBeenCalledTimes(5);
    });

    it('does not cancel scheduled resting follow-up when parent re-renders before frame fires', async () => {
      const offset = 1200;
      const listRef = {
        current: {
          getAbsoluteLastScrollOffset: () => offset,
          getWindowSize: () => ({ height: 800 }),
          getChildContainerDimensions: () => ({ height: 1600 }),
          getFirstItemOffset: () => 0,
        },
      };

      const onFetchNextPage = jest
        .fn()
        .mockResolvedValue({ status: 'started' });
      const host = await renderHook(
        ({
          busy,
          itemCount,
          fetchFn,
        }: {
          busy: boolean;
          itemCount: number;
          fetchFn: () => Promise<unknown>;
        }) =>
          useEndReachedPagination({
            isActive: true,
            hasNextPage: true,
            isFetchNextPageError: false,
            isBusy: busy,
            cursor: 'cursor-1',
            onFetchNextPage: fetchFn,
            itemCount,
            listRef,
            endReachedThreshold: 0.5,
          }),
        {
          initialProps: {
            busy: false,
            itemCount: 10,
            fetchFn: onFetchNextPage,
          },
        },
      );

      // 1. User reaches end
      await act(async () => {
        host.result.current.handleEndReached();
      });
      expect(onFetchNextPage).toHaveBeenCalledTimes(1);

      // 2. Fetch becomes busy then finishes (busy -> false)
      await act(async () => {
        host.rerender({
          busy: true,
          itemCount: 10,
          fetchFn: onFetchNextPage,
        });
      });
      await act(async () => {
        host.rerender({
          busy: false,
          itemCount: 10,
          fetchFn: onFetchNextPage,
        });
      });

      // 3. Parent re-renders with a newly allocated fetch function before the animation frame runs!
      const newFetchFn = jest.fn().mockResolvedValue({ status: 'started' });
      await act(async () => {
        host.rerender({
          busy: false,
          itemCount: 10,
          fetchFn: newFetchFn,
        });
      });

      // 4. Animation frame runs now
      await act(async () => {
        jest.runOnlyPendingTimers();
      });

      // The follow-up request was NOT cancelled and used the latest fetch function!
      expect(newFetchFn).toHaveBeenCalledTimes(1);
    });

    it('cancels scheduled resting follow-up when cancelPendingIntent or deactivate is called before frame fires', async () => {
      const offset = 1200;
      const listRef = {
        current: {
          getAbsoluteLastScrollOffset: () => offset,
          getWindowSize: () => ({ height: 800 }),
          getChildContainerDimensions: () => ({ height: 1600 }),
          getFirstItemOffset: () => 0,
        },
      };

      const onFetchNextPage = jest
        .fn()
        .mockResolvedValue({ status: 'started' });
      const host = await renderHook(
        ({ busy, active }: { busy: boolean; active: boolean }) =>
          useEndReachedPagination({
            isActive: active,
            hasNextPage: true,
            isFetchNextPageError: false,
            isBusy: busy,
            cursor: 'cursor-1',
            onFetchNextPage,
            itemCount: 10,
            listRef,
            endReachedThreshold: 0.5,
          }),
        { initialProps: { busy: false, active: true } },
      );

      // User reaches end
      await act(async () => {
        host.result.current.handleEndReached();
      });
      expect(onFetchNextPage).toHaveBeenCalledTimes(1);

      // Busy finishes
      await act(async () => {
        host.rerender({ busy: true, active: true });
      });
      await act(async () => {
        host.rerender({ busy: false, active: true });
      });

      // Before frame fires, user refreshes / cancels intent
      await act(async () => {
        host.result.current.cancelPendingIntent();
      });

      // Animation frame fires
      await act(async () => {
        jest.runOnlyPendingTimers();
      });

      // Did not fire follow-up because it was cancelled!
      expect(onFetchNextPage).toHaveBeenCalledTimes(1);
    });
  });
});
