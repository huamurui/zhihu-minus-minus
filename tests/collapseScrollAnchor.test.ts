import { renderHook } from '@testing-library/react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useCollapseScrollAnchor } from '../src/hooks/useCollapseScrollAnchor';

const layout = (height: number) =>
  ({
    nativeEvent: { layout: { x: 0, y: 0, width: 360, height } },
  }) as unknown as LayoutChangeEvent;

async function setup(offset: number) {
  const scrollToOffset = jest.fn();
  const hook = await renderHook(() =>
    useCollapseScrollAnchor({ getOffset: () => offset, scrollToOffset }),
  );
  return { scrollToOffset, anchor: () => hook.result.current };
}

test('collapsing a description the reader scrolled into keeps the content below it in place', async () => {
  const { scrollToOffset, anchor } = await setup(2800);
  anchor().onLayout(layout(3200));
  anchor().beforeCollapse();
  anchor().onLayout(layout(200));
  // Without this the list stays at 2800 inside a header 3000 shorter: the view
  // jumps past several answers, or past the end of the list and shows nothing.
  expect(scrollToOffset).toHaveBeenCalledWith(0);
  expect(scrollToOffset).toHaveBeenCalledTimes(1);
});

test('a reader partway down keeps the shrink minus the hidden part', async () => {
  const { scrollToOffset, anchor } = await setup(5000);
  anchor().onLayout(layout(3200));
  anchor().beforeCollapse();
  anchor().onLayout(layout(200));
  expect(scrollToOffset).toHaveBeenCalledWith(2000);
});

test('a reader at the top is not scrolled', async () => {
  const { scrollToOffset, anchor } = await setup(0);
  anchor().onLayout(layout(3200));
  anchor().beforeCollapse();
  anchor().onLayout(layout(200));
  expect(scrollToOffset).not.toHaveBeenCalled();
});

test('layout changes that are not a collapse leave the scroll position alone', async () => {
  const { scrollToOffset, anchor } = await setup(2800);
  anchor().onLayout(layout(200));
  // Expanding, and the rich content shrinking after it measures itself.
  anchor().onLayout(layout(3400));
  anchor().onLayout(layout(3200));
  expect(scrollToOffset).not.toHaveBeenCalled();
});

test('a collapse is anchored once, not on later layouts', async () => {
  const { scrollToOffset, anchor } = await setup(2800);
  anchor().onLayout(layout(3200));
  anchor().beforeCollapse();
  anchor().onLayout(layout(200));
  anchor().onLayout(layout(3200));
  anchor().onLayout(layout(100));
  expect(scrollToOffset).toHaveBeenCalledTimes(1);
});
