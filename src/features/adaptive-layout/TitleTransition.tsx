import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  type LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  View,
  type ViewInstance,
} from 'react-native';
import { useRuntimeThemeColors } from '@/components/Themed';
import { useSettingsStore } from '@/store/useSettingsStore';
import { PaneContext, usePaneVisible } from './PaneContext';

type Frame = { x: number; y: number; width: number; height: number };
type PendingTitle = {
  id: string;
  text: string;
  source: Frame;
  expires: number;
  isValid?: () => boolean;
  destinationKey?: string;
  sourceRouteKey?: string;
  rootX: number;
  rootY: number;
  measuring: boolean;
  pressTime?: number;
  sourceMeasuredTime?: number;
  retries?: number;
};
type Flight = {
  text: string;
  sourceTitle?: ReactNode;
  source: Frame;
  target: Frame;
  moving: boolean;
  token: number;
};
type TitleTransition = {
  navigate: (
    ref: RefObject<ViewInstance | null>,
    id: string,
    text: string,
    navigate: () => void,
    isValid?: () => boolean,
    onSourceHiddenChange?: (hidden: boolean) => void,
    sourceTitle?: ReactNode,
  ) => void;
  target: (id: string, ref: ViewInstance | null) => void;
};

const Context = createContext<TitleTransition | null>(null);
const VisibilityContext = createContext<{
  id: string;
  sourceRouteKey?: string;
  activeRouteKey?: string;
  flight: Flight | null;
  progress: Animated.Value;
} | null>(null);
export const TARGET_WAIT_MS = Platform.OS === 'android' ? 500 : 200;
const validFrame = (frame: Frame) =>
  Number.isFinite(frame.x) &&
  Number.isFinite(frame.y) &&
  Number.isFinite(frame.width) &&
  Number.isFinite(frame.height) &&
  frame.width > 0 &&
  frame.height > 0;

