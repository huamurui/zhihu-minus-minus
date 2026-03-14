import { useCallback, useRef, useState } from 'react';

export function useViewableItems<TItem extends { id: string | number }>() {
  const [activeItem, setActiveItem] = useState<TItem | null>(null);
  const viewableIdsRef = useRef<string[]>([]);

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 20,
  }).current;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ item: TItem }> }) => {
      viewableIdsRef.current = viewableItems.map((v) => v.item.id.toString());
      const candidate = viewableItems[0]?.item;
      if (candidate && candidate.id !== activeItem?.id) {
        setActiveItem(candidate);
      }
    },
    [activeItem],
  );

  return {
    activeItem,
    setActiveItem,
    viewableIdsRef,
    viewabilityConfig,
    onViewableItemsChanged,
  };
}
