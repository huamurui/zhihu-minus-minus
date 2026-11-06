import {
  createNativeStackProps,
  createStandardRouterNavigator,
  type Href,
  IsWithinNativeNavigator,
  type NativeStackDescriptorMap,
  NativeStackView,
  type NavigatorContentProps,
  Stack,
} from 'expo-router';
import type {
  NativeStackNavigationEventMap,
  NativeStackNavigationOptions,
} from 'expo-router/native-stack';
import {
  Header,
  HeaderBackButton,
  HeaderHeightContext,
  HeaderShownContext,
  type NavigationAction,
  SafeAreaProviderCompat,
} from 'expo-router/react-navigation';
import {
  Children,
  type ComponentProps,
  createElement,
  isValidElement,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassNavigationButton } from '@/components/navigation/GlassNavigationButton';
import { useIsLiquidGlassActive } from '@/components/surfaces/FloatingSurface';
import { useRuntimeThemeColors } from '@/components/Themed';
import { useSettingsStore } from '@/store/useSettingsStore';
import {
  getListPaneWidth,
  getVisiblePanes,
  PANE_DIVIDER_WIDTH,
} from './layout';
import { PaneContext, usePaneDimensions } from './PaneContext';
import { PaneDivider } from './PaneDivider';
import { PaneStackRouter } from './PaneStackRouter';
import { resolvePaneDetailHref } from './selection';
import {
  TitleTransitionProvider,
  useTitleTransitionActiveForRoute,
} from './TitleTransition';
import { PaneSelectionContext } from './usePaneRouter';

type StackEvents = {
  [K in keyof NativeStackNavigationEventMap]: NativeStackNavigationEventMap[K] & {
    canPreventDefault: false;
  };
};
type ContentProps = NavigatorContentProps<
  NativeStackNavigationOptions,
  StackEvents,
  object,
  {
    dispatchNavigation: (action: NavigationAction) => void;
    navigatorKey: string;
    isPreloaded: (key: string) => boolean;
    isRemovalPrevented: (key: string) => boolean;
    pop: (count: number, sourceRouteKey: string) => void;
  }
>;

type RetainedRoute = {
  route: ContentProps['state']['routes'][number];
  descriptor: ContentProps['descriptors'][string];
  index: number;
  left: number;
  width: number;
  height: number;
  twoPane: boolean;
};

function StackContent(props: ContentProps) {
  const enabled = useSettingsStore((s) => s.enableLargeScreenLayout);
  if (Platform.OS === 'ios' && !enabled) {
    // Expo Router passes its full navigation descriptors at runtime; the
    // standard navigator type exposes only their shared options/render subset.
    return (
      <IsWithinNativeNavigator.Provider value>
        <NativeStackView
          state={props.state}
          descriptors={props.descriptors as NativeStackDescriptorMap}
          emit={props.emitter.emit}
          isPreloaded={props.isPreloaded}
          isRemovalPrevented={props.isRemovalPrevented}
          pop={props.pop}
        />
      </IsWithinNativeNavigator.Provider>
    );
  }
  return <AdaptiveStackContent {...props} />;
}

