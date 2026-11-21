import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { AppState, type LayoutChangeEvent } from 'react-native';
import { ENABLE_READING_PROGRESS } from '@/constants/readingProgress';
import { useProgressStore } from '@/store/useProgressStore';
import {
  calculateReadingProgress,
  resolveReadingProgressOffset,
} from '@/utils/readingProgress';

interface ScrollToRef {
  scrollTo: (options: { y: number; animated: boolean }) => void;
}

interface UseReadingProgressOptions {
  contentKey: string;
  enabled?: boolean;
  ready?: boolean;
  onProgrammaticScroll?: (offset: number) => void;
  onContentMeasured?: (width: number, height: number) => void;
  /** Native content requires an actual measurement paired with this identity. */
  layoutSource?: object;
  scrollRef: React.RefObject<ScrollToRef | null>;
}

export type CompleteReadingContentMeasurement = (
  width: number,
  height: number,
) => void;

const SAVE_DELAY_MS = 1200;
const RESTORE_DELAY_MS = 180;

export function useReadingProgress({
  contentKey,
  enabled = true,
  ready = true,
  onProgrammaticScroll,
  onContentMeasured,
  layoutSource,
  scrollRef,
}: UseReadingProgressOptions) {
  const progressEnabled = ENABLE_READING_PROGRESS && enabled;
  const entry = useProgressStore((state) => state.progress[contentKey]);
  const saveProgress = useProgressStore((state) => state.saveProgress);
  const removeProgress = useProgressStore((state) => state.removeProgress);
  const [hasHydrated, setHasHydrated] = useState(() =>
    useProgressStore.persist.hasHydrated(),
  );
  const [restoredOffset, setRestoredOffset] = useState<number | null>(null);

  const contentHeightRef = useRef(0);
  const readyToSave = useRef(ready);
  const contentMeasuredWhileReadyRef = useRef(false);
  const viewportHeightRef = useRef(0);
  const offsetRef = useRef(0);
  const restoredRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreEligibilityRef = useRef({
    contentKey,
    enabled,
    ready,
    layoutSource,
  });
  restoreEligibilityRef.current = { contentKey, enabled, ready, layoutSource };
  const measurementScopeRef = useRef({
    contentKey,
    enabled,
    layoutSource,
    epoch: 0,
  });
  const measurementRequestRef = useRef(0);
  const actualMeasurementRef = useRef<{
    layoutSource: object;
    height: number;
    epoch: number;
    request: number;
  } | null>(null);
  const committedTryRestoreRef = useRef<() => void>(() => {});
  const progressIdentityRef = useRef(contentKey);
  const onProgrammaticScrollRef = useRef(onProgrammaticScroll);
  onProgrammaticScrollRef.current = onProgrammaticScroll;
  const onContentMeasuredRef = useRef(onContentMeasured);
  onContentMeasuredRef.current = onContentMeasured;

  useLayoutEffect(() => {
    measurementScopeRef.current = {
      contentKey,
      enabled,
      layoutSource,
      epoch: measurementScopeRef.current.epoch + 1,
    };
    measurementRequestRef.current += 1;
    actualMeasurementRef.current = null;
    return () => {
      measurementScopeRef.current.enabled = false;
      measurementRequestRef.current += 1;
      actualMeasurementRef.current = null;
    };
  }, [contentKey, enabled, layoutSource]);

  useEffect(() => {
    if (!progressEnabled) return;
    const unsubscribe = useProgressStore.persist.onFinishHydration(() =>
      setHasHydrated(true),
    );
    if (useProgressStore.persist.hasHydrated()) setHasHydrated(true);
    return unsubscribe;
  }, [progressEnabled]);

  useLayoutEffect(() => {
    // Keep the outgoing body's readiness through its cleanup when switching keys.
    readyToSave.current = ready;
  }, [ready]);

  const commitProgress = useCallback(() => {
    if (!progressEnabled || !restoredRef.current || !readyToSave.current)
      return;

    const result = calculateReadingProgress(
      offsetRef.current,
      contentHeightRef.current,
      viewportHeightRef.current,
    );

    if (result.status === 'active') {
      saveProgress(contentKey, result.entry);
    } else if (result.status === 'complete' || result.status === 'at-start') {
      removeProgress(contentKey);
    }
  }, [contentKey, progressEnabled, removeProgress, saveProgress]);

  useLayoutEffect(() => {
    if (progressIdentityRef.current !== contentKey) {
      progressIdentityRef.current = contentKey;
      contentHeightRef.current = 0;
      contentMeasuredWhileReadyRef.current = false;
      offsetRef.current = 0;
      restoredRef.current = false;
      setRestoredOffset(null);
    }
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
      saveTimerRef.current = null;
      restoreTimerRef.current = null;
      // Save the outgoing identity before the next layout resets shared refs.
      commitProgress();
    };
  }, [contentKey, commitProgress]);

  const scheduleSave = useCallback(() => {
    if (!progressEnabled || !restoredRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(commitProgress, SAVE_DELAY_MS);
  }, [commitProgress, progressEnabled]);

  const tryRestore = useCallback(() => {
    if (!progressEnabled || !ready || !hasHydrated || restoredRef.current)
      return;
    if (!entry) {
      restoredRef.current = true;
      return;
    }
    const measured = actualMeasurementRef.current;
    const hasActualMeasurement =
      measured?.layoutSource === layoutSource &&
      measured?.epoch === measurementScopeRef.current.epoch &&
      measured?.request === measurementRequestRef.current;
    if (
      (layoutSource
        ? !hasActualMeasurement
        : !contentMeasuredWhileReadyRef.current) ||
      contentHeightRef.current <= 0 ||
      viewportHeightRef.current <= 0
    ) {
      return;
    }

    if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
    restoreTimerRef.current = setTimeout(() => {
      restoreTimerRef.current = null;
      const current = restoreEligibilityRef.current;
      if (
        !current.enabled ||
        !current.ready ||
        current.contentKey !== contentKey ||
        current.layoutSource !== layoutSource ||
        restoredRef.current
      )
        return;
      const actual = actualMeasurementRef.current;
      if (
        layoutSource &&
        (actual?.layoutSource !== layoutSource ||
          actual?.epoch !== measurementScopeRef.current.epoch ||
          actual?.request !== measurementRequestRef.current)
      )
        return;
      const targetOffset = resolveReadingProgressOffset(
        entry,
        layoutSource && actual ? actual.height : contentHeightRef.current,
        viewportHeightRef.current,
      );
      offsetRef.current = targetOffset;
      scrollRef.current?.scrollTo({ y: targetOffset, animated: false });
      restoredRef.current = true;
      setRestoredOffset(targetOffset);
      onProgrammaticScrollRef.current?.(targetOffset);
    }, RESTORE_DELAY_MS);
  }, [
    contentKey,
    progressEnabled,
    entry,
    hasHydrated,
    ready,
    layoutSource,
    scrollRef,
  ]);

  useLayoutEffect(() => {
    committedTryRestoreRef.current = tryRestore;
  }, [tryRestore]);

  const beginContentMeasurement =
    useCallback((): CompleteReadingContentMeasurement | null => {
      const scope = measurementScopeRef.current;
      if (
        !scope.enabled ||
        !layoutSource ||
        scope.contentKey !== contentKey ||
        scope.layoutSource !== layoutSource
      )
        return null;
      const request = ++measurementRequestRef.current;
      return (width, height) => {
        const current = measurementScopeRef.current;
        if (
          !current.enabled ||
          current.contentKey !== contentKey ||
          current.layoutSource !== layoutSource ||
          current.epoch !== scope.epoch ||
          measurementRequestRef.current !== request ||
          !Number.isFinite(width) ||
          !Number.isFinite(height) ||
          width <= 0 ||
          height <= 0
        )
          return;
        actualMeasurementRef.current = {
          layoutSource,
          height,
          epoch: scope.epoch,
          request,
        };
        contentHeightRef.current = height;
        onContentMeasuredRef.current?.(width, height);
        // Readiness may have committed since this async measurement was requested.
        committedTryRestoreRef.current();
      };
    }, [contentKey, layoutSource]);

  useEffect(() => {
    if (!ready) contentMeasuredWhileReadyRef.current = false;
    tryRestore();
    return () => {
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
      restoreTimerRef.current = null;
    };
  }, [ready, tryRestore]);

  useEffect(() => {
    if (!progressEnabled) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') commitProgress();
    });
    return () => subscription.remove();
  }, [commitProgress, progressEnabled]);

  const onScroll = useCallback(
    (offset: number) => {
      offsetRef.current = Math.max(0, offset);
      scheduleSave();
    },
    [scheduleSave],
  );

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportHeightRef.current = event.nativeEvent.layout.height;
      tryRestore();
    },
    [tryRestore],
  );

  const onContentSizeChange = useCallback(
    (width: number, height: number) => {
      const current = measurementScopeRef.current;
      if (
        current.contentKey !== contentKey ||
        current.layoutSource !== layoutSource ||
        (layoutSource && !current.enabled)
      )
        return;
      // Mounted fallback pages can reflow while unfocused without another size
      // event on focus. Keep their geometry; tryRestore still requires enabled.
      contentHeightRef.current = height;
      onContentMeasuredRef.current?.(width, height);
      if (!layoutSource && ready) contentMeasuredWhileReadyRef.current = true;
      tryRestore();
    },
    [contentKey, layoutSource, ready, tryRestore],
  );

  const dismissRestoreNotice = useCallback(() => {
    setRestoredOffset(null);
  }, []);

  const scrollToTop = useCallback(() => {
    const current = restoreEligibilityRef.current;
    if (
      !ENABLE_READING_PROGRESS ||
      !current.enabled ||
      current.contentKey !== contentKey
    )
      return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    offsetRef.current = 0;
    setRestoredOffset(null);
    removeProgress(contentKey);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    onProgrammaticScrollRef.current?.(0);
  }, [contentKey, removeProgress, scrollRef]);

  return {
    beginContentMeasurement,
    commitProgress,
    dismissRestoreNotice,
    onContentSizeChange,
    onLayout,
    onScroll,
    restoredOffset: ENABLE_READING_PROGRESS ? restoredOffset : null,
    scrollToTop,
  };
}