/** Only an explicitly tapped title can start a flight; missing layout falls back to navigation. */
export function TitleTransitionProvider({
  children,
  activeRouteKey,
}: {
  children: ReactNode;
  activeRouteKey?: string;
}) {
  const root = useRef<ViewInstance>(null);
  const pending = useRef<PendingTitle | null>(null);
  const sourceRestore = useRef<(() => void) | null>(null);
  const targetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);
  const progress = useRef(new Animated.Value(0)).current;
  const reducedMotion = useRef(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [waiting, setWaiting] = useState<{
    id: string;
    sourceRouteKey?: string;
  } | null>(null);
  const flightRef = useRef(flight);
  const previousRoute = useRef(activeRouteKey);
  const currentRoute = useRef(activeRouteKey);
  const colors = useRuntimeThemeColors();
  const fontSizeScale = useSettingsStore((state) => state.fontSizeScale);
  const lineHeightScale = useSettingsStore((state) => state.lineHeightScale);
  const restoreSource = useCallback(() => {
    const restore = sourceRestore.current;
    sourceRestore.current = null;
    restore?.();
  }, []);

  useLayoutEffect(() => {
    flightRef.current = flight;
    currentRoute.current = activeRouteKey;
  }, [flight, activeRouteKey]);

  useLayoutEffect(() => {
    if (previousRoute.current === activeRouteKey) return;
    previousRoute.current = activeRouteKey;
    if (pending.current && !pending.current.destinationKey) {
      pending.current.destinationKey = activeRouteKey;
    } else if (flightRef.current || pending.current) {
      sequence.current += 1;
      pending.current = null;
      if (targetTimer.current) clearTimeout(targetTimer.current);
      targetTimer.current = null;
      progress.stopAnimation();
      restoreSource();
      setFlight(null);
      setWaiting(null);
    } else {
      // A source measurement can still be in progress before pending is set.
      sequence.current += 1;
    }
  }, [activeRouteKey, progress, restoreSource]);

  useEffect(() => {
    let mounted = true;
    const updateReducedMotion = (enabled: boolean) => {
      reducedMotion.current = enabled;
      if (enabled && (pending.current || flightRef.current)) {
        sequence.current += 1;
        pending.current = null;
        if (targetTimer.current) clearTimeout(targetTimer.current);
        targetTimer.current = null;
        progress.stopAnimation();
        restoreSource();
        setFlight(null);
        setWaiting(null);
      }
    };
    void AccessibilityInfo.isReduceMotionEnabled?.()?.then?.((enabled) => {
      if (mounted) updateReducedMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      updateReducedMotion,
    );
    return () => {
      mounted = false;
      sequence.current += 1;
      if (targetTimer.current) clearTimeout(targetTimer.current);
      restoreSource();
      subscription?.remove?.();
    };
  }, [progress, restoreSource]);

  const navigate = useCallback<TitleTransition['navigate']>(
    (ref, id, text, open, isValid, onSourceHiddenChange, sourceTitle) => {
      const token = ++sequence.current;
      const pressTime = Date.now();
      pending.current = null;
      if (targetTimer.current) clearTimeout(targetTimer.current);
      targetTimer.current = null;
      progress.stopAnimation();
      restoreSource();
      setFlight(null);
      setWaiting(null);
      if (
        !id ||
        !text ||
        reducedMotion.current ||
        !ref.current ||
        !root.current
      ) {
        if (__DEV__) {
          const reason = !id
            ? 'missing-id'
            : !text
              ? 'missing-text'
              : reducedMotion.current
                ? 'reduced-motion'
                : !ref.current
                  ? 'missing-ref'
                  : 'missing-root';
          console.debug(
            `[TitleTransition] navigate skipped (${reason}) for id: ${id}`,
          );
        }
        open();
        return;
      }
      let completed = false;
      const finish = (source?: Frame, rootX = 0, rootY = 0) => {
        if (completed || token !== sequence.current) return;
        completed = true;
        clearTimeout(timeout);
        if (
          source &&
          validFrame(source) &&
          !reducedMotion.current &&
          (!isValid || isValid())
        ) {
          const now = Date.now();
          pending.current = {
            id,
            text,
            source,
            expires: now + TARGET_WAIT_MS,
            isValid,
            sourceRouteKey: currentRoute.current,
            rootX,
            rootY,
            measuring: false,
            pressTime,
            sourceMeasuredTime: now,
          };
          const relative = {
            ...source,
            x: source.x - rootX,
            y: source.y - rootY,
          };
          if (onSourceHiddenChange) {
            sourceRestore.current = () => onSourceHiddenChange(false);
            onSourceHiddenChange(true);
          }
          progress.setValue(0);
          setWaiting({ id, sourceRouteKey: currentRoute.current });
          setFlight({
            text,
            sourceTitle,
            source: relative,
            target: relative,
            moving: false,
            token,
          });
          targetTimer.current = setTimeout(() => {
            if (token !== sequence.current) return;
            if (__DEV__) {
              console.debug(
                `[TitleTransition] target wait timed out (${TARGET_WAIT_MS}ms) for id: ${id}`,
              );
            }
            pending.current = null;
            targetTimer.current = null;
            restoreSource();
            setWaiting(null);
            setFlight(null);
          }, TARGET_WAIT_MS);
        } else {
          if (__DEV__) {
            const reason = !source
              ? 'timeout-or-failed-measure'
              : !validFrame(source)
                ? 'invalid-source-frame'
                : reducedMotion.current
                  ? 'reduced-motion'
                  : 'invalid-callback';
            console.debug(
              `[TitleTransition] source measurement failed (${reason}) for id: ${id}`,
              { elapsedMs: Date.now() - pressTime },
            );
          }
        }
        open();
      };
      const SOURCE_WAIT_MS = Platform.OS === 'android' ? 200 : 100;
      const timeout = setTimeout(() => finish(), SOURCE_WAIT_MS);
      ref.current.measureInWindow((x, y, width, height) => {
        root.current?.measureInWindow((rootX, rootY) => {
          if (!Number.isFinite(rootX) || !Number.isFinite(rootY)) finish();
          else finish({ x, y, width, height }, rootX, rootY);
        });
      });
    },
    [progress, restoreSource],
  );

  const target = useCallback<TitleTransition['target']>(
    (id, ref) => {
      const current = pending.current;
      if (!current || current.id !== id || !ref || current.measuring) return;
      if (
        Date.now() > current.expires ||
        reducedMotion.current ||
        (current.isValid && !current.isValid())
      ) {
        if (__DEV__) {
          const reason =
            Date.now() > current.expires
              ? 'expired'
              : reducedMotion.current
                ? 'reduced-motion'
                : 'invalid-callback';
          console.debug(
            `[TitleTransition] target rejected (${reason}) for id: ${id}`,
          );
        }
        pending.current = null;
        if (targetTimer.current) clearTimeout(targetTimer.current);
        targetTimer.current = null;
        restoreSource();
        setWaiting(null);
        setFlight(null);
        return;
      }
      current.measuring = true;
      const token = sequence.current;
      ref.measureInWindow((x, y, width, height) => {
        const destination = { x, y, width, height };
        if (
          !validFrame(destination) ||
          token !== sequence.current ||
          pending.current !== current ||
          Date.now() > current.expires ||
          (current.isValid && !current.isValid())
        ) {
          if (pending.current === current && token === sequence.current) {
            current.measuring = false;
            const retries = (current.retries ?? 0) + 1;
            current.retries = retries;
            if (retries <= 3 && Date.now() <= current.expires) {
              setTimeout(() => {
                if (
                  pending.current === current &&
                  token === sequence.current &&
                  !current.measuring &&
                  Date.now() <= current.expires
                ) {
                  target(id, ref);
                }
              }, 16);
            }
          }
          return;
        }
        if (targetTimer.current) clearTimeout(targetTimer.current);
        targetTimer.current = null;
        const now = Date.now();
        if (__DEV__) {
          console.debug('[TitleTransition] target flight started', {
            id,
            sourceMeasureMs:
              (current.sourceMeasuredTime ?? now) - (current.pressTime ?? now),
            targetWaitMs: now - (current.sourceMeasuredTime ?? now),
            totalMs: now - (current.pressTime ?? now),
          });
        }
        setFlight({
          text: current.text,
          source: {
            ...current.source,
            x: current.source.x - current.rootX,
            y: current.source.y - current.rootY,
          },
          target: {
            ...destination,
            x: destination.x - current.rootX,
            y: destination.y - current.rootY,
          },
          moving: true,
          token,
        });
      });
    },
    [restoreSource],
  );

  useLayoutEffect(() => {
    if (!flight?.moving) return;
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && flight.token === sequence.current) {
        pending.current = null;
        restoreSource();
        setWaiting(null);
        setFlight(null);
      }
    });
    return () => animation.stop();
  }, [flight, progress, restoreSource]);

  const api = useMemo(() => ({ navigate, target }), [navigate, target]);
  const visibility = useMemo(
    () => (waiting ? { ...waiting, activeRouteKey, flight, progress } : null),
    [waiting, activeRouteKey, flight, progress],
  );

  return (
    <Context.Provider value={api}>
      <VisibilityContext.Provider value={visibility}>
        <View ref={root} collapsable={false} style={styles.root}>
          {children}
          {flight && !flight.moving ? (
            <View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
              style={[
                styles.title,
                {
                  left: flight.source.x,
                  top: flight.source.y,
                  width: flight.source.width,
                },
              ]}
            >
              {flight.sourceTitle ?? (
                <Text
                  numberOfLines={2}
                  style={{
                    color: colors.text,
                    fontSize: 18 * fontSizeScale,
                    lineHeight: (24 * fontSizeScale * lineHeightScale) / 1.5,
                    fontWeight: '700',
                  }}
                >
                  {flight.text}
                </Text>
              )}
            </View>
          ) : null}
        </View>
      </VisibilityContext.Provider>
    </Context.Provider>
  );
}

