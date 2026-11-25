import { useCallback, useRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/**
 * 收起列表头里一段可展开的内容时，让它下方的内容留在屏幕原处。
 *
 * 列表头变矮时，原生滚动位置不会跟着回退：收起一段很长的问题描述后，画面会
 * 一下跳过它缩掉的高度；已加载的回答不够长时，滚动位置超出列表末尾，整页空白。
 * 这里在收起后的那次排版里把滚动位置减去缩掉的高度，最小到 0。
 */
export function useCollapseScrollAnchor({
  getOffset,
  scrollToOffset,
}: {
  /** 当前的原生滚动位置。 */
  getOffset: () => number;
  scrollToOffset: (offset: number) => void;
}) {
  const height = useRef<number | null>(null);
  const pending = useRef<{ offset: number; height: number } | null>(null);

  /** 在切换到收起状态之前调用。 */
  const beforeCollapse = useCallback(() => {
    if (height.current === null) return;
    pending.current = { offset: getOffset(), height: height.current };
  }, [getOffset]);

  /** 挂在可收起内容的容器上。 */
  const onLayout = useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => {
      const next = nativeEvent.layout.height;
      height.current = next;
      const collapse = pending.current;
      pending.current = null;
      if (!collapse) return;
      const target = Math.max(
        0,
        collapse.offset - Math.max(0, collapse.height - next),
      );
      if (target !== collapse.offset) scrollToOffset(target);
    },
    [scrollToOffset],
  );

  return { beforeCollapse, onLayout };
}
