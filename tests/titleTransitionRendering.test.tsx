import { act, fireEvent, render } from '@testing-library/react-native';
import { Suspense, startTransition, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Text,
  View,
  type ViewInstance,
} from 'react-native';
import { PaneContext } from '../src/features/adaptive-layout/PaneContext';
import {
  TitleTransitionProvider,
  TitleTransitionTarget,
  useTitleTransition,
  useTitleTransitionSource,
} from '../src/features/adaptive-layout/TitleTransition';

let mockMeasureInWindow:
  | ((callback: (...args: number[]) => void) => void)
  | null = null;

jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  const react = jest.requireActual('react');
  const ViewWithMeasurement = react.forwardRef(
    (props: object, ref: unknown) => {
      react.useImperativeHandle(ref, () => ({
        measureInWindow: (callback: (...args: number[]) => void) => {
          if (mockMeasureInWindow) {
            mockMeasureInWindow(callback);
            return;
          }
          callback(20, 80, 180, 24);
        },
      }));
      return react.createElement(native.View, props);
    },
  );
  return new Proxy(native, {
    get: (target, key) => {
      if (key === 'View') return ViewWithMeasurement;
      const value = target[key];
      if (key === 'Animated' && value) {
        return new Proxy(value, {
          get: (animated, prop) =>
            prop === 'View' ? ViewWithMeasurement : animated[prop],
        });
      }
      return value;
    },
  });
});

jest.mock('../src/components/Themed', () => ({
  useRuntimeThemeColors: () => ({ text: '#111' }),
}));

function Example() {
  const ref = useRef<ViewInstance>(null);
  const [opened, setOpened] = useState(false);
  const transition = useTitleTransition();
  return opened ? (
    <TitleTransitionTarget id="question-1">
      <Text>详情标题</Text>
    </TitleTransitionTarget>
  ) : (
    <View ref={ref}>
      <Text
        onPress={() =>
          transition(ref, 'question-1', '卡片标题', () => setOpened(true))
        }
      >
        打开
      </Text>
    </View>
  );
}

function PersistentSource() {
  const ref = useRef<ViewInstance>(null);
  const [identity, setIdentity] = useState('one');
  const [opened, setOpened] = useState(false);
  const source = useTitleTransitionSource(identity);
  const transition = useTitleTransition();
  return (
    <View>
      <View ref={ref} style={source.hidden ? { opacity: 0 } : undefined}>
        <Text testID="source-title">来源标题 {identity}</Text>
      </View>
      <Text
        onPress={() =>
          transition(
            ref,
            'question-1',
            '来源标题',
            () => setOpened(true),
            undefined,
            source.onSourceHiddenChange,
            <Text testID="source-placeholder">来源标题</Text>,
          )
        }
      >
        打开来源
      </Text>
      <Text
        onPress={() =>
          setIdentity((current) => (current === 'one' ? 'two' : 'one'))
        }
      >
        复用卡片
      </Text>
      {opened ? (
        <TitleTransitionTarget id="question-1">
          <Text>详情标题</Text>
        </TitleTransitionTarget>
      ) : null}
    </View>
  );
}

test('the selected source title stays hidden while the destination title moves and is restored afterward', async () => {
  let finish: ((result: { finished: boolean }) => void) | undefined;
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn((callback) => {
      finish = callback;
    }),
    stop: jest.fn(),
    reset: jest.fn(),
  });
  try {
    const host = await render(
      <TitleTransitionProvider activeRouteKey="source">
        <PersistentSource />
      </TitleTransitionProvider>,
    );
    expect(host.getByTestId('source-title')).toBeVisible();
    await fireEvent.press(host.getByText('打开来源'));
    expect(host.getByTestId('source-title')).not.toBeVisible();
    expect(
      host.getByTestId('source-placeholder', { includeHiddenElements: true }),
    ).toBeTruthy();
    await host.rerender(
      <TitleTransitionProvider activeRouteKey="destination">
        <PersistentSource />
      </TitleTransitionProvider>,
    );
    expect(host.getByText('详情标题')).not.toBeVisible();
    expect(
      host.getByText('来源标题', { includeHiddenElements: true }),
    ).toBeTruthy();
    const target = host.getByText('详情标题').parent;
    await act(() => {
      if (target)
        fireEvent(target, 'layout', {
          nativeEvent: { layout: { x: 0, y: 0, width: 180, height: 24 } },
        });
    });
    expect(host.getByTestId('source-title')).not.toBeVisible();
    expect(host.getByText('详情标题')).toBeVisible();
    expect(
      host.queryByText('来源标题', { includeHiddenElements: true }),
    ).toBeNull();
    expect(
      host.queryByTestId('source-placeholder', { includeHiddenElements: true }),
    ).toBeNull();
    await act(() => finish?.({ finished: true }));
    expect(host.getByTestId('source-title')).toBeVisible();
  } finally {
    timing.mockRestore();
  }
});