export function AdaptiveStackContent({
  state,
  descriptors,
  actions,
  dispatchNavigation,
  navigatorKey,
}: ContentProps) {
  const dimensions = useWindowDimensions();
  const colors = useRuntimeThemeColors();
  const enabled = useSettingsStore((s) => s.enableLargeScreenLayout);
  const savedRatio = useSettingsStore((s) => s.largeScreenListRatio);
  const [ratio, setRatio] = useState(savedRatio);
  const [measurement, setMeasurement] = useState<{
    width: number;
    height: number;
    windowWidth: number;
    windowHeight: number;
  } | null>(null);
  // Ignore the old container measurement immediately when the window changes.
  const size =
    measurement?.windowWidth === dimensions.width &&
    measurement.windowHeight === dimensions.height
      ? measurement
      : null;
  useEffect(() => setRatio(savedRatio), [savedRatio]);
  const width = size?.width ?? dimensions.width;
  const height = size?.height ?? dimensions.height;
  const panes = getVisiblePanes(state.routes, state.index, enabled);
  const activeKey = state.routes[state.index]?.key;
  const transition = useRef({
    key: activeKey,
    sequence: 0,
    routeKeys: state.routes.map((route) => route.key),
    returning: false,
  });
  if (transition.current.key !== activeKey) {
    transition.current = {
      key: activeKey,
      sequence: transition.current.sequence + 1,
      routeKeys: state.routes.map((route) => route.key),
      returning:
        !!activeKey && transition.current.routeKeys.includes(activeKey),
    };
  }
  const selectDetail = useCallback(
    (sourceKey: string, href: Href) => {
      if (!enabled || sourceKey !== panes.listKey) return false;
      const destination = resolvePaneDetailHref(href);
      if (!destination) return false;
      // A list selection opens one answer, irrespective of the phone reading mode.
      if (destination.name === 'answer/[id]')
        destination.params.readingMode = 'detail';
      dispatchNavigation({
        type: 'PUSH',
        target: navigatorKey,
        payload: { ...destination, paneSelectionSource: sourceKey },
      });
      return true;
    },
    [enabled, panes.listKey, dispatchNavigation, navigatorKey],
  );
  const listWidth = getListPaneWidth(width, ratio);
  const detailLeft = listWidth + PANE_DIVIDER_WIDTH;
  const previousPane = getVisiblePanes(state.routes, state.index - 1, enabled);
  const underlayKeys = panes.fullKey
    ? [previousPane.fullKey, previousPane.listKey, previousPane.detailKey]
    : panes.detailKey
      ? [previousPane.detailKey]
      : [];
  const previous = useRef<{
    activeKey: string | undefined;
    routeKeys: string[];
    active: RetainedRoute | null;
  } | null>(null);
  const [exiting, setExiting] = useState<RetainedRoute | null>(null);
  const completedExit = useRef<string | null>(null);
  const [, markExitComplete] = useReducer((version: number) => version + 1, 0);
  const pendingExit =
    Platform.OS === 'android' &&
    previous.current?.activeKey !== activeKey &&
    activeKey &&
    previous.current?.routeKeys.includes(activeKey) &&
    previous.current.active &&
    !state.routes.some((route) => route.key === previous.current?.activeKey)
      ? previous.current.active
      : null;
  const retained =
    pendingExit ?? (transition.current.returning ? exiting : null);
  const activeRoute = state.routes[state.index];
  useLayoutEffect(() => {
    if (pendingExit) {
      if (completedExit.current === pendingExit.route.key) {
        setExiting(null);
      } else {
        completedExit.current = null;
        setExiting(pendingExit);
      }
    } else if (!transition.current.returning) setExiting(null);
    previous.current = {
      activeKey,
      routeKeys: state.routes.map((route) => route.key),
      active:
        activeRoute && descriptors[activeRoute.key]
          ? {
              route: activeRoute,
              descriptor: descriptors[activeRoute.key],
              index: state.index,
              left: activeRoute.key === panes.detailKey ? detailLeft : 0,
              width:
                activeRoute.key === panes.detailKey
                  ? width - detailLeft
                  : width,
              height,
              twoPane: !!panes.listKey,
            }
          : null,
    };
  });
  const finishExit = useCallback((routeKey: string) => {
    completedExit.current = routeKey;
    setExiting((current) => (current?.route.key === routeKey ? null : current));
    markExitComplete();
  }, []);
  const commitRatio = useCallback((next: number) => {
    setRatio(next);
    useSettingsStore.getState().updateSettings({ largeScreenListRatio: next });
  }, []);
  const cancelResize = useCallback(() => {
    setRatio(useSettingsStore.getState().largeScreenListRatio);
  }, []);

  return (
    <PaneSelectionContext.Provider value={selectDetail}>
      <TitleTransitionProvider activeRouteKey={activeKey}>
        <View
          style={[styles.container, { backgroundColor: colors.background }]}
          testID="adaptive-stack"
          onLayout={({ nativeEvent: { layout } }) => {
            if (layout.width > 0 && layout.height > 0) {
              setMeasurement((previous) =>
                previous?.width === layout.width &&
                previous.height === layout.height &&
                previous.windowWidth === dimensions.width &&
                previous.windowHeight === dimensions.height
                  ? previous
                  : {
                      width: layout.width,
                      height: layout.height,
                      windowWidth: dimensions.width,
                      windowHeight: dimensions.height,
                    },
              );
            }
          }}
        >
          {panes.listKey && !panes.detailKey ? (
            <View
              style={[styles.empty, { left: detailLeft }]}
              testID="adaptive-empty-detail"
            >
              <Text style={{ color: colors.textSecondary }}>选择左侧内容</Text>
            </View>
          ) : null}
          {[...state.routes, ...(retained ? [retained.route] : [])].map(
            (route, index) => {
              const retainedRoute =
                retained?.route.key === route.key ? retained : null;
              const isExiting = retainedRoute !== null;
              const descriptor =
                retainedRoute?.descriptor ?? descriptors[route.key];
              const isList = route.key === panes.listKey;
              const isDetail = route.key === panes.detailKey;
              const visible =
                isExiting || isList || isDetail || route.key === panes.fullKey;
              const paneWidth = retainedRoute
                ? retainedRoute.width
                : isList
                  ? listWidth
                  : isDetail
                    ? width - detailLeft
                    : width;
              return (
                <RoutePane
                  key={route.key}
                  routeKey={route.key}
                  twoPane={retainedRoute?.twoPane ?? !!panes.listKey}
                  testID={`adaptive-route-${route.key}`}
                  left={retainedRoute?.left ?? (isDetail ? detailLeft : 0)}
                  width={paneWidth}
                  height={retainedRoute?.height ?? height}
                  visible={visible}
                  background={
                    Platform.OS === 'android' &&
                    !transition.current.returning &&
                    underlayKeys.includes(route.key) &&
                    !visible
                  }
                  active={route.key === activeKey && !isList}
                  exiting={isExiting}
                  animateEntry={
                    Platform.OS !== 'android' || !transition.current.returning
                  }
                  onExited={finishExit}
                  expand={
                    route.name !== 'user/[id]/index' &&
                    route.name !== 'user/[id]/stream'
                  }
                  transitionSequence={transition.current.sequence}
                >
                  <AdaptiveScreen
                    options={descriptor.options}
                    canGoBack={(retainedRoute?.index ?? state.index) > 0}
                    onBack={actions.back}
                    previousTitle={
                      descriptors[state.routes[index - 1]?.key]?.options.title
                    }
                  >
                    {descriptor.render()}
                  </AdaptiveScreen>
                </RoutePane>
              );
            },
          )}
          {panes.listKey ? (
            <PaneDivider
              width={width}
              ratio={ratio}
              onChange={setRatio}
              onCommit={commitRatio}
              onCancel={cancelResize}
            />
          ) : null}
        </View>
      </TitleTransitionProvider>
    </PaneSelectionContext.Provider>
  );
}

