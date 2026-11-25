import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform, ScrollView } from 'react-native';
import {
  Gesture,
  GestureDetector,
  type GestureTouchEvent,
  PointerType,
  State,
} from 'react-native-gesture-handler';
import { makeMutable, withTiming } from 'react-native-reanimated';
import { ReadingScrollViewport } from '../src/components/ReadingScrollViewport';

jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: jest.fn(({ children }: { children: ReactNode }) => children),
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { createAnimatedComponent: (component: unknown) => component },
  makeMutable: (value: number) => ({ value }),
  useSharedValue: (value: unknown) =>
    jest.requireActual<typeof import('react')>('react').useRef({ value })
      .current,
  withTiming: jest.fn((toValue: number) => toValue),
}));

const initialPlatform = Platform.OS;
afterEach(() => {
  Platform.OS = initialPlatform;
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

const stateManager = {
  handlerTag: 1,
  begin: jest.fn(),
  activate: jest.fn(),
  fail: jest.fn(),
  end: jest.fn(),
};

function touch(
  y: number,
  state: GestureTouchEvent['state'] = State.ACTIVE,
): GestureTouchEvent {
  const point = { id: 0, x: 0, y, absoluteX: 0, absoluteY: y };
  return {
    handlerTag: 1,
    numberOfTouches: 1,
    state,
    eventType: 2,
    allTouches: [point],
    changedTouches: [point],
    pointerType: PointerType.TOUCH,
  };
}

async function renderViewport() {
  const scrollY = makeMutable(0);
  const edgePull = makeMutable(0);
  const native = Gesture.Native();
  const doubleTap = Gesture.Tap();
  const createNative = jest.spyOn(Gesture, 'Native').mockReturnValue(native);
  const child = <ScrollView />;
  const host = await render(
    <ReadingScrollViewport
      doubleTap={doubleTap}
      focused
      scrollY={scrollY}
      viewportHeight={makeMutable(100)}
      contentHeight={makeMutable(400)}
      edgePull={edgePull}
    >
      {child}
    </ReadingScrollViewport>,
  );
  return { native, createNative, doubleTap, child, scrollY, edgePull, host };
}

test('observes the Android ScrollView without taking taps or horizontal swipes', async () => {
  Platform.OS = 'android';
  const { native, doubleTap, child, scrollY, edgePull, host } =
    await renderViewport();
  expect(jest.mocked(GestureDetector).mock.calls[0][0]).toMatchObject({
    gesture: native,
    children: child,
  });
  expect(native.config.simultaneousWith).toContain(doubleTap);
  expect(native.config.shouldActivateOnStart).not.toBe(true);
  expect(native.config.disallowInterruption).not.toBe(true);

  const { onTouchesDown, onTouchesMove, onFinalize } = native.handlers;
  const move = (y: number, state?: GestureTouchEvent['state']) =>
    onTouchesMove?.(touch(y, state), stateManager);
  onTouchesDown?.(touch(80, State.BEGAN), stateManager);
  move(100, State.BEGAN);
  move(110, State.BEGAN);
  expect(edgePull.value).toBe(0);
  move(150);
  expect(edgePull.value).toBe(-40);
  move(130);
  expect(edgePull.value).toBe(-20);
  move(100);
  expect(edgePull.value).toBe(0);
  scrollY.value = 140;
  move(80);
  expect(edgePull.value).toBe(0);
  scrollY.value = 300;
  move(40);
  expect(edgePull.value).toBe(40);

  onFinalize?.(
    {
      handlerTag: 1,
      state: State.CANCELLED,
      oldState: State.ACTIVE,
      numberOfPointers: 0,
      pointerType: PointerType.TOUCH,
      pointerInside: false,
    },
    false,
  );
  expect(withTiming).toHaveBeenCalled();
  expect(edgePull.value).toBe(0);

  onTouchesDown?.(touch(100, State.BEGAN), stateManager);
  move(80);
  move(40);
  expect(edgePull.value).toBe(40);
  await host.unmount();
  expect(edgePull.value).toBe(0);
});

test('uses the native elastic offset directly on iOS', async () => {
  Platform.OS = 'ios';
  const { createNative } = await renderViewport();
  expect(createNative).not.toHaveBeenCalled();
});
