import type { FlashListRef } from '@shopify/flash-list';
import { act, renderHook } from '@testing-library/react-native';
import type { ZhihuReadingPreviewItem } from '../src/api/zhihu/nextRender';
import { useAnswerPreviewCollapse } from '../src/hooks/useAnswerPreviewCollapse';

type Layout = { x: number; y: number; width: number; height: number };

/** The list's top padding, which FlashList layouts exclude. */
const FIRST_ITEM_OFFSET = 108;

function createList(layouts: Layout[], offset = { value: 0 }) {
  const data = layouts.map((_, index) => ({
    type: 'answer',
    id: String(index),
  }));
  const list = {
    props: { data },
    scrollToOffset: jest.fn(
      ({ offset: next, animated }: { offset: number; animated: boolean }) => {
        // Native animated scrolling reports its position asynchronously.
        if (!animated) offset.value = next;
      },
    ),
    getLayout: jest.fn((index: number) => layouts[index]),
    getFirstItemOffset: jest.fn(() => FIRST_ITEM_OFFSET),
    getAbsoluteLastScrollOffset: jest.fn(() => offset.value),
  };
  return {
    list,
    ref: { current: list as unknown as FlashListRef<ZhihuReadingPreviewItem> },
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

  await act(async () => result.current.collapse('1', collapse));
  expect(list.scrollToOffset).toHaveBeenCalledWith({
    offset: 792,
    animated: true,
  });
  expect(collapse).not.toHaveBeenCalled();

  // The animated scroll keeps emitting events; collapse waits for it to settle.
  await act(async () => {
    offset.value = 1500;
    result.current.onScroll(offset.value);
    await jest.advanceTimersByTimeAsync(100);
    offset.value = 800 + FIRST_ITEM_OFFSET - 116;
    result.current.onScroll(offset.value);
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
  await act(async () => result.current.collapse('1', collapse));
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
  await act(async () => result.current.collapse('1', collapse));
  offset.value = 792;
  await act(async () => await jest.advanceTimersByTimeAsync(300));
  expect(collapse).toHaveBeenCalledTimes(1);
  list.scrollToOffset.mockClear();

  // The reader drags; a re-measure must not pull the list back.
  result.current.cancel();
  offset.value = 500;
  layouts[0] = layout(0, 760);
  layouts[1] = layout(760, 600);
  await act(async () => result.current.onCommitLayout());
  expect(list.scrollToOffset).not.toHaveBeenCalled();
});

test('a reader interrupting the return scroll keeps control of the expanded card', async () => {
  const layouts = [layout(0, 800), layout(800, 4000)];
  const { list, ref, offset } = createList(layouts, { value: 3000 });
  const collapse = jest.fn();
  const { result } = await renderHook(() =>
    useAnswerPreviewCollapse({ listRef: ref, scope: 's', viewOffset: 116 }),
  );
  await act(async () => result.current.collapse('1', collapse));
  await act(async () => result.current.cancel());
  expect(collapse).not.toHaveBeenCalled();

  list.scrollToOffset.mockClear();
  offset.value = 500;
  layouts[1] = layout(760, 600);
  await act(async () => {
    result.current.onScroll(offset.value);
    await jest.advanceTimersByTimeAsync(1500);
    result.current.onCommitLayout();
  });
  expect(collapse).not.toHaveBeenCalled();
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
  await act(async () => result.current.collapse('1', collapse));
  expect(collapse).toHaveBeenCalledTimes(1);
  expect(list.scrollToOffset).not.toHaveBeenCalled();
});

test('collapses even if the scroll never reports settling', async () => {
  const { ref, offset } = createList([layout(0, 800), layout(800, 4000)], {
    value: 3000,
  });
  const collapse = jest.fn();
  const { result } = await renderHook(() =>
    useAnswerPreviewCollapse({ listRef: ref, scope: 's', viewOffset: 0 }),
  );
  await act(async () => result.current.collapse('1', collapse));
  await act(async () => {
    for (let elapsed = 0; elapsed < 1300; elapsed += 100) {
      result.current.onScroll(offset.value);
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
  await act(async () => result.current.collapse('1', collapse));
  await rerender({ scope: 'b' });
  await act(async () => await jest.advanceTimersByTimeAsync(2000));
  expect(collapse).not.toHaveBeenCalled();
});

test('keeps the same answer under the header after a prepend and a header resize', async () => {
  const layouts = [layout(0, 800), layout(800, 4000)];
  const { list, ref, offset } = createList(layouts, { value: 600 });
  const { result } = await renderHook(() =>
    useAnswerPreviewCollapse({ listRef: ref, scope: 's', viewOffset: 116 }),
  );
  await act(async () => result.current.collapse('1', jest.fn()));
  // A selected answer is inserted above both cards while the header grows.
  list.props.data.unshift({ type: 'answer', id: 'inserted' });
  layouts.splice(0, 2, layout(0, 200), layout(200, 800), layout(1000, 600));
  list.getFirstItemOffset.mockReturnValue(FIRST_ITEM_OFFSET + 50);
  await act(async () => result.current.onCommitLayout());
  expect(offset.value).toBe(850);
  list.props.data.pop();
  list.scrollToOffset.mockClear();
  await act(async () => result.current.onCommitLayout());
  expect(list.scrollToOffset).not.toHaveBeenCalled();
});

test('uses the native scroll position when only the list header grows', async () => {
  const { list, ref, offset } = createList(
    [layout(0, 800), layout(800, 4000)],
    { value: 600 },
  );
  const { result } = await renderHook(() =>
    useAnswerPreviewCollapse({ listRef: ref, scope: 's', viewOffset: 116 }),
  );
  await act(async () => {
    result.current.onScroll(600);
    result.current.collapse('1', jest.fn());
  });
  // FlashList reports its stored relative offset plus the *new* header height.
  list.getFirstItemOffset.mockReturnValue(FIRST_ITEM_OFFSET + 50);
  list.getAbsoluteLastScrollOffset.mockReturnValue(650);
  await act(async () => result.current.onCommitLayout());
  expect(offset.value).toBe(650);
});

test('a second collapse cannot pull the reader back to the first card', async () => {
  const { list, ref, offset } = createList(
    [layout(0, 800), layout(800, 4000)],
    { value: 0 },
  );
  const { result } = await renderHook(() =>
    useAnswerPreviewCollapse({ listRef: ref, scope: 's', viewOffset: 116 }),
  );
  await act(async () => result.current.collapse('0', jest.fn()));
  offset.value = 3000;
  await act(async () => result.current.onScroll(3000));
  await act(async () => result.current.collapse('1', jest.fn()));
  list.scrollToOffset.mockClear();
  await act(async () => result.current.onCommitLayout());
  expect(list.scrollToOffset).not.toHaveBeenCalled();
});