function RoutePane({
  routeKey,
  twoPane,
  testID,
  left,
  width,
  height,
  visible,
  background,
  active,
  exiting,
  animateEntry,
  onExited,
  expand,
  transitionSequence,
  children,
}: {
  routeKey: string;
  twoPane: boolean;
  testID: string;
  left: number;
  width: number;
  height: number;
  visible: boolean;
  background: boolean;
  active: boolean;
  exiting: boolean;
  animateEntry: boolean;
  onExited: (routeKey: string) => void;
  expand: boolean;
  transitionSequence: number;
  children: ReactNode;
}) {
  const hasTitleTransition = useTitleTransitionActiveForRoute(routeKey);
  const useGlass = useIsLiquidGlassActive();
  const focused = useRef(false);
  const isEntering =
    visible && active && animateEntry && transitionSequence > 0;
  const progress = useRef(new Animated.Value(isEntering ? 0 : 1)).current;
  const lastTransition = useRef(0);
  const reduceMotion = useRef(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) reduceMotion.current = enabled;
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        reduceMotion.current = enabled;
      },
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  useLayoutEffect(() => {
    if (
      !visible ||
      !active ||
      exiting ||
      lastTransition.current === transitionSequence
    ) {
      return;
    }
    lastTransition.current = transitionSequence;
    progress.stopAnimation();
    if (!animateEntry || reduceMotion.current) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => {
      animation.stop();
      progress.setValue(1);
    };
  }, [active, animateEntry, exiting, progress, transitionSequence, visible]);
  useLayoutEffect(() => {
    if (!exiting) return;
    progress.stopAnimation();
    progress.setValue(1);
    if (reduceMotion.current) {
      onExited(routeKey);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) onExited(routeKey);
    });
    return () => animation.stop();
  }, [exiting, onExited, progress, routeKey]);
  useEffect(() => {
    if (!visible && focused.current) {
      focused.current = false;
      Keyboard.dismiss();
    }
  }, [visible]);
  // Keep native ScrollView/Pager geometry while covered. Collapsing a screen or
  // pausing its effects can reset scroll offsets, refreshes and header state.
  const [lastFrame, setLastFrame] = useState({ width, height, left });
  if (
    visible &&
    (lastFrame.width !== width ||
      lastFrame.height !== height ||
      lastFrame.left !== left)
  ) {
    setLastFrame({ width, height, left });
  }
  const frame = visible ? { width, height, left } : lastFrame;
  // Stable identity matters: route-level Stack.Screen updates options in a layout
  // effect. Recreating this value on each descriptor update causes a render loop.
  const value = useMemo(
    () => ({
      width: frame.width,
      height: frame.height,
      visible,
      routeKey,
      twoPane,
      fixedHeaderEntryProgress: expand ? undefined : progress,
    }),
    [frame.width, frame.height, visible, routeKey, twoPane, expand, progress],
  );
  const webProps = Platform.OS === 'web' ? { inert: !visible } : {};
  // Keep visibility independent of native-driven opacity on retained routes.
  return (
    <View
      {...webProps}
      testID={testID}
      onFocusCapture={() => {
        focused.current = true;
      }}
      onBlurCapture={() => {
        focused.current = false;
      }}
      pointerEvents={visible && !exiting ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible || exiting}
      importantForAccessibility={
        visible && !exiting ? 'auto' : 'no-hide-descendants'
      }
      style={[styles.route, frame, { opacity: visible || background ? 1 : 0 }]}
    >
      <Animated.View
        testID={`${testID}-transition`}
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: exiting
              ? progress
              : (hasTitleTransition && Platform.OS !== 'android') || useGlass
                ? 1
                : progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [Platform.OS === 'android' ? 0.05 : 0.15, 1],
                  }),
            ...(expand && !hasTitleTransition && !exiting
              ? {
                  transform: [
                    {
                      scale: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [twoPane ? 1.008 : 1.03, 1],
                      }),
                    },
                  ],
                }
              : {}),
          },
        ]}
      >
        <PaneContext.Provider value={value}>
          <SafeAreaProviderCompat>{children}</SafeAreaProviderCompat>
        </PaneContext.Provider>
      </Animated.View>
    </View>
  );
}

