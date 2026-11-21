import { useCallback, useLayoutEffect, useRef } from 'react';

/** Keep large tail batches available until the reader touches this document. */
export function useProgressiveTailInteraction(sessionKey: string) {
  const untouchedSession = useRef<string | null>(sessionKey);
  useLayoutEffect(() => {
    untouchedSession.current = sessionKey;
  }, [sessionKey]);

  const markInteraction = useCallback(() => {
    if (untouchedSession.current === sessionKey)
      untouchedSession.current = null;
  }, [sessionKey]);
  const canExpandProgressiveTail = useCallback(
    () => untouchedSession.current === sessionKey,
    [sessionKey],
  );
  return {
    canExpandProgressiveTail,
    scrollInteractionHandlers: {
      onTouchStartCapture: markInteraction,
      onScrollBeginDrag: markInteraction,
    },
  };
}