test('a recycled card is visible and a timed-out flight restores the original source', async () => {
  jest.useFakeTimers();
  try {
    const host = await render(
      <TitleTransitionProvider activeRouteKey="source">
        <PersistentSource />
      </TitleTransitionProvider>,
    );
    await fireEvent.press(host.getByText('打开来源'));
    expect(host.getByTestId('source-title')).not.toBeVisible();
    await fireEvent.press(host.getByText('复用卡片'));
    expect(host.getByText('来源标题 two')).toBeVisible();
    await fireEvent.press(host.getByText('复用卡片'));
    expect(host.getByText('来源标题 one')).toBeVisible();
    await act(() => jest.advanceTimersByTime(250));
    expect(host.getByText('来源标题 one')).toBeVisible();
  } finally {
    jest.useRealTimers();
  }
});

test('a timed-out title handoff restores the original source', async () => {
  jest.useFakeTimers();
  try {
    const host = await render(
      <TitleTransitionProvider activeRouteKey="source">
        <PersistentSource />
      </TitleTransitionProvider>,
    );
    await fireEvent.press(host.getByText('打开来源'));
    expect(host.getByTestId('source-title')).not.toBeVisible();
    await act(() => jest.advanceTimersByTime(250));
    expect(host.getByTestId('source-title')).toBeVisible();
  } finally {
    jest.useRealTimers();
  }
});

test('returning during a handoff restores the source title', async () => {
  const timing = jest
    .spyOn(Animated, 'timing')
    .mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
  try {
    const host = await render(
      <TitleTransitionProvider activeRouteKey="source">
        <PersistentSource />
      </TitleTransitionProvider>,
    );
    await fireEvent.press(host.getByText('打开来源'));
    await host.rerender(
      <TitleTransitionProvider activeRouteKey="destination">
        <PersistentSource />
      </TitleTransitionProvider>,
    );
    const target = host.getByText('详情标题').parent;
    await act(() => {
      if (target)
        fireEvent(target, 'layout', {
          nativeEvent: { layout: { x: 0, y: 0, width: 180, height: 24 } },
        });
    });
    expect(host.getByTestId('source-title')).not.toBeVisible();
    await host.rerender(
      <TitleTransitionProvider activeRouteKey="source">
        <PersistentSource />
      </TitleTransitionProvider>,
    );
    expect(host.getByTestId('source-title')).toBeVisible();
  } finally {
    timing.mockRestore();
  }
});

test('a suspended route change does not change the source of a title handoff', async () => {
  let setRoute: ((route: string) => void) | undefined;
  let suspendedRenders = 0;
  const never = new Promise<void>(() => {});
  function SuspendRoute({ route }: { route: string }) {
    if (route === 'uncommitted') {
      suspendedRenders += 1;
      throw never;
    }
    return null;
  }
  function App() {
    const [route, updateRoute] = useState('source');
    setRoute = updateRoute;
    return (
      <Suspense fallback={<Text>加载中</Text>}>
        <TitleTransitionProvider activeRouteKey={route}>
          <PersistentSource />
          <SuspendRoute route={route} />
        </TitleTransitionProvider>
      </Suspense>
    );
  }
  const host = await render(<App />);
  await act(() => {
    startTransition(() => setRoute?.('uncommitted'));
  });
  expect(suspendedRenders).toBeGreaterThan(0);
  await fireEvent.press(host.getByText('打开来源'));
  // The old route is still committed, so its matching title is not a destination.
  expect(host.getByText('详情标题')).toBeVisible();
  await host.unmount();
});