function AdaptiveScreen({
  options,
  children,
  onBack,
  canGoBack,
  previousTitle,
}: {
  options: NativeStackNavigationOptions;
  children: React.ReactNode;
  onBack: () => void;
  canGoBack: boolean;
  previousTitle?: string;
}) {
  const insets = useSafeAreaInsets();
  const dimensions = usePaneDimensions();
  const colors = useRuntimeThemeColors();
  const useGlass = useIsLiquidGlassActive();
  const [headerHeight, setHeaderHeight] = useState(56 + insets.top);
  const shown = options.headerShown !== false;
  const tintColor =
    typeof options.headerTintColor === 'string'
      ? options.headerTintColor
      : colors.primary;
  const itemProps = { tintColor, canGoBack };
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {shown ? (
        <View
          onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        >
          <Header
            layout={dimensions}
            title={options.title ?? ''}
            headerTitle={options.headerTitle}
            headerTitleStyle={options.headerTitleStyle}
            headerStyle={options.headerStyle}
            headerTintColor={tintColor}
            headerShadowVisible={options.headerShadowVisible}
            headerLeft={
              options.headerLeft
                ? () =>
                    options.headerLeft?.({ ...itemProps, label: previousTitle })
                : canGoBack
                  ? () =>
                      useGlass ? (
                        <GlassNavigationButton
                          icon="back"
                          onPress={onBack}
                          color={tintColor}
                          accessibilityLabel="返回"
                          style={styles.headerBackBtn}
                        />
                      ) : (
                        <HeaderBackButton
                          onPress={onBack}
                          tintColor={tintColor}
                          displayMode="minimal"
                          accessibilityLabel="返回"
                        />
                      )
                  : undefined
            }
            headerRight={
              options.headerRight
                ? () => options.headerRight?.(itemProps)
                : undefined
            }
          />
        </View>
      ) : null}
      <HeaderShownContext.Provider value={shown}>
        <HeaderHeightContext.Provider value={shown ? headerHeight : 0}>
          <View style={styles.container}>{children}</View>
        </HeaderHeightContext.Provider>
      </HeaderShownContext.Provider>
    </View>
  );
}

export const TwoPaneStack = createStandardRouterNavigator(
  StackContent,
  PaneStackRouter,
  {
    createProps: (args) => ({
      ...createNativeStackProps(args),
      dispatchNavigation: args.dispatch,
      navigatorKey: args.state.key,
    }),
  },
);

function AdaptiveStackHost(props: ComponentProps<typeof Stack>) {
  // Expo's native Stack unwraps Stack.Screen itself. A standard navigator
  // instead expects its own Screen marker when reading layout options.
  const adaptiveChildren = useMemo(
    () =>
      Children.map(props.children, (child) =>
        isValidElement<ComponentProps<typeof Stack.Screen>>(child) &&
        child.type === Stack.Screen
          ? createElement(TwoPaneStack.Screen, {
              ...child.props,
              key: child.key,
            })
          : child,
      ),
    [props.children],
  );
  return (
    <TwoPaneStack {...props} activityEnabled={false}>
      {adaptiveChildren}
    </TwoPaneStack>
  );
}

export const AdaptiveStack = Object.assign(AdaptiveStackHost, {
  Screen: Stack.Screen,
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBackBtn: { marginLeft: 8 },
  route: { position: 'absolute', top: 0, overflow: 'hidden' },
  empty: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
