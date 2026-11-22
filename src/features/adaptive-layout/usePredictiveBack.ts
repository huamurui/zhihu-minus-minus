import { useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { Platform, type ViewStyle } from 'react-native';
import {
  cancelAnimation,
  makeMutable,
  type SharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  addPredictiveBackListener,
  type PredictiveBackCornerRadii,
  setPredictiveBackTarget,
} from '@/modules/predictive-back';

export type PredictiveBackPreview = {
  source: string;
  destination: string;
  edge: 'left' | 'right';
  cornerRadii?: PredictiveBackCornerRadii;
  progress: SharedValue<number>;
};

export const PREDICTIVE_BACK_EXIT_MS = 120;

export function getPredictiveBackStyle(
  { cornerRadii, edge, progress }: PredictiveBackPreview,
  width: number,
): ViewStyle {
  'worklet';
  const p = Math.max(0, Math.min(1, progress.get()));
  const round = Math.min(1, p / 0.2);
  return {
    borderTopLeftRadius: (cornerRadii?.topLeft ?? 0) * round,
    borderTopRightRadius: (cornerRadii?.topRight ?? 0) * round,
    borderBottomRightRadius: (cornerRadii?.bottomRight ?? 0) * round,
    borderBottomLeftRadius: (cornerRadii?.bottomLeft ?? 0) * round,
    opacity: p < 0.8 ? 1 - (0.15 * p) / 0.8 : (0.85 * (1 - p)) / 0.2,
    transform: [
      { translateX: width * (edge === 'left' ? 0.18 : -0.18) * p },
      { scale: 1 - 0.1 * p },
    ],
  };
}

/** Commit history as soon as Android commits; animation only controls the visual. */
export function usePredictiveBack(
  source: string | undefined,
  destination: string | undefined,
  pop: (count: number, sourceKey: string) => void,
) {
  const [preview, setPreview] = useState<PredictiveBackPreview | null>(null);
  const completed = useRef<PredictiveBackPreview | null>(null);
  const commit = useEffectEvent(
    (sourceKey: string, gesture: PredictiveBackPreview | null) => {
      completed.current = gesture;
      pop(1, sourceKey);
    },
  );

  useLayoutEffect(() => {
    if (
      Platform.OS !== 'android' ||
      Number(Platform.Version) < 34 ||
      !source ||
      !destination
    )
      return;
    let listening = true;
    let lastStarted = -1;
    let lastFinished = -1;
    let tracking: PredictiveBackPreview | null = null;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;
    const listener = addPredictiveBackListener((event) => {
      if (
        !listening ||
        event.routeKey !== source ||
        event.gestureId <= lastFinished
      )
        return;
      if (event.phase === 'commit') {
        if (event.gestureId < lastStarted) return;
        // A native commit for this route is authoritative even when JS never
        // rendered the start frame. Duplicate and cancelled gesture IDs expire.
        lastFinished = event.gestureId;
        const gesture = event.gestureId === lastStarted ? tracking : null;
        tracking = null;
        commit(source, gesture);
        setPreview(null);
        return;
      }
      if (event.phase === 'start') {
        if (event.gestureId <= lastStarted) return;
        lastStarted = event.gestureId;
        clearTimeout(resetTimer);
        if (tracking) cancelAnimation(tracking.progress);
        tracking = {
          source,
          destination,
          edge: event.edge,
          cornerRadii: event.cornerRadii,
          progress: makeMutable(event.progress),
        };
        setPreview(tracking);
        return;
      }
      if (event.phase === 'progress') {
        if (event.gestureId === lastStarted)
          tracking?.progress.set(event.progress);
        return;
      }
      if (event.gestureId < lastStarted) return;
      lastFinished = event.gestureId;
      const gesture = tracking;
      tracking = null;
      if (gesture) {
        const duration = 150;
        gesture.progress.set(withTiming(0, { duration }));
        resetTimer = setTimeout(() => setPreview(null), duration);
      }
    });
    setPredictiveBackTarget(source);
    return () => {
      listening = false;
      listener.remove();
      setPredictiveBackTarget(null);
      clearTimeout(resetTimer);
      if (tracking) cancelAnimation(tracking.progress);
      setPreview(null);
    };
  }, [source, destination]);

  const completedGesture = completed.current;
  useLayoutEffect(() => {
    completed.current = null;
  });
  return {
    preview:
      preview?.source === source && preview?.destination === destination
        ? preview
        : null,
    completedGesture,
  };
}