test('a measured matching destination starts a temporary title handoff', async () => {
  let finish: ((result: { finished: boolean }) => void) | undefined;
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn((callback) => {
      finish = callback;
    }),
    stop: jest.fn(),
    reset: jest.fn(),
  });
  const host = await render(
    <TitleTransitionProvider activeRouteKey="source">
      <Example />
    </TitleTransitionProvider>,
  );
  await fireEvent.press(host.getByText('打开'));
  await host.rerender(
    <TitleTransitionProvider activeRouteKey="destination">
      <Example />
    </TitleTransitionProvider>,
  );
  const target = host.getByText('详情标题', {
    includeHiddenElements: true,
  }).parent;
  expect(target).not.toBeNull();
  expect(host.getByText('详情标题')).not.toBeVisible();
  expect(
    host.getByText('卡片标题', { includeHiddenElements: true }),
  ).toBeTruthy();
  await act(() => {
    if (target)
      fireEvent(target, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 180, height: 24 } },
      });
  });
  expect(
    host.queryByText('卡片标题', { includeHiddenElements: true }),
  ).toBeNull();
  expect(host.getByText('详情标题')).toBeVisible();
  await act(() => finish?.({ finished: true }));
  expect(host.getByText('详情标题')).toBeVisible();
  expect(
    host.queryByText('卡片标题', { includeHiddenElements: true }),
  ).toBeNull();
  timing.mockRestore();
});

test('a late destination falls back to its real title without a delayed handoff', async () => {
  jest.useFakeTimers();
  const timing = jest.spyOn(Animated, 'timing');
  try {
    const host = await render(
      <TitleTransitionProvider activeRouteKey="source">
        <Example />
      </TitleTransitionProvider>,
    );
    await fireEvent.press(host.getByText('打开'));
    await host.rerender(
      <TitleTransitionProvider activeRouteKey="destination">
        <Example />
      </TitleTransitionProvider>,
    );
    const target = host.getByText('详情标题', {
      includeHiddenElements: true,
    }).parent;
    expect(host.getByText('详情标题')).not.toBeVisible();
    await act(() => jest.advanceTimersByTime(250));
    expect(host.getByText('详情标题')).toBeVisible();
    await act(() => {
      if (target)
        fireEvent(target, 'layout', {
          nativeEvent: { layout: { x: 0, y: 0, width: 180, height: 24 } },
        });
    });
    expect(timing).not.toHaveBeenCalled();
    expect(
      host.queryByText('卡片标题', { includeHiddenElements: true }),
    ).toBeNull();
  } finally {
    timing.mockRestore();
    jest.useRealTimers();
  }
});

test('returning during the title handoff reveals the actual title', async () => {
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
  });
  const host = await render(
    <TitleTransitionProvider activeRouteKey="source">
      <Example />
    </TitleTransitionProvider>,
  );
  await fireEvent.press(host.getByText('打开'));
  await host.rerender(
    <TitleTransitionProvider activeRouteKey="destination">
      <Example />
    </TitleTransitionProvider>,
  );
  const target = host.getByText('详情标题', {
    includeHiddenElements: true,
  }).parent;
  await act(() => {
    if (target)
      fireEvent(target, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 180, height: 24 } },
      });
  });
  await host.rerender(
    <TitleTransitionProvider activeRouteKey="source">
      <Example />
    </TitleTransitionProvider>,
  );
  expect(
    host.queryByText('卡片标题', { includeHiddenElements: true }),
  ).toBeNull();
  expect(host.getByText('详情标题')).toBeVisible();
  timing.mockRestore();
});

test('reduced motion opens the destination without hiding its title', async () => {
  const reducedMotion = jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  try {
    const host = await render(
      <TitleTransitionProvider activeRouteKey="source">
        <Example />
      </TitleTransitionProvider>,
    );
    await fireEvent.press(host.getByText('打开'));
    await host.rerender(
      <TitleTransitionProvider activeRouteKey="destination">
        <Example />
      </TitleTransitionProvider>,
    );
    expect(host.getByText('详情标题')).toBeVisible();
    expect(
      host.queryByText('卡片标题', { includeHiddenElements: true }),
    ).toBeNull();
  } finally {
    reducedMotion.mockRestore();
  }
});