export function useTitleTransition() {
  const context = useContext(Context);
  return (
    context?.navigate ??
    ((
      _: RefObject<ViewInstance | null>,
      _id: string,
      _text: string,
      open: () => void,
    ) => open())
  );
}

/** Keep a recycled card's new title visible if an older flight is still ending. */
export function useTitleTransitionSource(identity: string) {
  const [state, setState] = useState({ identity, hidden: false });
  if (state.identity !== identity) setState({ identity, hidden: false });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const onSourceHiddenChange = useCallback(
    (hidden: boolean) => {
      if (!mounted.current) return;
      setState((current) =>
        current.identity === identity ? { identity, hidden } : current,
      );
    },
    [identity],
  );
  return {
    hidden: state.identity === identity && state.hidden,
    onSourceHiddenChange,
  };
}

export function TitleTransitionTarget({
  id,
  children,
  onLayout,
  enabled = true,
}: {
  id: string;
  children: ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
  enabled?: boolean;
}) {
  const context = useContext(Context);
  const transition = useContext(VisibilityContext);
  const routeKey = useContext(PaneContext)?.routeKey;
  const visible = usePaneVisible();
  const ref = useRef<ViewInstance>(null);
  const laidOutId = useRef<string | null>(null);
  const isTarget = Boolean(
    enabled &&
      transition?.id === id &&
      transition.sourceRouteKey !== transition.activeRouteKey &&
      (!routeKey || routeKey === transition.activeRouteKey) &&
      visible,
  );
  const flight =
    isTarget && transition?.flight?.moving ? transition.flight : null;
  const progress = transition?.progress;

  useLayoutEffect(() => {
    if (isTarget && laidOutId.current === id && ref.current) {
      context?.target(id, ref.current);
    }
  }, [context, id, isTarget]);

  const motion = useMemo(() => {
    if (!flight || !progress) return undefined;
    // Move the real destination title, so the last frame is its actual layout.
    const initialScale = 0.82;
    return {
      transform: [
        {
          translateX: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [
              flight.source.x -
                flight.target.x -
                (flight.target.width * (1 - initialScale)) / 2,
              0,
            ],
          }),
        },
        {
          translateY: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [
              flight.source.y -
                flight.target.y -
                (flight.target.height * (1 - initialScale)) / 2,
              0,
            ],
          }),
        },
        {
          scale: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [initialScale, 1],
          }),
        },
      ],
    };
  }, [flight, progress]);
  return (
    <Animated.View
      ref={ref}
      collapsable={false}
      style={isTarget && !flight ? { opacity: 0 } : motion}
      onLayout={(event) => {
        laidOutId.current = id;
        onLayout?.(event);
        if (
          enabled &&
          visible &&
          (!routeKey || routeKey === transition?.activeRouteKey)
        )
          context?.target(id, ref.current);
      }}
    >
      {children}
    </Animated.View>
  );
}

export function useTitleTransitionActiveForRoute(routeKey?: string): boolean {
  const transition = useContext(VisibilityContext);
  if (!transition || !routeKey) return false;
  return (
    transition.activeRouteKey === routeKey &&
    transition.sourceRouteKey !== transition.activeRouteKey
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { position: 'absolute' },
});
