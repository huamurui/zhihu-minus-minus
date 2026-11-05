import { useIsFocused } from 'expo-router';
import {
  NavigationContext,
  type NavigationProp,
  NavigationRouteContext,
  type ParamListBase,
} from 'expo-router/react-navigation';
import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from 'react';
import { type Animated, useWindowDimensions } from 'react-native';

export const PaneContext = createContext<{
  width: number;
  height: number;
  visible: boolean;
  routeKey?: string;
  twoPane?: boolean;
  fixedHeaderEntryProgress?: Animated.Value;
} | null>(null);

/** Modal contents use window dimensions but retain their originating visibility. */
export const PaneVisibilityContext = createContext(true);

/** Page controls use their pane's bounds, while full-screen overlays use the window. */
export function usePaneDimensions(): ReturnType<typeof useWindowDimensions> {
  const dimensions = useWindowDimensions();
  const pane = useContext(PaneContext);
  return pane
    ? { ...dimensions, width: pane.width, height: pane.height }
    : dimensions;
}

export function usePaneVisible(): boolean {
  const pane = useContext(PaneContext);
  const ancestorVisible = useContext(PaneVisibilityContext);
  return (pane?.visible ?? true) && ancestorVisible;
}

/** Screens with fixed toolbars can animate their content with the route clock. */
export function useFixedHeaderEntryProgress(): Animated.Value | undefined {
  return useContext(PaneContext)?.fixedHeaderEntryProgress;
}

export function useIsTwoPaneLayout(): boolean {
  return useContext(PaneContext)?.twoPane ?? false;
}

/** Both visible panes can be active even though the stack has one focused route. */
export function usePaneActive(): boolean {
  const focused = useIsFocused();
  const pane = useContext(PaneContext);
  const navigation = useContext(NavigationContext);
  const route = useContext(NavigationRouteContext);
  const visible = usePaneVisible();
  const paneKey = pane?.routeKey;
  const routeKey = route?.key;
  const subscribe = useCallback(
    (listener: () => void) => {
      const subscriptions: Array<() => void> = [];
      if (paneKey && routeKey !== paneKey) {
        let current = navigation;
        while (current) {
          subscriptions.push(current.addListener('state', listener));
          if (current.getState().routes.some(({ key }) => key === paneKey))
            break;
          current = current.getParent();
        }
      }
      return () => {
        for (const unsubscribe of subscriptions) unsubscribe();
      };
    },
    [navigation, paneKey, routeKey],
  );
  const getSelected = useCallback(
    () =>
      !paneKey ||
      !routeKey ||
      !navigation ||
      isSelectedWithinPane(navigation, routeKey, paneKey),
    [navigation, paneKey, routeKey],
  );
  const selected = useSyncExternalStore(subscribe, getSelected, getSelected);
  return visible && (pane ? selected : focused);
}

function isSelectedWithinPane(
  navigation: NavigationProp<ParamListBase>,
  routeKey: string,
  paneKey: string,
): boolean {
  let current: NavigationProp<ParamListBase> | undefined = navigation;
  let childKey = routeKey;
  while (current) {
    // The pane replaces only its root stack's focus, never a nested tab choice.
    if (childKey === paneKey) return true;
    const state = current.getState();
    if (state.routes[state.index]?.key !== childKey) return false;
    const parent: NavigationProp<ParamListBase> | undefined =
      current.getParent();
    if (!parent) return false;
    const parentState = parent.getState();
    if (parentState.routes.some(({ key }) => key === paneKey)) return true;
    const parentRoute = parentState.routes.find(
      (candidate) => candidate.state?.key === state.key,
    );
    if (!parentRoute) return false;
    childKey = parentRoute.key;
    current = parent;
  }
  return false;
}
