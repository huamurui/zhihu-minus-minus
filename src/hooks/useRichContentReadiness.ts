import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/** The visible prefix and the complete layout belong to the same body revision. */
export function useRichContentReadiness(source: object) {
  const [layout, setLayout] = useState<{
    source: object;
    complete: boolean;
  } | null>(null);
  const latest = useRef(source);
  useLayoutEffect(() => {
    latest.current = source;
  }, [source]);

  const onFirstContentLayout = useCallback(() => {
    if (latest.current !== source) return;
    setLayout((previous) =>
      previous?.source === source ? previous : { source, complete: false },
    );
  }, [source]);

  const onLayoutReady = useCallback(() => {
    if (latest.current !== source) return;
    setLayout((previous) =>
      previous?.source === source && previous.complete
        ? previous
        : { source, complete: true },
    );
  }, [source]);

  const readable = layout?.source === source;
  const complete = readable && layout.complete;
  return {
    readable,
    complete,
    onFirstContentLayout,
    onLayoutReady,
  };
}