test('target measures successfully even if onLayout fired before the route became active', async () => {
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
  });
  try {
    const host = await render(
      <TitleTransitionProvider activeRouteKey="source">
        <Example />
      </TitleTransitionProvider>,
    );
    await fireEvent.press(host.getByText('打开'));
    const destinationPane = {
      width: 375,
      height: 812,
      visible: true,
      routeKey: 'destination',
    };
    // Render destination while route is still "source" (early native mount)
    await host.rerender(
      <TitleTransitionProvider activeRouteKey="source">
        <PaneContext.Provider value={destinationPane}>
          <TitleTransitionTarget id="question-1">
            <Text>提前布局标题</Text>
          </TitleTransitionTarget>
        </PaneContext.Provider>
      </TitleTransitionProvider>,
    );
    const target = host.getByText('提前布局标题').parent;
    expect(target).not.toBeNull();
    // Native onLayout fires while activeRouteKey is still "source"
    await act(() => {
      if (target)
        fireEvent(target, 'layout', {
          nativeEvent: { layout: { x: 0, y: 0, width: 180, height: 24 } },
        });
    });
    // Target route was inactive when onLayout fired, so animation must not start yet
    expect(timing).not.toHaveBeenCalled();

    // Now route updates to destination
    await host.rerender(
      <TitleTransitionProvider activeRouteKey="destination">
        <PaneContext.Provider value={destinationPane}>
          <TitleTransitionTarget id="question-1">
            <Text>提前布局标题</Text>
          </TitleTransitionTarget>
        </PaneContext.Provider>
      </TitleTransitionProvider>,
    );
    // Should have recovered via useLayoutEffect and started the transition timing!
    expect(timing).toHaveBeenCalledTimes(1);
  } finally {
    timing.mockRestore();
  }
});

test('target with enabled=false does not intercept title transition', async () => {
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
  });
  try {
    const host = await render(
      <TitleTransitionProvider activeRouteKey="source">
        <Example />
      </TitleTransitionProvider>,
    );
    await fireEvent.press(host.getByText('打开'));
    await host.rerender(
      <TitleTransitionProvider activeRouteKey="destination">
        <View>
          <TitleTransitionTarget id="question-1" enabled={false}>
            <Text testID="inactive-target">相邻回答标题</Text>
          </TitleTransitionTarget>
          <TitleTransitionTarget id="question-1" enabled={true}>
            <Text testID="active-target">当前回答标题</Text>
          </TitleTransitionTarget>
        </View>
      </TitleTransitionProvider>,
    );
    // Inactive target should remain visible directly (not hidden)
    expect(host.getByTestId('inactive-target')).toBeVisible();
    // Active target waiting for layout should be hidden
    expect(host.getByTestId('active-target')).not.toBeVisible();
  } finally {
    timing.mockRestore();
  }
});

test('target retries measurement if initial destination frame is invalid', async () => {
  jest.useFakeTimers();
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
  });
  let measureCalls = 0;
  mockMeasureInWindow = (callback) => {
    measureCalls++;
    // Call 1: source measurement
    // Call 2: root measurement for source
    // Call 3: destination measurement on target -> return invalid frame (0, 0, 0, 0)
    // Call 4+: retry destination measurement -> return valid frame (20, 80, 180, 24)
    if (measureCalls === 3) {
      callback(0, 0, 0, 0);
    } else {
      callback(20, 80, 180, 24);
    }
  };
  try {
    const host = await render(
      <TitleTransitionProvider activeRouteKey="source">
        <Example />
      </TitleTransitionProvider>,
    );
    await fireEvent.press(host.getByText('打开'));
    await host.rerender(
      <TitleTransitionProvider activeRouteKey="destination">
        <TitleTransitionTarget id="question-1">
          <Text>重试标题</Text>
        </TitleTransitionTarget>
      </TitleTransitionProvider>,
    );
    const target = host.getByText('重试标题').parent;
    expect(target).not.toBeNull();
    await act(() => {
      if (target)
        fireEvent(target, 'layout', {
          nativeEvent: { layout: { x: 0, y: 0, width: 180, height: 24 } },
        });
    });
    // First measurement returned invalid (0, 0, 0, 0), so animation should NOT have started yet
    expect(timing).not.toHaveBeenCalled();
    expect(measureCalls).toBe(3);

    // Advance timers by 20ms to allow next-frame retry (16ms setTimeout)
    await act(() => jest.advanceTimersByTime(20));

    // Retry succeeded and started animation
    expect(measureCalls).toBeGreaterThanOrEqual(4);
    expect(timing).toHaveBeenCalledTimes(1);
  } finally {
    mockMeasureInWindow = null;
    timing.mockRestore();
    jest.useRealTimers();
  }
});
