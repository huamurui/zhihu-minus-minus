import type { FlashListRef } from '@shopify/flash-list';
import { act, renderHook } from '@testing-library/react-native';
import { useAnswerPreviewCollapse } from '../src/hooks/useAnswerPreviewCollapse';

type Layout = { x: number; y: number; width: number; height: number };

/** The list's top padding, which FlashList layouts exclude. */
const FIRST_ITEM_OFFSET = 108;

function createList(layouts: Layout[], offset = { value: 0 }) {
  const list = {
    scrollToIndex: jest.fn(),
    scrollToOffset: jest.fn(({ offset: next }: { offset: number }) => {
      offset.value = next;
    }),
    getLayout: jest.fn((index: number) => layouts[index]),
    getFirstItemOffset: jest.fn(() => FIRST_ITEM_OFFSET),
    getAbsoluteLastScrollOffset: jest.fn(() => offset.value),
  };
  return {
    list,
    ref: { current: list as unknown as FlashListRef<unknown> },
    offset,
  };
}

const layout = (y: number, height: number): Layout => ({
  x: 0,
  y,
  width: 400,
  height,
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('scrolls back to the answer start before collapsing and keeps that start in place', async () => {
  const layouts = [layout(0, 800), layout(800, 4000), layout(4800, 800)];
  // Reading deep inside the expanded second answer.
  const { list, ref, offset } = createList(layouts, { value: 3000 });
  const collapse = jest.fn();
  const { result } = await renderHook(() =>
    useAnswerPreviewCollapse({ listRef: ref, scope: 's', viewOffset: 116 }),
  );

  await act(async () => result.current.collapse(1, collapse));
  expect(list.scrollToIndex).toHaveBeenCalledWith({
    index: 1,
    animated: true,
    viewOffset: -116,
  });
  expect(collapse).not.toHaveBeenCalled();

  // The animated scroll keeps emitting events; collapse waits for it to settle.
  await act(async () => {
    offset.value = 1500;
    result.current.onScroll();
    await jest.advanceTimersByTimeAsync(100);
    offset.value = 800 + FIRST_ITEM_OFFSET - 116;
    result.current.onScroll();
    await jest.advanceTimersByTimeAsync(100);
  });
  expect(collapse).not.toHaveBeenCalled();
  await act(async () => await jest.advanceTimersByTimeAsync(150));
  expect(collapse).toHaveBeenCalledTimes(1);

  // Shrinking the card leaves its start where it was.
  layouts[1] = layout(800, 600);
  layouts[2] = layout(1400, 800);
  list.scrollToOffset.mockClear();
  await act(async () => result.current.onCommitLayout());
  expect(list.scrollToOffset).not.toHaveBeenCalled();
});

test('re-anchors the answer start if its position shifts during the collapse', async () => {
  const layouts = [layout(0, 800), layout(800, 4000)];
  const { list, ref, offset } = createList(layouts, { value: 3000 });
  const collapse = jest.fn();
  const { result } = await renderHook(() =>
    useAnswerPreviewCollapse({ listRef: ref, scope: 's', viewOffset: 116 }),
  );
  await act(async () => result.current.collapse(1, collapse));
  offset.value = 792;
  await act(async () => await jest.advanceTimersByTimeAsync(300));
  expect(collapse).toHaveBeenCalledTimes(1);
  // The card above is re-measured 40px shorter in the same commit.
  layouts[0] = layout(0, 760);
  layouts[1] = layout(760, 600);
  await act(async () => result.current.onCommitLayout());
  expect(list.scrollToOffset).toHaveBeenLastCalledWith({
    offset: 752,
    animated: false,
  });
});

test('a drag during the collapse ends the re-anchoring', async () => {
  const layouts = [layout(0, 800), layout(800, 4000)];
  const { list, ref, offset } = createList(layouts, { value: 3000 });
  const collapse = jest.fn();
  const { result } = await renderHook(() =>
    useAnswerPreviewCollapse({ listRef: ref, scope: 's', viewOffset: 116 }),
  );
  await act(async () => result.current.collapse(1, collapse));
  offset.value = 792;
  await act(async () => await jest.advanceTimersByTimeAsync(300));
  expect(collapse).toHaveBeenCalledTimes(1);
  list.scrollToOffset.mockClear();

  // The reader drags; a re-measure must not pull the list back.
  result.current.onScrollBeginDrag();
  offset.value = 500;
  layouts[0] = layout(0, 760);
  layouts[1] = layout(760, 600);
  await act(async () => result.current.onCommitLayout());
  expect(list.scrollToOffset).not.toHaveBeenCalled();
});

test('a drag during the scroll cancels pending re-anchoring', async () => {
  const layouts = [layout(0, 800), layout(800, 4000)];
  const { list, ref, offset } = createList(layouts, { value: 3000 });
  const collapse = jest.fn();
  const { result } = await renderHook(() =>
    useAnswerPreviewCollapse({ listRef: ref, scope: 's', viewOffset: 116 }),
  );
  await act(async () => result.current.collapse(1, collapse));
  await act(async () => result.current.onScrollBeginDrag());
  expect(collapse).toHaveBeenCalledTimes(1);

  offset.value = 500;
  layouts[1] = layout(760, 600);
  await act(async () => {
    result.current.onScroll();
    await jest.advanceTimersByTimeAsync(1500);
    result.current.onCommitLayout();
  });
  expect(collapse).toHaveBeenCalledTimes(1);
  expect(list.scrollToOffset).not.toHaveBeenCalled();
});

test('collapses at once when the answer start is already on screen', async () => {
  const { list, ref } = createList([layout(0, 800), layout(800, 3000)], {
    value: 600,
  });
  const collapse = jest.fn();
  const { result } = await renderHook(() =>
    useAnswerPreviewCollapse({ listRef: ref, scope: 's', viewOffset: 116 }),
  );
  await act(async () => result.current.collapse(1, collapse));
  expect(collapse).toHaveBeenCalledTimes(1);
  expect(list.scrollToIndex).not.toHaveBeenCalled();
});

test('collapses even if the scroll never reports settling', async () => {
  const { ref } = createList([layout(0, 800), layout(800, 4000)], {
    value: 3000,
  });
  const collapse = jest.fn();
  const { result } = await renderHook(() =>
    useAnswerPreviewCollapse({ listRef: ref, scope: 's', viewOffset: 0 }),
  );
  await act(async () => result.current.collapse(1, collapse));
  await act(async () => {
    for (let elapsed = 0; elapsed < 1300; elapsed += 100) {
      result.current.onScroll();
      await jest.advanceTimersByTimeAsync(100);
    }
  });
  expect(collapse).toHaveBeenCalledTimes(1);
});

test('a scope change drops a collapse queued for the previous list', async () => {
  const { ref } = createList([layout(0, 800), layout(800, 4000)], {
    value: 3000,
  });
  const collapse = jest.fn();
  const { result, rerender } = await renderHook(
    ({ scope }: { scope: string }) =>
      useAnswerPreviewCollapse({ listRef: ref, scope, viewOffset: 0 }),
    { initialProps: { scope: 'a' } },
  );
  await act(async () => result.current.collapse(1, collapse));
  await rerender({ scope: 'b' });
  await act(async () => await jest.advanceTimersByTimeAsync(2000));
  expect(collapse).not.toHaveBeenCalled();
});
