import { useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  addPredictiveBackListener,
  type PredictiveBackEvent,
  releasePredictiveBackSurface,
  setPredictiveBackTarget,
} from '@/modules/predictive-back';

type CommittedExit = {
  source: string;
  destination: string;
  gestureId: number;
  finished: boolean;
};

/** Android handles every visual frame, including cancellation, on its UI thread. */
export function usePredictiveBack(
  target: string | undefined,
  destination: string | undefined,
  routes: readonly { key: string }[],
  pop: (count: number, sourceKey: string) => void,
  finishExit: (routeKey: string) => void,
) {
  const [committed, setCommitted] = useState<CommittedExit | null>(null);
  const lastCommit = useRef(-1);
  const handle = useEffectEvent((event: PredictiveBackEvent) => {
    if (event.phase === 'finish') {
      setCommitted((current) =>
        current?.gestureId === event.gestureId &&
        current.source === event.routeKey
          ? { ...current, finished: true }
          : current,
      );
      return;
    }
    if (event.phase !== 'commit' || event.gestureId <= lastCommit.current)
      return;
    lastCommit.current = event.gestureId;
    if (event.routeKey !== target || !destination) {
      releasePredictiveBackSurface(event.gestureId);
      return;
    }
    setCommitted({
      source: target,
      destination,
      gestureId: event.gestureId,
      finished: false,
    });
    pop(1, target);
  });

  useLayoutEffect(() => {
    if (Platform.OS !== 'android' || Number(Platform.Version) < 34) return;
    const subscription = addPredictiveBackListener(handle);
    if (target) setPredictiveBackTarget(target);
    return () => {
      subscription.remove();
      if (target) setPredictiveBackTarget(null);
    };
  }, [target]);

  useLayoutEffect(() => {
    if (!committed?.finished) return;
    // A blocked source still needs its pixels restored if another route
    // covered it before the native exit finished.
    if (routes.some((route) => route.key === committed.source))
      releasePredictiveBackSurface(committed.gestureId);
    else finishExit(committed.source);
    setCommitted(null);
  }, [routes, committed, finishExit]);
  return committed;
}
